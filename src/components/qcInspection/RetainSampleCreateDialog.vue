<script setup>
/**
 * Create a retain sample from an inspection lot. Item / lot # / batch /
 * mfg + expiry dates carry over from the lot automatically; QA picks the
 * sample type, quantity and storage. Retain-until defaults server-side
 * (expiry + 12 months when known, else +24 months) and can be overridden.
 */
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.

const props = defineProps({
  lotId: { type: String, required: true },
})
const emit = defineEmits(['created'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()
const saving = ref(false)

const lot = useLiveQueryWithDeps(
  [() => props.lotId],
  async (db, [id]) => (id ? db.InspectionLot.findByPk(id) : null),
  { models: ['InspectionLot'] },
)
const product = useLiveQueryWithDeps(
  [() => lot.value?.productId],
  async (db, [pid]) => (pid ? db.Product.findByPk(pid) : null),
  { models: ['Product'] },
)
const uoms = useLiveQuery(async (db) => db.Uom.where().exec(), { models: ['Uom'], initial: [] })
const uomOptions = computed(() =>
  [...uoms.value].sort((a, b) => (a.code || '').localeCompare(b.code || '')).map((u) => ({
    id: u.id,
    label: u.name ? `${u.code} — ${u.name}` : u.code,
  })),
)

const TYPE_OPTIONS = [
  { id: 'RESERVE', label: 'Reserve — kept for possible re-testing' },
  { id: 'REFERENCE', label: 'Reference — analytical sample (EU)' },
  { id: 'RETENTION', label: 'Retention — full market pack (EU)' },
]

const sampleType = ref('RESERVE')
const quantity = ref(null)
const uomId = ref(null)
const storageLocationId = ref(null)
const position = ref('')
const retainUntil = ref('') // yyyy-mm-dd override; blank = server default
const notes = ref('')

watch(show, (open) => {
  if (!open) return
  sampleType.value = 'RESERVE'
  quantity.value = null
  uomId.value = product.value?.uomId ?? null
  storageLocationId.value = null
  position.value = ''
  retainUntil.value = ''
  notes.value = ''
})
watch(product, (p) => {
  if (show.value && p?.uomId && !uomId.value) uomId.value = p.uomId
})

const canSubmit = computed(
  () => !saving.value && Number(quantity.value) > 0 && !!storageLocationId.value,
)

async function onSubmit() {
  if (!canSubmit.value) return
  saving.value = true
  try {
    await post(`/v1/services/qcInspection/lots/${props.lotId}/retainSamples`, {
      sampleType: sampleType.value,
      quantity: Number(quantity.value),
      uomId: uomId.value || null,
      storageLocationId: storageLocationId.value,
      position: position.value.trim() || null,
      retainUntil: retainUntil.value || null,
      notes: notes.value.trim() || null,
    })
    toast.success('Retain sample created')
    show.value = false
    emit('created')
  } catch (err) {
    toast.error(err?.message || 'Failed to create retain sample')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" title="Create Retain Sample" maxWidth="xl">
    <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
      <!-- What carries over from the lot -->
      <div class="tw:rounded-lg tw:bg-main-hover tw:px-4 tw:py-3 tw:text-sm tw:flex tw:flex-col tw:gap-1">
        <div class="tw:flex tw:justify-between tw:gap-3">
          <span class="tw:text-secondary">Item</span>
          <span class="tw:text-on-main tw:text-right">{{ product?.name || '—' }}</span>
        </div>
        <div class="tw:flex tw:justify-between tw:gap-3">
          <span class="tw:text-secondary">Lot #</span>
          <span class="tw:text-on-main">{{ lot?.lotNumber || '—' }}</span>
        </div>
        <div v-if="lot?.batchNumber" class="tw:flex tw:justify-between tw:gap-3">
          <span class="tw:text-secondary">Batch #</span>
          <span class="tw:text-on-main">{{ lot.batchNumber }}</span>
        </div>
        <div v-if="lot?.expiryDate" class="tw:flex tw:justify-between tw:gap-3">
          <span class="tw:text-secondary">Expiry</span>
          <span class="tw:text-on-main">{{ lot.expiryDate.formatDate('date') }}</span>
        </div>
      </div>

      <BaseField v-slot="{ id: fieldId }" label="Sample type" required>
        <select
          :id="fieldId"
          v-model="sampleType"
          class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
        >
          <option v-for="t in TYPE_OPTIONS" :key="t.id" :value="t.id">{{ t.label }}</option>
        </select>
      </BaseField>

      <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
        <BaseField v-slot="{ id: fieldId }" label="Quantity retained" required>
          <input
            :id="fieldId"
            v-model.number="quantity"
            type="number"
            min="0"
            step="any"
            class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
            placeholder="e.g. 6"
          />
        </BaseField>
        <BaseField label="Unit">
          <BaseSelect
            v-model="uomId"
            :options="uomOptions"
            optionLabel="label"
            optionValue="id"
            nullLabel="— Unit —"
            clearable
          />
        </BaseField>
      </div>

      <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
        <BaseField label="Storage location" required>
          <StorageLocationSelectMenu v-model="storageLocationId" required />
        </BaseField>
        <BaseField
          v-slot="{ id: fieldId }"
          label="Position"
          hint="Shelf / box / slot within the location."
        >
          <BaseTextInput :id="fieldId" v-model="position" placeholder="e.g. Shelf B, Box 12" />
        </BaseField>
      </div>

      <BaseField
        v-slot="{ id: fieldId }"
        label="Retain until"
        hint="Leave blank to use the default: expiry + 12 months (or +24 months when the lot has no expiry)."
      >
        <input
          :id="fieldId"
          v-model="retainUntil"
          type="date"
          class="tw:w-48 tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
        />
      </BaseField>

      <BaseField v-slot="{ id: fieldId }" label="Notes" optional>
        <BaseTextarea :id="fieldId" v-model="notes" :rows="2" placeholder="Anything worth noting about this sample" />
      </BaseField>
    </div>

    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Create Retain Sample"
        :loading="saving"
        :disabled="!canSubmit"
        @cancel="close"
        @submit="onSubmit"
      />
    </template>
  </BaseDialog>
</template>
