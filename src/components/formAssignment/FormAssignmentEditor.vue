<script setup>
import { IconArrowLeft, IconDeviceFloppy, IconTrash } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { post, patch, del } from '@/api'

/**
 * Create / edit a FormAssignment plan.
 *
 * Uses the REST endpoints directly (POST/PATCH/DELETE
 * /v1/services/formAssignments) rather than SyncEngine save — the
 * controller validates the cron expression, the assignedUserIds /
 * assignedRoleId mutual exclusion, the schedule shape, etc. Going
 * through GraphQL would skip those checks.
 *
 * After a successful write, the SyncEngine eventually catches up via
 * the server's sync push; for immediate UX we navigate back to the
 * list which re-reads the live query.
 */

const props = defineProps({
  id: { type: String, default: null }, // null = create mode
})

const router = useRouter()
const toast = useToast()

const canAssign = computed(() => isAllowed(['inspections:assign']))

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
]

const form = ref({
  name: '',
  description: '',
  formTemplateId: '',
  scheduleType: 'RECURRING', // RECURRING | AD_HOC
  cron: '0 8 * * MON',
  timezone: 'UTC',
  windowMinutes: 120,
  startOffsetMinutes: 0,
  graceMinutes: 60,
  assigneeMode: 'USERS', // USERS | ROLE
  assignedUserIds: [],
  assignedRoleId: '',
  siteId: '',
  effectiveAt: '',
  effectiveUntil: '',
  active: true,
})

const isEditing = computed(() => Boolean(props.id))
const existing = useLiveQueryWithDeps([() => props.id], async (db, [id]) => {
  if (!id) return null
  return db.FormAssignment.findByPk(id)
})

const formTemplates = useLiveQuery((db) => db.FormTemplate.where().exec(), { initial: [] })
// Templates eligible for Inspections & Logs — OPERATIONAL_LOG and
// CONTROLLED_RECORD. UTILITY templates write to the legacy records
// table and aren't used by this module.
const inspectionTemplates = computed(() =>
  (formTemplates.value ?? []).filter((t) => {
    const cls = t.config?.recordClassification
    return cls === 'OPERATIONAL_LOG' || cls === 'CONTROLLED_RECORD'
  }),
)

watch(
  existing,
  (plan) => {
    if (!plan) return
    form.value = {
      name: plan.name ?? '',
      description: plan.description ?? '',
      formTemplateId: plan.formTemplateId ?? '',
      scheduleType: plan.schedule?.type ?? 'RECURRING',
      cron: plan.schedule?.cron ?? '0 8 * * MON',
      timezone: plan.schedule?.timezone ?? 'UTC',
      windowMinutes: plan.schedule?.windowMinutes ?? 120,
      startOffsetMinutes: plan.schedule?.startOffsetMinutes ?? 0,
      graceMinutes: plan.graceMinutes ?? 60,
      assigneeMode: plan.assignedRoleId ? 'ROLE' : 'USERS',
      assignedUserIds: plan.assignedUserIds ?? [],
      assignedRoleId: plan.assignedRoleId ?? '',
      siteId: plan.siteId ?? '',
      effectiveAt: plan.effectiveAt ? toIsoLocal(plan.effectiveAt) : '',
      effectiveUntil: plan.effectiveUntil ? toIsoLocal(plan.effectiveUntil) : '',
      active: plan.active ?? true,
    }
  },
  { immediate: true },
)

function toIsoLocal(dt) {
  if (!dt) return ''
  // Accept luxon DateTime or ISO string / Date.
  if (dt.toFormat) return dt.toFormat("yyyy-MM-dd'T'HH:mm")
  const d = new Date(dt)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const isSaving = ref(false)

function validate() {
  if (!form.value.name?.trim()) return 'Name is required'
  if (!form.value.formTemplateId) return 'Form template is required'
  if (form.value.scheduleType === 'RECURRING' && !form.value.cron?.trim()) {
    return 'RECURRING schedule requires a cron expression'
  }
  if (form.value.assigneeMode === 'USERS') {
    if (!form.value.assignedUserIds || form.value.assignedUserIds.length === 0) {
      return 'At least one assignee is required (or pick a role instead)'
    }
  } else {
    if (!form.value.assignedRoleId) return 'Pick a role (or assign users instead)'
  }
  return null
}

function buildPayload() {
  const schedule =
    form.value.scheduleType === 'AD_HOC'
      ? { type: 'AD_HOC' }
      : {
          type: 'RECURRING',
          cron: form.value.cron,
          timezone: form.value.timezone || 'UTC',
          windowMinutes: Number(form.value.windowMinutes) || 120,
          startOffsetMinutes: Number(form.value.startOffsetMinutes) || 0,
        }
  return {
    name: form.value.name.trim(),
    description: form.value.description?.trim() || null,
    formTemplateId: form.value.formTemplateId,
    assignedUserIds: form.value.assigneeMode === 'USERS' ? form.value.assignedUserIds : null,
    assignedRoleId: form.value.assigneeMode === 'ROLE' ? form.value.assignedRoleId : null,
    siteId: form.value.siteId || null,
    schedule,
    graceMinutes: Number(form.value.graceMinutes) || 60,
    effectiveAt: form.value.effectiveAt || null,
    effectiveUntil: form.value.effectiveUntil || null,
    active: form.value.active,
  }
}

async function save() {
  const err = validate()
  if (err) {
    toast.error(err)
    return
  }
  isSaving.value = true
  try {
    const payload = buildPayload()
    if (isEditing.value) {
      await patch(`/v1/services/formAssignments/${props.id}`, payload)
      toast.success('Assignment plan updated')
    } else {
      await post('/v1/services/formAssignments', payload)
      toast.success('Assignment plan created')
    }
    router.push(getCompanyPath('/inspections-logs/form-assignments'))
  } catch (e) {
    toast.error(e?.message || 'Failed to save assignment plan')
  } finally {
    isSaving.value = false
  }
}

async function archive() {
  if (!isEditing.value) return
  if (!confirm('Archive this assignment plan? Existing instances stay; no new ones generate.')) {
    return
  }
  isSaving.value = true
  try {
    await del(`/v1/services/formAssignments/${props.id}`)
    toast.success('Assignment plan archived')
    router.push(getCompanyPath('/inspections-logs/form-assignments'))
  } catch (e) {
    toast.error(e?.message || 'Failed to archive')
  } finally {
    isSaving.value = false
  }
}

function back() {
  router.push(getCompanyPath('/inspections-logs/form-assignments'))
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4 tw:h-full tw:p-5 tw:overflow-y-auto">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">
          {{ isEditing ? 'Edit Assignment Plan' : 'New Assignment Plan' }}
        </h2>
      </div>
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <BaseButton variant="ghost" @click="back">
        <IconArrowLeft :size="16" />
        Back
      </BaseButton>
      <BaseButton
        v-if="isEditing && canAssign"
        variant="ghost"
        class="tw:text-red-600"
        :disabled="isSaving"
        @click="archive"
      >
        <IconTrash :size="16" />
        Archive
      </BaseButton>
      <BaseButton variant="primary" :disabled="isSaving || !canAssign" @click="save">
        <IconDeviceFloppy :size="16" />
        {{ isSaving ? 'Saving…' : 'Save' }}
      </BaseButton>
    </SafeTeleport>

    <div class="tw:max-w-4xl tw:flex tw:flex-col tw:gap-5">
      <!-- Basics -->
      <div class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-5 tw:space-y-3">
        <h3 class="tw:text-sm tw:font-semibold tw:text-on-main">Basics</h3>
        <div>
          <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:block tw:mb-1">
            Name
          </label>
          <BaseTextInput v-model="form.name" placeholder="e.g. Warehouse A — daily temperature" />
        </div>
        <div>
          <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:block tw:mb-1">
            Description
          </label>
          <BaseTextarea
            v-model="form.description"
            placeholder="Optional context for assignees"
            :rows="2"
          />
        </div>
        <div>
          <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:block tw:mb-1">
            Form template
          </label>
          <select
            v-model="form.formTemplateId"
            class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
          >
            <option value="" disabled>Pick a form template…</option>
            <option v-for="t in $db.FormTemplate ? [] : []" :key="t.id" :value="t.id">
              {{ t.title }}
            </option>
          </select>
          <FormTemplateInlineSelect v-model="form.formTemplateId" />
        </div>
      </div>

      <!-- Assignees -->
      <div class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-5 tw:space-y-3">
        <h3 class="tw:text-sm tw:font-semibold tw:text-on-main">Assignees</h3>
        <div class="tw:flex tw:items-center tw:gap-4">
          <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm">
            <input v-model="form.assigneeMode" type="radio" value="USERS" name="assigneeMode" />
            <span class="tw:text-on-main">Specific users</span>
          </label>
          <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm">
            <input v-model="form.assigneeMode" type="radio" value="ROLE" name="assigneeMode" />
            <span class="tw:text-on-main">All users in a role</span>
          </label>
        </div>
        <div v-if="form.assigneeMode === 'USERS'">
          <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:block tw:mb-1">
            Users
          </label>
          <UserSelectMenu v-model="form.assignedUserIds" :multiple="true" />
        </div>
        <div v-else>
          <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:block tw:mb-1">
            Role
          </label>
          <RoleSelectMenu v-model="form.assignedRoleId" :required="true" />
          <p class="tw:text-[11px] tw:text-secondary tw:italic tw:mt-1">
            Members are resolved at instance generation time. Adding a user to the role tomorrow
            gives them tomorrow's occurrences, not today's.
          </p>
        </div>
      </div>

      <!-- Schedule -->
      <div class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-5 tw:space-y-3">
        <h3 class="tw:text-sm tw:font-semibold tw:text-on-main">Schedule</h3>
        <div class="tw:flex tw:items-center tw:gap-4">
          <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm">
            <input v-model="form.scheduleType" type="radio" value="RECURRING" name="scheduleType" />
            <span class="tw:text-on-main">Recurring (cron-driven)</span>
          </label>
          <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm">
            <input v-model="form.scheduleType" type="radio" value="AD_HOC" name="scheduleType" />
            <span class="tw:text-on-main">Ad-hoc (no schedule)</span>
          </label>
        </div>

        <template v-if="form.scheduleType === 'RECURRING'">
          <CronPicker v-model="form.cron" :timezone="form.timezone" />
          <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
            <div>
              <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:block tw:mb-1">
                Timezone (IANA)
              </label>
              <select
                v-model="form.timezone"
                class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
              >
                <option v-for="tz in COMMON_TIMEZONES" :key="tz" :value="tz">{{ tz }}</option>
              </select>
            </div>
            <div>
              <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:block tw:mb-1">
                Window length (minutes)
              </label>
              <input
                v-model.number="form.windowMinutes"
                type="number"
                min="1"
                max="2880"
                class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
              />
              <p class="tw:text-[11px] tw:text-secondary tw:italic tw:mt-1">
                How long the window stays open after the scheduled time.
              </p>
            </div>
            <div>
              <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:block tw:mb-1">
                Start offset (minutes)
              </label>
              <input
                v-model.number="form.startOffsetMinutes"
                type="number"
                min="0"
                max="2880"
                class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
              />
              <p class="tw:text-[11px] tw:text-secondary tw:italic tw:mt-1">
                Delay between dueAt and when the window opens. 0 = window opens at dueAt.
              </p>
            </div>
            <div>
              <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:block tw:mb-1">
                Grace minutes (before MISSED)
              </label>
              <input
                v-model.number="form.graceMinutes"
                type="number"
                min="0"
                max="10080"
                class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
              />
              <p class="tw:text-[11px] tw:text-secondary tw:italic tw:mt-1">
                How long after the window closes before the instance flips to MISSED.
              </p>
            </div>
          </div>
        </template>
        <template v-else>
          <p class="tw:text-sm tw:text-secondary">
            Ad-hoc plans don't generate instances. Assigned users see the form in their available
            list and can submit it whenever needed.
          </p>
          <div>
            <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:block tw:mb-1">
              Grace minutes
            </label>
            <input
              v-model.number="form.graceMinutes"
              type="number"
              min="0"
              max="10080"
              class="tw:w-40 tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
            />
          </div>
        </template>
      </div>

      <!-- Location + lifecycle -->
      <div class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-5 tw:space-y-3">
        <h3 class="tw:text-sm tw:font-semibold tw:text-on-main">Location &amp; Lifecycle</h3>
        <div>
          <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:block tw:mb-1">
            Site (optional)
          </label>
          <SiteSelectMenu v-model="form.siteId" :required="false" />
        </div>
        <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
          <div>
            <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:block tw:mb-1">
              Effective from (optional)
            </label>
            <input
              v-model="form.effectiveAt"
              type="datetime-local"
              class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
            />
          </div>
          <div>
            <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:block tw:mb-1">
              Effective until (optional)
            </label>
            <input
              v-model="form.effectiveUntil"
              type="datetime-local"
              class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
            />
          </div>
        </div>
        <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm">
          <input v-model="form.active" type="checkbox" />
          <span class="tw:text-on-main">Active</span>
        </label>
      </div>

      <div v-if="!canAssign" class="tw:text-xs tw:text-red-600 tw:italic">
        You need the <code>inspections:assign</code> permission to save.
      </div>
    </div>
  </div>
</template>
