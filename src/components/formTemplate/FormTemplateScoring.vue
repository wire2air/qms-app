<script setup>
/**
 * The form template's "Scoring" view (its own mode, alongside Automation). Edits
 * the module-level rating bands on `moduleConfig.scoring`. Per-field weights /
 * option scores are authored in the form builder (ConfigFieldScoring); this
 * page defines the bands that turn a 0–100 total into a rating + outcome that
 * automation and approval can react to.
 */
import { IconPlus, IconTrash, IconChartBar } from '@tabler/icons-vue'
import { collectScoredFields } from '@/composables/useModuleScoring'

const props = defineProps({
  templateId: { type: String, required: true },
})

const toast = useToast()

const template = useLiveQueryWithDeps(
  [() => props.templateId],
  async (db, [id]) => (id ? db.FormTemplate.findByPk(id) : null),
  { models: ['FormTemplate'] },
)
const isModule = computed(() => !!template.value?.isModule)
const scoredFieldCount = computed(() => collectScoredFields(template.value?.schema || []).length)

// Band outcomes drive approval / automation semantics downstream.
const OUTCOME_OPTIONS = [
  { id: 'APPROVE', name: 'Approve / Qualified' },
  { id: 'CONDITIONAL', name: 'Conditional' },
  { id: 'REJECT', name: 'Reject / Not qualified' },
  { id: 'NONE', name: 'No automatic outcome' },
]

function defaultBands() {
  return [
    { id: 'approved', label: 'Approved', min: 80, max: 100, color: '#16a34a', outcome: 'APPROVE' },
    {
      id: 'conditional',
      label: 'Conditional',
      min: 60,
      max: 79,
      color: '#f59e0b',
      outcome: 'CONDITIONAL',
    },
    { id: 'rejected', label: 'Not Qualified', min: 0, max: 59, color: '#dc2626', outcome: 'REJECT' },
  ]
}

// Local editable copy; hydrated from the template once it loads.
const bands = ref([])
const enabled = ref(false)
// Supplier-qualification flag: links each record to a Supplier, surfaces the
// history on the supplier page, and hands off uploaded attachments on approval.
const linkedSupplier = ref(false)
const saving = ref(false)
const hydrated = ref(false)

watch(
  template,
  (t) => {
    if (!t || hydrated.value) return
    const scoring = t.moduleConfig?.scoring
    if (scoring?.bands?.length) {
      bands.value = scoring.bands.map((b) => ({ ...b }))
      enabled.value = true
    } else {
      bands.value = defaultBands()
      enabled.value = false
    }
    linkedSupplier.value = t.moduleConfig?.linkedEntity === 'supplier'
    hydrated.value = true
  },
  { immediate: true },
)

function slugify(text) {
  return (text || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || `band_${bands.value.length + 1}`
}

function addBand() {
  bands.value.push({
    id: `band_${bands.value.length + 1}`,
    label: 'New band',
    min: 0,
    max: 100,
    color: '#6b7280',
    outcome: 'NONE',
  })
}
function removeBand(index) {
  bands.value.splice(index, 1)
}

const sortedPreview = computed(() =>
  [...bands.value].sort((a, b) => Number(b.min) - Number(a.min)),
)

async function save() {
  if (!template.value || saving.value) return
  saving.value = true
  try {
    const cleanBands = enabled.value
      ? bands.value.map((b) => ({
          id: b.id || slugify(b.label),
          label: b.label?.trim() || 'Band',
          min: Number(b.min) || 0,
          max: Number(b.max) || 100,
          color: b.color || '#6b7280',
          outcome: b.outcome || 'NONE',
        }))
      : []
    template.value.moduleConfig = {
      ...(template.value.moduleConfig || {}),
      scoring: enabled.value ? { formula: 'weighted_average', bands: cleanBands } : undefined,
      linkedEntity: linkedSupplier.value ? 'supplier' : undefined,
    }
    await template.value.save()
    toast.success('Scoring saved')
  } catch (e) {
    toast.error(e?.message || 'Failed to save scoring')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="tw:grow tw:flex tw:flex-col tw:p-8 tw:overflow-y-auto tw:h-full">
    <div class="tw:max-w-3xl tw:mx-auto tw:flex tw:flex-col tw:w-full tw:gap-6">
      <div
        class="tw:flex tw:items-start tw:justify-between tw:gap-4 tw:border-b tw:border-divider tw:pb-4"
      >
        <div>
          <BaseText as="h3" variant="subheading" weight="bold">Scoring</BaseText>
          <p class="tw:text-sm tw:text-secondary">
            Turn each record's weighted 0–100 score into a rating band. Set per-field weights in the
            form builder; define the bands here.
          </p>
        </div>
        <IconChartBar :size="28" class="tw:text-secondary/50" />
      </div>

      <BaseCard v-if="!isModule" class="tw:text-sm tw:text-secondary">
        Promote this template to a Module to configure scoring.
      </BaseCard>

      <template v-else>
        <BaseCard
          v-if="scoredFieldCount === 0"
          class="tw:text-sm tw:text-amber-700 tw:bg-amber-50 tw:border-amber-200"
        >
          No fields are marked "Include in the score" yet. Open the form builder and enable scoring
          on the fields you want to weigh.
        </BaseCard>

        <BaseCard class="tw:flex tw:flex-col tw:gap-2">
          <BaseCheckbox v-model="linkedSupplier">This module qualifies a Supplier</BaseCheckbox>
          <p class="tw:text-xs tw:text-secondary tw:pl-6">
            Each record links to a supplier and appears on that supplier's Evaluations tab. On
            approval, uploaded attachments are handed off to the supplier while the answers stay on
            the record. Re-qualify by creating a new record each cycle — all copies are kept.
          </p>
        </BaseCard>

        <BaseCard class="tw:flex tw:flex-col tw:gap-4">
          <BaseCheckbox v-model="enabled">Enable rating bands for this module</BaseCheckbox>

          <template v-if="enabled">
            <div class="tw:flex tw:flex-col tw:gap-3">
              <div
                v-for="(band, index) in bands"
                :key="index"
                class="tw:flex tw:flex-wrap tw:items-end tw:gap-3 tw:bg-main-hover tw:rounded-lg tw:p-3"
              >
                <BaseColorPicker v-model="band.color" />
                <BaseField label="Label" class="tw:flex-1 tw:min-w-32">
                  <BaseTextInput v-model="band.label" size="sm" />
                </BaseField>
                <BaseField label="Min" class="tw:w-20">
                  <BaseTextInput v-model.number="band.min" type="number" :min="0" :max="100" size="sm" />
                </BaseField>
                <BaseField label="Max" class="tw:w-20">
                  <BaseTextInput v-model.number="band.max" type="number" :min="0" :max="100" size="sm" />
                </BaseField>
                <BaseField label="Outcome" class="tw:min-w-40">
                  <BaseSelect
                    v-model="band.outcome"
                    :options="OUTCOME_OPTIONS"
                    optionLabel="name"
                    optionValue="id"
                    :required="true"
                  />
                </BaseField>
                <button
                  class="tw:p-1.5 tw:mb-1 tw:rounded tw:text-red-500 tw:hover:bg-red-50 tw:transition-colors"
                  aria-label="Remove band"
                  @click="removeBand(index)"
                >
                  <IconTrash :size="16" />
                </button>
              </div>
            </div>

            <button
              class="tw:self-start tw:flex tw:items-center tw:gap-1 tw:px-3 tw:py-1.5 tw:text-primary tw:rounded-lg tw:hover:bg-primary/10 tw:transition-colors tw:text-sm tw:font-medium"
              @click="addBand"
            >
              <IconPlus :size="14" /> Add band
            </button>

            <div class="tw:flex tw:flex-wrap tw:gap-2 tw:pt-2 tw:border-t tw:border-divider">
              <span class="tw:text-xs tw:text-secondary tw:mr-1">Preview:</span>
              <span
                v-for="band in sortedPreview"
                :key="band.id"
                class="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-full tw:px-2.5 tw:py-1 tw:text-xs tw:font-medium tw:text-white"
                :style="{ backgroundColor: band.color }"
              >
                {{ band.label }} ({{ band.min }}–{{ band.max }})
              </span>
            </div>
          </template>

          <div class="tw:flex tw:justify-end tw:pt-2">
            <BaseButton variant="primary" :loading="saving" @click="save">Save scoring</BaseButton>
          </div>
        </BaseCard>
      </template>
    </div>
  </div>
</template>
