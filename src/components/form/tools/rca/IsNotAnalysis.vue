<script setup>
const props = defineProps({
  config: { type: Object, required: true },
  modelValue: { type: Object, default: () => ({}) },
  readonly: { type: Boolean, default: false },
  /**
   * The problem, carried in from the parent record — the NC's description via
   * the field's `problemField`. Every other method shows it; this one did not,
   * so an Is/Is-Not analysis opened with no statement of what is being analysed
   * and the reader had to go back to the record to find out (2026-08-20).
   */
  problem: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])

// The inherited value wins; the local one is the fallback for an analysis that
// is not attached to a record. Mirrors FishboneAnalysis.
const problemText = computed(() => props.problem || props.modelValue?.problem || '')

function onProblemInput(val) {
  if (props.readonly || props.problem) return
  emit('update:modelValue', { ...props.modelValue, problem: val })
}

function updateCell(idx, key, val) {
  const dimensions = (props.modelValue.dimensions ?? []).map((d, i) =>
    i === idx ? { ...d, [key]: val } : d,
  )
  emit('update:modelValue', { ...props.modelValue, dimensions })
}

function updateProbableCauses(val) {
  emit('update:modelValue', { ...props.modelValue, probableCauses: val })
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <!-- Problem statement — what the comparison below is distinguishing. -->
    <div class="tw:flex tw:flex-col tw:gap-1">
      <label
        class="tw:text-caption tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider"
      >
        {{ config.problemPrompt || 'Problem Statement' }}
      </label>
      <BaseTextarea
        :modelValue="problemText"
        placeholder="Describe the problem..."
        :rows="2"
        :readonly="readonly || !!problem"
        @update:modelValue="onProblemInput"
      />
      <BaseCaption v-if="problem">Carried from the record.</BaseCaption>
    </div>

    <!-- Comparison table -->
    <div class="tw:overflow-x-auto">
      <table class="tw:w-full tw:text-sm">
        <thead>
          <tr>
            <th
              class="tw:text-left tw:text-table-header tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-2 tw:w-28"
            >
              Dimension
            </th>
            <th
              class="tw:text-left tw:text-table-header tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-2 tw:px-2 tw:text-green-700"
            >
              IS
            </th>
            <th
              class="tw:text-left tw:text-table-header tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-2 tw:px-2 tw:text-red-600"
            >
              IS NOT
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(dim, idx) in modelValue.dimensions ?? []"
            :key="idx"
            class="tw:border-t tw:border-divider"
          >
            <td class="tw:py-2 tw:pr-2">
              <span class="tw:font-medium tw:text-on-main tw:text-sm">{{ dim.label }}</span>
            </td>
            <td class="tw:py-2 tw:px-2">
              <BaseTextInput
                :modelValue="dim.is ?? ''"
                placeholder="What IS true..."
                size="sm"
                :readonly="readonly"
                @update:modelValue="(v) => updateCell(idx, 'is', v)"
              />
            </td>
            <td class="tw:py-2 tw:px-2">
              <BaseTextInput
                :modelValue="dim.isNot ?? ''"
                placeholder="What IS NOT true..."
                size="sm"
                :readonly="readonly"
                @update:modelValue="(v) => updateCell(idx, 'isNot', v)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Probable causes -->
    <BaseField v-slot="{ id: fieldId }" label="Probable Causes">
      <BaseTextarea
        :id="fieldId"
        :modelValue="modelValue.probableCauses ?? ''"
        placeholder="Based on the IS / IS NOT analysis, what are the probable causes?"
        :rows="3"
        :readonly="readonly"
        @update:modelValue="updateProbableCauses"
      />
    </BaseField>
  </div>
</template>
