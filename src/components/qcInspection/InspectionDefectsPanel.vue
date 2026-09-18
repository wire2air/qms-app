<script setup>
/**
 * AQL Acceptance (read-only). Per the percent-defective model (ANSI/ASQ Z1.4 ·
 * ISO 2859-1) it counts DEFECTIVE UNITS per defect class (Critical/Major/Minor)
 * — a sampled unit is one defective for a class if any of its characteristics of
 * that class fail — and compares each class to the sampling plan's per-class
 * accept/reject numbers, showing an ADVISORY Accept / Reject verdict. Acceptance
 * is driven by the spec characteristics + their defect class (the Test Library
 * feeds the spec; the spec drives this — no separate defect logging).
 */
const props = defineProps({
  // [{ severity, accept, reject }] from lot.samplingSnapshot.perSeverity.
  perSeverity: { type: Array, default: () => [] },
  // Defective-unit counts per defect class { CRITICAL, MAJOR, MINOR }.
  defectiveUnits: { type: Object, default: () => ({}) },
  // Inspected sample size (n) — shown for context ("k of n defective").
  sampleSize: { type: Number, default: null },
  // Single-result capture: one judgment applies to the whole sample (no per-unit
  // readings), so a failing test counts the whole sample defective for its class.
  singleResult: { type: Boolean, default: false },
})

const verdict = computed(() => {
  if (!props.perSeverity?.length) return null
  const rows = props.perSeverity.map((p) => {
    const count = Number(props.defectiveUnits?.[p.severity] ?? 0)
    return { ...p, count, rejected: p.reject != null && count >= p.reject }
  })
  return { rows, verdict: rows.some((r) => r.rejected) ? 'REJECT' : 'ACCEPT' }
})

const columns = [
  { name: 'class', label: 'Class', field: 'severity', align: 'left' },
  { name: 'defectives', label: 'Defectives', field: 'count', align: 'left' },
  { name: 'accept', label: 'Accept ≤', field: 'accept', align: 'left' },
  { name: 'reject', label: 'Reject ≥', field: 'reject', align: 'left' },
  { name: 'verdict', label: 'Verdict', field: 'severity', align: 'left' },
]
</script>

<template>
  <div v-if="verdict" class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
    <div class="tw:px-5 tw:py-3 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:gap-3">
      <h3 class="tw:text-sm tw:font-semibold tw:text-on-main">AQL Acceptance</h3>
      <span
        class="tw:text-xs tw:font-bold tw:px-2.5 tw:py-1 tw:rounded-full"
        :class="verdict.verdict === 'REJECT' ? 'tw:bg-red-100 tw:text-red-700' : 'tw:bg-green-100 tw:text-green-700'"
      >
        {{ verdict.verdict }} (advisory)
      </span>
    </div>

    <div class="tw:p-4">
      <DataTable
        :rows="verdict.rows"
        :columns="columns"
        rowKey="severity"
        :mobileCards="false"
        :stickyHeader="false"
        hidePagination
      >
        <template #body-cell-class="{ row }">
          <DefectSeverityBadgeById :severityId="row.severity" />
        </template>
        <template #body-cell-defectives="{ row }">
          <span class="tw:font-semibold" :class="row.rejected ? 'tw:text-red-700' : 'tw:text-on-main'">
            {{ row.count }}<span v-if="sampleSize" class="tw:text-secondary tw:font-normal"> / {{ sampleSize }}</span>
          </span>
        </template>
        <template #body-cell-accept="{ row }">
          <span class="tw:text-secondary">{{ row.accept ?? '—' }}</span>
        </template>
        <template #body-cell-reject="{ row }">
          <span class="tw:text-secondary">{{ row.reject ?? '—' }}</span>
        </template>
        <template #body-cell-verdict="{ row }">
          <span class="tw:text-xs tw:font-semibold" :class="row.rejected ? 'tw:text-red-700' : 'tw:text-green-700'">
            {{ row.rejected ? 'Reject' : 'OK' }}
          </span>
        </template>
      </DataTable>
      <p v-if="singleResult" class="tw:text-caption tw:text-secondary tw:mt-2">
        <strong>Single-result inspection:</strong> the one judgment applies to the whole sample, so a
        failing test marks all {{ sampleSize ?? 'n' }} units defective for that class (→ reject).
        Switch to <strong>Per sample</strong> capture to accept/reject on individual defective units.
        Advisory — the QA reviewer records the final disposition.
      </p>
      <p v-else class="tw:text-caption tw:text-secondary tw:mt-2">
        Counts are <strong>defective units</strong> per class — a unit is one defective if any of
        its tests in that class fail (so a unit failing several tests still counts once), compared to
        the sampling plan's accept/reject numbers. Advisory — the QA reviewer records the final
        disposition.
      </p>
    </div>
  </div>
</template>
