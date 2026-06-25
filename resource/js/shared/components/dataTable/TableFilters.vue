<script setup>
/**
 * Linear-style filter bar: a row of condition chips joined by a clickable AND/OR
 * connector, an "Add filter" field picker (searchable), and a clear-all. Emits a
 * FilterGroup via v-model; DataTable applies it (see tableFilters.js).
 */
import { IconPlus, IconX } from '@tabler/icons-vue'
import { newCondition, emptyGroup } from './filterModel.js'

const props = defineProps({
  // Filterable columns: { name, label, filterType, filterOptions? }
  columns: { type: Array, default: () => [] },
})
const group = defineModel({ type: Object, default: () => emptyGroup() })

const colByName = computed(() => Object.fromEntries(props.columns.map((c) => [c.name, c])))
const conditions = computed(() => group.value?.conditions ?? [])
const combinator = computed(() => group.value?.combinator ?? 'and')

const search = ref('')
const filteredColumns = computed(() => {
  const q = search.value.trim().toLowerCase()
  return props.columns.filter((c) => !q || c.label.toLowerCase().includes(q))
})

function addFilter(column, close) {
  const cond = newCondition(column.name, column.filterType || 'text')
  group.value = { combinator: combinator.value, conditions: [...conditions.value, cond] }
  search.value = ''
  close?.()
}
function updateCondition(id, next) {
  group.value = { ...group.value, conditions: conditions.value.map((c) => (c.id === id ? next : c)) }
}
function removeCondition(id) {
  group.value = { ...group.value, conditions: conditions.value.filter((c) => c.id !== id) }
}
function toggleCombinator() {
  group.value = { ...group.value, combinator: combinator.value === 'and' ? 'or' : 'and' }
}
function clearAll() {
  group.value = emptyGroup()
}
</script>

<template>
  <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-1.5">
    <template v-for="(cond, i) in conditions" :key="cond.id">
      <button
        v-if="i > 0"
        type="button"
        :aria-label="`Toggle combinator, currently ${combinator}`"
        class="tw:rounded tw:bg-main-hover tw:px-1.5 tw:py-1 tw:text-micro tw:font-bold tw:tracking-wide tw:text-secondary tw:uppercase tw:transition-colors tw:hover:text-on-main"
        @click="toggleCombinator"
      >
        {{ combinator }}
      </button>
      <TableFilterChip
        v-if="colByName[cond.field]"
        :condition="cond"
        :column="colByName[cond.field]"
        @update="updateCondition(cond.id, $event)"
        @remove="removeCondition(cond.id)"
      />
    </template>

    <BasePopover placement="bottom-start">
      <template #button>
        <button
          type="button"
          class="tw:flex tw:items-center tw:gap-1 tw:rounded-md tw:border tw:border-dashed tw:border-divider tw:px-2 tw:py-1 tw:text-xs tw:font-medium tw:text-secondary tw:transition-colors tw:hover:border-primary tw:hover:text-on-main"
        >
          <IconPlus :size="13" />
          <span v-if="!conditions.length">Filter</span>
        </button>
      </template>
      <template #content="{ close }">
        <div class="tw:w-56 tw:p-1">
          <input
            v-model="search"
            type="text"
            placeholder="Find a field…"
            aria-label="Find a field"
            class="tw:mb-1 tw:h-8 tw:w-full tw:rounded-md tw:border tw:border-divider tw:bg-sidebar tw:px-2 tw:text-sm tw:text-on-main focus-visible:tw:outline-none focus-visible:tw:ring-2 focus-visible:tw:ring-primary/30"
          />
          <button
            v-for="col in filteredColumns"
            :key="col.name"
            type="button"
            class="tw:flex tw:w-full tw:items-center tw:rounded-md tw:px-3 tw:py-2 tw:text-left tw:text-sm tw:text-on-sidebar tw:transition-colors tw:hover:bg-main-hover"
            @click="addFilter(col, close)"
          >
            {{ col.label }}
          </button>
          <p v-if="!filteredColumns.length" class="tw:px-3 tw:py-2 tw:text-sm tw:text-secondary">
            No fields
          </p>
        </div>
      </template>
    </BasePopover>

    <button
      v-if="conditions.length"
      type="button"
      class="tw:flex tw:items-center tw:gap-1 tw:rounded-md tw:px-1.5 tw:py-1 tw:text-xs tw:font-medium tw:text-secondary tw:transition-colors tw:hover:text-on-main"
      @click="clearAll"
    >
      <IconX :size="13" /> Clear
    </button>
  </div>
</template>
