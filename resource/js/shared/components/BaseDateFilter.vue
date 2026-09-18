<script setup>
/**
 * BaseDateFilter — operator-driven date filter editor for the advanced-filter
 * framework. v-model is a token { operator, value, value2, relative }. Relative
 * tokens stay dynamic (resolved at filter run time by resolveDateFilter), so a
 * saved filter like "Last 7 days" re-evaluates every run. Composes BaseDateField.
 */
import { OPERATORS } from '@/utils/dateRanges.js'

const model = defineModel({ type: Object, default: null })

const DEFAULT = { operator: 'relative', value: null, value2: null, relative: { dir: 'past', unit: 'day', count: 7 } }
const token = computed(() => ({
  ...DEFAULT,
  ...(model.value || {}),
  relative: { ...DEFAULT.relative, ...(model.value?.relative || {}) },
}))

const UNITS = [
  { id: 'day', label: 'days' },
  { id: 'week', label: 'weeks' },
  { id: 'month', label: 'months' },
  { id: 'quarter', label: 'quarters' },
  { id: 'year', label: 'years' },
]
const DIRS = [
  { id: 'past', label: 'Last' },
  { id: 'next', label: 'Next' },
  { id: 'this', label: 'This' },
]

const needsOne = computed(() =>
  ['eq', 'neq', 'before', 'after', 'onBefore', 'onAfter'].includes(token.value.operator),
)
const needsTwo = computed(() => ['between', 'notBetween'].includes(token.value.operator))
const isRelative = computed(() => token.value.operator === 'relative')

function patch(next) {
  model.value = { ...token.value, ...next }
}
function setOperator(op) {
  patch({ operator: op })
}
function patchRelative(next) {
  patch({ relative: { ...token.value.relative, ...next } })
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-2 tw:p-2 tw:min-w-64">
    <select
      data-op
      :value="token.operator"
      class="tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
      @change="(e) => setOperator(e.target.value)"
    >
      <option v-for="op in OPERATORS" :key="op.id" :value="op.id">{{ op.label }}</option>
    </select>

    <template v-if="isRelative">
      <div class="tw:flex tw:items-center tw:gap-1">
        <select
          data-rel-dir
          :value="token.relative.dir"
          class="tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
          @change="(e) => patchRelative({ dir: e.target.value })"
        >
          <option v-for="d in DIRS" :key="d.id" :value="d.id">{{ d.label }}</option>
        </select>
        <input
          v-if="token.relative.dir !== 'this'"
          data-rel-count
          type="number"
          min="1"
          :value="token.relative.count"
          class="tw:w-16 tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
          @input="(e) => patchRelative({ count: Number(e.target.value) })"
        />
        <select
          data-rel-unit
          :value="token.relative.unit"
          class="tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
          @change="(e) => patchRelative({ unit: e.target.value })"
        >
          <option v-for="u in UNITS" :key="u.id" :value="u.id">{{ u.label }}</option>
        </select>
      </div>
    </template>

    <template v-else-if="needsOne">
      <div data-value-field>
        <BaseDateField
          :modelValue="token.value"
          valueFormat="iso"
          clearable
          placeholder="Pick a date"
          @update:modelValue="(v) => patch({ value: v })"
        />
      </div>
    </template>

    <template v-else-if="needsTwo">
      <div data-value-field>
        <BaseDateField
          :modelValue="token.value"
          valueFormat="iso"
          clearable
          placeholder="From"
          @update:modelValue="(v) => patch({ value: v })"
        />
      </div>
      <div data-value-field>
        <BaseDateField
          :modelValue="token.value2"
          valueFormat="iso"
          clearable
          placeholder="To"
          @update:modelValue="(v) => patch({ value2: v })"
        />
      </div>
    </template>
  </div>
</template>
