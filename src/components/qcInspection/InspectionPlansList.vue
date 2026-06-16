<script setup>
/**
 * Inspection Plans — the resolution table for lot creation: each row binds a
 * (product OR product type, inspection point) to a Specification + Sampling
 * Plan + disposition Workflow. Lots created for a matching product+point pick
 * these up automatically (specific-product plans win over product-type plans).
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

function startEdit(plan) {
  editingPlan.value = plan
  showEdit.value = true
}

async function deletePlan(id) {
  if (deletingId.value !== id) { deletingId.value = id; return }
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
  <div class="tw:flex tw:flex-col tw:gap-3">
    <div class="tw:flex tw:items-center tw:justify-between tw:gap-2">
      <div class="tw:text-sm tw:text-secondary">
        {{ plans.length }} inspection plan(s) — lots for a matching product + point auto-resolve
        their spec &amp; sampling
      </div>
      <BaseButton v-if="canManage" variant="primary" size="sm" @click="showCreate = true">
        <template #icon><IconPlus :size="16" /></template>
        New Inspection Plan
      </BaseButton>
    </div>

    <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
      <table class="tw:w-full tw:text-sm">
        <thead class="tw:bg-main-hover tw:text-secondary tw:text-xs tw:uppercase">
          <tr>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Name</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Point</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Applies To</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Specification</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Sampling Plan</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Workflow</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Active</th>
            <th class="tw:px-4 tw:py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in plans" :key="t.id" class="tw:border-t tw:border-divider">
            <td class="tw:px-4 tw:py-2.5 tw:font-medium tw:text-on-main">{{ t.name }}</td>
            <td class="tw:px-4 tw:py-2.5 tw:text-secondary">
              {{ POINT_LABELS[t.inspectionPoint] || t.inspectionPoint }}
            </td>
            <td class="tw:px-4 tw:py-2.5 tw:text-secondary">{{ scopeLabel(t) }}</td>
            <td class="tw:px-4 tw:py-2.5 tw:text-secondary">{{ specName(t.specificationId) }}</td>
            <td class="tw:px-4 tw:py-2.5 tw:text-secondary">
              {{ samplingName(t.samplingPlanId) }}
            </td>
            <td class="tw:px-4 tw:py-2.5 tw:text-secondary">
              {{ workflowName(t.workflowVersionId) }}
            </td>
            <td class="tw:px-4 tw:py-2.5">
              <span
                class="tw:text-[11px] tw:font-semibold tw:px-2 tw:py-0.5 tw:rounded-full"
                :class="
                  t.active ? 'tw:bg-green-100 tw:text-green-700' : 'tw:bg-gray-200 tw:text-gray-600'
                "
                >{{ t.active ? 'ACTIVE' : 'INACTIVE' }}</span
              >
            </td>
            <td class="tw:px-4 tw:py-2.5 tw:text-right">
              <div class="tw:flex tw:items-center tw:justify-end tw:gap-2">
                <BaseButton v-if="canManage" variant="outline" size="sm" @click="startEdit(t)">
                  Edit
                </BaseButton>
                <BaseButton
                  v-if="canManage"
                  :variant="deletingId === t.id ? 'danger' : 'outline'"
                  size="sm"
                  @click="deletePlan(t.id)"
                >
                  {{ deletingId === t.id ? 'Confirm Delete?' : 'Delete' }}
                </BaseButton>
              </div>
            </td>
          </tr>
          <tr v-if="!plans.length">
            <td colspan="8" class="tw:px-4 tw:py-8 tw:text-center tw:text-secondary">
              <p class="tw:font-medium tw:text-on-main tw:mb-1">No inspection plans yet.</p>
              <p class="tw:text-xs tw:italic">
                Create one to bind a Specification + Sampling Plan to a product (or product type)
                and inspection point — new lots will pick them up automatically.
              </p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <InspectionPlanCreateDialog v-model="showCreate" />
    <InspectionPlanCreateDialog v-model="showEdit" :editPlan="editingPlan" />
  </div>
</template>
