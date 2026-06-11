<script setup>
/**
 * Inspection lots list — the QC execution queue. Reads live from the
 * SyncEngine; create/import/transition go through the qcInspection REST service.
 */
import { IconPlus } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'

defineProps({ canCreate: { type: Boolean, default: false } })

const router = useRouter()
const showCreate = ref(false)
const pointFilter = ref(null)

const POINT_LABELS = {
  INCOMING: 'Incoming (IQC)',
  IN_PROCESS: 'In-process (IPQC)',
  FINAL: 'Final (FQC)',
  OUTGOING: 'Outgoing (OQC)',
}
const POINT_OPTIONS = Object.entries(POINT_LABELS).map(([id, name]) => ({ id, name }))

const lots = useLiveQueryWithDeps(
  [() => pointFilter.value],
  async (db, [point]) => {
    const rows = await db.InspectionLot.where().exec()
    const filtered = point ? rows.filter((l) => l.inspectionPoint === point) : rows
    return filtered.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },
  { initial: [] },
)
const products = useLiveQuery(async (db) => db.Product.where().exec(), { initial: [] })
const productName = (id) => products.value.find((p) => p.id === id)?.name || '—'

function openLot(id) {
  router.push(getCompanyPath(`/qc-inspection/lots/${id}`))
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <div class="tw:flex tw:items-center tw:justify-between tw:gap-2">
      <BaseInlineSelect
        v-model="pointFilter"
        :items="POINT_OPTIONS"
        nullLabel="— All points —"
        class="tw:w-56"
      />
      <BaseButton v-if="canCreate" variant="primary" size="sm" @click="showCreate = true">
        <template #icon><IconPlus :size="16" /></template>
        New Lot
      </BaseButton>
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
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="l in lots"
            :key="l.id"
            class="tw:border-t tw:border-divider tw:cursor-pointer tw:hover:bg-main-hover"
            @click="openLot(l.id)"
          >
            <td class="tw:px-4 tw:py-2.5 tw:font-mono tw:text-on-main">{{ l.lotNumber }}</td>
            <td class="tw:px-4 tw:py-2.5 tw:text-secondary">{{ POINT_LABELS[l.inspectionPoint] || l.inspectionPoint }}</td>
            <td class="tw:px-4 tw:py-2.5">{{ productName(l.productId) }}</td>
            <td class="tw:px-4 tw:py-2.5 tw:text-secondary">{{ l.sampleSize ?? '—' }}<span v-if="l.quantity"> / {{ l.quantity }}</span></td>
            <td class="tw:px-4 tw:py-2.5"><InspectionLotStatusBadgeById :statusId="l.statusId" /></td>
          </tr>
          <tr v-if="!lots.length">
            <td colspan="5" class="tw:px-4 tw:py-8 tw:text-center tw:text-secondary tw:italic">No inspection lots yet.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <InspectionLotCreateDialog v-model="showCreate" @created="(id) => openLot(id)" />
  </div>
</template>
