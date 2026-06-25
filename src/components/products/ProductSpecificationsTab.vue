<script setup>
/**
 * Specifications for a single product, embedded on the product detail page.
 * Lists every (non-superseded) specification scoped to this product; clicking
 * one opens the full SpecificationDetail INLINE (embedded, same tab) rather
 * than navigating off to the QC Inspection module. New draft (pre-scoped to the
 * product), approve via e-sign, and delete are all available from the list.
 *
 * Reads live from the SyncEngine; create/approve/delete go through the
 * qcInspection REST service (aggregate writes, not plain entity CRUD).
 */
import { IconPlus } from '@tabler/icons-vue'
import { post, del } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { isAllowed } from '@/utils/currentSession.js'

const props = defineProps({
  productId: { type: String, required: true },
  productName: { type: String, default: '' },
})

const toast = useToast()

const selectedSpecId = ref(null)
const showCreate = ref(false)
const showEsign = ref(false)
const approvingId = ref(null)
const deletingId = ref(null)

const canManage = computed(() => isAllowed(['qcInspection:spec:write']))

const backLabel = computed(() =>
  props.productName ? `Back to ${props.productName} specifications` : 'Back to specifications',
)

const MATERIAL_LABELS = {
  RAW: 'Raw material',
  PACKAGING: 'Packaging',
  BULK: 'Bulk',
  FINISHED: 'Finished good',
}

const columns = [
  { name: 'name', label: 'NAME', field: 'name', align: 'left' },
  { name: 'material', label: 'MATERIAL', field: 'materialKind', align: 'left' },
  { name: 'version', label: 'VERSION', field: 'version', align: 'left' },
  { name: 'status', label: 'STATUS', field: 'statusId', align: 'left' },
  { name: 'actions', label: '', field: 'actions', align: 'right' },
]

const specs = useLiveQueryWithDeps(
  [() => props.productId],
  async (db, [productId]) => {
    if (!productId) return []
    const rows = await db.Specification.where('productId', productId).exec()
    return rows
      .filter((s) => s.statusId !== 'SUPERSEDED')
      .sort((a, b) => (a.name || '').localeCompare(b.name || '') || b.version - a.version)
  },
  { models: ['Specification'], initial: [] },
)

function openSpec(id) {
  selectedSpecId.value = id
}

function startApprove(spec) {
  approvingId.value = spec.id
  showEsign.value = true
}

async function onEsignVerified({ method, token }) {
  if (!approvingId.value) return
  try {
    await post(`/v1/services/qcInspection/specifications/${approvingId.value}/approve`, {
      esign: { method, token },
    })
    toast.success('Specification approved — now effective')
  } catch (err) {
    toast.error(err?.message || 'Approval failed')
  } finally {
    approvingId.value = null
  }
}

async function deleteSpec(id) {
  if (deletingId.value !== id) {
    deletingId.value = id
    return
  }
  try {
    await del(`/v1/services/qcInspection/specifications/${id}`)
    toast.success('Specification deleted')
  } catch (err) {
    toast.error(err?.message || 'Delete failed')
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <!-- Inline spec detail (embedded — back returns to this list) -->
  <SpecificationDetail
    v-if="selectedSpecId"
    :id="selectedSpecId"
    :key="selectedSpecId"
    embedded
    :backLabel="backLabel"
    @back="selectedSpecId = null"
    @openSpec="(id) => (selectedSpecId = id)"
  />

  <!-- Spec list -->
  <div v-else class="tw:flex tw:flex-col tw:gap-3">
    <div class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:flex-wrap">
      <div class="tw:text-sm tw:text-secondary">
        {{ specs.length }} specification(s) for this item
      </div>
      <BaseButton v-if="canManage" variant="primary" size="sm" @click="showCreate = true">
        <template #icon><IconPlus :size="16" /></template>
        New Specification
      </BaseButton>
    </div>

    <DataTable
      :rows="specs"
      :columns="columns"
      rowKey="id"
      :mobileCards="false"
      hidePagination
      noDataLabel="No specifications for this item yet."
    >
      <template #body-cell-name="{ row }">
        <button
          type="button"
          class="tw:font-medium tw:text-on-main tw:hover:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:text-left tw:p-0"
          :aria-label="`Open specification ${row.name}`"
          @click="openSpec(row.id)"
        >
          {{ row.name }}
          <span v-if="row.code" class="tw:text-xs tw:text-secondary tw:font-mono"
            >· {{ row.code }}</span
          >
        </button>
      </template>

      <template #body-cell-material="{ row }">
        <span class="tw:text-secondary">{{ MATERIAL_LABELS[row.materialKind] || row.materialKind }}</span>
      </template>

      <template #body-cell-version="{ row }">
        <span class="tw:text-secondary">v{{ row.version }}</span>
      </template>

      <template #body-cell-status="{ row }">
        <SpecificationStatusBadgeById :statusId="row.statusId" />
      </template>

      <template #body-cell-actions="{ row }">
        <div
          v-if="canManage && row.statusId === 'DRAFT'"
          class="tw:flex tw:items-center tw:justify-end tw:gap-2"
        >
          <BaseButton variant="outline" size="sm" @click="startApprove(row)">Approve</BaseButton>
          <BaseButton
            :variant="deletingId === row.id ? 'danger' : 'outline'"
            size="sm"
            @click="deleteSpec(row.id)"
          >
            {{ deletingId === row.id ? 'Confirm Delete?' : 'Delete' }}
          </BaseButton>
        </div>
      </template>
    </DataTable>
  </div>

  <SpecificationCreateDialog
    v-model="showCreate"
    :lockProductId="productId"
    @created="openSpec"
  />
  <WorkflowInstanceEsignAuthDialog v-model="showEsign" @verified="onEsignVerified" />
</template>
