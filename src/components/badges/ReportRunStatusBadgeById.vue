<script setup>
/**
 * Enum-flavour badge (CLAUDE.md badge triad) for `analytics_report_runs.status`.
 * No SyncEngine status model exists and none should: the five values are a CHECK
 * constraint on the run log, not a tenant-editable lookup table — a status
 * somebody could rename or add to would let the run log make claims the worker
 * never makes.
 *
 * There is no matching XSelectMenu, and that is not an omission: a run status is
 * never chosen by a human. Nothing in the app may write this table at all —
 * app_user holds SELECT and INSERT and the rows come from the worker.
 */
import { RUN_STATUS_HELP, RUN_STATUS_LABEL } from '@/utils/analyticsReportSchedules.js'

const props = defineProps({
  statusId: { type: String, default: null },
  withHelp: { type: Boolean, default: true },
})

const STATUS_MAP = Object.fromEntries(
  Object.entries(RUN_STATUS_LABEL).map(([id, name]) => [id, { id, name }]),
)

const status = computed(
  () =>
    STATUS_MAP[props.statusId] ||
    (props.statusId ? { id: props.statusId, name: props.statusId } : null),
)

const help = computed(() => RUN_STATUS_HELP[props.statusId] || 'What happened on this run.')
</script>

<template>
  <BaseTooltip v-if="status && withHelp" :content="help">
    <ReportRunStatusBadge :status="status" v-bind="$attrs" />
  </BaseTooltip>
  <ReportRunStatusBadge v-else-if="status" :status="status" v-bind="$attrs" />
</template>
