<script setup>
const props = defineProps({
  modelValue: { type: Object, default: null },
  field: { type: Object, required: true },
  readonly: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

// Prefer embedded snapshot; fall back to FK lookup. See RcaField for
// the rationale.
const template = useLiveQueryWithDeps(
  [() => props.field.riskAssessmentTemplate, () => props.field.riskAssessmentTemplateId],
  async (db, [embedded, id]) => {
    if (embedded?.config) return embedded
    if (!id) return null
    return db.RiskAssessmentTemplate.findByPk(id)
  },
)

const likelihood = computed(() => template.value?.config?.likelihood ?? [])
const severity = computed(() => template.value?.config?.severity ?? [])
const riskLevels = computed(() => template.value?.config?.riskLevels ?? [])
const cells = computed(() => template.value?.config?.cells ?? {})
const detectability = computed(() => template.value?.config?.detectability ?? [])
const enableDetectability = computed(() => template.value?.config?.enableDetectability ?? false)
const selectedDetectabilityId = computed(() => props.modelValue?.detectabilityId ?? null)
const selectedDetectability = computed(
  () => detectability.value.find((d) => d.id === selectedDetectabilityId.value) ?? null,
)

function cellKey(likelihoodId, severityId) {
  return `${likelihoodId}:${severityId}`
}

function cellLevel(likelihoodId, severityId) {
  const key = cellKey(likelihoodId, severityId)
  const levelId = cells.value[key]
  return riskLevels.value.find((r) => r.id === levelId) ?? null
}

const selectedLikelihoodId = computed(() => props.modelValue?.likelihoodId ?? null)
const selectedSeverityId = computed(() => props.modelValue?.severityId ?? null)
const selectedRiskLevelId = computed(() => props.modelValue?.riskLevelId ?? null)

const selectedRiskLevel = computed(
  () => riskLevels.value.find((r) => r.id === selectedRiskLevelId.value) ?? null,
)

function computeRpn(likelihoodId, severityId, detectabilityId) {
  const l = likelihood.value.find((x) => x.id === likelihoodId)
  const s = severity.value.find((x) => x.id === severityId)
  const lScore = l?.score ?? l?.order ?? 1
  const sScore = s?.score ?? s?.order ?? 1
  if (enableDetectability.value && detectabilityId) {
    const d = detectability.value.find((x) => x.id === detectabilityId)
    const dScore = d?.score ?? d?.order ?? 1
    return lScore * sScore * dScore
  }
  return lScore * sScore
}

function selectCell(likelihoodId, severityId) {
  if (props.readonly || props.disabled) return
  const key = cellKey(likelihoodId, severityId)
  const levelId = cells.value[key] ?? null
  const rpnScore = computeRpn(likelihoodId, severityId, selectedDetectabilityId.value)
  emit('update:modelValue', {
    ...(props.modelValue ?? {}),
    _templateId: template.value?.id ?? null,
    likelihoodId,
    severityId,
    riskLevelId: levelId,
    rpnScore,
  })
}

function selectDetectability(detectabilityId) {
  if (props.readonly || props.disabled) return
  const rpnScore = computeRpn(selectedLikelihoodId.value, selectedSeverityId.value, detectabilityId)
  emit('update:modelValue', {
    ...(props.modelValue ?? {}),
    detectabilityId,
    rpnScore,
  })
}

function isSelectedCell(likelihoodId, severityId) {
  return selectedLikelihoodId.value === likelihoodId && selectedSeverityId.value === severityId
}

function updateNotes(notes) {
  emit('update:modelValue', { ...(props.modelValue ?? {}), notes })
}

const notes = computed(() => props.modelValue?.notes ?? '')
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <!-- Loading -->
    <div v-if="template === undefined" class="tw:text-sm tw:text-secondary tw:animate-pulse">
      Loading...
    </div>

    <!-- No template -->
    <div
      v-else-if="!template"
      class="tw:text-sm tw:text-secondary tw:border tw:border-divider tw:rounded-lg tw:p-4 tw:text-center"
    >
      No risk assessment template linked to this field. Contact your administrator.
    </div>

    <template v-else>
      <!-- Selected risk level display -->
      <div
        v-if="selectedRiskLevel"
        class="tw:flex tw:items-center tw:gap-3 tw:rounded-lg tw:p-3 tw:border tw:border-divider"
        :style="{ backgroundColor: selectedRiskLevel.bg + '33', borderColor: selectedRiskLevel.bg }"
      >
        <div
          class="tw:text-sm tw:font-bold tw:px-3 tw:py-1 tw:rounded-md tw:shrink-0"
          :style="{ backgroundColor: selectedRiskLevel.bg, color: selectedRiskLevel.text }"
        >
          {{ selectedRiskLevel.label }}
        </div>
        <div class="tw:flex tw:flex-col tw:flex-1 tw:min-w-0">
          <span class="tw:text-xs tw:font-medium tw:text-on-main">
            {{ likelihood.find((l) => l.id === selectedLikelihoodId)?.label ?? '' }}
            ×
            {{ severity.find((s) => s.id === selectedSeverityId)?.label ?? '' }}
            <template v-if="enableDetectability && selectedDetectability">
              × {{ selectedDetectability.label }}
            </template>
          </span>
          <span v-if="!readonly && !disabled" class="tw:text-[11px] tw:text-secondary">
            Click another cell to change selection
          </span>
        </div>
        <div
          v-if="modelValue?.rpnScore"
          class="tw:flex tw:flex-col tw:items-center tw:shrink-0 tw:bg-white/60 tw:rounded-lg tw:px-3 tw:py-1.5"
        >
          <span class="tw:text-[10px] tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary">RPN</span>
          <span class="tw:text-xl tw:font-bold tw:text-on-main tw:leading-none">{{ modelValue.rpnScore }}</span>
        </div>
      </div>
      <div
        v-else-if="!readonly && !disabled"
        class="tw:text-sm tw:text-secondary tw:text-center tw:py-2"
      >
        Click a cell to select your risk level
      </div>

      <!-- Matrix -->
      <div class="tw:overflow-x-auto">
        <table class="tw:border-collapse">
          <thead>
            <tr>
              <th class="tw:w-28 tw:text-[10px] tw:text-secondary tw:font-semibold tw:uppercase tw:text-right tw:pr-2 tw:pb-1">
                Likelihood ↓ / Severity →
              </th>
              <th
                v-for="col in severity"
                :key="col.id"
                class="tw:text-[11px] tw:font-semibold tw:text-on-main tw:text-center tw:pb-1 tw:px-1 tw:min-w-[72px]"
              >
                {{ col.label }}
                <div class="tw:text-[10px] tw:font-normal tw:text-secondary">({{ col.score ?? col.order }})</div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in likelihood" :key="row.id">
              <td class="tw:text-[11px] tw:font-semibold tw:text-on-main tw:text-right tw:pr-2 tw:py-0.5 tw:whitespace-nowrap">
                {{ row.label }}
                <div class="tw:text-[10px] tw:font-normal tw:text-secondary">({{ row.score ?? row.order }})</div>
              </td>
              <td
                v-for="col in severity"
                :key="col.id"
                class="tw:p-0.5"
              >
                <div
                  class="tw:w-[72px] tw:h-10 tw:flex tw:items-center tw:justify-center tw:text-xs tw:font-semibold tw:rounded tw:transition-all tw:select-none"
                  :class="[
                    readonly || disabled ? 'tw:cursor-default' : 'tw:cursor-pointer tw:hover:opacity-80',
                    isSelectedCell(row.id, col.id)
                      ? 'tw:ring-2 tw:ring-offset-1 tw:ring-primary tw:shadow-md tw:scale-105'
                      : '',
                  ]"
                  :style="cellLevel(row.id, col.id)
                    ? { backgroundColor: cellLevel(row.id, col.id).bg, color: cellLevel(row.id, col.id).text }
                    : { backgroundColor: '#f3f4f6', color: '#9ca3af' }"
                  @click="selectCell(row.id, col.id)"
                >
                  {{ cellLevel(row.id, col.id)?.label ?? '—' }}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Detectability selector (FMEA 3-factor) -->
      <div v-if="enableDetectability" class="tw:flex tw:flex-col tw:gap-2">
        <div class="tw:flex tw:items-center tw:gap-2">
          <label class="tw:text-xs tw:font-medium tw:text-secondary">Detectability</label>
          <span class="tw:text-[10px] tw:text-secondary tw:bg-divider tw:rounded tw:px-1.5 tw:py-0.5">FMEA</span>
        </div>
        <p class="tw:text-[11px] tw:text-secondary tw:-mt-1">How easily can this failure be detected? Lower score = easier to detect.</p>
        <div class="tw:flex tw:flex-wrap tw:gap-1.5">
          <button
            v-for="item in detectability"
            :key="item.id"
            class="tw:flex tw:items-center tw:gap-1.5 tw:rounded-lg tw:border tw:px-3 tw:py-1.5 tw:text-xs tw:font-medium tw:transition-colors tw:cursor-pointer"
            :class="selectedDetectabilityId === item.id
              ? 'tw:border-primary tw:bg-primary/10 tw:text-primary'
              : 'tw:border-divider tw:text-secondary tw:hover:border-primary/50'"
            :disabled="readonly || disabled"
            @click="selectDetectability(item.id)"
          >
            {{ item.label }}
            <span class="tw:text-[10px] tw:opacity-60">({{ item.score ?? item.order }})</span>
          </button>
        </div>
      </div>

      <!-- Notes -->
      <div class="tw:flex tw:flex-col tw:gap-1">
        <label class="tw:text-xs tw:font-medium tw:text-secondary">Notes (optional)</label>
        <BaseTextarea
          :modelValue="notes"
          placeholder="Explain the rationale for this risk assessment..."
          :rows="2"
          :readonly="readonly || disabled"
          @update:modelValue="updateNotes"
        />
      </div>
    </template>
  </div>
</template>
