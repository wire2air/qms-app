<script setup>
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

const lots = useLiveQuery(
  async (db) => {
    const rows = await db.InspectionLot.where().exec()
    return rows.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },
  { models: ['InspectionLot'], initial: [] },
)
const products = useLiveQuery(async (db) => db.Product.where().exec(), {
  models: ['Product'],
  initial: [],
})
const productName = (id) => products.value.find((p) => p.id === id)?.name || '—'

const columns = [
  { name: 'lotNumber', label: 'LOT #', field: 'lotNumber', align: 'left', sortable: true },
  {
    name: 'point',
    label: 'POINT',
    field: 'inspectionPoint',
    align: 'left',
    filterType: 'select',
    filterOptions: POINT_OPTIONS,
  },
  { name: 'product', label: 'PRODUCT', field: 'productId', align: 'left' },
  { name: 'sample', label: 'SAMPLE', field: 'sampleSize', align: 'left' },
  { name: 'status', label: 'STATUS', field: 'statusId', align: 'left' },
  { name: 'disposition', label: 'DISPOSITION', field: 'dispositionTypeId', align: 'left' },
  { name: 'nc', label: 'NC', field: 'ncId', align: 'left' },
  {
    name: 'createdAt',
    label: 'CREATED',
    field: 'createdAt',
    align: 'left',
    sortable: true,
    filterType: 'date',
  },
]

function openLot(id) {
  router.push(getCompanyPath(`/qc-inspection/lots/${id}`))
}
</script>

<template>
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
    exportFilename="inspection-lots.csv"
    persistKey="qcInspection:inspectionLots"
    noDataLabel="No inspection lots yet."
  >
    <template #toolbar-left>
      <span class="tw:text-sm tw:text-secondary">{{ lots.length }} lot(s)</span>
      <BaseButton v-if="canCreate" variant="outline" size="sm" @click="showImport = true">
        <template #icon><IconUpload :size="16" /></template>
        Import CSV
      </BaseButton>
      <BaseButton v-if="canCreate" variant="primary" size="sm" @click="showCreate = true">
        <template #icon><IconPlus :size="16" /></template>
        New Lot
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
</template>
