<script setup>
/**
 * Create a draft specification + its characteristics. Aggregate write through
 * the qcInspection REST service (not entity CRUD).
 */
import { IconPlus, IconTrash } from '@tabler/icons-vue'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { required, requiredWhen } from '@shared/components/form/validators.js'

const props = defineProps({
  // When set, the spec is pre-scoped to this product: the scope/target
  // pickers are hidden and the spec is created against this product.
  lockProductId: { type: String, default: null },
})

const emit = defineEmits(['created'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()

const formRef = ref(null)
const isSubmitting = ref(false)
const saveError = ref(null)

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
    scope: 'product', // product | family | productType
    productId: props.lockProductId ?? null,
    productFamilyId: null,
    productTypeId: null,
    characteristics: [],
  }
}
reset()
watch(show, (v) => {
  if (v) reset()
  if (!v) saveError.value = null
})

function addCharacteristic() {
  // Prepend so the newest row is at the top, in view.
  form.value.characteristics.unshift({
    _key: crypto.randomUUID(),
    name: '',
    testType: 'NUMERIC',
    targetValue: null,
    lsl: null,
    usl: null,
    uom: '',
    defectClass: 'MAJOR',
    requiresInstrument: false,
    preferredEquipmentId: null,
    testMethod: '',
  })
}
// Pre-fill characteristics from Test Library entries (overridable). Accepts an
// array (multi-select) and prepends them all, preserving pick order.
function addFromLibrary(entries) {
  const list = Array.isArray(entries) ? entries : [entries]
  const mapped = list.map((t) => ({
    _key: crypto.randomUUID(),
    name: t.name ?? '',
    testType: t.testType || 'PASS_FAIL',
    // Acceptance criteria are spec-specific — start blank; the user sets them here.
    targetValue: null,
    lsl: null,
    usl: null,
    uom: '',
    defectClass: t.defaultSeverity || 'MAJOR',
    requiresInstrument: !!t.requiresInstrument,
    preferredEquipmentId: t.preferredEquipmentId ?? null,
    testMethod: t.testMethod ?? '',
  }))
  form.value.characteristics.unshift(...mapped)
}
function removeCharacteristic(i) {
  form.value.characteristics.splice(i, 1)
}

async function onSubmit() {
  if (isSubmitting.value) return
  isSubmitting.value = true
  saveError.value = null
  try {
    const f = form.value
    const { specification } = await post('/v1/services/qcInspection/specifications', {
      name: f.name.trim(),
      code: f.code?.trim() || null,
      materialKind: f.materialKind,
      productId: f.scope === 'product' ? f.productId : null,
      productFamilyId: f.scope === 'family' ? f.productFamilyId : null,
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
        preferredEquipmentId: c.requiresInstrument ? c.preferredEquipmentId || null : null,
        testMethod: c.testMethod || null,
        sortOrder: i,
      })),
    })
    toast.success('Specification created')
    show.value = false
    emit('created', specification.id)
  } catch (err) {
    saveError.value = err?.message || 'Failed to create specification'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" title="New Specification" :persistent="true" size="3xl">
    <BaseForm ref="formRef" hideFooter @submit="onSubmit">
      <div class="tw:p-4 tw:space-y-4">
        <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
          <BaseField label="Name" required :value="form.name" :rules="[required()]">
            <template #default="field">
              <BaseTextInput
                v-bind="field"
                v-model="form.name"
                placeholder="e.g. Bulk Lotion Spec"
              />
            </template>
          </BaseField>
          <BaseField label="Code" :value="form.code">
            <template #default="field">
              <BaseTextInput v-bind="field" v-model="form.code" placeholder="optional" />
            </template>
          </BaseField>
          <BaseField label="Material kind">
            <BaseInlineSelect
              v-model="form.materialKind"
              :items="MATERIAL_KINDS"
              :required="true"
            />
          </BaseField>
          <BaseField v-if="!lockProductId" label="Scope">
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

        <!-- Scope target on its own row (the select needs the width). Hidden
             when the dialog is opened pre-scoped to a product. -->
        <BaseField
          v-if="!lockProductId"
          required
          :value="
            form.scope === 'product'
              ? form.productId
              : form.scope === 'family'
                ? form.productFamilyId
                : form.productTypeId
          "
          :rules="[
            requiredWhen(() => form.scope === 'product' && !lockProductId, 'Item is required.'),
            requiredWhen(
              () => form.scope === 'family' && !lockProductId,
              'Item group is required.',
            ),
            requiredWhen(
              () => form.scope === 'productType' && !lockProductId,
              'Item type is required.',
            ),
          ]"
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

        <div>
          <div class="tw:flex tw:items-center tw:justify-between tw:mb-2">
            <label class="tw:text-sm tw:font-semibold"
              >Characteristics (tests) <span class="tw:text-bad">*</span></label
            >
            <div class="tw:flex tw:items-center tw:gap-3">
              <TestLibraryAddMenu
                :productFamilyId="form.scope === 'family' ? form.productFamilyId : null"
                @pick="addFromLibrary"
              />
              <BaseButton variant="secondary" size="sm" @click="addCharacteristic">
                <IconPlus :size="14" /> Add test
              </BaseButton>
            </div>
          </div>
          <div
            v-if="!form.characteristics.length"
            class="tw:text-xs tw:text-secondary tw:italic tw:py-2"
          >
            Add at least one test (e.g. pH 5.0–6.0, Appearance pass/fail).
          </div>
          <!-- List-level rule: at least one characteristic must exist. -->
          <BaseField :value="form.characteristics" :rules="[required('Add at least one test.')]" />
          <div
            v-for="(c, i) in form.characteristics"
            :key="c._key || i"
            class="tw:p-3 tw:mb-2 tw:rounded-lg tw:border tw:border-divider tw:bg-main-hover"
          >
            <div class="tw:flex tw:items-end tw:gap-3">
              <BaseField
                label="Test name"
                required
                :value="c.name"
                :rules="[required()]"
                class="tw:flex-1"
              >
                <template #default="field">
                  <BaseTextInput
                    v-bind="field"
                    v-model="c.name"
                    placeholder="e.g. pH, Appearance"
                    size="sm"
                  />
                </template>
              </BaseField>
              <BaseField label="Type" class="tw:w-44">
                <BaseInlineSelect v-model="c.testType" :items="TEST_TYPES" :required="true" />
              </BaseField>
              <BaseField label="Defect class" class="tw:w-32">
                <DefectSeveritySelectMenu v-model="c.defectClass" :required="true" />
              </BaseField>
              <label
                class="tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-secondary tw:pb-2 tw:whitespace-nowrap"
              >
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
              <BaseField label="Target" class="tw:w-28">
                <template #default="field">
                  <BaseTextInput
                    v-bind="field"
                    v-model.number="c.targetValue"
                    type="number"
                    size="sm"
                  />
                </template>
              </BaseField>
              <BaseField label="LSL (min)" class="tw:w-28">
                <template #default="field">
                  <BaseTextInput v-bind="field" v-model.number="c.lsl" type="number" size="sm" />
                </template>
              </BaseField>
              <BaseField label="USL (max)" class="tw:w-28">
                <template #default="field">
                  <BaseTextInput v-bind="field" v-model.number="c.usl" type="number" size="sm" />
                </template>
              </BaseField>
              <BaseField label="UOM" class="tw:w-28">
                <template #default="field">
                  <BaseTextInput
                    v-bind="field"
                    v-model="c.uom"
                    placeholder="e.g. pH, %"
                    size="sm"
                  />
                </template>
              </BaseField>
            </div>
            <BaseField
              v-if="c.requiresInstrument"
              label="Preferred instrument"
              class="tw:mt-3 tw:w-72"
            >
              <EquipmentSelectMenu
                v-model="c.preferredEquipmentId"
                nullLabel="— None (pick at capture) —"
              />
            </BaseField>
            <BaseField label="Test method / instrument requirements" class="tw:mt-3">
              <RichTextAttachments
                v-model="c.testMethod"
                placeholder="e.g. Calibrated micrometer, 0.001 mm resolution, 20°C — attach reference images or spec sheets"
              />
            </BaseField>
          </div>
        </div>
      </div>
    </BaseForm>

    <template #footer>
      <BaseDialogFooter
        submitLabel="Create"
        :loading="isSubmitting"
        :error="saveError"
        @cancel="show = false"
        @submit="formRef?.submit()"
      />
    </template>
  </BaseDialog>
</template>
