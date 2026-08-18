<script setup>
import { humanizeFilter } from '@/composables/useListPrint.js'
/**
 * Inspection lots list — the QC execution queue. Reads live from the
 * SyncEngine; create/import/transition go through the qcInspection REST service.
 * Rendered via the shared DataTable — search, advanced filter (point + created
 * date), density, column manager and export all live in the table toolbar.
 */
import { IconPlus, IconUpload } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'

defineProps({ canCreate: { type: Boolean, default: false } })

const router = useRouter()
const showCreate = ref(false)
const showImport = ref(false)

const POINT_LABELS = {
  INCOMING: 'Incoming (IQC)',
  IN_PROCESS: 'In-process (IPQC)',
  FINAL: 'Final (FQC)',
  OUTGOING: 'Outgoing (OQC)',
}
const POINT_OPTIONS = Object.entries(POINT_LABELS).map(([value, label]) => ({ value, label }))

// ── Quick views ───────────────────────────────────────────────────────────────
// A bare DataTable, so the pill state is a plain ref synced to ?view= rather
// than useListLayout (same approach as AuditInstancesHome).
const route = useRoute()

const LOT_PILLS = [
  { value: 'all', label: 'All' },
  { value: 'queue', label: 'Inspection queue' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'awaiting_disposition', label: 'Awaiting disposition' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'closed', label: 'Closed' },
]
const PILL_VALUES = new Set(LOT_PILLS.map((p) => p.value))

// A lot is "closed" once it reaches a disposition outcome — those are terminal
// and the lot is no longer QC's work.
const CLOSED_STATUSES = [
  'RELEASED',
  'USE_AS_IS',
  'REGRADE',
  'REWORK',
  'RETURN_TO_SUPPLIER',
  'REJECTED',
  'SCRAP',
]

const activeFilter = ref(PILL_VALUES.has(route.query.view) ? route.query.view : 'all')
watch(
  () => route.query.view,
  (v) => {
    if (v && PILL_VALUES.has(v)) activeFilter.value = v
  },
)
watch(activeFilter, (v) => {
  if (route.query.view !== v) router.replace({ query: { ...route.query, view: v } })
})

function applyActiveFilter(rows, af) {
  // Not yet started — the actual "what do I inspect next" queue.
  if (af === 'queue') return rows.filter((r) => ['DRAFT', 'PENDING'].includes(r.statusId))
  if (af === 'in_progress') return rows.filter((r) => r.statusId === 'IN_PROGRESS')
  // Inspected but not yet dispositioned: the decision backlog.
  if (af === 'awaiting_disposition')
    return rows.filter((r) => ['COMPLETED', 'UNDER_REVIEW'].includes(r.statusId))
  if (af === 'on_hold') return rows.filter((r) => r.statusId === 'HOLD')
  if (af === 'closed') return rows.filter((r) => CLOSED_STATUSES.includes(r.statusId))
  return rows // 'all'
}

const allLots = useLiveQuery(
  async (db) => {
    const rows = await db.InspectionLot.where().exec()
    return rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },
  { models: ['InspectionLot'], initial: [] },
)

const lots = computed(() => applyActiveFilter(allLots.value, activeFilter.value))
const products = useLiveQuery(async (db) => db.Product.where().exec(), {
  models: ['Product'],
  initial: [],
})
const dispositions = useLiveQuery(async (db) => db.NcDispositionType.where().exec(), {
  models: ['NcDispositionType'],
  initial: [],
})
const ncs = useLiveQuery(async (db) => db.Nonconformance.where().exec(), {
  models: ['Nonconformance'],
  initial: [],
})
const productName = (id) => products.value.find((p) => p.id === id)?.name || ''
const dispositionName = (id) => dispositions.value.find((d) => d.id === id)?.name || ''
const ncNumber = (id) => ncs.value.find((n) => n.id === id)?.ncNumber || ''
// Humanize an enum-style status id ("IN_PROGRESS" → "In progress") for the export.
const humanize = (v) =>
  v
    ? String(v)
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/^\w/, (c) => c.toUpperCase())
    : ''

// `exportValue(row)` controls how each column serializes to CSV (the on-screen
// cells use body slots to render badges/links). Resolves ids → readable values.
const columns = [
  { name: 'lotNumber', label: 'QC #', field: 'lotNumber', align: 'left', sortable: true },
  {
    name: 'point',
    label: 'POINT',
    field: 'inspectionPoint',
    align: 'left',
    filterType: 'select',
    filterOptions: POINT_OPTIONS,
    exportValue: (row) => POINT_LABELS[row.inspectionPoint] || row.inspectionPoint || '',
  },
  {
    name: 'product',
    label: 'PRODUCT',
    field: 'productId',
    align: 'left',
    exportValue: (row) => productName(row.productId),
  },
  { name: 'sample', label: 'SAMPLE', field: 'sampleSize', align: 'left' },
  {
    name: 'status',
    label: 'STATUS',
    field: 'statusId',
    align: 'left',
    exportValue: (row) => humanize(row.statusId),
  },
  {
    name: 'disposition',
    label: 'DISPOSITION',
    field: 'dispositionTypeId',
    align: 'left',
    exportValue: (row) => dispositionName(row.dispositionTypeId),
  },
  {
    name: 'nc',
    label: 'NC',
    field: 'ncId',
    align: 'left',
    exportValue: (row) => ncNumber(row.ncId),
  },
  {
    name: 'createdAt',
    label: 'CREATED',
    field: 'createdAt',
    align: 'left',
    sortable: true,
    filterType: 'date',
    exportValue: (row) => (row.createdAt ? row.createdAt.formatDate('date') : ''),
  },
]
// Export-only extra fields (superset of the visible columns).
const exportColumns = [
  ...columns,
  { name: 'quantity', label: 'QUANTITY', exportValue: (row) => row.quantity ?? '' },
  { name: 'batchNumber', label: 'BATCH / LOT REF', exportValue: (row) => row.batchNumber || '' },
]

function openLot(id) {
  router.push(getCompanyPath(`/qc-inspection/lots/${id}`))
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <BaseQuickFilterPills
      v-model="activeFilter"
      :pills="LOT_PILLS"
      ariaLabel="Inspection lot quick views"
    />

    <DataTable
      :rows="lots"
      :columns="columns"
      rowKey="id"
      :mobileCards="false"
      searchable
      filterable
      densitySelector
      columnManager
      exportManager
      :exportColumns="exportColumns"
      exportFilename="inspections.csv"
      persistKey="qcInspection:inspectionLots"
      noDataLabel="No inspection lots yet."
    >
      <template #toolbar-left>
        <span class="tw:text-sm tw:text-secondary">{{ lots.length }} lot(s)</span>
        <ListPrintButton
          entity="InspectionLot"
          title="Inspection Lot Register"
          :rows="lots"
          :filterLabel="humanizeFilter(activeFilter)"
          size="sm"
        />
        <BaseButton v-if="canCreate" variant="outline" size="sm" @click="showImport = true">
          <template #icon><IconUpload :size="16" /></template>
          Import CSV
        </BaseButton>
        <BaseButton v-if="canCreate" variant="primary" size="sm" @click="showCreate = true">
          <template #icon><IconPlus :size="16" /></template>
          New Inspection
        </BaseButton>
      </template>

      <template #body-cell-lotNumber="{ row }">
        <RouterLink
          :to="getCompanyPath(`/qc-inspection/lots/${row.id}`)"
          class="tw:text-on-main tw:hover:text-primary"
        >
          {{ row.lotNumber }}
        </RouterLink>
      </template>

      <template #body-cell-point="{ row }">
        <span class="tw:text-secondary">
          {{ POINT_LABELS[row.inspectionPoint] || row.inspectionPoint }}
        </span>
      </template>

      <template #body-cell-product="{ row }">
        {{ productName(row.productId) }}
      </template>

      <template #body-cell-sample="{ row }">
        <span class="tw:text-secondary">
          {{ row.sampleSize ?? '—' }}<span v-if="row.quantity"> / {{ row.quantity }}</span>
        </span>
      </template>

      <template #body-cell-status="{ row }">
        <InspectionLotStatusBadgeById :statusId="row.statusId" />
      </template>

      <template #body-cell-disposition="{ row }">
        <NcDispositionTypeBadgeById
          v-if="row.dispositionTypeId"
          :dispositionTypeId="row.dispositionTypeId"
        />
        <span v-else class="tw:text-secondary">—</span>
      </template>

      <template #body-cell-nc="{ row }">
        <RouterLink
          v-if="row.ncId"
          :to="getCompanyPath(`/nonconformances/${row.ncId}`)"
          class="tw:text-caption tw:font-semibold tw:px-2 tw:py-0.5 tw:rounded-full tw:bg-red-100 tw:text-red-700 tw:hover:bg-red-200"
        >
          NC raised
        </RouterLink>
        <span v-else class="tw:text-secondary">—</span>
      </template>

      <template #body-cell-createdAt="{ row }">
        <span class="tw:text-secondary">{{ row.createdAt?.formatDate('date') }}</span>
      </template>
    </DataTable>

    <InspectionLotCreateDialog v-model="showCreate" @created="(id) => openLot(id)" />
    <InspectionLotImportDialog v-model="showImport" />
  </div>
</template>
