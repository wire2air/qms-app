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

const form = ref({
  name: '',
  sku: '',
  productFamilyId: null,
  description: '',
  productTypeId: null,
  statusId: 'ACTIVE',
})

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
        description: p.description || '',
        productTypeId: p.productTypeId,
        statusId: p.statusId,
      }
    }
  },
  { immediate: true },
)

const createProduct = useLiveMutation(async (db, data) => {
  const p = db.Product.create(data)
  await p.save()
  return p
})

async function onSubmit() {
  if (isSubmitting.value) return
  isSubmitting.value = true
  saveError.value = ''
  try {
    const uid = currentSession.value?.userId
    if (!isEdit.value) {
      // createdBy/updatedBy are required on the Product model and are not
      // auto-populated — set them from the current session.
      const newProduct = await createProduct({ ...form.value, createdBy: uid, updatedBy: uid })
      emit('created', newProduct)
    } else {
      Object.assign(product.value, form.value, { updatedBy: uid })
      await product.value.save()
      emit('updated', product.value)
    }
    open.value = false
  } catch (err) {
    saveError.value = err?.message || 'Failed to save product'
  } finally {
    isSubmitting.value = false
  }
}

// Reset form when dialog closes
watch(open, (val) => {
  if (!val) {
    form.value = {
      name: '',
      sku: '',
      productFamilyId: null,
      description: '',
      productTypeId: null,
      statusId: 'ACTIVE',
    }
    saveError.value = ''
  }
})
</script>

<template>
  <BaseDialog v-model="open" maxWidth="md">
    <template #title>
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:w-9 tw:h-9 tw:bg-primary/10 tw:text-primary tw:rounded-xl tw:flex tw:items-center tw:justify-center"
        >
          <IconPackage class="tw:size-5 tw:text-primary" />
        </div>
        <span>{{ isEdit ? 'Edit Product' : 'Create New Product' }}</span>
      </div>
    </template>

    <BaseForm ref="formRef" hideFooter @submit="onSubmit">
      <BaseField label="Product Name" required :value="form.name" :rules="[required()]">
        <template #default="field">
          <BaseTextInput
            v-bind="field"
            v-model="form.name"
            placeholder="e.g. Stainless Steel Bolt"
          />
        </template>
      </BaseField>

      <BaseField
        label="SKU"
        required
        :value="form.sku"
        :rules="[required(), skuUnique]"
        :error="skuInUseError"
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

      <div>
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Product Family</p>
        <ProductFamilySelectMenu v-model="form.productFamilyId" nullLabel="— No family —" />
      </div>

      <div class="tw:flex tw:gap-4">
        <BaseField label="Product Type" required :value="form.productTypeId" :rules="[required()]">
          <ProductTypeSelectMenu v-model="form.productTypeId" :required="true" />
        </BaseField>

        <BaseField label="Status" required :value="form.statusId" :rules="[required()]">
          <ProductStatusSelectMenu v-model="form.statusId" :required="true" />
        </BaseField>
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
        :submitLabel="isEdit ? 'Save Changes' : 'Create Product'"
        :loading="isSubmitting"
        :error="saveError"
        @cancel="open = false"
        @submit="formRef?.submit()"
      />
    </template>
  </BaseDialog>
</template>
