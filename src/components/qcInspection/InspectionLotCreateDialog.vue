<script setup>
/**
 * Create or edit an inspection lot. On create the backend resolves the
 * inspection plan (template) for the product + point, snapshots the spec +
 * sampling plan, and computes the sample size. Pass `editLot` to pre-populate
 * and PATCH instead of POST:
 *   PENDING      — everything editable (spec/sampling re-snapshot server-side).
 *   IN_PROGRESS  — only logistics fields (instrument, refs, notes); identity +
 *                  spec fields are frozen because results are being captured.
 */
import { post, patch } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { required } from '@shared/components/form/validators.js'

const props = defineProps({
  editLot: { type: Object, default: null },
})
const emit = defineEmits(['created', 'updated'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()
const formRef = ref(null)
const saving = ref(false)
const saveError = ref(null)

const isEdit = computed(() => Boolean(props.editLot))
// IN_PROGRESS edits can only touch logistics — the spec snapshot is frozen.
const identityLocked = computed(
  () => isEdit.value && props.editLot.statusId !== 'PENDING' && props.editLot.statusId !== 'DRAFT',
)

const POINTS = [
  { id: 'INCOMING', name: 'Incoming (IQC)' },
  { id: 'IN_PROCESS', name: 'In-process (IPQC)' },
  { id: 'FINAL', name: 'Final (FQC)' },
  { id: 'OUTGOING', name: 'Outgoing (OQC)' },
]

const form = ref(null)
function reset() {
  const lot = props.editLot
  form.value = lot
    ? {
        inspectionPoint: lot.inspectionPoint ?? 'INCOMING',
        productId: lot.productId ?? null,
        supplierId: lot.supplierId ?? null,
        equipmentId: lot.equipmentId ?? null,
        specificationId: lot.specificationId ?? null,
        samplingPlanId: lot.samplingPlanId ?? null,
        quantity: lot.quantity ?? null,
        poNumber: lot.poNumber ?? '',
        receiptNumber: lot.receiptNumber ?? '',
        workOrder: lot.workOrder ?? '',
        batchNumber: lot.batchNumber ?? '',
        notes: lot.notes ?? '',
        notifyGroupIdsOnPass: Array.isArray(lot.notifyGroupIdsOnPass)
          ? [...lot.notifyGroupIdsOnPass]
          : [],
        notifyGroupIdsOnFail: Array.isArray(lot.notifyGroupIdsOnFail)
          ? [...lot.notifyGroupIdsOnFail]
          : [],
      }
    : {
        inspectionPoint: 'INCOMING',
        productId: null,
        supplierId: null,
        equipmentId: null,
        specificationId: null, // null = auto-resolve from inspection plan
        samplingPlanId: null,
        quantity: null,
        poNumber: '',
        receiptNumber: '',
        workOrder: '',
        batchNumber: '',
        notes: '',
        notifyGroupIdsOnPass: null, // null = inherit from inspection plan
        notifyGroupIdsOnFail: null,
      }
}
reset()
watch(show, (v) => {
  if (v) reset()
  else saveError.value = null
})

async function onSave() {
  if (saving.value) return
  saving.value = true
  saveError.value = null
  try {
    const f = form.value
    const refFields = {
      equipmentId: f.equipmentId || null,
      poNumber: f.poNumber?.trim() || null,
      receiptNumber: f.receiptNumber?.trim() || null,
      workOrder: f.workOrder?.trim() || null,
      batchNumber: f.batchNumber?.trim() || null,
      notes: f.notes?.trim() || null,
      // Only send arrays the user actually touched — omitting them lets the
      // backend inherit the inspection plan's groups at lot creation.
      ...(Array.isArray(f.notifyGroupIdsOnPass)
        ? { notifyGroupIdsOnPass: f.notifyGroupIdsOnPass }
        : {}),
      ...(Array.isArray(f.notifyGroupIdsOnFail)
        ? { notifyGroupIdsOnFail: f.notifyGroupIdsOnFail }
        : {}),
    }
    if (isEdit.value) {
      const body = identityLocked.value
        ? refFields
        : {
            ...refFields,
            inspectionPoint: f.inspectionPoint,
            productId: f.productId,
            supplierId: f.supplierId || null,
            specificationId: f.specificationId || null,
            samplingPlanId: f.samplingPlanId || null,
            quantity: f.quantity ?? null,
          }
      const { lot } = await patch(`/v1/services/qcInspection/lots/${props.editLot.id}`, body)
      toast.success(`Lot ${lot.lotNumber} updated`)
      show.value = false
      emit('updated', lot.id)
    } else {
      const { lot } = await post('/v1/services/qcInspection/lots', {
        ...refFields,
        inspectionPoint: f.inspectionPoint,
        productId: f.productId,
        supplierId: f.supplierId || null,
        specificationId: f.specificationId || null,
        samplingPlanId: f.samplingPlanId || null,
        quantity: f.quantity ?? null,
      })
      toast.success(`Lot ${lot.lotNumber} created`)
      show.value = false
      emit('created', lot.id)
    }
  } catch (err) {
    saveError.value =
      err?.message || (isEdit.value ? 'Failed to update lot' : 'Failed to create lot')
    toast.error(saveError.value)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog
    v-model="show"
    :title="isEdit ? `Edit Lot ${props.editLot?.lotNumber ?? ''}` : 'New Inspection Lot'"
    :persistent="true"
    size="3xl"
  >
    <BaseForm ref="formRef" hideFooter @submit="onSave">
      <div class="tw:p-4 tw:space-y-4">
        <div
          v-if="identityLocked"
          class="tw:bg-blue-50 tw:border tw:border-blue-200 tw:rounded-lg tw:px-3 tw:py-2 tw:text-xs tw:text-blue-800"
        >
          Inspection has started — product, point, quantity and spec/sampling are frozen. Logistics
          fields remain editable.
        </div>

        <!-- Product on its own row — the select shows SKU + name and needs the width. -->
        <BaseField label="Product" required :value="form.productId" :rules="[required()]">
          <ProductSelectMenu
            v-model="form.productId"
            class="tw:w-full"
            :disabled="identityLocked"
            nullLabel="— Select Product —"
          />
        </BaseField>

        <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
          <BaseField
            label="Inspection point"
            required
            :value="form.inspectionPoint"
            :rules="[required()]"
          >
            <BaseInlineSelect
              v-model="form.inspectionPoint"
              :items="POINTS"
              :disabled="identityLocked"
            />
          </BaseField>
          <BaseField label="Supplier">
            <SupplierSelectMenu v-model="form.supplierId" :disabled="identityLocked" />
          </BaseField>
          <BaseField
            label="Default instrument"
            hint="Used for tests that require an instrument unless a row picks its own. Calibration is checked at capture."
          >
            <EquipmentSelectMenu v-model="form.equipmentId" />
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Lot quantity">
            <BaseTextInput
              :id="fieldId"
              v-model.number="form.quantity"
              type="number"
              placeholder="for sample-size calc"
              :disabled="identityLocked"
            />
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Batch / Lot ref">
            <BaseTextInput :id="fieldId" v-model="form.batchNumber" placeholder="optional" />
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="PO #">
            <BaseTextInput :id="fieldId" v-model="form.poNumber" placeholder="optional" />
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Receipt #">
            <BaseTextInput :id="fieldId" v-model="form.receiptNumber" placeholder="optional" />
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Work order">
            <BaseTextInput :id="fieldId" v-model="form.workOrder" placeholder="optional" />
          </BaseField>
        </div>

        <BaseField v-slot="{ id: fieldId }" label="Notes">
          <BaseTextarea :id="fieldId" v-model="form.notes" :rows="2" placeholder="optional" />
        </BaseField>

        <!-- Email-only group notifications on disposition -->
        <div class="tw:border tw:border-divider tw:rounded-lg tw:overflow-hidden">
          <div class="tw:px-4 tw:py-2.5 tw:bg-main-hover tw:flex tw:items-center tw:gap-2">
            <span class="tw:text-sm tw:font-medium tw:text-on-main">Disposition notifications</span>
            <span class="tw:text-xs tw:text-secondary"
              >— defaults come from the inspection plan</span
            >
          </div>
          <div class="tw:p-3 tw:flex tw:flex-col tw:gap-3">
            <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
              <BaseField label="Notify groups when PASSED">
                <GroupSelectMenu v-model="form.notifyGroupIdsOnPass" multiple class="tw:w-full" />
              </BaseField>
              <BaseField label="Notify groups when FAILED">
                <GroupSelectMenu v-model="form.notifyGroupIdsOnFail" multiple class="tw:w-full" />
              </BaseField>
            </div>
            <p class="tw:text-xs tw:text-secondary">
              Email only — no tasks are created and no access is granted.
            </p>
          </div>
        </div>

        <!-- Specification + Sampling Plan: "Auto Resolve from Plan" = inspection
             plan decides; picking a specific one overrides it for this lot. -->
        <div
          class="tw:border tw:border-divider tw:rounded-lg tw:overflow-hidden"
          :class="identityLocked ? 'tw:opacity-60 tw:pointer-events-none' : ''"
        >
          <div class="tw:px-4 tw:py-2.5 tw:bg-main-hover tw:flex tw:items-center tw:gap-2">
            <span class="tw:text-sm tw:font-medium tw:text-on-main"
              >Specification &amp; Sampling Plan</span
            >
            <span class="tw:text-xs tw:text-secondary"
              >— "Auto Resolve from Plan" uses the inspection plan's defaults</span
            >
          </div>
          <div class="tw:p-3 tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
            <BaseField label="Specification">
              <SpecificationSelectMenu
                v-model="form.specificationId"
                :productId="form.productId"
                class="tw:w-full"
              />
            </BaseField>
            <BaseField label="Sampling Plan">
              <SamplingPlanSelectMenu
                v-model="form.samplingPlanId"
                :productId="form.productId"
                :inspectionPoint="form.inspectionPoint"
                class="tw:w-full"
              />
            </BaseField>
          </div>
        </div>
      </div>
    </BaseForm>

    <template #footer>
      <BaseDialogFooter
        :submitLabel="isEdit ? 'Save changes' : 'Create'"
        :loading="saving"
        :error="saveError"
        @cancel="show = false"
        @submit="formRef?.submit()"
      />
    </template>
  </BaseDialog>
</template>
