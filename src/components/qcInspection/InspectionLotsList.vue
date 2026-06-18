<script setup>
/**
 * Inspection lots list — the QC execution queue. Reads live from the
 * SyncEngine; create/import/transition go through the qcInspection REST service.
 */
import { IconPlus, IconDownload, IconUpload } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { dateInRange } from '@/utils/listFilters.js'
import { exportToCSV } from '@/utils/exportUtils.js'

defineProps({ canCreate: { type: Boolean, default: false } })

const router = useRouter()
const showCreate = ref(false)
const showImport = ref(false)
const pointFilter = ref(null)
const dateFrom = ref('')
const dateTo = ref('')

const POINT_LABELS = {
  INCOMING: 'Incoming (IQC)',
  IN_PROCESS: 'In-process (IPQC)',
  FINAL: 'Final (FQC)',
  OUTGOING: 'Outgoing (OQC)',
}
const POINT_OPTIONS = Object.entries(POINT_LABELS).map(([id, name]) => ({ id, name }))

const lots = useLiveQueryWithDeps(
  [() => pointFilter.value, () => dateFrom.value, () => dateTo.value],
  async (db, [point, from, to]) => {
    const rows = await db.InspectionLot.where().exec()
    let filtered = point ? rows.filter((l) => l.inspectionPoint === point) : rows
    if (from || to) filtered = filtered.filter((l) => dateInRange(l.createdAt, from, to))
    return filtered.sort(
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
const dispositionTypes = useLiveQuery(async (db) => db.NcDispositionType.where().exec(), { initial: [] })
const dispositionName = (id) => dispositionTypes.value.find((d) => d.id === id)?.name || ''

function openLot(id) {
  router.push(getCompanyPath(`/qc-inspection/lots/${id}`))
}

function exportCsv() {
  exportToCSV(
    lots.value,
    [
      { field: 'lotNumber', label: 'Lot #' },
      { field: (r) => POINT_LABELS[r.inspectionPoint] || r.inspectionPoint, label: 'Point' },
      { field: (r) => productName(r.productId), label: 'Product' },
      { field: 'statusId', label: 'Status' },
      { field: 'sampleSize', label: 'Sample size' },
      { field: 'quantity', label: 'Quantity' },
      { field: (r) => dispositionName(r.dispositionTypeId), label: 'Disposition' },
      { field: 'qualityState', label: 'Quality state' },
      { field: 'batchNumber', label: 'Batch' },
      { field: 'poNumber', label: 'PO' },
      { field: (r) => r.createdAt?.toFormat?.('yyyy-LL-dd') ?? '', label: 'Created' },
    ],
    'inspection-lots',
  )
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <div class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:flex-wrap">
      <div class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
        <BaseInlineSelect
          v-model="pointFilter"
          :items="POINT_OPTIONS"
          nullLabel="— All points —"
          class="tw:w-56"
        />
        <DateRangeFilter
          :from="dateFrom"
          :to="dateTo"
          @update:from="(v) => (dateFrom = v)"
          @update:to="(v) => (dateTo = v)"
        />
      </div>
      <div class="tw:flex tw:items-center tw:gap-2">
        <BaseButton variant="outline" size="sm" :disabled="!lots.length" @click="exportCsv">
          <template #icon><IconDownload :size="16" /></template>
          Export
        </BaseButton>
        <BaseButton v-if="canCreate" variant="outline" size="sm" @click="showImport = true">
          <template #icon><IconUpload :size="16" /></template>
          Import CSV
        </BaseButton>
        <BaseButton v-if="canCreate" variant="primary" size="sm" @click="showCreate = true">
          <template #icon><IconPlus :size="16" /></template>
          New Lot
        </BaseButton>
      </div>
    </div>

    <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
      <table class="tw:w-full tw:text-sm">
        <thead class="tw:bg-main-hover tw:text-secondary tw:text-xs tw:uppercase">
          <tr>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Lot #</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Point</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Product</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Sample</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Status</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Disposition</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">NC</th>
          </tr>
        </thead>
        <tbody>
          <BaseClickableRow
            v-for="l in lots"
            :key="l.id"
            tag="tr"
            class="tw:border-t tw:border-divider tw:hover:bg-main-hover"
            :aria-label="`Open inspection lot ${l.lotNumber}`"
            @click="openLot(l.id)"
          >
            <td class="tw:px-4 tw:py-2.5 tw:font-mono tw:text-on-main">{{ l.lotNumber }}</td>
            <td class="tw:px-4 tw:py-2.5 tw:text-secondary">
              {{ POINT_LABELS[l.inspectionPoint] || l.inspectionPoint }}
            </td>
            <td class="tw:px-4 tw:py-2.5">{{ productName(l.productId) }}</td>
            <td class="tw:px-4 tw:py-2.5 tw:text-secondary">
              {{ l.sampleSize ?? '—' }}<span v-if="l.quantity"> / {{ l.quantity }}</span>
            </td>
            <td class="tw:px-4 tw:py-2.5">
              <InspectionLotStatusBadgeById :statusId="l.statusId" />
            </td>
            <td class="tw:px-4 tw:py-2.5">
              <NcDispositionTypeBadgeById v-if="l.dispositionTypeId" :dispositionTypeId="l.dispositionTypeId" />
              <span v-else class="tw:text-secondary">—</span>
            </td>
            <td class="tw:px-4 tw:py-2.5" @click.stop>
              <RouterLink
                v-if="l.ncId"
                :to="getCompanyPath(`/nonconformances/${l.ncId}`)"
                class="tw:text-caption tw:font-semibold tw:px-2 tw:py-0.5 tw:rounded-full tw:bg-red-100 tw:text-red-700 tw:hover:bg-red-200"
              >
                NC raised
              </RouterLink>
              <span v-else class="tw:text-secondary">—</span>
            </td>
          </BaseClickableRow>
          <tr v-if="!lots.length">
            <td colspan="7" class="tw:px-4 tw:py-8 tw:text-center tw:text-secondary tw:italic">
              No inspection lots yet.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <InspectionLotCreateDialog v-model="showCreate" @created="(id) => openLot(id)" />
    <InspectionLotImportDialog v-model="showImport" />
  </div>
</template>
