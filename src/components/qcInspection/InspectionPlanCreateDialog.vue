<script setup>
/**
 * Create or edit an Inspection Plan — the binding of (product OR product type,
 * inspection point) → Specification + Sampling Plan + disposition Workflow.
 * Once a plan exists, new lots for that product+point auto-resolve their spec
 * and sampling without the inspector picking anything. Pass `editPlan` to
 * pre-populate and PATCH instead of POST.
 */
import { post, patch } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { required } from '@shared/components/form/validators.js'

const props = defineProps({
  editPlan: { type: Object, default: null },
})
const emit = defineEmits(['created', 'updated'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()
const isSubmitting = ref(false)
const saveError = ref(null)
const formRef = ref(null)

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
        scope: t.productId ? 'product' : t.productFamilyId ? 'family' : 'productType',
        productId: t.productId ?? null,
        productFamilyId: t.productFamilyId ?? null,
        productTypeId: t.productTypeId ?? null,
        specificationId: t.specificationId ?? null,
        samplingPlanId: t.samplingPlanId ?? null,
        workflowVersionId: t.workflowVersionId ?? null,
        notifyGroupIdsOnPass: Array.isArray(t.notifyGroupIdsOnPass)
          ? [...t.notifyGroupIdsOnPass]
          : [],
        notifyGroupIdsOnFail: Array.isArray(t.notifyGroupIdsOnFail)
          ? [...t.notifyGroupIdsOnFail]
          : [],
        active: t.active ?? true,
      }
    : {
        name: '',
        description: '',
        inspectionPoint: 'INCOMING',
        scope: 'product',
        productId: null,
        productFamilyId: null,
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
watch(show, (v) => {
  if (v) reset()
  else saveError.value = null
})

async function onSubmit() {
  if (isSubmitting.value) return
  isSubmitting.value = true
  saveError.value = null
  try {
    const f = form.value
    const body = {
      name: f.name.trim(),
      description: f.description?.trim() || null,
      inspectionPoint: f.inspectionPoint,
      productId: f.scope === 'product' ? f.productId : null,
      productFamilyId: f.scope === 'family' ? f.productFamilyId : null,
      productTypeId: f.scope === 'productType' ? f.productTypeId : null,
      specificationId: f.specificationId || null,
      samplingPlanId: f.samplingPlanId || null,
      workflowVersionId: f.workflowVersionId,
      notifyGroupIdsOnPass: f.notifyGroupIdsOnPass,
      notifyGroupIdsOnFail: f.notifyGroupIdsOnFail,
      active: f.active,
    }
    if (isEdit.value) {
      const { template } = await patch(
        `/v1/services/qcInspection/templates/${props.editPlan.id}`,
        body,
      )
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
    saveError.value =
      err?.message ||
      (isEdit.value ? 'Failed to update inspection plan' : 'Failed to create inspection plan')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <BaseDialog
    v-model="show"
    :title="isEdit ? 'Edit Inspection Plan' : 'New Inspection Plan'"
    :persistent="true"
    size="3xl"
  >
    <BaseForm ref="formRef" hideFooter @submit="onSubmit">
      <div class="tw:p-5 tw:flex tw:flex-col tw:gap-5">
        <!-- ── Basic info ───────────────────────────────────────────────── -->
        <div class="tw:flex tw:flex-col tw:gap-3">
          <BaseField label="Plan name" required :value="form.name" :rules="[required()]">
            <template #default="field">
              <BaseTextInput
                v-bind="field"
                v-model="form.name"
                placeholder="e.g. Incoming — Raw Materials"
              />
            </template>
          </BaseField>
          <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
            <BaseField
              label="Inspection point"
              required
              :value="form.inspectionPoint"
              :rules="[required()]"
            >
              <template #default="field">
                <BaseInlineSelect
                  v-bind="field"
                  v-model="form.inspectionPoint"
                  :items="POINTS"
                  :required="true"
                  class="tw:w-full"
                />
              </template>
            </BaseField>
            <BaseField label="Scope">
              <BaseInlineSelect
                v-model="form.scope"
                :items="[
                  { id: 'product', name: 'Specific item' },
                  { id: 'family', name: 'Item group' },
                  { id: 'productType', name: 'Item type' },
                ]"
                :required="true"
                class="tw:w-full"
              />
            </BaseField>
          </div>
          <BaseField
            required
            :value="
              form.scope === 'product'
                ? form.productId
                : form.scope === 'family'
                  ? form.productFamilyId
                  : form.productTypeId
            "
            :rules="[required()]"
          >
            <template #label>
              {{ form.scope === 'product' ? 'Item' : form.scope === 'family' ? 'Item group' : 'Item type' }}
            </template>
            <template #default="field">
              <ProductSelectMenu
                v-if="form.scope === 'product'"
                v-bind="field"
                v-model="form.productId"
                class="tw:w-full"
              />
              <ProductFamilySelectMenu
                v-else-if="form.scope === 'family'"
                v-bind="field"
                v-model="form.productFamilyId"
                :required="true"
                class="tw:w-full"
              />
              <ProductTypeSelectMenu
                v-else
                v-bind="field"
                v-model="form.productTypeId"
                class="tw:w-full"
              />
            </template>
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Description">
            <BaseTextarea
              :id="fieldId"
              v-model="form.description"
              :rows="2"
              placeholder="optional"
            />
          </BaseField>
        </div>

        <hr class="tw:border-divider" />

        <!-- ── Bindings ──────────────────────────────────────────────────── -->
        <div class="tw:flex tw:flex-col tw:gap-3">
          <BaseText variant="overline">What gets applied to lots</BaseText>
          <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
            <BaseField label="Specification">
              <SpecificationSelectMenu v-model="form.specificationId" class="tw:w-full" />
            </BaseField>
            <BaseField label="Sampling Plan">
              <SamplingPlanSelectMenu v-model="form.samplingPlanId" class="tw:w-full" />
            </BaseField>
          </div>
          <!-- Email-only notifications on disposition. Grants no access. -->
          <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
            <BaseField label="Notify groups when PASSED">
              <GroupSelectMenu v-model="form.notifyGroupIdsOnPass" multiple class="tw:w-full" />
            </BaseField>
            <BaseField label="Notify groups when FAILED">
              <GroupSelectMenu v-model="form.notifyGroupIdsOnFail" multiple class="tw:w-full" />
            </BaseField>
          </div>
          <p class="tw:text-xs tw:text-secondary tw:-mt-1">
            Group members receive an email only — this does not assign tasks or grant access.
          </p>
          <label
            v-if="isEdit"
            class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-on-main tw:cursor-pointer"
          >
            <BaseCheckbox v-model="form.active" />
            Active (used to resolve new lots)
          </label>
        </div>

        <hr class="tw:border-divider" />

        <!-- ── Disposition workflow ──────────────────────────────────────── -->
        <div>
          <BaseField
            label="Disposition workflow"
            required
            :value="form.workflowVersionId"
            :rules="[required()]"
          >
            <template #default="field">
              <WorkflowVersionSelect
                v-bind="field"
                v-model="form.workflowVersionId"
                moduleId="QC_INSPECTION"
                dense
              />
            </template>
          </BaseField>
        </div>
      </div>
    </BaseForm>

    <template #footer>
      <BaseDialogFooter
        :submitLabel="isEdit ? 'Save changes' : 'Create plan'"
        :loading="isSubmitting"
        :error="saveError"
        @cancel="show = false"
        @submit="formRef?.submit()"
      />
    </template>
  </BaseDialog>
</template>
