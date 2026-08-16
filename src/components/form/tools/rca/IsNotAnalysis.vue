<script setup>
const props = defineProps({
  config: { type: Object, required: true },
  modelValue: { type: Object, default: () => ({}) },
  readonly: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

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
