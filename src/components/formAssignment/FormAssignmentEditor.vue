<script setup>
import { IconArrowLeft, IconDeviceFloppy, IconTrash } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { post, patch, del } from '@/api'

/**
 * Create / edit a Log Book Assignment.
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
  // When set, the assignment is scoped to this log book: the Log book
  // picker is hidden and the value is pre-filled. Used when the editor is
  // embedded in a log book's Assignments tab.
  logBookId: { type: String, default: null },
  // Embedded = rendered inside another page (the Assignments tab) rather
  // than as a standalone route. Suppresses the page-header teleports and
  // emits `saved`/`cancel` instead of navigating.
  embedded: { type: Boolean, default: false },
})

const emit = defineEmits(['saved', 'cancel'])

const router = useRouter()
const toast = useToast()

// Lock the log book when we're scoped to one (embedded in its tab) — the
// picker is hidden and the value can't be changed.
const lockLogBook = computed(() => props.embedded || !!props.logBookId)

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

// Default a new assignment to the admin's own timezone (most schedules
// are set for "my" timezone). Ensure it's in the dropdown options.
const userTimezone = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
})()
const timezoneOptions = computed(() =>
  [...new Set([userTimezone, form.value.timezone, ...COMMON_TIMEZONES].filter(Boolean))],
)

const form = ref({
  logBookId: '',
  scheduleType: 'RECURRING', // RECURRING | AD_HOC
  cron: '0 8 * * *',
  timezone: userTimezone,
  windowMinutes: 240, // 4h — matches the Daily default in DEFAULTS_BY_FREQUENCY
  startOffsetMinutes: 0,
  graceMinutes: 120, // 2h — matches the Daily default
  onWindowExpire: 'MISS', // MISS | KEEP_OPEN — what happens when the window+grace lapses unfilled
  assigneeMode: 'USERS', // USERS | ROLE
  assignedUserIds: [],
  assignedRoleId: '',
  active: true,
})

// Frequency the CronPicker last reported. Drives unit picking on the
// window / grace inputs below. Possible values: 'daily' | 'weekly' |
// 'monthly' | 'quarterly' | 'semi_annual' | 'annual'.
const frequency = ref('daily')

// Honour `?logBookId=...` so the "New assignment" button on a log book
// detail page lands here with the picker pre-filled. We only apply
// this in create mode — editing an existing plan shouldn't have its
// log book overwritten by query params.
const route = useRoute()
const presetLogBookId =
  props.logBookId || (typeof route.query?.logBookId === 'string' ? route.query.logBookId : '')
if (!props.id && presetLogBookId) {
  form.value.logBookId = presetLogBookId
}

/**
 * Industry-standard defaults — surveyed across CMMS/inspection SaaS
 * (MaintainX, SafetyCulture, Limble, Fiix, eMaint, UpKeep). The
 * pattern is the same everywhere: window + grace scale with the
 * frequency so a monthly check isn't held to "must complete in 2 hours"
 * and a daily check isn't given "30 days to finish."
 *
 *   Daily         → 4h window, 2h grace
 *   Weekly        → 2d window, 1d grace
 *   Monthly       → 5d window, 3d grace
 *   Quarterly     → 7d window, 5d grace
 *   Semi-annual   → 14d window, 7d grace
 *   Annual        → 30d window, 14d grace
 */
const DEFAULTS_BY_FREQUENCY = {
  daily: { windowMinutes: 4 * 60, graceMinutes: 2 * 60 },
  weekly: { windowMinutes: 2 * 24 * 60, graceMinutes: 1 * 24 * 60 },
  monthly: { windowMinutes: 5 * 24 * 60, graceMinutes: 3 * 24 * 60 },
  quarterly: { windowMinutes: 7 * 24 * 60, graceMinutes: 5 * 24 * 60 },
  semi_annual: { windowMinutes: 14 * 24 * 60, graceMinutes: 7 * 24 * 60 },
  annual: { windowMinutes: 30 * 24 * 60, graceMinutes: 14 * 24 * 60 },
}

/**
 * Unit the window/grace inputs render in. Sub-day frequencies (Daily)
 * use hours; everything weekly+ uses days. Minutes are still possible
 * via the Advanced cron mode — we don't expose them here because every
 * real log-book schedule worth scheduling is at least daily-grain.
 */
function unitForFrequency(freq) {
  return freq === 'daily' ? 'hours' : 'days'
}
function unitMinutes(unit) {
  return unit === 'days' ? 24 * 60 : unit === 'hours' ? 60 : 1
}
function fromMinutes(min, unit) {
  if (!Number.isFinite(min)) return 0
  return Math.round((min / unitMinutes(unit)) * 100) / 100
}
function toMinutes(val, unit) {
  return Math.max(0, Math.round(Number(val) * unitMinutes(unit)))
}

const unit = computed(() => unitForFrequency(frequency.value))
const windowDisplay = computed({
  get: () => fromMinutes(form.value.windowMinutes, unit.value),
  set: (v) => {
    form.value.windowMinutes = toMinutes(v, unit.value)
  },
})
const graceDisplay = computed({
  get: () => fromMinutes(form.value.graceMinutes, unit.value),
  set: (v) => {
    form.value.graceMinutes = toMinutes(v, unit.value)
  },
})

// When the user picks a different frequency, seed window + grace with
// that frequency's industry-standard defaults. We only apply defaults
// when the user hasn't manually edited away from the previous
// frequency's default — avoids stomping on intentional customisation.
let lastSuggestedFrequency = null
watch(frequency, (next) => {
  if (lastSuggestedFrequency === next) return
  const def = DEFAULTS_BY_FREQUENCY[next]
  if (!def) return
  // Apply unless the user has set non-default values matching a
  // different scheme — best-effort, not perfect.
  const prevDef = lastSuggestedFrequency && DEFAULTS_BY_FREQUENCY[lastSuggestedFrequency]
  const windowWasDefault =
    !prevDef || form.value.windowMinutes === prevDef.windowMinutes
  const graceWasDefault = !prevDef || form.value.graceMinutes === prevDef.graceMinutes
  if (windowWasDefault) form.value.windowMinutes = def.windowMinutes
  if (graceWasDefault) form.value.graceMinutes = def.graceMinutes
  lastSuggestedFrequency = next
})

const isEditing = computed(() => Boolean(props.id))
const existing = useLiveQueryWithDeps([() => props.id], async (db, [id]) => {
  if (!id) return null
  return db.FormAssignment.findByPk(id)
})

// Round 0 refactor: log books are a first-class entity. We query
// db.LogBook directly — every row qualifies (OPERATIONAL_LOG or
// CONTROLLED_RECORD; UTILITY templates never land here). Variable name
// preserved as `inspectionTemplates` to minimise template churn.
const inspectionTemplates = useLiveQuery(
  async (db) => {
    const rows = await db.LogBook.where().exec()
    return rows.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''))
  },
  { initial: [] },
)

// Seed the form from the stored plan ONCE per id. The live query
// re-runs on every syncBus tick; without this guard it would re-seed
// (clobber) the user's in-progress edits, so Save would post stale data.
let seededForId = null
watch(
  existing,
  (plan) => {
    if (!plan) return
    if (seededForId === plan.id) return
    seededForId = plan.id
    form.value = {
      logBookId: plan.logBookId ?? '',
      scheduleType: plan.schedule?.type ?? 'RECURRING',
      cron: plan.schedule?.cron ?? '0 8 * * MON',
      timezone: plan.schedule?.timezone ?? 'UTC',
      windowMinutes: plan.schedule?.windowMinutes ?? 120,
      startOffsetMinutes: plan.schedule?.startOffsetMinutes ?? 0,
      graceMinutes: plan.graceMinutes ?? 60,
      onWindowExpire: plan.schedule?.onWindowExpire ?? 'MISS',
      assigneeMode: plan.assignedRoleId ? 'ROLE' : 'USERS',
      assignedUserIds: plan.assignedUserIds ?? [],
      assignedRoleId: plan.assignedRoleId ?? '',
      active: plan.active ?? true,
    }
  },
  { immediate: true },
)

const isSaving = ref(false)

function validate() {
  if (!form.value.logBookId) return 'Log book is required'
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
          onWindowExpire: form.value.onWindowExpire === 'KEEP_OPEN' ? 'KEEP_OPEN' : 'MISS',
        }
  return {
    logBookId: form.value.logBookId,
    assignedUserIds: form.value.assigneeMode === 'USERS' ? form.value.assignedUserIds : null,
    assignedRoleId: form.value.assigneeMode === 'ROLE' ? form.value.assignedRoleId : null,
    schedule,
    graceMinutes: Number(form.value.graceMinutes) || 60,
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
      toast.success('Log book assignment updated')
    } else {
      await post('/v1/services/formAssignments', payload)
      toast.success('Log book assignment created')
    }
    if (props.embedded) emit('saved')
    else router.push(getCompanyPath('/inspections-logs/form-assignments'))
  } catch (e) {
    toast.error(e?.message || 'Failed to save assignment')
  } finally {
    isSaving.value = false
  }
}

async function archive() {
  if (!isEditing.value) return
  if (!confirm('Archive this log book assignment? Existing instances stay; no new ones generate.')) {
    return
  }
  isSaving.value = true
  try {
    await del(`/v1/services/formAssignments/${props.id}`)
    toast.success('Log book assignment archived')
    if (props.embedded) emit('saved')
    else router.push(getCompanyPath('/inspections-logs/form-assignments'))
  } catch (e) {
    toast.error(e?.message || 'Failed to archive')
  } finally {
    isSaving.value = false
  }
}

function back() {
  if (props.embedded) {
    emit('cancel')
    return
  }
  router.push(getCompanyPath('/inspections-logs/form-assignments'))
}
</script>

<template>
  <div
    :class="
      embedded
        ? 'tw:flex tw:flex-col tw:gap-4'
        : 'tw:flex tw:flex-col tw:gap-4 tw:h-full tw:p-5 tw:overflow-y-auto'
    "
  >
    <!-- Standalone-route chrome: title + actions teleported to the page
         header. Suppressed when embedded (the host tab owns the header). -->
    <template v-if="!embedded">
      <SafeTeleport to="#main-header-title">
        <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
          <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">
            {{ isEditing ? 'Edit Log Book Assignment' : 'New Log Book Assignment' }}
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
    </template>

    <!-- Embedded chrome: an inline action bar at the top of the panel. -->
    <div v-else class="tw:flex tw:items-center tw:justify-between tw:gap-2">
      <h3 class="tw:text-base tw:font-semibold tw:text-on-main">
        {{ isEditing ? 'Edit Assignment' : 'New Assignment' }}
      </h3>
      <div class="tw:flex tw:items-center tw:gap-2">
        <BaseButton variant="ghost" @click="back">Cancel</BaseButton>
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
      </div>
    </div>

    <div class="tw:max-w-4xl tw:flex tw:flex-col tw:gap-5">
      <!-- Log book — standalone only. When embedded in a log book's
           Assignments tab the book is fixed (lockLogBook), so this whole
           section is hidden and the value is pre-filled from the prop. -->
      <div
        v-if="!lockLogBook"
        class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-5 tw:space-y-3"
      >
        <h3 class="tw:text-sm tw:font-semibold tw:text-on-main">Log book</h3>
        <div>
          <select
            v-model="form.logBookId"
            class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
          >
            <option value="" disabled>Pick a log book…</option>
            <option v-for="t in inspectionTemplates" :key="t.id" :value="t.id">
              {{ t.title }} ({{ t.recordClassification }})
            </option>
          </select>
          <p
            v-if="inspectionTemplates.length === 0"
            class="tw:text-[11px] tw:text-red-600 tw:italic tw:mt-1"
          >
            No log books yet. Create one from the Log Books page and then come back to assign it.
          </p>
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
          <p class="tw:text-[11px] tw:text-secondary tw:italic tw:mt-1">
            Click each user you want to assign — the menu stays open so you can pick
            multiple (e.g. one per shift). All selected users get an instance per
            occurrence.
          </p>
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
          <CronPicker
            v-model="form.cron"
            v-model:frequency="frequency"
            :timezone="form.timezone"
          />
          <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
            <div>
              <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:block tw:mb-1">
                Timezone (IANA)
              </label>
              <select
                v-model="form.timezone"
                class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
              >
                <option v-for="tz in timezoneOptions" :key="tz" :value="tz">{{ tz }}</option>
              </select>
            </div>
            <div>
              <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:block tw:mb-1">
                Window length ({{ unit }})
              </label>
              <input
                v-model.number="windowDisplay"
                type="number"
                min="0"
                step="0.5"
                class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
              />
              <p class="tw:text-[11px] tw:text-secondary tw:italic tw:mt-1">
                How long the entry stays open after the scheduled time.
              </p>
            </div>
            <div>
              <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:block tw:mb-1">
                Start offset ({{ unit }})
              </label>
              <input
                :value="fromMinutes(form.startOffsetMinutes, unit)"
                type="number"
                min="0"
                step="0.5"
                class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
                @input="(e) => (form.startOffsetMinutes = toMinutes(e.target.value, unit))"
              />
              <p class="tw:text-[11px] tw:text-secondary tw:italic tw:mt-1">
                Delay between dueAt and when the window opens. 0 = opens at dueAt.
              </p>
            </div>
            <div>
              <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:block tw:mb-1">
                Grace ({{ unit }}, before MISSED)
              </label>
              <input
                v-model.number="graceDisplay"
                type="number"
                min="0"
                step="0.5"
                class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
              />
              <p class="tw:text-[11px] tw:text-secondary tw:italic tw:mt-1">
                How long after the window closes before the instance flips to MISSED.
              </p>
            </div>
          </div>
          <div>
            <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:block tw:mb-1">
              When the window closes unfilled
            </label>
            <div class="tw:inline-flex tw:rounded-lg tw:border tw:border-divider tw:overflow-hidden">
              <button
                class="tw:px-3 tw:py-1.5 tw:text-sm tw:border-0 tw:cursor-pointer"
                :class="
                  form.onWindowExpire !== 'KEEP_OPEN'
                    ? 'tw:bg-primary tw:text-white'
                    : 'tw:bg-card tw:text-secondary'
                "
                @click="form.onWindowExpire = 'MISS'"
              >
                Mark as missed
              </button>
              <button
                class="tw:px-3 tw:py-1.5 tw:text-sm tw:border-0 tw:border-l tw:border-divider tw:cursor-pointer"
                :class="
                  form.onWindowExpire === 'KEEP_OPEN'
                    ? 'tw:bg-primary tw:text-white'
                    : 'tw:bg-card tw:text-secondary'
                "
                @click="form.onWindowExpire = 'KEEP_OPEN'"
              >
                Keep open until done
              </button>
            </div>
            <p class="tw:text-[11px] tw:text-secondary tw:italic tw:mt-1">
              <template v-if="form.onWindowExpire === 'KEEP_OPEN'">
                The task stays overdue in the assignee's inbox until completed — nothing
                auto-misses. For work that must be done regardless of lateness.
              </template>
              <template v-else>
                A missed occurrence is recorded as a gap, leaves the inbox, and notifies the
                supervisor. For time-bound readings that can't be done late.
              </template>
            </p>
          </div>
        </template>
        <template v-else>
          <p class="tw:text-sm tw:text-secondary">
            Ad-hoc plans don't generate instances. Assigned users see the form in their available
            list and can submit it whenever needed.
          </p>
        </template>
      </div>

      <!-- Location & Lifecycle removed for log book assignments: site
           scoping + the effective-from/until window were more than these
           need. Assignments are always-active (form.active defaults true,
           dates null in the payload). Re-add a pause toggle here if a
           tenant needs to disable an assignment without deleting it. -->

      <div v-if="!canAssign" class="tw:text-xs tw:text-red-600 tw:italic">
        You need the <code>inspections:assign</code> permission to save.
      </div>
    </div>
  </div>
</template>
