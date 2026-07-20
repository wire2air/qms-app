<script setup>
import { IconCheck, IconX as IconXCross, IconPackage } from '@tabler/icons-vue'
import { required } from '@shared/components/form/validators.js'
import { currentSession } from '@/utils/currentSession.js'

const props = defineProps({
  id: {
    type: [String, Number],
    default: null,
  },
})

const emit = defineEmits(['created', 'updated'])

const open = defineModel({
  type: Boolean,
  default: false,
})

const formRef = ref(null)
const isSubmitting = ref(false)
const saveError = ref('')

const EMPTY_FORM = () => ({
  name: '',
  sku: '',
  productFamilyId: null,
  itemCategoryId: null,
  erpItemCode: '',
  uomId: null,
  supplierIds: [],
  description: '',
  productTypeId: null,
  statusId: 'ACTIVE',
  // Additional details
  revision: '',
  lotControlled: false,
  serialControlled: false,
  shelfLifeDays: null,
  criticality: null,
  inspectionRequired: false,
  defaultAql: '',
  countryOfOrigin: '',
  storageConditions: '',
  isHazardous: false,
})

const form = ref(EMPTY_FORM())

const showAdvanced = ref(false)
const CRITICALITY_OPTIONS = [
  { id: 'CRITICAL', name: 'Critical' },
  { id: 'MAJOR', name: 'Major' },
  { id: 'MINOR', name: 'Minor' },
]

const isEdit = computed(() => !!props.id)

// Load existing product if editing
const product = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return null
    return db.Product.findByPk(id)
  },
  { models: ['Product'] },
)

// Existing Item ↔ Supplier links (edit mode) — the source of truth for the
// diff-and-save on submit.
const supplierLinks = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => (id ? db.ProductSupplier.where('productId', id).exec() : []),
  { models: ['ProductSupplier'], initial: [] },
)

// SKU uniqueness check
const skuAvailable = useLiveQueryWithDeps(
  [() => props.id, () => form.value.sku],
  async (db, [id, sku]) => {
    if (!sku || sku.trim().length < 1) return true
    const all = await db.Product.where().exec()
    return !all.some((p) => p.sku === sku && p.id !== id)
  },

  { models: ['Product'], initial: true },
)

// Live "in use" message for the SKU field (create mode); enforced on submit via skuUnique.
const skuInUseError = computed(() =>
  !isEdit.value && form.value.sku && !skuAvailable.value ? 'SKU already in use' : '',
)

function skuUnique() {
  return skuAvailable.value || 'SKU already in use'
}

// Populate form when product loads in edit mode
watch(
  product,
  (p) => {
    if (p) {
      form.value = {
        name: p.name,
        sku: p.sku,
        productFamilyId: p.productFamilyId ?? null,
        itemCategoryId: p.itemCategoryId ?? null,
        erpItemCode: p.erpItemCode ?? '',
        uomId: p.uomId ?? null,
        supplierIds: form.value.supplierIds, // preserve until links seed below
        description: p.description || '',
        productTypeId: p.productTypeId,
        statusId: p.statusId,
        revision: p.revision ?? '',
        lotControlled: p.lotControlled ?? false,
        serialControlled: p.serialControlled ?? false,
        shelfLifeDays: p.shelfLifeDays ?? null,
        criticality: p.criticality ?? null,
        inspectionRequired: p.inspectionRequired ?? false,
        defaultAql: p.defaultAql ?? '',
        countryOfOrigin: p.countryOfOrigin ?? '',
        storageConditions: p.storageConditions ?? '',
        isHazardous: p.isHazardous ?? false,
      }
    }
  },
  { immediate: true },
)

// Seed the supplier multi-select from the existing links once (edit mode).
const linksSeeded = ref(false)
watch(
  [product, supplierLinks],
  ([p, links]) => {
    if (!isEdit.value || linksSeeded.value || !p) return
    form.value.supplierIds = (links || []).map((l) => l.supplierId)
    linksSeeded.value = true
  },
  { immediate: true },
)

const createProduct = useLiveMutation(async (db, data) => {
  const p = db.Product.create(data)
  await p.save()
  return p
})

const createProductSupplier = useLiveMutation(async (db, { productId, supplierId }) => {
  const row = db.ProductSupplier.create({ productId, supplierId })
  await row.save()
  return row
})

// Diff the selected suppliers against the existing links: create the new ones,
// soft-delete the removed ones (join-table mutation pattern).
async function saveSuppliers(productId) {
  const selected = form.value.supplierIds || []
  const existing = isEdit.value ? supplierLinks.value || [] : []
  const existingIds = existing.map((l) => l.supplierId)
  const toAdd = selected.filter((sid) => !existingIds.includes(sid))
  const toRemove = existing.filter((l) => !selected.includes(l.supplierId))
  for (const supplierId of toAdd) await createProductSupplier({ productId, supplierId })
  for (const link of toRemove) await link.delete()
}

async function onSubmit() {
  if (isSubmitting.value) return
  isSubmitting.value = true
  saveError.value = ''
  try {
    const uid = currentSession.value?.userId
    const payload = {
      name: form.value.name,
      sku: form.value.sku,
      productFamilyId: form.value.productFamilyId,
      itemCategoryId: form.value.itemCategoryId,
      erpItemCode: form.value.erpItemCode?.trim() || null,
      uomId: form.value.uomId,
      description: form.value.description,
      productTypeId: form.value.productTypeId,
      statusId: form.value.statusId,
      revision: form.value.revision?.trim() || null,
      lotControlled: form.value.lotControlled,
      serialControlled: form.value.serialControlled,
      shelfLifeDays: form.value.shelfLifeDays || null,
      criticality: form.value.criticality || null,
      inspectionRequired: form.value.inspectionRequired,
      defaultAql: form.value.defaultAql?.trim() || null,
      countryOfOrigin: form.value.countryOfOrigin?.trim() || null,
      storageConditions: form.value.storageConditions?.trim() || null,
      isHazardous: form.value.isHazardous,
    }
    if (!isEdit.value) {
      // createdBy/updatedBy are required on the Product model and are not
      // auto-populated — set them from the current session.
      const newProduct = await createProduct({ ...payload, createdBy: uid, updatedBy: uid })
      await saveSuppliers(newProduct.id)
      emit('created', newProduct)
    } else {
      Object.assign(product.value, payload, { updatedBy: uid })
      await product.value.save()
      await saveSuppliers(product.value.id)
      emit('updated', product.value)
    }
    open.value = false
  } catch (err) {
    saveError.value = err?.message || 'Failed to save item'
  } finally {
    isSubmitting.value = false
  }
}

// Reset form when dialog closes
watch(open, (val) => {
  if (!val) {
    form.value = EMPTY_FORM()
    saveError.value = ''
    linksSeeded.value = false
  }
})
</script>

<template>
  <BaseDialog v-model="open" size="2xl">
    <template #title>
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:w-9 tw:h-9 tw:bg-primary/10 tw:text-primary tw:rounded-xl tw:flex tw:items-center tw:justify-center"
        >
          <IconPackage class="tw:size-5 tw:text-primary" />
        </div>
        <span>{{ isEdit ? 'Edit Item' : 'Create New Item' }}</span>
      </div>
    </template>

    <BaseForm ref="formRef" hideFooter @submit="onSubmit">
      <BaseField label="Item Name" required :value="form.name" :rules="[required()]">
        <template #default="field">
          <BaseTextInput
            v-bind="field"
            v-model="form.name"
            placeholder="e.g. Stainless Steel Bolt"
          />
        </template>
      </BaseField>

      <div class="tw:flex tw:gap-4">
        <BaseField
          label="SKU"
          required
          :value="form.sku"
          :rules="[required(), skuUnique]"
          :error="skuInUseError"
          class="tw:flex-1"
        >
          <template #default="field">
            <div class="tw:relative">
              <BaseTextInput
                v-bind="field"
                v-model="form.sku"
                placeholder="e.g. BOLT-SS-M8"
                :disabled="isEdit"
              />
              <template v-if="!isEdit && form.sku">
                <IconCheck
                  v-if="skuAvailable"
                  class="tw:absolute tw:right-3 tw:top-1/2 tw:-translate-y-1/2 tw:size-4 tw:text-green"
                />
                <IconXCross
                  v-else
                  class="tw:absolute tw:right-3 tw:top-1/2 tw:-translate-y-1/2 tw:size-4 tw:text-red"
                />
              </template>
            </div>
          </template>
        </BaseField>

        <BaseField label="ERP Item Code" :value="form.erpItemCode" class="tw:flex-1">
          <template #default="field">
            <BaseTextInput
              v-bind="field"
              v-model="form.erpItemCode"
              placeholder="Optional — external ERP reference"
            />
          </template>
        </BaseField>
      </div>

      <div class="tw:flex tw:gap-4">
        <BaseField label="Item Type" required :value="form.productTypeId" :rules="[required()]" class="tw:flex-1">
          <ProductTypeSelectMenu v-model="form.productTypeId" :required="true" />
        </BaseField>
        <div class="tw:flex-1">
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Item Category</p>
          <ItemCategorySelectMenu v-model="form.itemCategoryId" />
        </div>
      </div>

      <div class="tw:flex tw:gap-4">
        <div class="tw:flex-1">
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Item Group</p>
          <ProductFamilySelectMenu v-model="form.productFamilyId" nullLabel="— No group —" />
        </div>
        <div class="tw:flex-1">
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Unit of Measure</p>
          <UomSelectMenu v-model="form.uomId" />
        </div>
      </div>

      <div class="tw:flex tw:gap-4">
        <BaseField label="Status" required :value="form.statusId" :rules="[required()]" class="tw:flex-1">
          <ProductStatusSelectMenu v-model="form.statusId" :required="true" />
        </BaseField>
        <BaseField label="Revision" :value="form.revision" class="tw:flex-1">
          <template #default="field">
            <BaseTextInput v-bind="field" v-model="form.revision" placeholder="e.g. A" />
          </template>
        </BaseField>
      </div>

      <div>
        <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Suppliers</p>
        <SupplierSelectMenu
          v-model="form.supplierIds"
          :multiple="true"
          :allStatuses="true"
          nullLabel="— No suppliers —"
        />
      </div>

      <!-- Additional QMS item details — collapsed by default to keep the form light. -->
      <div class="tw:border tw:border-divider tw:rounded-lg tw:overflow-hidden">
        <button
          type="button"
          class="tw:w-full tw:flex tw:items-center tw:justify-between tw:px-4 tw:py-2.5 tw:text-sm tw:font-medium tw:text-on-main tw:bg-main-hover tw:hover:bg-main-hover/70"
          @click="showAdvanced = !showAdvanced"
        >
          <span>Additional details — traceability, quality & compliance</span>
          <span class="tw:text-secondary">{{ showAdvanced ? '▾' : '▸' }}</span>
        </button>
        <div v-if="showAdvanced" class="tw:p-4 tw:flex tw:flex-col tw:gap-4">
          <!-- Traceability -->
          <div class="tw:flex tw:flex-wrap tw:gap-4 tw:items-end">
            <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-on-main">
              <BaseCheckbox v-model="form.lotControlled" /> Lot / batch controlled
            </label>
            <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-on-main">
              <BaseCheckbox v-model="form.serialControlled" /> Serial controlled
            </label>
            <BaseField label="Shelf life (days)" :value="form.shelfLifeDays" class="tw:w-40">
              <template #default="field">
                <BaseTextInput v-bind="field" v-model.number="form.shelfLifeDays" type="number" :min="0" placeholder="—" />
              </template>
            </BaseField>
          </div>

          <!-- Quality controls -->
          <div class="tw:flex tw:flex-wrap tw:gap-4 tw:items-end">
            <BaseField label="Criticality" class="tw:w-40">
              <BaseInlineSelect v-model="form.criticality" :items="CRITICALITY_OPTIONS" :clearable="true" nullLabel="— None —" />
            </BaseField>
            <BaseField label="Default AQL" :value="form.defaultAql" class="tw:w-32">
              <template #default="field">
                <BaseTextInput v-bind="field" v-model="form.defaultAql" placeholder="e.g. 1.5" />
              </template>
            </BaseField>
            <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-on-main tw:pb-2">
              <BaseCheckbox v-model="form.inspectionRequired" /> Inspection required
            </label>
          </div>

          <!-- Compliance / logistics -->
          <div class="tw:flex tw:flex-wrap tw:gap-4 tw:items-end">
            <BaseField label="Country of origin" :value="form.countryOfOrigin" class="tw:flex-1 tw:min-w-40">
              <template #default="field">
                <BaseTextInput v-bind="field" v-model="form.countryOfOrigin" placeholder="e.g. USA" />
              </template>
            </BaseField>
            <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-on-main tw:pb-2">
              <BaseCheckbox v-model="form.isHazardous" /> Hazardous / controlled
            </label>
          </div>
          <BaseTextarea
            v-model="form.storageConditions"
            label="Storage conditions"
            placeholder="e.g. Store below 25°C, away from direct sunlight (optional)"
            :maxlength="500"
            :rows="2"
          />
        </div>
      </div>

      <BaseTextarea
        v-model="form.description"
        label="Description"
        placeholder="Short plain-text summary (optional)"
        :maxlength="1000"
        :rows="3"
      />
    </BaseForm>

    <template #footer>
      <BaseDialogFooter
        :submitLabel="isEdit ? 'Save Changes' : 'Create Item'"
        :loading="isSubmitting"
        :error="saveError"
        @cancel="open = false"
        @submit="formRef?.submit()"
      />
    </template>
  </BaseDialog>
</template>
