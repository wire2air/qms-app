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

const props = defineProps({
  editLot: { type: Object, default: null },
})
const emit = defineEmits(['created', 'updated'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()
const saving = ref(false)

const isEdit = computed(() => Boolean(props.editLot))
// IN_PROGRESS edits can only touch logistics — the spec snapshot is frozen.
const identityLocked = computed(() => isEdit.value && props.editLot.statusId !== 'PENDING' && props.editLot.statusId !== 'DRAFT')

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
        notifyGroupIdsOnPass: Array.isArray(lot.notifyGroupIdsOnPass) ? [...lot.notifyGroupIdsOnPass] : [],
        notifyGroupIdsOnFail: Array.isArray(lot.notifyGroupIdsOnFail) ? [...lot.notifyGroupIdsOnFail] : [],
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
})

const canSubmit = computed(() => !!form.value.inspectionPoint && !!form.value.productId)

async function onSave() {
  if (!canSubmit.value || saving.value) return
  saving.value = true
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
      ...(Array.isArray(f.notifyGroupIdsOnPass) ? { notifyGroupIdsOnPass: f.notifyGroupIdsOnPass } : {}),
      ...(Array.isArray(f.notifyGroupIdsOnFail) ? { notifyGroupIdsOnFail: f.notifyGroupIdsOnFail } : {}),
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
    toast.error(err?.message || (isEdit.value ? 'Failed to update lot' : 'Failed to create lot'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" :title="isEdit ? `Edit Lot ${props.editLot?.lotNumber ?? ''}` : 'New Inspection Lot'" :persistent="true" size="3xl">
    <div class="tw:p-4 tw:space-y-4">
      <div v-if="identityLocked" class="tw:bg-blue-50 tw:border tw:border-blue-200 tw:rounded-lg tw:px-3 tw:py-2 tw:text-xs tw:text-blue-800">
        Inspection has started — product, point, quantity and spec/sampling are frozen. Logistics fields remain editable.
      </div>

      <!-- Product on its own row — the select shows SKU + name and needs the width. -->
      <div>
        <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Product <span class="tw:text-bad">*</span></label>
        <ProductSelectMenu v-model="form.productId" class="tw:w-full" :disabled="identityLocked" />
      </div>

      <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Inspection point</label>
          <BaseInlineSelect v-model="form.inspectionPoint" :items="POINTS" :required="true" :disabled="identityLocked" />
        </div>
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Supplier</label>
          <SupplierSelectMenu v-model="form.supplierId" :disabled="identityLocked" />
        </div>
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Default instrument</label>
          <EquipmentSelectMenu v-model="form.equipmentId" />
          <p class="tw:text-[11px] tw:text-secondary tw:mt-1">
            Used for tests that require an instrument unless a row picks its own. Calibration is checked at capture.
          </p>
        </div>
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Lot quantity</label>
          <BaseTextInput v-model.number="form.quantity" type="number" placeholder="for sample-size calc" :disabled="identityLocked" />
        </div>
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Batch / Lot ref</label>
          <BaseTextInput v-model="form.batchNumber" placeholder="optional" />
        </div>
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">PO #</label>
          <BaseTextInput v-model="form.poNumber" placeholder="optional" />
        </div>
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Receipt #</label>
          <BaseTextInput v-model="form.receiptNumber" placeholder="optional" />
        </div>
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Work order</label>
          <BaseTextInput v-model="form.workOrder" placeholder="optional" />
        </div>
      </div>

      <div>
        <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Notes</label>
        <BaseTextarea v-model="form.notes" :rows="2" placeholder="optional" />
      </div>

      <!-- Email-only group notifications on disposition -->
      <div class="tw:border tw:border-divider tw:rounded-lg tw:overflow-hidden">
        <div class="tw:px-4 tw:py-2.5 tw:bg-main-hover tw:flex tw:items-center tw:gap-2">
          <span class="tw:text-sm tw:font-medium tw:text-on-main">Disposition notifications</span>
          <span class="tw:text-xs tw:text-secondary">— defaults come from the inspection plan</span>
        </div>
        <div class="tw:p-3 tw:flex tw:flex-col tw:gap-3">
          <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
            <div>
              <label class="tw:block tw:text-[11px] tw:text-secondary tw:mb-1">Notify groups when PASSED</label>
              <GroupSelectMenu v-model="form.notifyGroupIdsOnPass" multiple class="tw:w-full" />
            </div>
            <div>
              <label class="tw:block tw:text-[11px] tw:text-secondary tw:mb-1">Notify groups when FAILED</label>
              <GroupSelectMenu v-model="form.notifyGroupIdsOnFail" multiple class="tw:w-full" />
            </div>
          </div>
          <p class="tw:text-xs tw:text-secondary">
            Email only — no tasks are created and no access is granted.
          </p>
        </div>
      </div>

      <!-- Specification + Sampling Plan: auto-resolved from the inspection plan
           (template) for this product + point; pick manually to override. -->
      <div class="tw:border tw:border-divider tw:rounded-lg tw:overflow-hidden" :class="identityLocked ? 'tw:opacity-60 tw:pointer-events-none' : ''">
        <div class="tw:px-4 tw:py-2.5 tw:bg-main-hover tw:flex tw:items-center tw:gap-2">
          <span class="tw:text-sm tw:font-medium tw:text-on-main">Specification &amp; Sampling Plan</span>
          <span class="tw:text-xs tw:text-secondary">— auto-resolved from inspection plan unless you pick below</span>
        </div>
        <div class="tw:p-3 tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
          <div>
            <label class="tw:block tw:text-[11px] tw:text-secondary tw:mb-1">Specification (override)</label>
            <SpecificationSelectMenu v-model="form.specificationId" class="tw:w-full" />
          </div>
          <div>
            <label class="tw:block tw:text-[11px] tw:text-secondary tw:mb-1">Sampling Plan (override)</label>
            <SamplingPlanSelectMenu v-model="form.samplingPlanId" class="tw:w-full" />
          </div>
        </div>
      </div>
    </div>

    <div class="tw:flex tw:justify-end tw:gap-2 tw:px-4 tw:pb-4">
      <BaseButton variant="outline" @click="show = false">Cancel</BaseButton>
      <BaseButton :disabled="!canSubmit || saving" :loading="saving" @click="onSave">
        {{ isEdit ? 'Save changes' : 'Create' }}
      </BaseButton>
    </div>
  </BaseDialog>
</template>
