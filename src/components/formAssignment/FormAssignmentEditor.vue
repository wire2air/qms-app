<script setup>
import { IconArrowLeft, IconDeviceFloppy, IconTrash } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { post, patch, del } from '@/api'
import {
  resolveLogBookTrainingGaps,
  resolveAssignmentAudience,
} from '@/composables/useLogBookTraining.js'

/**
 * Create / edit a Log Book Assignment.
 *
 * Uses the REST endpoints directly (POST/PATCH/DELETE
 * /v1/services/formAssignments) rather than SyncEngine save — the
 * controller validates the cron expression, the assignedUserIds /
 * assignee union (roles + users), the schedule shape, etc. Going
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
const { confirm } = useConfirm()

// Lock the log book when we're scoped to one (embedded in its tab) — the
// picker is hidden and the value can't be changed.
const lockLogBook = computed(() => props.embedded || !!props.logBookId)

const canAssign = computed(() => isAllowed(['inspections:assign']))

// Default a new assignment to the admin's own timezone (most schedules
// are set for "my" timezone). Ensure it's in the dropdown options.
const userTimezone = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
})()

const form = ref({
  logBookId: '',
  scheduleType: 'RECURRING', // RECURRING | AD_HOC
  cron: '0 8 * * *',
  timezone: userTimezone,
  windowMinutes: 240, // 4h — matches the Daily default in DEFAULTS_BY_FREQUENCY
  startOffsetMinutes: 0,
  graceMinutes: 120, // 2h — matches the Daily default
  onWindowExpire: 'MISS', // MISS | KEEP_OPEN — what happens when the window+grace lapses unfilled
  // Users and roles are UNIONED (2026-08-15) — no mode toggle. "The QA team
  // plus Priya" is an ordinary ask and the old either/or refused it.
  assignedUserIds: [],
  assignedRoleIds: [],
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
  const windowWasDefault = !prevDef || form.value.windowMinutes === prevDef.windowMinutes
  const graceWasDefault = !prevDef || form.value.graceMinutes === prevDef.graceMinutes
  if (windowWasDefault) form.value.windowMinutes = def.windowMinutes
  if (graceWasDefault) form.value.graceMinutes = def.graceMinutes
  lastSuggestedFrequency = next
})

const isEditing = computed(() => Boolean(props.id))
const existing = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return null
    return db.FormAssignment.findByPk(id)
  },
  { models: ['FormAssignment'] },
)

// Round 0 refactor: log books are a first-class entity. We query
// db.LogBook directly — every row qualifies (OPERATIONAL_LOG or
// CONTROLLED_RECORD; UTILITY templates never land here). Variable name
// preserved as `inspectionTemplates` to minimise template churn.
const inspectionTemplates = useLiveQuery(
  async (db) => {
    const rows = await db.LogBook.where().exec()
    return rows.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''))
  },

  { models: ['LogBook'], initial: [] },
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
      assignedUserIds: plan.assignedUserIds ?? [],
      assignedRoleIds: plan.assignedRoleIds ?? [],
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
  // Mirrors the DB CHECK: target somebody, either way, or both.
  const hasUsers = (form.value.assignedUserIds?.length ?? 0) > 0
  const hasRoles = (form.value.assignedRoleIds?.length ?? 0) > 0
  if (!hasUsers && !hasRoles) return 'Assign at least one user or role'
  return null
}

function buildPayload() {
  // Audience only — scheduling lives on the log book (2026-08-06).
  return {
    logBookId: form.value.logBookId,
    assignedUserIds: form.value.assignedUserIds ?? [],
    assignedRoleIds: form.value.assignedRoleIds ?? [],
    active: form.value.active,
  }
}

/**
 * Soft training gate (2026-08-08): if the book links controlling documents
 * that the assignees aren't trained on, warn the manager — they may continue
 * (the person will be blocked from actually logging until trained, and their
 * task/notification will say so) or cancel. Best-effort: a check failure
 * never blocks the save.
 * @returns {Promise<boolean>} true = proceed, false = manager cancelled.
 */
async function confirmTrainingGaps() {
  try {
    const audience = await resolveAssignmentAudience({
      assignedUserIds: form.value.assignedUserIds,
      assignedRoleIds: form.value.assignedRoleIds,
    })
    if (!audience.length) return true
    const { byUser } = await resolveLogBookTrainingGaps(form.value.logBookId, audience)
    const untrainedCount = [...byUser.values()].filter((docs) => docs.length).length
    if (!untrainedCount) return true

    const docTitles = [...new Set([...byUser.values()].flat().map((d) => d.title))].join(', ')
    const who = untrainedCount === 1 ? '1 assignee has not' : `${untrainedCount} assignees have not`
    return await confirm({
      title: 'Training not complete',
      message:
        `${who} completed the required training on the document(s) linked to this log book ` +
        `(${docTitles}). They can be assigned, but won't be able to record entries until the ` +
        `training is complete and verified. Assign anyway?`,
      okLabel: 'Assign anyway',
      cancelLabel: 'Cancel',
    })
  } catch {
    return true // never block a save on a training-check failure
  }
}

async function save() {
  const err = validate()
  if (err) {
    toast.error(err)
    return
  }
  if (!(await confirmTrainingGaps())) return
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
  if (
    !(await confirm({
      title: 'Archive Assignment',
      message: 'Archive this log book assignment? Existing instances stay; no new ones generate.',
      okLabel: 'Archive',
      danger: true,
    }))
  ) {
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
      <PageHeader>
        <template #title>
          {{ isEditing ? 'Edit Log Book Assignment' : 'New Log Book Assignment' }}
        </template>
      </PageHeader>

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
      <BaseText as="h3" variant="subheading">
        {{ isEditing ? 'Edit Assignment' : 'New Assignment' }}
      </BaseText>
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
      <BaseCard v-if="!lockLogBook" class="tw:space-y-3">
        <BaseText as="h3" weight="semibold">Log book</BaseText>
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
            class="tw:text-caption tw:text-red-600 tw:italic tw:mt-1"
          >
            No log books yet. Create one from the Log Books page and then come back to assign it.
          </p>
        </div>
      </BaseCard>

      <!-- Assignees -->
      <BaseCard class="tw:space-y-3">
        <BaseText as="h3" weight="semibold">Assignees</BaseText>
        <p class="tw:text-sm tw:text-secondary">
          Roles and users are combined — pick any mix. Everyone named here, plus every member of the
          roles you pick, gets an instance per occurrence. Somebody who is both only gets one.
        </p>
        <BaseField
          label="Roles"
          hint="Members are resolved at instance generation time. Adding a user to the role tomorrow gives them tomorrow's occurrences, not today's."
        >
          <RoleSelectMenu v-model="form.assignedRoleIds" :multiple="true" />
        </BaseField>
        <BaseField
          label="Users"
          hint="Click each user you want to assign — the menu stays open so you can pick multiple (e.g. one per shift)."
        >
          <UserSelectMenu v-model="form.assignedUserIds" :multiple="true" />
        </BaseField>
      </BaseCard>

      <!-- Schedule moved to the LOG BOOK (Details → Schedule, 2026-08-06):
           an assignment is pure AUDIENCE now — who logs, not when. -->
      <BaseCard class="tw:space-y-2">
        <BaseText as="h3" weight="semibold">Schedule</BaseText>
        <p class="tw:text-sm tw:text-secondary">
          When entries happen is configured on the log book itself (Details → Schedule): ad hoc, a
          recurring cadence, or an equipment calibration/PM trigger. This assignment only decides
          who is expected to log.
        </p>
      </BaseCard>

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
