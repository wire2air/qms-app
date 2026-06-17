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
    defectClass: 'MAJOR',
    requiresInstrument: false,
    testMethod: '',
  })
}
// Pre-fill a characteristic from a Test Library entry (overridable).
function addFromLibrary(t) {
  form.value.characteristics.push({
    name: t.name ?? '',
    testType: t.testType || 'PASS_FAIL',
    targetValue: t.targetValue ?? null,
    lsl: t.lsl ?? null,
    usl: t.usl ?? null,
    uom: t.uom ?? '',
    defectClass: t.defaultSeverity || 'MAJOR',
    requiresInstrument: !!t.requiresInstrument,
    testMethod: t.testMethod ?? '',
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
        defectClass: c.defectClass || 'MAJOR',
        isCritical: c.defectClass === 'CRITICAL',
        requiresInstrument: !!c.requiresInstrument,
        testMethod: c.testMethod || null,
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
        <BaseField v-slot="{ id: fieldId }" label="Name" required>
          <BaseTextInput :id="fieldId" v-model="form.name" placeholder="e.g. Bulk Lotion Spec" />
        </BaseField>
        <BaseField v-slot="{ id: fieldId }" label="Code">
          <BaseTextInput :id="fieldId" v-model="form.code" placeholder="optional" />
        </BaseField>
        <BaseField label="Material kind">
          <BaseInlineSelect v-model="form.materialKind" :items="MATERIAL_KINDS" :required="true" />
        </BaseField>
        <BaseField label="Scope">
          <BaseInlineSelect
            v-model="form.scope"
            :items="[{ id: 'product', name: 'Specific product' }, { id: 'productType', name: 'Product type' }]"
            :required="true"
            class="tw:w-full"
          />
        </BaseField>
      </div>

      <!-- Scope target on its own row (the select needs the width). -->
      <BaseField required>
        <template #label>
          {{ form.scope === 'product' ? 'Product' : 'Product type' }}
        </template>
        <ProductSelectMenu v-if="form.scope === 'product'" v-model="form.productId" class="tw:w-full" />
        <ProductTypeSelectMenu v-else v-model="form.productTypeId" class="tw:w-full" />
      </BaseField>

      <div>
        <div class="tw:flex tw:items-center tw:justify-between tw:mb-2">
          <label class="tw:text-sm tw:font-semibold">Characteristics (tests) <span class="tw:text-bad">*</span></label>
          <div class="tw:flex tw:items-center tw:gap-3">
            <TestLibraryAddMenu
              :productTypeId="form.scope === 'productType' ? form.productTypeId : null"
              @pick="addFromLibrary"
            />
            <BaseButton variant="secondary" size="sm" @click="addCharacteristic">
              <IconPlus :size="14" /> Add test
            </BaseButton>
          </div>
        </div>
        <div v-if="!form.characteristics.length" class="tw:text-xs tw:text-secondary tw:italic tw:py-2">
          Add at least one test (e.g. pH 5.0–6.0, Appearance pass/fail).
        </div>
        <div
          v-for="(c, i) in form.characteristics"
          :key="i"
          class="tw:p-3 tw:mb-2 tw:rounded-lg tw:border tw:border-divider tw:bg-main-hover"
        >
          <div class="tw:flex tw:items-end tw:gap-3">
            <BaseField v-slot="{ id: fieldId }" label="Test name" class="tw:flex-1">
              <BaseTextInput :id="fieldId" v-model="c.name" placeholder="e.g. pH, Appearance" size="sm" />
            </BaseField>
            <BaseField label="Type" class="tw:w-44">
              <BaseInlineSelect v-model="c.testType" :items="TEST_TYPES" :required="true" />
            </BaseField>
            <BaseField label="Defect class" class="tw:w-32">
              <DefectSeveritySelectMenu v-model="c.defectClass" :required="true" />
            </BaseField>
            <label class="tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-secondary tw:pb-2 tw:whitespace-nowrap">
              <BaseCheckbox v-model="c.requiresInstrument" /> Instrument
            </label>
            <button
              type="button"
              class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:text-bad tw:bg-transparent tw:border-0 tw:cursor-pointer"
              @click="removeCharacteristic(i)"
            >
              <IconTrash :size="16" />
            </button>
          </div>
          <div v-if="c.testType === 'NUMERIC'" class="tw:flex tw:flex-wrap tw:gap-3 tw:mt-3">
            <BaseField v-slot="{ id: fieldId }" label="Target" class="tw:w-28">
              <BaseTextInput :id="fieldId" v-model.number="c.targetValue" type="number" size="sm" />
            </BaseField>
            <BaseField v-slot="{ id: fieldId }" label="LSL (min)" class="tw:w-28">
              <BaseTextInput :id="fieldId" v-model.number="c.lsl" type="number" size="sm" />
            </BaseField>
            <BaseField v-slot="{ id: fieldId }" label="USL (max)" class="tw:w-28">
              <BaseTextInput :id="fieldId" v-model.number="c.usl" type="number" size="sm" />
            </BaseField>
            <BaseField v-slot="{ id: fieldId }" label="UOM" class="tw:w-28">
              <BaseTextInput :id="fieldId" v-model="c.uom" placeholder="e.g. pH, %" size="sm" />
            </BaseField>
          </div>
          <BaseField label="Test method / instrument requirements" class="tw:mt-3">
            <RichTextAttachments
              v-model="c.testMethod"
              placeholder="e.g. Calibrated micrometer, 0.001 mm resolution, 20°C — attach reference images or spec sheets"
            />
          </BaseField>
        </div>
      </div>
    </div>

    <div class="tw:flex tw:justify-end tw:gap-2 tw:px-4 tw:pb-4">
      <BaseButton variant="outline" @click="show = false">Cancel</BaseButton>
      <BaseButton :disabled="!canSubmit || saving" :loading="saving" @click="onSave">Create</BaseButton>
    </div>
  </BaseDialog>
</template>
