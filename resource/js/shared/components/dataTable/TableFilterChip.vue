<script setup>
/**
 * One filter condition as an editable chip: "<field> <operator> <value>".
 * Clicking opens a popover to change the operator and value; the × removes it.
 */
import { IconX } from '@tabler/icons-vue'
import { operatorsFor, operatorMeta, operatorNeedsValue } from './filterModel.js'

const props = defineProps({
  condition: { type: Object, required: true },
  column: { type: Object, required: true }, // filterable column: { name, label, filterType, filterOptions? }
})
const emit = defineEmits(['update', 'remove'])

const filterType = computed(() => props.column.filterType || 'text')
const operators = computed(() => operatorsFor(filterType.value))
const opMeta = computed(() => operatorMeta(filterType.value, props.condition.operator))
const inputKind = computed(() => opMeta.value?.input ?? 'text')

const options = computed(() =>
  (props.column.filterOptions || []).map((o) =>
    typeof o === 'object'
      ? { value: o.value ?? o.id, label: o.label ?? o.name ?? String(o.value ?? o.id) }
      : { value: o, label: String(o) },
  ),
)

function setOperator(op) {
  const needs = operatorNeedsValue(filterType.value, op)
  emit('update', { ...props.condition, operator: op, value: needs ? props.condition.value : null })
}
function setValue(v) {
  emit('update', { ...props.condition, value: v })
}
function toggleMulti(val) {
  const cur = Array.isArray(props.condition.value) ? props.condition.value : []
  setValue(cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val])
}

const valueLabel = computed(() => {
  const v = props.condition.value
  if (!operatorNeedsValue(filterType.value, props.condition.operator)) return ''
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '…'
  if (inputKind.value === 'boolean') return v ? 'true' : 'false'
  if (inputKind.value === 'select') return options.value.find((o) => o.value === v)?.label ?? String(v)
  if (inputKind.value === 'multiselect') {
    return v
      .map((x) => options.value.find((o) => o.value === x)?.label ?? x)
      .join(', ')
  }
  return String(v)
})
</script>

<template>
  <div
    class="tw:inline-flex tw:items-center tw:overflow-hidden tw:rounded-md tw:border tw:border-divider tw:bg-sidebar tw:text-xs"
  >
    <BasePopover placement="bottom-start">
      <template #button>
        <button
          type="button"
          class="tw:flex tw:items-center tw:gap-1.5 tw:px-2 tw:py-1 tw:transition-colors tw:hover:bg-main-hover"
        >
          <span class="tw:font-semibold tw:text-on-main">{{ column.label }}</span>
          <span class="tw:text-secondary">{{ opMeta?.label }}</span>
          <span v-if="valueLabel" class="tw:font-medium tw:text-primary">{{ valueLabel }}</span>
        </button>
      </template>
      <template #content>
        <div class="tw:flex tw:w-60 tw:flex-col tw:gap-2 tw:p-2">
          <div class="tw:text-micro tw:font-semibold tw:tracking-wide tw:text-secondary tw:uppercase">
            {{ column.label }}
          </div>
          <select
            :value="condition.operator"
            aria-label="Operator"
            class="tw:h-8 tw:rounded-md tw:border tw:border-divider tw:bg-sidebar tw:px-2 tw:text-sm tw:text-on-main focus-visible:tw:outline-none focus-visible:tw:ring-2 focus-visible:tw:ring-primary/30"
            @change="setOperator($event.target.value)"
          >
            <option v-for="op in operators" :key="op.value" :value="op.value">{{ op.label }}</option>
          </select>

          <template v-if="inputKind === 'text' || inputKind === 'number' || inputKind === 'date'">
            <input
              :type="inputKind"
              :value="condition.value ?? ''"
              aria-label="Value"
              placeholder="Value"
              class="tw:h-8 tw:rounded-md tw:border tw:border-divider tw:bg-sidebar tw:px-2 tw:text-sm tw:text-on-main focus-visible:tw:outline-none focus-visible:tw:ring-2 focus-visible:tw:ring-primary/30"
              @input="setValue(inputKind === 'number' ? Number($event.target.value) : $event.target.value)"
            />
          </template>

          <select
            v-else-if="inputKind === 'boolean'"
            :value="String(condition.value)"
            aria-label="Value"
            class="tw:h-8 tw:rounded-md tw:border tw:border-divider tw:bg-sidebar tw:px-2 tw:text-sm tw:text-on-main"
            @change="setValue($event.target.value === 'true')"
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </select>

          <select
            v-else-if="inputKind === 'select'"
            :value="condition.value ?? ''"
            aria-label="Value"
            class="tw:h-8 tw:rounded-md tw:border tw:border-divider tw:bg-sidebar tw:px-2 tw:text-sm tw:text-on-main"
            @change="setValue($event.target.value)"
          >
            <option value="" disabled>Select…</option>
            <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>

          <div v-else-if="inputKind === 'multiselect'" class="tw:flex tw:max-h-40 tw:flex-col tw:gap-1 tw:overflow-auto">
            <label
              v-for="o in options"
              :key="o.value"
              class="tw:flex tw:items-center tw:gap-2 tw:rounded tw:px-1 tw:py-1 tw:text-sm tw:text-on-main tw:hover:bg-main-hover"
            >
              <input
                type="checkbox"
                class="tw:size-3.5 tw:accent-primary"
                :checked="Array.isArray(condition.value) && condition.value.includes(o.value)"
                @change="toggleMulti(o.value)"
              />
              {{ o.label }}
            </label>
          </div>
        </div>
      </template>
    </BasePopover>

    <button
      type="button"
      :aria-label="`Remove ${column.label} filter`"
      class="tw:flex tw:h-full tw:items-center tw:border-l tw:border-divider tw:px-1.5 tw:py-1 tw:text-secondary tw:transition-colors tw:hover:bg-red-50 tw:hover:text-red-600"
      @click="emit('remove')"
    >
      <IconX :size="12" />
    </button>
  </div>
</template>
