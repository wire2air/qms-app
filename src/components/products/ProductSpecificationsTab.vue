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

    <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
      <table class="tw:w-full tw:text-sm">
        <thead class="tw:bg-main-hover tw:text-secondary tw:text-xs tw:uppercase">
          <tr>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Name</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Material</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Version</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Status</th>
            <th class="tw:px-4 tw:py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          <BaseClickableRow
            v-for="s in specs"
            :key="s.id"
            tag="tr"
            class="tw:border-t tw:border-divider tw:hover:bg-main-hover"
            :aria-label="`Open specification ${s.name}`"
            @click="openSpec(s.id)"
          >
            <td class="tw:px-4 tw:py-2.5 tw:font-medium tw:text-on-main">
              {{ s.name }}
              <span v-if="s.code" class="tw:text-xs tw:text-secondary tw:font-mono">· {{ s.code }}</span>
            </td>
            <td class="tw:px-4 tw:py-2.5 tw:text-secondary">
              {{ MATERIAL_LABELS[s.materialKind] || s.materialKind }}
            </td>
            <td class="tw:px-4 tw:py-2.5 tw:text-secondary">v{{ s.version }}</td>
            <td class="tw:px-4 tw:py-2.5">
              <SpecificationStatusBadgeById :statusId="s.statusId" />
            </td>
            <td class="tw:px-4 tw:py-2.5 tw:text-right" @click.stop>
              <div class="tw:flex tw:items-center tw:justify-end tw:gap-2">
                <BaseButton
                  v-if="canManage && s.statusId === 'DRAFT'"
                  variant="outline"
                  size="sm"
                  @click="startApprove(s)"
                >
                  Approve
                </BaseButton>
                <BaseButton
                  v-if="canManage && s.statusId === 'DRAFT'"
                  :variant="deletingId === s.id ? 'danger' : 'outline'"
                  size="sm"
                  @click="deleteSpec(s.id)"
                >
                  {{ deletingId === s.id ? 'Confirm Delete?' : 'Delete' }}
                </BaseButton>
              </div>
            </td>
          </BaseClickableRow>
          <tr v-if="!specs.length">
            <td colspan="5" class="tw:px-4 tw:py-8 tw:text-center tw:text-secondary tw:italic">
              No specifications for this item yet.
              <span v-if="canManage">Click <strong>New Specification</strong> to define one.</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <SpecificationCreateDialog
    v-model="showCreate"
    :lockProductId="productId"
    @created="openSpec"
  />
  <WorkflowInstanceEsignAuthDialog v-model="showEsign" @verified="onEsignVerified" />
</template>
