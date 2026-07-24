<script setup>
/**
 * Retain Sample REGISTER — printable inventory report of retained samples
 * (the artifact QA hands an auditor). Optional `?state=` filter narrows to
 * RETAINED / DUE (≤30 days) / OVERDUE / DISPOSED. Wraps PrintLayout for the
 * company chrome; auto-fires window.print() once loaded (TrainingMatrixPrint
 * pattern).
 */
import { DateTime } from 'luxon'

const props = defineProps({
  state: { type: String, default: null }, // RETAINED | DUE | OVERDUE | DISPOSED | null = all
})

const TYPE_LABELS = { RESERVE: 'Reserve', REFERENCE: 'Reference', RETENTION: 'Retention' }
const STATE_LABELS = {
  RETAINED: 'Retained',
  DUE: 'Due for destruction (≤30 days)',
  OVERDUE: 'Overdue for destruction',
  DISPOSED: 'Disposed',
}

function derivedState(row) {
  if (row.statusId !== 'RETAINED') return row.statusId
  if (row.retainUntil?.isValid) {
    const days = row.retainUntil.diff(DateTime.now(), 'days').days
    if (days < 0) return 'OVERDUE'
    if (days <= 30) return 'DUE'
  }
  return 'RETAINED'
}

const samples = useLiveQuery(
  async (db) => {
    const rows = await db.RetainSample.where().exec()
    return rows.sort((a, b) => (a.rsNumber || '').localeCompare(b.rsNumber || ''))
  },
  { models: ['RetainSample'], initial: undefined },
)
const products = useLiveQuery(async (db) => db.Product.where().exec(), {
  models: ['Product'],
  initial: [],
})
const locations = useLiveQuery(async (db) => db.StorageLocation.where().exec(), {
  models: ['StorageLocation'],
  initial: [],
})
const uoms = useLiveQuery(async (db) => db.Uom.where().exec(), { models: ['Uom'], initial: [] })

const productName = (id) => products.value.find((p) => p.id === id)?.name || '—'
const locationText = (row) =>
  [locations.value.find((l) => l.id === row.storageLocationId)?.name, row.position]
    .filter(Boolean)
    .join(' / ') || '—'
const uomCode = (id) => uoms.value.find((u) => u.id === id)?.code || ''
const dateStr = (d) => (d?.isValid ? d.toFormat('yyyy-MM-dd') : '—')

const stateFilter = computed(() => (props.state ? String(props.state).toUpperCase() : null))
const rows = computed(() => {
  const all = samples.value ?? []
  if (!stateFilter.value || stateFilter.value === 'ALL') return all
  return all.filter((s) => derivedState(s) === stateFilter.value)
})

const fired = ref(false)
watch(samples, (list) => {
  if (list === undefined || fired.value) return
  fired.value = true
  setTimeout(() => window.print(), 500)
})
</script>

<template>
  <PrintLayout identifier="Retain Sample Register" :showAudit="false">
    <template #title>
      <h1 class="tw:text-xl tw:font-bold">Retain Sample Register</h1>
      <p class="tw:text-sm tw:text-secondary tw:mt-1">
        {{ rows.length }} sample{{ rows.length === 1 ? '' : 's' }}
        <template v-if="stateFilter && STATE_LABELS[stateFilter]">
          · {{ STATE_LABELS[stateFilter] }}
        </template>
        · Printed {{ dateStr(DateTime.now()) }}
      </p>
    </template>

    <table class="register tw:w-full tw:text-xs tw:border-collapse">
      <thead>
        <tr>
          <th>Sample #</th>
          <th>Item</th>
          <th>Lot #</th>
          <th>Type</th>
          <th>Qty</th>
          <th>Location</th>
          <th>Retained</th>
          <th>Retain until</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in rows" :key="s.id">
          <td class="tw:font-mono tw:font-semibold">{{ s.rsNumber }}</td>
          <td>{{ productName(s.productId) }}</td>
          <td>{{ s.lotNumber || '—' }}</td>
          <td>{{ TYPE_LABELS[s.sampleType] || s.sampleType }}</td>
          <td>{{ s.quantity != null ? `${s.quantity} ${uomCode(s.uomId)}` : '—' }}</td>
          <td>{{ locationText(s) }}</td>
          <td>{{ dateStr(s.retainedAt) }}</td>
          <td>{{ dateStr(s.retainUntil) }}</td>
          <td>{{ STATE_LABELS[derivedState(s)]?.split(' (')[0] || derivedState(s) }}</td>
        </tr>
        <tr v-if="rows.length === 0">
          <td colspan="9" class="tw:text-center tw:text-secondary tw:py-4">No samples match.</td>
        </tr>
      </tbody>
    </table>
  </PrintLayout>
</template>

<style scoped>
.register th {
  text-align: left;
  border-bottom: 1.5px solid #000;
  padding: 4px 6px;
  font-weight: 700;
  white-space: nowrap;
}
.register td {
  border-bottom: 1px solid #ddd;
  padding: 3px 6px;
  vertical-align: top;
}
.register tr { break-inside: avoid; }
</style>
