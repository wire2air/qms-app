<script setup>
/**
 * What actually happened, each time this schedule fired.
 *
 * ── WHY THIS SCREEN EXISTS AND A QUEUE VIEW WOULD NOT DO ────────────────────
 * graphile-worker DELETES a job row the moment it succeeds — that is the design,
 * and it is why the queue stays small. So the only jobs still visible in
 * `graphile_worker` are the ones that FAILED and have not yet exhausted their
 * retries: a queue view is an inventory of everything that went wrong and
 * nothing that went right, and it empties itself as the failures are cleaned up.
 *
 * `analytics_report_runs` is written by the runner in the same transaction that
 * does the work, precisely so "the Q3 audit summary went to these six people on
 * 12 August" stays answerable months later, when a regulator or a customer audit
 * asks. This list is that record, and it is the ONLY proof a schedule ever ran.
 *
 * ── THE COUNTS ARE THE POINT, NOT DECORATION ────────────────────────────────
 * `deniedCount` is where Phase 8's exit criterion — "a recipient who loses
 * access stops receiving on the next run" — becomes observable. It is invisible
 * in an email that does not arrive, and a send path that silently drops people
 * while reporting success is indistinguishable from one that works. So the
 * delivered / denied / failed split is shown on every row, including the rows
 * where everything went fine, rather than being hidden behind a failure state.
 *
 * ── READ-ONLY, BECAUSE THE TABLE IS ─────────────────────────────────────────
 * app_user holds SELECT and INSERT on this table and nothing else; there is no
 * UPDATE or DELETE policy and neither is granted. A log a user can edit is not
 * evidence. Hence no row actions, no delete, no retry button — the runner owns
 * every row here. Retrying is done by fixing the schedule, not by rewriting its
 * history.
 */
import { RUN_STATUS_LABEL } from '@/utils/analyticsReportSchedules.js'

const props = defineProps({
  scheduleId: { type: String, required: true },
})

const runs = useLiveQueryWithDeps(
  [() => props.scheduleId],
  async (db, [scheduleId]) => {
    if (!scheduleId) return []
    const rows = await db.AnalyticsReportRun.where('scheduleId', scheduleId).exec()
    // Most recent first — the question is almost always "did the last one work".
    return rows
      .slice()
      .sort((a, b) => (b.startedAt?.toMillis?.() ?? 0) - (a.startedAt?.toMillis?.() ?? 0))
  },
  { models: 'AnalyticsReportRun', initial: [] },
)

const columns = [
  { name: 'occurrence', label: 'OCCURRENCE', field: 'occurrence', align: 'left' },
  { name: 'status', label: 'OUTCOME', field: 'status', align: 'left' },
  { name: 'delivery', label: 'DELIVERED', field: 'delivery', align: 'left' },
  { name: 'finished', label: 'FINISHED', field: 'finished', align: 'left' },
  { name: 'detail', label: 'DETAIL', field: 'detail', align: 'left' },
]

/**
 * `scheduled_for` is the cron instant the run BELONGS to, not when work started —
 * they differ whenever the worker was busy or down, and the difference is the
 * whole reason both columns exist. It is null for a manual run, which has no
 * occurrence.
 */
function occurrenceLabel(row) {
  if (row.scheduledFor?.isValid) return row.scheduledFor.formatDate('datetime')
  return row.triggerSource === 'MANUAL' ? 'Run manually' : '—'
}

function startedLabel(row) {
  return row.startedAt?.isValid ? row.startedAt.formatDate('datetime') : '—'
}

function finishedLabel(row) {
  if (row.finishedAt?.isValid) return row.finishedAt.formatDate('datetime')
  // Not "—": a run with no finish is still in flight (or stalled), and that is a
  // different claim from "we don't know".
  return row.status === 'RUNNING' ? 'Still running' : 'Never finished'
}

/**
 * delivered + denied + failed <= recipientCount by CHECK, so a shortfall means
 * "still in flight" rather than a lost person. Reported as a fraction so the
 * denominator — how many people the references EXPANDED to — is always visible.
 */
function deliveryLabel(row) {
  return `${row.deliveredCount ?? 0} of ${row.recipientCount ?? 0}`
}

/** A run that dropped somebody is worth calling out even when it "succeeded". */
function shortfall(row) {
  const denied = row.deniedCount ?? 0
  const failed = row.failedCount ?? 0
  const parts = []
  if (denied) parts.push(`${denied} no longer has export access`)
  if (failed) parts.push(`${failed} could not be sent`)
  return parts.join(' · ')
}

const anyRuns = computed(() => (runs.value?.length ?? 0) > 0)
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-2">
    <BaseEmptyState
      v-if="!anyRuns"
      dense
      title="This schedule has not run yet"
      description="Every firing is recorded here, successful ones included — the job queue deletes successful jobs, so this table is the only lasting proof a report was sent."
    />

    <DataTable
      v-else
      :rows="runs"
      :columns="columns"
      rowKey="id"
      :mobileCards="false"
      hidePagination
      ariaLabel="Schedule run history"
    >
      <template #body-cell-occurrence="{ row }">
        <BaseText variant="caption" weight="medium">{{ occurrenceLabel(row) }}</BaseText>
        <BaseText variant="caption" color="secondary">
          started {{ startedLabel(row) }}<template v-if="(row.attempt ?? 1) > 1">
            · attempt {{ row.attempt }}</template>
        </BaseText>
      </template>

      <template #body-cell-status="{ row }">
        <ReportRunStatusBadgeById :statusId="row.status" />
      </template>

      <template #body-cell-delivery="{ row }">
        <BaseText variant="caption">{{ deliveryLabel(row) }}</BaseText>
        <BaseText v-if="shortfall(row)" variant="caption" color="secondary">
          {{ shortfall(row) }}
        </BaseText>
      </template>

      <template #body-cell-finished="{ row }">
        <BaseText variant="caption">{{ finishedLabel(row) }}</BaseText>
        <BaseText v-if="row.format" variant="caption" color="secondary">
          {{ String(row.format).toUpperCase() }}
        </BaseText>
      </template>

      <template #body-cell-detail="{ row }">
        <!-- Verbatim. A FAILED run always carries an error (CHECK), and a
             generic "Run failed" would throw away the only thing that
             distinguishes a mail-server outage from an unreadable report. -->
        <BaseText v-if="row.error" variant="caption" color="error" :lines="3">
          {{ row.error }}
        </BaseText>
        <BaseText v-else variant="caption" color="secondary">
          {{ RUN_STATUS_LABEL[row.status] ?? row.status }}
        </BaseText>
      </template>
    </DataTable>
  </div>
</template>
