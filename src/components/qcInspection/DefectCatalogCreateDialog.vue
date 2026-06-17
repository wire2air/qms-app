<script setup>
/**
 * Create / edit a Test Library entry (the per-tenant master list of inspection
 * tests). Synced model — creates via useLiveMutation, edits by mutating the live
 * record and saving (CLAUDE.md rule #4). Picking one in the spec builder
 * pre-fills a characteristic with these defaults.
 */
import ProductTypeSelectMenu from '@/components/menus/ProductTypeSelectMenu.vue'

const props = defineProps({
  editDefect: { type: Object, default: null },
})
const open = defineModel({ type: Boolean, default: false })
const toast = useToast()
const saving = ref(false)

const TEST_TYPES = [
  { id: 'NUMERIC', name: 'Numeric (measured)' },
  { id: 'PASS_FAIL', name: 'Pass / Fail' },
  { id: 'TEXT', name: 'Text / observation' },
]

function blank() {
  return {
    code: '',
    name: '',
    description: '',
    defaultSeverity: 'MAJOR',
    testType: 'PASS_FAIL',
    testMethod: '',
    requiresInstrument: false,
    targetValue: null,
    lsl: null,
    usl: null,
    uom: '',
    applicableProductTypeIds: [],
    active: true,
  }
}
const form = ref(blank())

watch(open, (isOpen) => {
  if (!isOpen) return
  const d = props.editDefect
  form.value = d
    ? {
        code: d.code ?? '',
        name: d.name ?? '',
        description: d.description ?? '',
        defaultSeverity: d.defaultSeverity ?? 'MAJOR',
        testType: d.testType ?? 'PASS_FAIL',
        testMethod: d.testMethod ?? '',
        requiresInstrument: d.requiresInstrument ?? false,
        targetValue: d.targetValue ?? null,
        lsl: d.lsl ?? null,
        usl: d.usl ?? null,
        uom: d.uom ?? '',
        applicableProductTypeIds: Array.isArray(d.applicableProductTypeIds)
          ? [...d.applicableProductTypeIds]
          : [],
        active: d.active ?? true,
      }
    : blank()
})

// Auto-suggest a SCREAMING_SNAKE code from the name on new entries.
watch(
  () => form.value.name,
  (name) => {
    if (props.editDefect || !name) return
    form.value.code = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  },
)

const createTest = useLiveMutation(async (db, payload) => {
  const d = db.DefectCatalog.create(payload)
  await d.save()
  return d
})

async function save() {
  if (saving.value) return
  if (!form.value.code.trim() || !form.value.name.trim()) {
    toast.error('Code and name are required')
    return
  }
  saving.value = true
  try {
    const numeric = form.value.testType === 'NUMERIC'
    const payload = {
      code: form.value.code.trim(),
      name: form.value.name.trim(),
      description: form.value.description.trim() || null,
      defaultSeverity: form.value.defaultSeverity,
      testType: form.value.testType,
      testMethod: form.value.testMethod.trim() || null,
      requiresInstrument: numeric ? form.value.requiresInstrument : false,
      targetValue: numeric ? form.value.targetValue : null,
      lsl: numeric ? form.value.lsl : null,
      usl: numeric ? form.value.usl : null,
      uom: numeric ? form.value.uom.trim() || null : null,
      applicableProductTypeIds: form.value.applicableProductTypeIds.length
        ? form.value.applicableProductTypeIds
        : null,
      active: form.value.active,
    }
    if (props.editDefect) {
      Object.assign(props.editDefect, payload)
      await props.editDefect.save()
    } else {
      await createTest(payload)
    }
    toast.success(props.editDefect ? 'Test updated' : 'Test added')
    open.value = false
  } catch (err) {
    toast.error(err?.message || 'Failed to save test')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="open" :title="editDefect ? 'Edit test' : 'Add test'" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-4 tw:py-1">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <label class="tw:text-sm tw:font-medium tw:text-secondary">Name <span class="tw:text-red-500">*</span></label>
        <BaseTextInput v-model="form.name" placeholder="e.g. pH, Appearance" />
      </div>
      <div class="tw:grid tw:grid-cols-3 tw:gap-3">
        <div class="tw:flex tw:flex-col tw:gap-1">
          <label class="tw:text-sm tw:font-medium tw:text-secondary">Code <span class="tw:text-red-500">*</span></label>
          <BaseTextInput v-model="form.code" placeholder="PH" :disabled="!!editDefect" />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-1">
          <label class="tw:text-sm tw:font-medium tw:text-secondary">Type <span class="tw:text-red-500">*</span></label>
          <BaseInlineSelect v-model="form.testType" :items="TEST_TYPES" :required="true" />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-1">
          <label class="tw:text-sm tw:font-medium tw:text-secondary">Severity <span class="tw:text-red-500">*</span></label>
          <DefectSeveritySelectMenu v-model="form.defaultSeverity" :required="true" />
        </div>
      </div>

      <!-- NUMERIC defaults -->
      <div v-if="form.testType === 'NUMERIC'" class="tw:flex tw:flex-wrap tw:gap-3 tw:items-end">
        <div class="tw:w-24">
          <label class="tw:block tw:text-[11px] tw:text-secondary tw:mb-1">Target</label>
          <BaseTextInput v-model.number="form.targetValue" type="number" size="sm" />
        </div>
        <div class="tw:w-24">
          <label class="tw:block tw:text-[11px] tw:text-secondary tw:mb-1">LSL (≥)</label>
          <BaseTextInput v-model.number="form.lsl" type="number" size="sm" />
        </div>
        <div class="tw:w-24">
          <label class="tw:block tw:text-[11px] tw:text-secondary tw:mb-1">USL (≤)</label>
          <BaseTextInput v-model.number="form.usl" type="number" size="sm" />
        </div>
        <div class="tw:w-24">
          <label class="tw:block tw:text-[11px] tw:text-secondary tw:mb-1">UOM</label>
          <BaseTextInput v-model="form.uom" size="sm" placeholder="mm" />
        </div>
        <label class="tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-secondary tw:pb-2 tw:whitespace-nowrap">
          <BaseCheckbox v-model="form.requiresInstrument" /> Instrument
        </label>
      </div>

      <div class="tw:flex tw:flex-col tw:gap-1">
        <label class="tw:text-sm tw:font-medium tw:text-secondary">Method / instructions</label>
        <BaseTextarea v-model="form.testMethod" :rows="2" placeholder="How is this test performed?" />
      </div>
      <div class="tw:flex tw:flex-col tw:gap-1">
        <label class="tw:text-sm tw:font-medium tw:text-secondary">
          Applies to product types
          <span class="tw:font-normal tw:text-secondary">(optional — blank = all)</span>
        </label>
        <ProductTypeSelectMenu v-model="form.applicableProductTypeIds" multiple />
      </div>
      <label class="tw:flex tw:items-center tw:gap-2 tw:cursor-pointer tw:select-none">
        <BaseCheckbox v-model="form.active" />
        <span class="tw:text-sm tw:text-on-main">Active</span>
      </label>
    </div>

    <template #footer="{ close }">
      <div class="tw:flex tw:justify-end tw:gap-2">
        <BaseButton variant="outline" :disabled="saving" @click="close">Cancel</BaseButton>
        <BaseButton variant="primary" :isLoading="saving" @click="save">
          {{ editDefect ? 'Save' : 'Add test' }}
        </BaseButton>
      </div>
    </template>
  </BaseDialog>
</template>
