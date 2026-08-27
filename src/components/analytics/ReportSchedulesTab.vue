<script setup>
/**
 * The delivery schedules for one saved report, and the proof that they fired.
 *
 * ── WHAT A SCHEDULE IS ──────────────────────────────────────────────────────
 * A standing instruction to mail THIS report, on a cron, to a list of people
 * described as REFERENCES rather than addresses. The report itself holds no
 * numbers, and neither does the schedule: `run_report_schedules` queues one
 * export job PER RECIPIENT so every copy is resolved under its reader's own
 * access. That is why the same schedule legitimately sends different figures to
 * different people, and why this screen never previews "the" numbers.
 *
 * ── THE PERMISSION SPLIT THIS SCREEN DRAWS ──────────────────────────────────
 * Two different questions, two different answers, and conflating them would be a
 * security hole rather than a rough edge:
 *
 *   MAY I WRITE THIS ROW?   owner, company owner, or reports_dashboards:manage
 *                           (analytics_report_schedules_update_rls USING)
 *   MAY IT BE LIVE?         reports_dashboards:EXPORT, checked on the resulting
 *                           row as `(is_active = false OR has_permission(export))`
 *
 * A live schedule mails figures out of the system on a timer with nobody
 * watching: holding one IS an export. Gate it on `manage` instead and a
 * manage-only holder could name themselves the sole recipient of a weekly send
 * and receive by email exactly the file `request_report_export` refuses them —
 * the scheduler would become a bypass of the export gate, reachable through the
 * product's own UI.
 *
 * Because the check is on the ROW and not the operation, two things follow and
 * both are drawn below: anyone with write access may create and save a DRAFT,
 * and anyone with write access may always switch a running schedule OFF. Turning
 * something off is what an administrator reaches for when it is going wrong; it
 * must never be the thing they lack a permission for.
 *
 * None of this is the enforcement. RLS is. These decide which controls to draw.
 *
 * ── RETIRING, NOT DELETING ──────────────────────────────────────────────────
 * app_user has no DELETE grant on this table and no DELETE policy, on purpose:
 * `analytics_report_runs` cascades from it, so a hard delete would take the
 * delivery evidence with it. Retiring is a soft delete, and it clears
 * `is_active` in the SAME update — the UPDATE WITH CHECK is evaluated against
 * the resulting row, so soft-deleting a still-active schedule would otherwise
 * demand `:export` from whoever is trying to stop it.
 */
import { IconCalendarClock, IconHistory, IconPencil, IconPlus, IconTrash } from '@tabler/icons-vue'
import { currentSession, isAllowed } from '@/utils/currentSession'
import {
  canActivateSchedule,
  canEditSchedule,
  nextRunTimes,
  normaliseRecipients,
} from '@/utils/analyticsReportSchedules.js'

const props = defineProps({
  reportId: { type: String, required: true },
})

const toast = useToast()
const { confirm } = useConfirm()

const schedules = useLiveQueryWithDeps(
  [() => props.reportId],
  async (db, [reportId]) => {
    if (!reportId) return []
    const rows = await db.AnalyticsReportSchedule.where('reportId', reportId).exec()
    return rows.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)))
  },
  { models: 'AnalyticsReportSchedule', initial: [] },
)

const viewer = computed(() => ({
  userId: currentSession.value?.id ?? null,
  // isAllowed already returns true for a company owner, which is the owner
  // branch of the SQL — no separate test needed.
  canManage: isAllowed(['reports_dashboards:manage']),
}))

/**
 * The export gate, kept separate from `canManage` on purpose — see the header.
 * A courtesy only: RLS re-checks it on every write and refuses regardless of
 * what this draws.
 */
const canExport = computed(() => isAllowed(['reports_dashboards:export']))

// ── create / edit ───────────────────────────────────────────────────────────
const dialogOpen = ref(false)
const editing = ref(null)

function newSchedule() {
  editing.value = null
  dialogOpen.value = true
}

function editSchedule(schedule) {
  editing.value = schedule
  dialogOpen.value = true
}

// ── activate / deactivate inline ────────────────────────────────────────────
const setActive = useLiveMutation(async (db, { id, isActive }) => {
  const schedule = await db.AnalyticsReportSchedule.findByPk(id)
  if (!schedule) throw new Error('That schedule no longer exists.')
  schedule.isActive = isActive
  await schedule.save()
})

async function toggleActive(schedule, next) {
  try {
    await setActive({ id: schedule.id, isActive: next })
    toast.success(next ? 'Schedule is now live' : 'Schedule switched off')
  } catch (err) {
    toast.error(err?.message || 'Could not change the schedule')
  }
}

// ── retire ──────────────────────────────────────────────────────────────────
const retire = useLiveMutation(async (db, id) => {
  const schedule = await db.AnalyticsReportSchedule.findByPk(id)
  if (!schedule) return
  // Same update as the soft delete — see the header for why this is not
  // housekeeping.
  schedule.isActive = false
  await schedule.delete()
})

async function retireSchedule(schedule) {
  const ok = await confirm({
    title: 'Retire schedule',
    message: `Stop "${schedule.name}" from sending? Its run history is kept — that record is the only proof of what was already delivered.`,
    okLabel: 'Retire',
    danger: true,
  })
  if (!ok) return
  try {
    await retire(schedule.id)
    toast.success('Schedule retired')
  } catch (err) {
    toast.error(err?.message || 'Could not retire the schedule')
  }
}

// ── run history disclosure ──────────────────────────────────────────────────
const openRunsFor = ref(null)

function toggleRuns(schedule) {
  openRunsFor.value = openRunsFor.value === schedule.id ? null : schedule.id
}

// ── row helpers ─────────────────────────────────────────────────────────────

/**
 * The next firing, computed HERE rather than read from `next_run_at`.
 *
 * `next_run_at` is the worker's armed time: null until the first tick claims the
 * schedule, and stale for the moments between an edit and the next tick. Reading
 * it would show "—" on a schedule that is perfectly well configured, which reads
 * as broken. The stored column stays authoritative for WHEN IT ACTUALLY FIRES;
 * this is what the author asked for.
 */
function nextRun(schedule) {
  const [first] = nextRunTimes(schedule.cronExpression, schedule.timezone, 1)
  return first ?? null
}

function recipientCount(schedule) {
  return normaliseRecipients(schedule.recipients).length
}

/**
 * Why the switch is refusing, or '' when it is not. Every disabled case returns
 * a sentence: a dead control with no explanation is indistinguishable from a
 * broken one, and this is the exact control where "why can't I?" is the whole
 * user question.
 *
 * Note the asymmetry, which is the RLS shape rather than a UI choice: switching
 * OFF is never blocked by a permission, only by not being allowed to write the
 * row at all.
 */
function switchReason(schedule) {
  if (!canEditSchedule(schedule, viewer.value)) {
    return 'Only the schedule owner or someone with Reports & Dashboards manage can change this.'
  }
  // Off is always available to anyone who may write the row — see the header.
  if (schedule.isActive) return ''
  if (!canActivateSchedule({ canExport: canExport.value })) {
    return 'Turning a schedule on needs the Reports & Dashboards export permission — a live schedule mails figures out of the system on a timer.'
  }
  if (recipientCount(schedule) === 0) {
    return 'Add at least one recipient before switching this on. An active schedule with nobody to send to runs for ever, does nothing, and looks healthy the whole time.'
  }
  return ''
}
</script>

<template>
  <PageSection
    title="Delivery schedules"
    :icon="IconCalendarClock"
    subtitle="Send this report on a repeating schedule. Every recipient receives their own copy, resolved under their own access."
  >
    <template #actions>
      <BaseButton size="sm" @click="newSchedule">
        <IconPlus :size="14" aria-hidden="true" />
        New schedule
      </BaseButton>
    </template>

    <BaseEmptyState
      v-if="(schedules?.length ?? 0) === 0"
      :icon="IconCalendarClock"
      title="No schedules yet"
      description="A schedule mails this report to named people, groups or roles on a cron. New schedules start switched off."
    />

    <div v-else class="tw:flex tw:flex-col tw:gap-3">
      <BaseCard v-for="s in schedules" :key="s.id" class="tw:flex tw:flex-col tw:gap-3">
        <div class="tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-3">
          <div class="tw:min-w-0">
            <div class="tw:flex tw:items-center tw:gap-2">
              <BaseText weight="medium" class="tw:truncate">{{ s.name }}</BaseText>
              <BaseBadge
                :class="
                  s.isActive
                    ? 'tw:bg-green-100 tw:text-green-700'
                    : 'tw:bg-gray-100 tw:text-gray-600'
                "
              >
                {{ s.isActive ? 'Live' : 'Off' }}
              </BaseBadge>
            </div>
            <BaseText v-if="s.description" variant="caption" color="secondary" :lines="2">
              {{ s.description }}
            </BaseText>
          </div>

          <div class="tw:flex tw:items-center tw:gap-2">
            <BaseTooltip v-if="switchReason(s)" :content="switchReason(s)">
              <BaseSwitch
                :modelValue="s.isActive"
                :label="`Schedule ${s.name} is active`"
                disabled
              />
            </BaseTooltip>
            <BaseSwitch
              v-else
              :modelValue="s.isActive"
              :label="`Schedule ${s.name} is active`"
              @update:modelValue="(v) => toggleActive(s, v)"
            />
            <BaseButton
              v-if="canEditSchedule(s, viewer)"
              size="sm"
              variant="ghost"
              :aria-label="`Edit schedule ${s.name}`"
              @click="editSchedule(s)"
            >
              <IconPencil :size="14" aria-hidden="true" />
            </BaseButton>
            <BaseButton
              v-if="canEditSchedule(s, viewer)"
              size="sm"
              variant="ghost"
              :aria-label="`Retire schedule ${s.name}`"
              @click="retireSchedule(s)"
            >
              <IconTrash :size="14" aria-hidden="true" />
            </BaseButton>
          </div>
        </div>

        <div class="tw:grid tw:gap-2 tw:sm:grid-cols-2 tw:lg:grid-cols-4">
          <div>
            <BaseText variant="caption" color="secondary">When</BaseText>
            <BaseText variant="caption">{{ s.cronExpression }} · {{ s.timezone }}</BaseText>
          </div>
          <div>
            <BaseText variant="caption" color="secondary">Next run</BaseText>
            <BaseText variant="caption">
              {{ nextRun(s) ? nextRun(s).formatDate('datetime') : 'Not scheduled' }}
            </BaseText>
          </div>
          <div>
            <BaseText variant="caption" color="secondary">Last sent</BaseText>
            <BaseText variant="caption">
              {{ s.lastRunAt?.isValid ? s.lastRunAt.formatDate('datetime') : 'Never' }}
            </BaseText>
          </div>
          <div>
            <BaseText variant="caption" color="secondary">Recipients</BaseText>
            <BaseText variant="caption">
              {{ recipientCount(s) }}
              {{ recipientCount(s) === 1 ? 'reference' : 'references' }} ·
              {{ String(s.format).toUpperCase() }}
            </BaseText>
          </div>
        </div>

        <div class="tw:flex tw:items-center tw:justify-between tw:gap-2">
          <BaseButton size="sm" variant="text" @click="toggleRuns(s)">
            <IconHistory :size="14" aria-hidden="true" />
            {{ openRunsFor === s.id ? 'Hide run history' : 'Run history' }}
          </BaseButton>
          <BaseText v-if="!s.isActive" variant="caption" color="secondary">
            Switched off — nothing is sent while it is off.
          </BaseText>
        </div>

        <ReportScheduleRuns v-if="openRunsFor === s.id" :scheduleId="s.id" />
      </BaseCard>
    </div>

    <ReportScheduleDialog
      v-model:open="dialogOpen"
      :reportId="reportId"
      :schedule="editing"
      :canExport="canExport"
    />
  </PageSection>
</template>
