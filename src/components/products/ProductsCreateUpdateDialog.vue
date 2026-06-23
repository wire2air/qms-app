<script setup>
import { IconCheck, IconX as IconXCross, IconPackage } from '@tabler/icons-vue'
import { required, helpers } from '@vuelidate/validators'
import { useValidator } from '@shared/composables/validator.js'
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

const toast = useToast()

const form = ref({
  name: '',
  sku: '',
  productFamilyId: null,
  description: '',
  productTypeId: null,
  statusId: 'ACTIVE',
})

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

const rules = computed(() => ({
  name: { required: helpers.withMessage('Required', required) },
  sku: { required: helpers.withMessage('Required', required) },
  productTypeId: { required: helpers.withMessage('Required', required) },
  statusId: { required: helpers.withMessage('Required', required) },
}))

const validator = useValidator(rules, form)

const isSubmitting = ref(false)
const isEdit = computed(() => !!props.id)

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
  const valid = await validator.value.$validate()
  if (!valid || !skuAvailable.value) return

  isSubmitting.value = true
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
  } catch (e) {
    toast.error(e?.message || 'Failed to save product')
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

    <div class="tw:flex tw:flex-col tw:gap-4">
      <BaseTextInput
        v-model="form.name"
        name="name"
        label="Product Name"
        placeholder="e.g. Stainless Steel Bolt"
        :required="true"
        :errorMsg="validator.$errors?.name?.[0]?.$message"
      />

      <div class="tw:relative">
        <BaseTextInput
          v-model="form.sku"
          name="sku"
          label="SKU"
          placeholder="e.g. BOLT-SS-M8"
          :required="true"
          :errorMsg="
            !skuAvailable ? 'SKU already in use' : (validator.$errors?.sku?.[0]?.$message ?? '')
          "
        />
        <template v-if="!isEdit && form.sku">
          <IconCheck
            v-if="skuAvailable"
            class="tw:absolute tw:right-3 tw:top-9 tw:size-4 tw:text-green-500"
          />
          <IconXCross v-else class="tw:absolute tw:right-3 tw:top-9 tw:size-4 tw:text-red-500" />
        </template>
      </div>

      <div>
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Product Family</p>
        <ProductFamilySelectMenu v-model="form.productFamilyId" nullLabel="— No family —" />
      </div>

      <div class="tw:flex tw:gap-4">
        <BaseField label="Product Type">
          <ProductTypeSelectMenu v-model="form.productTypeId" :required="true" />
        </BaseField>

        <BaseField label="Status">
          <ProductStatusSelectMenu v-model="form.statusId" :required="true" />
        </BaseField>
      </div>

      <BaseTextarea
        v-model="form.description"
        name="description"
        label="Description"
        placeholder="Short plain-text summary (optional)"
        :maxlength="1000"
        :rows="3"
      />
    </div>

    <template #footer>
      <BaseDialogFooter
        :submitLabel="isEdit ? 'Save Changes' : 'Create Product'"
        :loading="isSubmitting"
        @cancel="open = false"
        @submit="onSubmit"
      />
    </template>
  </BaseDialog>
</template>
