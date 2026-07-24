<script setup>
/**
 * Retain samples list — the QA retain-storage inventory. One row per retained
 * box/pack, always linked to its source inspection lot. Reads live from the
 * SyncEngine; quick status chips split the inventory into the lists a QA
 * manager works from (Retained / Due ≤30d / Overdue / Disposed). Print opens
 * the filtered register via the central /print route.
 */
import { IconPrinter } from '@tabler/icons-vue'
import { DateTime } from 'luxon'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const router = useRouter()

const TYPE_LABELS = { RESERVE: 'Reserve', REFERENCE: 'Reference', RETENTION: 'Retention' }

// Derived destruction state for a RETAINED row (DUE ≤30 days, OVERDUE past due).
function derivedState(row) {
  if (row.statusId !== 'RETAINED') return row.statusId
  if (row.retainUntil?.isValid) {
    const days = row.retainUntil.diff(DateTime.now(), 'days').days
    if (days < 0) return 'OVERDUE'
    if (days <= 30) return 'DUE'
  }
  return 'RETAINED'
}

const stateFilter = ref('ALL') // ALL | RETAINED | DUE | OVERDUE | DISPOSED

const allSamples = useLiveQuery(
  async (db) => {
    const rows = await db.RetainSample.where().exec()
    return rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },
  { models: ['RetainSample'], initial: [] },
)
const samples = computed(() =>
  stateFilter.value === 'ALL'
    ? allSamples.value
    : allSamples.value.filter((s) => derivedState(s) === stateFilter.value),
)
const stateCounts = computed(() => {
  const counts = { ALL: allSamples.value.length, RETAINED: 0, DUE: 0, OVERDUE: 0, DISPOSED: 0 }
  for (const s of allSamples.value) counts[derivedState(s)] = (counts[derivedState(s)] ?? 0) + 1
  return counts
})
const STATE_CHIPS = [
  { value: 'ALL', label: 'All' },
  { value: 'RETAINED', label: 'Retained' },
  { value: 'DUE', label: 'Due ≤30d' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'DISPOSED', label: 'Disposed' },
]

const products = useLiveQuery(async (db) => db.Product.where().exec(), {
  models: ['Product'],
  initial: [],
})
const locations = useLiveQuery(async (db) => db.StorageLocation.where().exec(), {
  models: ['StorageLocation'],
  initial: [],
})
const uoms = useLiveQuery(async (db) => db.Uom.where().exec(), { models: ['Uom'], initial: [] })
const productName = (id) => products.value.find((p) => p.id === id)?.name || ''
const locationName = (id) => locations.value.find((l) => l.id === id)?.name || ''
const uomCode = (id) => uoms.value.find((u) => u.id === id)?.code || ''

const columns = [
  { name: 'rsNumber', label: 'SAMPLE #', field: 'rsNumber', align: 'left', sortable: true },
  { name: 'product', label: 'ITEM', field: 'productId', align: 'left', exportValue: (row) => productName(row.productId) },
  { name: 'lotNumber', label: 'LOT #', field: 'lotNumber', align: 'left', sortable: true },
  {
    name: 'sampleType',
    label: 'TYPE',
    field: 'sampleType',
    align: 'left',
    filterType: 'select',
    filterOptions: Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label })),
    exportValue: (row) => TYPE_LABELS[row.sampleType] || row.sampleType,
  },
  {
    name: 'quantity',
    label: 'QTY',
    field: 'quantity',
    align: 'left',
    exportValue: (row) => (row.quantity != null ? `${row.quantity} ${uomCode(row.uomId)}`.trim() : ''),
  },
  {
    name: 'location',
    label: 'LOCATION',
    field: 'storageLocationId',
    align: 'left',
    exportValue: (row) => [locationName(row.storageLocationId), row.position].filter(Boolean).join(' / '),
  },
  {
    name: 'retainUntil',
    label: 'RETAIN UNTIL',
    field: 'retainUntil',
    align: 'left',
    sortable: true,
    filterType: 'date',
    exportValue: (row) => (row.retainUntil ? row.retainUntil.formatDate('date') : ''),
  },
  {
    name: 'status',
    label: 'STATUS',
    field: 'statusId',
    align: 'left',
    exportValue: (row) => derivedState(row),
  },
  {
    name: 'retainedAt',
    label: 'RETAINED',
    field: 'retainedAt',
    align: 'left',
    sortable: true,
    filterType: 'date',
    exportValue: (row) => (row.retainedAt ? row.retainedAt.formatDate('date') : ''),
  },
]
const exportColumns = [
  ...columns,
  { name: 'batchNumber', label: 'BATCH #', exportValue: (row) => row.batchNumber || '' },
  { name: 'sealState', label: 'SEAL', exportValue: (row) => row.sealState || '' },
  { name: 'storageConditions', label: 'CONDITIONS', exportValue: (row) => row.storageConditions || '' },
  { name: 'expiryDate', label: 'EXPIRY', exportValue: (row) => (row.expiryDate ? row.expiryDate.formatDate('date') : '') },
]

function openSample(id) {
  router.push(getCompanyPath(`/qc-inspection/retain-samples/${id}`))
}

function openRegisterPrint() {
  const url = getCompanyPath(
    `/print?module=RetainSampleRegister${stateFilter.value !== 'ALL' ? `&state=${stateFilter.value}` : ''}`,
  )
  window.open(url, '_blank')
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <DataTable
      :rows="samples"
      :columns="columns"
      rowKey="id"
      :mobileCards="false"
      searchable
      filterable
      densitySelector
      columnManager
      exportManager
      :exportColumns="exportColumns"
      exportFilename="retain-samples.csv"
      persistKey="qcInspection:retainSamples"
      noDataLabel="No retain samples yet — create them from an inspection lot."
    >
      <template #toolbar-left>
        <div class="tw:flex tw:items-center tw:gap-1">
          <button
            v-for="chip in STATE_CHIPS"
            :key="chip.value"
            type="button"
            class="tw:text-xs tw:rounded-full tw:px-2.5 tw:py-1 tw:border tw:transition"
            :class="
              stateFilter === chip.value
                ? 'tw:bg-primary tw:text-white tw:border-primary'
                : 'tw:bg-card tw:text-secondary tw:border-divider tw:hover:border-primary/40'
            "
            @click="stateFilter = chip.value"
          >
            {{ chip.label }} ({{ stateCounts[chip.value] ?? 0 }})
          </button>
        </div>
        <BaseButton variant="outline" size="sm" @click="openRegisterPrint">
          <template #icon><IconPrinter :size="16" /></template>
          Print Register
        </BaseButton>
      </template>

      <template #body-cell-rsNumber="{ row }">
        <BaseClickableRow
          class="tw:font-semibold tw:text-primary"
          :aria-label="`Open retain sample ${row.rsNumber}`"
          @click="openSample(row.id)"
        >
          {{ row.rsNumber }}
        </BaseClickableRow>
      </template>
      <template #body-cell-product="{ row }">
        {{ productName(row.productId) || '—' }}
      </template>
      <template #body-cell-sampleType="{ row }">
        {{ TYPE_LABELS[row.sampleType] || row.sampleType }}
      </template>
      <template #body-cell-quantity="{ row }">
        {{ row.quantity != null ? `${row.quantity} ${uomCode(row.uomId)}` : '—' }}
      </template>
      <template #body-cell-location="{ row }">
        <span class="tw:truncate">
          {{ [locationName(row.storageLocationId), row.position].filter(Boolean).join(' / ') || '—' }}
        </span>
      </template>
      <template #body-cell-retainUntil="{ row }">
        {{ row.retainUntil ? row.retainUntil.formatDate('date') : '—' }}
      </template>
      <template #body-cell-status="{ row }">
        <RetainSampleStatusBadgeById :statusId="row.statusId" :retainUntil="row.retainUntil" />
      </template>
      <template #body-cell-retainedAt="{ row }">
        {{ row.retainedAt ? row.retainedAt.formatDate('date') : '—' }}
      </template>
    </DataTable>
  </div>
</template>
