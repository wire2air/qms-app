<script setup>
/**
 * Create or edit an Inspection Plan — the binding of (product OR product type,
 * inspection point) → Specification + Sampling Plan + disposition Workflow.
 * Once a plan exists, new lots for that product+point auto-resolve their spec
 * and sampling without the inspector picking anything. Pass `editPlan` to
 * pre-populate and PATCH instead of POST.
 */
import { post, patch } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.

const props = defineProps({
  editPlan: { type: Object, default: null },
})
const emit = defineEmits(['created', 'updated'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()
const saving = ref(false)

const isEdit = computed(() => Boolean(props.editPlan))

const POINTS = [
  { id: 'INCOMING', name: 'Incoming (IQC)' },
  { id: 'IN_PROCESS', name: 'In-process (IPQC)' },
  { id: 'FINAL', name: 'Final (FQC)' },
  { id: 'OUTGOING', name: 'Outgoing (OQC)' },
]

const form = ref(null)
function reset() {
  const t = props.editPlan
  form.value = t
    ? {
        name: t.name ?? '',
        description: t.description ?? '',
        inspectionPoint: t.inspectionPoint ?? 'INCOMING',
        scope: t.productId ? 'product' : 'productType',
        productId: t.productId ?? null,
        productTypeId: t.productTypeId ?? null,
        specificationId: t.specificationId ?? null,
        samplingPlanId: t.samplingPlanId ?? null,
        workflowVersionId: t.workflowVersionId ?? null,
        notifyGroupIdsOnPass: Array.isArray(t.notifyGroupIdsOnPass) ? [...t.notifyGroupIdsOnPass] : [],
        notifyGroupIdsOnFail: Array.isArray(t.notifyGroupIdsOnFail) ? [...t.notifyGroupIdsOnFail] : [],
        active: t.active ?? true,
      }
    : {
        name: '',
        description: '',
        inspectionPoint: 'INCOMING',
        scope: 'product',
        productId: null,
        productTypeId: null,
        specificationId: null,
        samplingPlanId: null,
        workflowVersionId: null,
        notifyGroupIdsOnPass: [],
        notifyGroupIdsOnFail: [],
        active: true,
      }
}
reset()
watch(show, (v) => { if (v) reset() })

const canSubmit = computed(() => {
  const f = form.value
  if (!f.name?.trim() || !f.inspectionPoint || !f.workflowVersionId) return false
  if (f.scope === 'product' && !f.productId) return false
  if (f.scope === 'productType' && !f.productTypeId) return false
  return true
})

async function onSave() {
  if (!canSubmit.value || saving.value) return
  saving.value = true
  try {
    const f = form.value
    const body = {
      name: f.name.trim(),
      description: f.description?.trim() || null,
      inspectionPoint: f.inspectionPoint,
      productId: f.scope === 'product' ? f.productId : null,
      productTypeId: f.scope === 'productType' ? f.productTypeId : null,
      specificationId: f.specificationId || null,
      samplingPlanId: f.samplingPlanId || null,
      workflowVersionId: f.workflowVersionId,
      notifyGroupIdsOnPass: f.notifyGroupIdsOnPass,
      notifyGroupIdsOnFail: f.notifyGroupIdsOnFail,
      active: f.active,
    }
    if (isEdit.value) {
      const { template } = await patch(`/v1/services/qcInspection/templates/${props.editPlan.id}`, body)
      toast.success('Inspection plan updated')
      show.value = false
      emit('updated', template.id)
    } else {
      const { template } = await post('/v1/services/qcInspection/templates', body)
      toast.success('Inspection plan created')
      show.value = false
      emit('created', template.id)
    }
  } catch (err) {
    toast.error(err?.message || (isEdit.value ? 'Failed to update inspection plan' : 'Failed to create inspection plan'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" :title="isEdit ? 'Edit Inspection Plan' : 'New Inspection Plan'" :persistent="true" size="3xl">
    <div class="tw:p-5 tw:flex tw:flex-col tw:gap-5">

      <!-- ── Basic info ───────────────────────────────────────────────── -->
      <div class="tw:flex tw:flex-col tw:gap-3">
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Plan name <span class="tw:text-bad">*</span></label>
          <BaseTextInput v-model="form.name" placeholder="e.g. Incoming — Raw Materials" />
        </div>
        <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
          <div>
            <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Inspection point</label>
            <BaseInlineSelect v-model="form.inspectionPoint" :items="POINTS" :required="true" class="tw:w-full" />
          </div>
          <div>
            <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Scope</label>
            <BaseInlineSelect
              v-model="form.scope"
              :items="[{ id: 'product', name: 'Specific product' }, { id: 'productType', name: 'Product type' }]"
              :required="true"
              class="tw:w-full"
            />
          </div>
        </div>
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">
            {{ form.scope === 'product' ? 'Product' : 'Product type' }} <span class="tw:text-bad">*</span>
          </label>
          <ProductSelectMenu v-if="form.scope === 'product'" v-model="form.productId" class="tw:w-full" />
          <ProductTypeSelectMenu v-else v-model="form.productTypeId" class="tw:w-full" />
        </div>
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Description</label>
          <BaseTextarea v-model="form.description" :rows="2" placeholder="optional" />
        </div>
      </div>

      <hr class="tw:border-divider" />

      <!-- ── Bindings ──────────────────────────────────────────────────── -->
      <div class="tw:flex tw:flex-col tw:gap-3">
        <p class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide">What gets applied to lots</p>
        <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
          <div>
            <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Specification</label>
            <SpecificationSelectMenu v-model="form.specificationId" class="tw:w-full" />
          </div>
          <div>
            <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Sampling Plan</label>
            <SamplingPlanSelectMenu v-model="form.samplingPlanId" class="tw:w-full" />
          </div>
        </div>
        <!-- Email-only notifications on disposition. Grants no access. -->
        <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
          <div>
            <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Notify groups when PASSED</label>
            <GroupSelectMenu v-model="form.notifyGroupIdsOnPass" multiple class="tw:w-full" />
          </div>
          <div>
            <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Notify groups when FAILED</label>
            <GroupSelectMenu v-model="form.notifyGroupIdsOnFail" multiple class="tw:w-full" />
          </div>
        </div>
        <p class="tw:text-xs tw:text-secondary tw:-mt-1">
          Group members receive an email only — this does not assign tasks or grant access.
        </p>
        <label v-if="isEdit" class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-on-main tw:cursor-pointer">
          <BaseCheckbox v-model="form.active" />
          Active (used to resolve new lots)
        </label>
      </div>

      <hr class="tw:border-divider" />

      <!-- ── Disposition workflow ──────────────────────────────────────── -->
      <div>
        <p class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide tw:mb-3">
          Disposition workflow <span class="tw:text-bad">*</span>
        </p>
        <WorkflowVersionSelect v-model="form.workflowVersionId" moduleId="QC_INSPECTION" dense />
      </div>

    </div>

    <div class="tw:flex tw:justify-end tw:gap-2 tw:px-4 tw:pb-4">
      <BaseButton variant="outline" @click="show = false">Cancel</BaseButton>
      <BaseButton :disabled="!canSubmit || saving" :loading="saving" @click="onSave">
        {{ isEdit ? 'Save changes' : 'Create plan' }}
      </BaseButton>
    </div>
  </BaseDialog>
</template>
