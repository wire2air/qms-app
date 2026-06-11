<script setup>
/**
 * Create an inspection lot. The backend resolves the inspection plan (template)
 * for the product + point, snapshots the spec + sampling plan, and computes the
 * sample size. Aggregate write through the qcInspection REST service.
 */
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.

const emit = defineEmits(['created'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()
const saving = ref(false)

const POINTS = [
  { id: 'INCOMING', name: 'Incoming (IQC)' },
  { id: 'IN_PROCESS', name: 'In-process (IPQC)' },
  { id: 'FINAL', name: 'Final (FQC)' },
  { id: 'OUTGOING', name: 'Outgoing (OQC)' },
]

const form = ref(null)
function reset() {
  form.value = {
    inspectionPoint: 'INCOMING',
    productId: null,
    supplierId: null,
    equipmentId: null,
    quantity: null,
    poNumber: '',
    receiptNumber: '',
    batchNumber: '',
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
    const { lot } = await post('/v1/services/qcInspection/lots', {
      inspectionPoint: f.inspectionPoint,
      productId: f.productId,
      supplierId: f.supplierId || null,
      equipmentId: f.equipmentId || null,
      quantity: f.quantity ?? null,
      poNumber: f.poNumber?.trim() || null,
      receiptNumber: f.receiptNumber?.trim() || null,
      batchNumber: f.batchNumber?.trim() || null,
    })
    toast.success(`Lot ${lot.lotNumber} created`)
    show.value = false
    emit('created', lot.id)
  } catch (err) {
    toast.error(err?.message || 'Failed to create lot')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" title="New Inspection Lot" :persistent="true" size="xl">
    <div class="tw:p-4 tw:space-y-4">
      <!-- Product on its own row — the select shows SKU + name and needs the width. -->
      <div>
        <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Product <span class="tw:text-bad">*</span></label>
        <ProductSelectMenu v-model="form.productId" class="tw:w-full" />
      </div>

      <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Inspection point</label>
          <BaseInlineSelect v-model="form.inspectionPoint" :items="POINTS" :required="true" />
        </div>
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Supplier</label>
          <SupplierSelectMenu v-model="form.supplierId" />
        </div>
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Instrument (for calibration gate)</label>
          <EquipmentSelectMenu v-model="form.equipmentId" />
        </div>
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Lot quantity</label>
          <BaseTextInput v-model.number="form.quantity" type="number" placeholder="for sample-size calc" />
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
      </div>
      <p class="tw:text-[11px] tw:text-secondary">
        The matching inspection plan, specification and sampling plan are resolved automatically for
        this product + point.
      </p>
    </div>

    <div class="tw:flex tw:justify-end tw:gap-2 tw:px-4 tw:pb-4">
      <BaseButton variant="outline" @click="show = false">Cancel</BaseButton>
      <BaseButton :disabled="!canSubmit || saving" :loading="saving" @click="onSave">Create</BaseButton>
    </div>
  </BaseDialog>
</template>
