<script setup>
/**
 * Create a draft specification + its characteristics. Aggregate write through
 * the qcInspection REST service (not entity CRUD).
 */
import { IconPlus, IconTrash } from '@tabler/icons-vue'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.

const emit = defineEmits(['created'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()
const saving = ref(false)

const MATERIAL_KINDS = [
  { id: 'RAW', name: 'Raw material' },
  { id: 'PACKAGING', name: 'Packaging' },
  { id: 'BULK', name: 'Bulk' },
  { id: 'FINISHED', name: 'Finished good' },
]
const TEST_TYPES = [
  { id: 'NUMERIC', name: 'Numeric' },
  { id: 'PASS_FAIL', name: 'Pass / Fail' },
  { id: 'TEXT', name: 'Text' },
  { id: 'ATTACHMENT', name: 'Attachment' },
]

const form = ref(null)
function reset() {
  form.value = {
    name: '',
    code: '',
    materialKind: 'RAW',
    scope: 'product', // product | productType
    productId: null,
    productTypeId: null,
    characteristics: [],
  }
}
reset()
watch(show, (v) => {
  if (v) reset()
})

function addCharacteristic() {
  form.value.characteristics.push({
    name: '',
    testType: 'NUMERIC',
    targetValue: null,
    lsl: null,
    usl: null,
    uom: '',
    isCritical: false,
  })
}
function removeCharacteristic(i) {
  form.value.characteristics.splice(i, 1)
}

const canSubmit = computed(() => {
  const f = form.value
  if (!f.name?.trim()) return false
  if (f.scope === 'product' && !f.productId) return false
  if (f.scope === 'productType' && !f.productTypeId) return false
  return f.characteristics.length > 0 && f.characteristics.every((c) => c.name?.trim())
})

async function onSave() {
  if (!canSubmit.value || saving.value) return
  saving.value = true
  try {
    const f = form.value
    const { specification } = await post('/v1/services/qcInspection/specifications', {
      name: f.name.trim(),
      code: f.code?.trim() || null,
      materialKind: f.materialKind,
      productId: f.scope === 'product' ? f.productId : null,
      productTypeId: f.scope === 'productType' ? f.productTypeId : null,
      characteristics: f.characteristics.map((c, i) => ({
        name: c.name.trim(),
        testType: c.testType,
        targetValue: c.testType === 'NUMERIC' ? c.targetValue : null,
        lsl: c.testType === 'NUMERIC' ? c.lsl : null,
        usl: c.testType === 'NUMERIC' ? c.usl : null,
        uom: c.testType === 'NUMERIC' ? c.uom?.trim() || null : null,
        isCritical: !!c.isCritical,
        sortOrder: i,
      })),
    })
    toast.success('Specification created')
    show.value = false
    emit('created', specification.id)
  } catch (err) {
    toast.error(err?.message || 'Failed to create specification')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" title="New Specification" :persistent="true" size="3xl">
    <div class="tw:p-4 tw:space-y-4">
      <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Name <span class="tw:text-bad">*</span></label>
          <BaseTextInput v-model="form.name" placeholder="e.g. Bulk Lotion Spec" />
        </div>
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Code</label>
          <BaseTextInput v-model="form.code" placeholder="optional" />
        </div>
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Material kind</label>
          <BaseInlineSelect v-model="form.materialKind" :items="MATERIAL_KINDS" :required="true" />
        </div>
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Scope</label>
          <div class="tw:flex tw:gap-2">
            <BaseInlineSelect
              v-model="form.scope"
              :items="[{ id: 'product', name: 'Specific product' }, { id: 'productType', name: 'Product type' }]"
              :required="true"
              class="tw:w-44"
            />
            <ProductSelectMenu v-if="form.scope === 'product'" v-model="form.productId" class="tw:flex-1" />
            <ProductTypeSelectMenu v-else v-model="form.productTypeId" class="tw:flex-1" />
          </div>
        </div>
      </div>

      <div>
        <div class="tw:flex tw:items-center tw:justify-between tw:mb-2">
          <label class="tw:text-sm tw:font-semibold">Characteristics (tests) <span class="tw:text-bad">*</span></label>
          <BaseButton variant="secondary" size="sm" @click="addCharacteristic">
            <IconPlus :size="14" /> Add test
          </BaseButton>
        </div>
        <div v-if="!form.characteristics.length" class="tw:text-xs tw:text-secondary tw:italic tw:py-2">
          Add at least one test (e.g. pH 5.0–6.0, Appearance pass/fail).
        </div>
        <div
          v-for="(c, i) in form.characteristics"
          :key="i"
          class="tw:flex tw:items-start tw:gap-2 tw:p-2 tw:mb-2 tw:rounded tw:border tw:border-divider"
        >
          <div class="tw:flex-1 tw:grid tw:grid-cols-2 tw:md:grid-cols-6 tw:gap-2">
            <BaseTextInput v-model="c.name" placeholder="Test name" size="sm" class="tw:col-span-2" />
            <BaseInlineSelect v-model="c.testType" :items="TEST_TYPES" :required="true" />
            <template v-if="c.testType === 'NUMERIC'">
              <BaseTextInput v-model.number="c.lsl" type="number" placeholder="LSL" size="sm" />
              <BaseTextInput v-model.number="c.usl" type="number" placeholder="USL" size="sm" />
              <BaseTextInput v-model="c.uom" placeholder="UOM" size="sm" />
            </template>
            <label v-else class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-secondary tw:col-span-3">
              <BaseCheckbox v-model="c.isCritical" /> Critical
            </label>
          </div>
          <button
            type="button"
            class="tw:p-1 tw:rounded tw:text-secondary tw:hover:text-bad tw:bg-transparent tw:border-0 tw:cursor-pointer"
            @click="removeCharacteristic(i)"
          >
            <IconTrash :size="14" />
          </button>
        </div>
      </div>
    </div>

    <div class="tw:flex tw:justify-end tw:gap-2 tw:px-4 tw:pb-4">
      <BaseButton variant="outline" @click="show = false">Cancel</BaseButton>
      <BaseButton :disabled="!canSubmit || saving" :loading="saving" @click="onSave">Create</BaseButton>
    </div>
  </BaseDialog>
</template>
