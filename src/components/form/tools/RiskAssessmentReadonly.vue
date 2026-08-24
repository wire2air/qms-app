<script setup>
const props = defineProps({
  field: { type: Object, required: true },
  values: { type: Object, default: () => ({}) },
})

// Prefer the field-level embedded snapshot (saved on the workflow
// step's formSchema). Fall back to looking up by id — first the
// field's riskAssessmentTemplateId, then the value's _templateId
// which is what gets stamped on the record at submit time.
const template = useLiveQueryWithDeps(
  [
    () => props.field?.riskAssessmentTemplate,
    () => props.field?.riskAssessmentTemplateId,
    () => props.values?._templateId,
  ],

  async (db, [embedded, fieldId, valueId]) => {
    if (embedded?.config) return embedded
    const id = fieldId || valueId
    if (!id) return null
    return db.RiskAssessmentTemplate.findByPk(id)
  },
  { models: ['RiskAssessmentTemplate'] },
)

const riskLevel = computed(() => {
  const levelId = props.values?.riskLevelId
  if (!levelId || !template.value) return null
  return (template.value.config?.riskLevels ?? []).find((r) => r.id === levelId) ?? null
})

const likelihoodLabel = computed(() => {
  const id = props.values?.likelihoodId
  if (!id || !template.value) return null
  return (template.value.config?.likelihood ?? []).find((l) => l.id === id)?.label ?? null
})

const severityLabel = computed(() => {
  const id = props.values?.severityId
  if (!id || !template.value) return null
  return (template.value.config?.severity ?? []).find((s) => s.id === id)?.label ?? null
})

const rpnScore = computed(() => props.values?.rpnScore ?? null)

const enableDetectability = computed(() => template.value?.config?.enableDetectability ?? false)

const detectabilityLabel = computed(() => {
  const id = props.values?.detectabilityId
  if (!id || !template.value) return null
  return (template.value.config?.detectability ?? []).find((d) => d.id === id)?.label ?? null
})
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-2">
    <div
      v-if="riskLevel"
      class="tw:flex tw:items-center tw:gap-3 tw:rounded-lg tw:p-3 tw:border"
      :style="{ backgroundColor: riskLevel.bg + '33', borderColor: riskLevel.bg }"
    >
      <div
        class="tw:text-sm tw:font-bold tw:px-3 tw:py-1 tw:rounded-md tw:shrink-0"
        :style="{ backgroundColor: riskLevel.bg, color: riskLevel.text }"
      >
        {{ riskLevel.label }}
      </div>
      <div class="tw:flex tw:flex-col tw:flex-1 tw:min-w-0">
        <span
          v-if="likelihoodLabel && severityLabel"
          class="tw:text-xs tw:font-medium tw:text-on-main"
        >
          {{ likelihoodLabel }} × {{ severityLabel }}
          <template v-if="enableDetectability && detectabilityLabel">
            × {{ detectabilityLabel }}</template
          >
          <template v-if="rpnScore"> = RPN {{ rpnScore }}</template>
        </span>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <span v-if="values.notes" class="tw:text-xs tw:text-secondary" v-html="values.notes" />
      </div>
      <div
        v-if="rpnScore"
        class="tw:flex tw:flex-col tw:items-center tw:shrink-0 tw:bg-white/60 tw:rounded-lg tw:px-3 tw:py-1.5"
      >
        <span
          class="tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wider tw:text-secondary"
          >RPN</span
        >
        <span class="tw:text-xl tw:font-bold tw:text-on-main tw:leading-none">{{ rpnScore }}</span>
      </div>
    </div>
    <span v-else class="tw:text-sm tw:text-secondary">—</span>
  </div>
</template>
