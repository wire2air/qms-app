<script setup>
/**
 * Inspection Plans — the resolution table for lot creation: each row binds a
 * (product OR product type, inspection point) to a Specification + Sampling
 * Plan + disposition Workflow. Lots created for a matching product+point pick
 * these up automatically (specific-product plans win over product-type plans).
 * Rendered via the shared DataTable — search, advanced filter (point + active),
 * density, column manager and export all live in the table toolbar.
 */
import { IconPlus } from '@tabler/icons-vue'
import { del } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.

defineProps({ canManage: { type: Boolean, default: false } })

const toast = useToast()
const showCreate = ref(false)
const showEdit = ref(false)
const editingPlan = ref(null)
const deletingId = ref(null)

const POINT_LABELS = { INCOMING: 'Incoming', IN_PROCESS: 'In-process', FINAL: 'Final' }
const POINT_OPTIONS = Object.entries(POINT_LABELS).map(([value, label]) => ({ value, label }))
const ACTIVE_OPTIONS = [
  { value: true, label: 'Active' },
  { value: false, label: 'Inactive' },
]

const plans = useLiveQuery(
  async (db) => {
    const rows = await db.QcInspectionTemplate.where().exec()
    return rows.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  },

  { models: ['QcInspectionTemplate'], initial: [] },
)

const products = useLiveQuery(async (db) => db.Product.where().exec(), {
  models: ['Product'],
  initial: [],
})
const productTypes = useLiveQuery(async (db) => db.ProductType.where().exec(), {
  models: ['ProductType'],
  initial: [],
})
const specs = useLiveQuery(async (db) => db.Specification.where().exec(), {
  models: ['Specification'],
  initial: [],
})
const samplingPlans = useLiveQuery(async (db) => db.SamplingPlan.where().exec(), {
  models: ['SamplingPlan'],
  initial: [],
})
const workflows = useLiveQuery(async (db) => db.Workflow.where().exec(), {
  models: ['Workflow'],
  initial: [],
})
const workflowVersions = useLiveQuery(async (db) => db.WorkflowVersion.where().exec(), {
  models: ['WorkflowVersion'],
  initial: [],
})

function scopeLabel(t) {
  if (t.productId) {
    const p = products.value.find((x) => x.id === t.productId)
    return p ? `${p.name}${p.sku ? ` · ${p.sku}` : ''}` : '—'
  }
  const pt = productTypes.value.find((x) => x.id === t.productTypeId)
  return pt ? `${pt.name} (type)` : '—'
}
function specName(id) {
  if (!id) return '—'
  const s = specs.value.find((x) => x.id === id)
  return s ? `${s.name} v${s.version}` : '—'
}
function samplingName(id) {
  if (!id) return '—'
  return samplingPlans.value.find((x) => x.id === id)?.name ?? '—'
}
function workflowName(versionId) {
  const v = workflowVersions.value.find((x) => x.id === versionId)
  if (!v) return '—'
  const w = workflows.value.find((x) => x.id === v.workflowId)
  return w ? `${w.name} v${v.versionMajor}.${v.versionMinor}` : '—'
}

const columns = [
  { name: 'name', label: 'NAME', field: 'name', align: 'left', sortable: true },
  {
    name: 'point',
    label: 'POINT',
    field: 'inspectionPoint',
    align: 'left',
    filterType: 'select',
    filterOptions: POINT_OPTIONS,
  },
  { name: 'appliesTo', label: 'APPLIES TO', field: 'productId', align: 'left' },
  { name: 'specification', label: 'SPECIFICATION', field: 'specificationId', align: 'left' },
  { name: 'sampling', label: 'SAMPLING PLAN', field: 'samplingPlanId', align: 'left' },
  { name: 'workflow', label: 'WORKFLOW', field: 'workflowVersionId', align: 'left' },
  {
    name: 'active',
    label: 'ACTIVE',
    field: 'active',
    align: 'left',
    filterType: 'select',
    filterOptions: ACTIVE_OPTIONS,
  },
  { name: 'actions', label: '', field: 'actions', align: 'right' },
]

function startEdit(plan) {
  editingPlan.value = plan
  showEdit.value = true
}

async function deletePlan(id) {
  if (deletingId.value !== id) {
    deletingId.value = id
    return
  }
  try {
    await del(`/v1/services/qcInspection/templates/${id}`)
    toast.success('Inspection plan deleted')
  } catch (err) {
    toast.error(err?.message || 'Delete failed')
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <DataTable
    :rows="plans"
    :columns="columns"
    rowKey="id"
    :mobileCards="false"
    searchable
    filterable
    exportManager
    exportFilename="inspection-plans.csv"
    persistKey="qcInspection:inspectionPlans"
    noDataLabel="No inspection plans yet. Create one to bind a Specification + Sampling Plan to a product (or product type) and inspection point — new lots will pick them up automatically."
  >
    <template #toolbar-left>
      <span class="tw:text-sm tw:text-secondary">{{ plans.length }} inspection plan(s)</span>
      <BaseButton v-if="canManage" variant="primary" size="sm" @click="showCreate = true">
        <template #icon><IconPlus :size="16" /></template>
        New Inspection Plan
      </BaseButton>
    </template>

    <template #body-cell-name="{ row }">
      <span class="tw:font-medium tw:text-on-main">{{ row.name }}</span>
    </template>

    <template #body-cell-point="{ row }">
      <span class="tw:text-secondary">
        {{ POINT_LABELS[row.inspectionPoint] || row.inspectionPoint }}
      </span>
    </template>

    <template #body-cell-appliesTo="{ row }">
      <span class="tw:text-secondary">{{ scopeLabel(row) }}</span>
    </template>

    <template #body-cell-specification="{ row }">
      <span class="tw:text-secondary">{{ specName(row.specificationId) }}</span>
    </template>

    <template #body-cell-sampling="{ row }">
      <span class="tw:text-secondary">{{ samplingName(row.samplingPlanId) }}</span>
    </template>

    <template #body-cell-workflow="{ row }">
      <span class="tw:text-secondary">{{ workflowName(row.workflowVersionId) }}</span>
    </template>

    <template #body-cell-active="{ row }">
      <span
        class="tw:text-caption tw:font-semibold tw:px-2 tw:py-0.5 tw:rounded-full"
        :class="
          row.active ? 'tw:bg-green-100 tw:text-green-700' : 'tw:bg-gray-200 tw:text-gray-600'
        "
        >{{ row.active ? 'ACTIVE' : 'INACTIVE' }}</span
      >
    </template>

    <template #body-cell-actions="{ row }">
      <div v-if="canManage" class="tw:flex tw:items-center tw:justify-end tw:gap-2">
        <BaseButton variant="outline" size="sm" @click="startEdit(row)">Edit</BaseButton>
        <BaseButton
          :variant="deletingId === row.id ? 'danger' : 'outline'"
          size="sm"
          @click="deletePlan(row.id)"
        >
          {{ deletingId === row.id ? 'Confirm Delete?' : 'Delete' }}
        </BaseButton>
      </div>
    </template>
  </DataTable>

  <InspectionPlanCreateDialog v-model="showCreate" />
  <InspectionPlanCreateDialog v-model="showEdit" :editPlan="editingPlan" />
</template>
