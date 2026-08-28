<script setup>
import { IconCheck } from '@tabler/icons-vue'

const props = defineProps({
  rows: {
    type: Array,
    default: () => [],
  },
  columns: {
    type: Array,
    default: () => [],
  },
  options: {
    type: Array,
    default: () => [],
  },
  optionLabel: {
    type: [Function, String],
    default: 'label',
  },
  optionValue: {
    type: [Function, String],
    default: 'value',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  readonly: {
    type: Boolean,
    default: false,
  },
  error: {
    type: Boolean,
    default: false,
  },
  errorMessage: {
    type: String,
    default: undefined,
  },
  name: {
    type: String,
    default: undefined,
  },
  label: {
    type: String,
    default: '',
  },
  hint: {
    type: String,
    default: '',
  },
  dense: {
    type: Boolean,
    default: false,
  },
  tableClass: {
    type: String,
    default: '',
  },
  headerClass: {
    type: String,
    default: '',
  },
  rowLabelClass: {
    type: String,
    default: '',
  },
  cellClass: {
    type: String,
    default: '',
  },
  // Applied to each body <tr> — used for striped-row styling.
  rowClass: {
    type: String,
    default: '',
  },
})

const modelValue = defineModel({ type: Array, default: () => [] })

const isInteractive = computed(() => !props.disabled && !props.readonly)

const tableRows = computed(() =>
  (props.rows || []).map((row) => (typeof row === 'string' ? { label: row, value: row } : row)),
)

// The uniform-vs-nested value-shape state machine lives in a unit-tested
// composable (audit §7) — this component is just the table chrome over it.
const { getRowValue, getCellValue, getValue, isCellSelected, handleValueChange } = useChecklistModel(
  modelValue,
  () => props.columns,
  { interactive: () => isInteractive.value },
)

// optionGroup column: ONE column, options rendered inline as a mutually-
// exclusive radio set (groupType 'radio', the default) or a multi-select
// checkbox set (groupType 'checkbox' → the cell stores an array). `inline`
// (default true) lays options horizontally; false stacks them vertically.
// 'radioGroup' is a legacy alias for the radio flavor.
function isOptionGroupCol(col) {
  return col.inputType === 'optionGroup' || col.inputType === 'radioGroup'
}
// Options may be strings ('Yes') or { label, value } objects.
function rgValue(opt) {
  return typeof opt === 'object' && opt !== null ? (opt.value ?? opt.label) : opt
}
function rgLabel(opt) {
  return typeof opt === 'object' && opt !== null ? (opt.label ?? opt.value) : opt
}
function ogIsChecked(rowIndex, col, opt) {
  const current = getValue(rowIndex, col.value, null)
  if (col.groupType === 'checkbox') {
    return Array.isArray(current) && current.includes(rgValue(opt))
  }
  return current === rgValue(opt)
}
function ogToggle(rowIndex, col, opt) {
  const v = rgValue(opt)
  if (col.groupType === 'checkbox') {
    const current = getValue(rowIndex, col.value, null)
    const list = Array.isArray(current) ? [...current] : []
    const i = list.indexOf(v)
    if (i >= 0) list.splice(i, 1)
    else list.push(v)
    handleValueChange(rowIndex, col.value, list)
    return
  }
  handleValueChange(rowIndex, col.value, v)
}

// lookup column: the cell stores an entity id; LookupSelectByEntity picks the
// right select menu and applies the row-scoped cascade (the parent COLUMN's
// value in this same row narrows the options).
function lookupParentCol(col) {
  if (!col.parentColumn) return null
  return (props.columns || []).find((c) => c.value === col.parentColumn) || null
}

defineExpose({ getRowValue, getCellValue, isCellSelected })
</script>

<template>
  <div :class="['tw:flex tw:flex-col tw:gap-1', disabled ? 'tw:opacity-50' : '']">
    <!-- Label -->
    <div v-if="label" class="tw:text-sm tw:font-medium tw:text-secondary">{{ label }}</div>

    <!-- Table -->
    <div class="tw:overflow-x-auto">
      <table
        :class="[
          'tw:w-full tw:border-collapse tw:text-sm',
          error ? 'tw:ring-1 tw:ring-red-500 tw:rounded' : '',
          tableClass,
        ]"
      >
        <thead>
          <tr>
            <th
              :class="[
                'tw:text-left tw:font-medium tw:text-secondary tw:border-b tw:border-divider',
                dense ? 'tw:py-1 tw:px-2' : 'tw:py-2 tw:px-3',
                headerClass,
              ]"
            />
            <th
              v-for="col in columns"
              :key="col.value"
              :class="[
                'tw:text-center tw:font-medium tw:text-secondary tw:border-b tw:border-divider',
                dense ? 'tw:py-1 tw:px-2' : 'tw:py-2 tw:px-3',
                headerClass,
              ]"
            >
              {{ col.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, rowIndex) in tableRows"
            :key="rowIndex"
            :class="['tw:hover:bg-gray-50', rowClass]"
          >
            <!-- Row label -->
            <td
              :class="[
                'tw:text-on-main tw:border-b tw:border-divider',
                dense ? 'tw:py-1 tw:px-2' : 'tw:py-2 tw:px-3',
                rowLabelClass,
              ]"
            >
              {{ row.label }}
            </td>

            <!-- Cells -->
            <td
              v-for="col in columns"
              :key="col.value"
              :class="[
                'tw:text-center tw:border-b tw:border-divider',
                dense ? 'tw:py-1 tw:px-2' : 'tw:py-2 tw:px-3',
                cellClass,
              ]"
            >
              <!-- radio -->
              <template v-if="(col.inputType || 'radio') === 'radio'">
                <label class="tw:inline-flex tw:items-center tw:justify-center tw:cursor-pointer">
                  <input
                    type="radio"
                    class="tw:sr-only"
                    :name="`${name}-row-${rowIndex}`"
                    :value="col.value"
                    :checked="getValue(rowIndex, col.value, null) === col.value"
                    :disabled="disabled || readonly"
                    @change="handleValueChange(rowIndex, col.value, col.value)"
                  />
                  <span
                    :class="[
                      'tw:size-4 tw:rounded-full tw:border-2 tw:flex tw:items-center tw:justify-center tw:transition-colors',
                      getValue(rowIndex, col.value, null) === col.value
                        ? 'tw:border-primary tw:bg-primary'
                        : 'tw:border-gray-300 tw:bg-white',
                      !disabled && !readonly ? 'tw:cursor-pointer' : '',
                    ]"
                  >
                    <span
                      v-if="getValue(rowIndex, col.value, null) === col.value"
                      class="tw:size-1.5 tw:rounded-full tw:bg-white"
                    />
                  </span>
                </label>
              </template>

              <!-- checkbox -->
              <template v-else-if="col.inputType === 'checkbox'">
                <label class="tw:inline-flex tw:items-center tw:justify-center tw:cursor-pointer">
                  <input
                    type="checkbox"
                    class="tw:sr-only"
                    :checked="getValue(rowIndex, col.value, false)"
                    :disabled="disabled || readonly"
                    @change="handleValueChange(rowIndex, col.value, $event.target.checked)"
                  />
                  <span
                    :class="[
                      'tw:size-4 tw:rounded tw:border-2 tw:flex tw:items-center tw:justify-center tw:transition-colors',
                      getValue(rowIndex, col.value, false)
                        ? 'tw:border-primary tw:bg-primary'
                        : 'tw:border-gray-300 tw:bg-white',
                      !disabled && !readonly ? 'tw:cursor-pointer' : '',
                    ]"
                  >
                    <IconCheck
                      v-if="getValue(rowIndex, col.value, false)"
                      :size="12"
                      class="tw:text-white"
                      :stroke-width="3"
                    />
                  </span>
                </label>
              </template>

              <!-- text / number / date / time -->
              <template v-else-if="['text', 'number', 'date', 'time'].includes(col.inputType)">
                <input
                  :type="col.inputType"
                  :class="[
                    'tw:w-full tw:rounded tw:border tw:border-divider tw:px-2 tw:text-sm tw:text-on-main tw:bg-white',
                    'tw:focus:outline-none tw:focus:border-primary tw:transition-colors',
                    dense ? 'tw:py-0.5' : 'tw:py-1',
                    disabled || readonly ? 'tw:bg-gray-50 tw:cursor-not-allowed' : '',
                  ]"
                  :value="getValue(rowIndex, col.value, '')"
                  :placeholder="col.placeholder || ''"
                  :min="col.min"
                  :max="col.max"
                  :step="col.step"
                  :disabled="disabled"
                  :readonly="readonly"
                  @input="handleValueChange(rowIndex, col.value, $event.target.value)"
                />
              </template>

              <!-- option group: ONE column, options inline as mutually-exclusive
                   radios (or a checkbox set with groupType 'checkbox'); the safe
                   alternative to separate radio columns, whose stale keys broke
                   read-back. `inline: false` stacks options vertically. -->
              <template v-else-if="isOptionGroupCol(col)">
                <div
                  :class="
                    col.inline === false
                      ? 'tw:inline-flex tw:flex-col tw:items-start tw:gap-1'
                      : 'tw:inline-flex tw:flex-wrap tw:items-center tw:justify-center tw:gap-x-3 tw:gap-y-1'
                  "
                >
                  <label
                    v-for="opt in col.options || options"
                    :key="rgValue(opt)"
                    class="tw:inline-flex tw:items-center tw:gap-1.5"
                    :class="isInteractive ? 'tw:cursor-pointer' : 'tw:cursor-not-allowed'"
                  >
                    <input
                      :type="col.groupType === 'checkbox' ? 'checkbox' : 'radio'"
                      class="tw:sr-only"
                      :name="`${name}-row-${rowIndex}-${col.value}`"
                      :value="rgValue(opt)"
                      :checked="ogIsChecked(rowIndex, col, opt)"
                      :disabled="disabled || readonly"
                      @change="ogToggle(rowIndex, col, opt)"
                    />
                    <span
                      :class="[
                        'tw:size-4 tw:border-2 tw:flex tw:items-center tw:justify-center tw:transition-colors tw:shrink-0',
                        col.groupType === 'checkbox' ? 'tw:rounded' : 'tw:rounded-full',
                        ogIsChecked(rowIndex, col, opt)
                          ? 'tw:border-primary tw:bg-primary'
                          : 'tw:border-gray-300 tw:bg-white',
                      ]"
                    >
                      <IconCheck
                        v-if="col.groupType === 'checkbox' && ogIsChecked(rowIndex, col, opt)"
                        :size="12"
                        class="tw:text-white"
                        :stroke-width="3"
                      />
                      <span
                        v-else-if="ogIsChecked(rowIndex, col, opt)"
                        class="tw:size-1.5 tw:rounded-full tw:bg-white"
                      />
                    </span>
                    <span class="tw:text-sm tw:text-on-main">{{ rgLabel(opt) }}</span>
                  </label>
                </div>
              </template>

              <!-- lookup (entity) — options narrowed by the parent column's
                   value in THIS row, when the author configured one. -->
              <template v-else-if="col.inputType === 'lookup'">
                <LookupSelectByEntity
                  :entity="col.lookupEntity || 'product'"
                  :modelValue="getValue(rowIndex, col.value, null)"
                  :disabled="disabled || readonly"
                  :parentEntity="lookupParentCol(col)?.lookupEntity || null"
                  :parentValue="
                    col.parentColumn ? getValue(rowIndex, col.parentColumn, null) : null
                  "
                  @update:modelValue="handleValueChange(rowIndex, col.value, $event)"
                />
              </template>

              <!-- select / dropdown -->
              <template v-else-if="['select', 'dropdown'].includes(col.inputType)">
                <OptionSetSelect
                  :modelValue="getValue(rowIndex, col.value, null)"
                  :options="col.options || options"
                  :optionLabel="col.optionLabel || optionLabel"
                  :optionValue="col.optionValue || optionValue"
                  :optionSetId="col.optionSetId"
                  :disabled="disabled"
                  :readonly="readonly"
                  :placeholder="col.placeholder || 'Select'"
                  @update:modelValue="handleValueChange(rowIndex, col.value, $event)"
                />
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Error message -->
    <div v-if="error && errorMessage" class="tw:text-xs tw:text-red-500 tw:mt-0.5">
      {{ errorMessage }}
    </div>

    <!-- Hint -->
    <div v-if="hint" class="tw:text-xs tw:text-secondary tw:mt-0.5">
      {{ hint }}
    </div>
  </div>
</template>
