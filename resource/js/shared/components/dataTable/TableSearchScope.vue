<script setup>
/**
 * Search-scope dropdown for the DataTable toolbar. Lets the user narrow the
 * search box to specific columns; the default (empty selection) searches all
 * columns. Pairs with `TableSearch` — DataTable applies the scope when filtering.
 *
 * Decoupled like the rest of dataTable/: no `@/` imports.
 */
import { IconColumns, IconChevronDown, IconCheck } from '@tabler/icons-vue'

const props = defineProps({
  // Searchable columns: [{ name, label }].
  columns: { type: Array, default: () => [] },
})
// Selected column names; empty array ⇒ search across all columns.
const scope = defineModel({ type: Array, default: () => [] })

const label = computed(() => {
  const names = scope.value
  if (!names.length) return 'All fields'
  if (names.length === 1) {
    return props.columns.find((c) => c.name === names[0])?.label || '1 column'
  }
  return `${names.length} columns`
})

function toggle(name) {
  scope.value = scope.value.includes(name)
    ? scope.value.filter((n) => n !== name)
    : [...scope.value, name]
}
function allFields() {
  scope.value = []
}
</script>

<template>
  <BasePopover placement="bottom-end">
    <template #button>
      <button
        type="button"
        title="Search in"
        class="tw:flex tw:items-center tw:gap-1 tw:rounded-md tw:px-2 tw:py-1.5 tw:text-xs tw:font-medium tw:text-secondary tw:transition-colors tw:hover:bg-main-hover tw:hover:text-on-main"
      >
        <IconColumns :size="16" />
        <span class="tw:hidden sm:tw:inline">{{ label }}</span>
        <IconChevronDown :size="13" />
      </button>
    </template>
    <template #content>
      <div class="tw:w-56 tw:p-1">
        <div
          class="tw:px-3 tw:py-1.5 tw:text-caption tw:font-semibold tw:tracking-wider tw:text-secondary tw:uppercase"
        >
          Search in
        </div>
        <button
          type="button"
          role="menuitemcheckbox"
          :aria-checked="!scope.length"
          class="tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-2 tw:rounded-md tw:px-3 tw:py-2 tw:text-sm tw:text-on-sidebar tw:transition-colors tw:hover:bg-main-hover"
          @click="allFields"
        >
          <span>All fields</span>
          <IconCheck v-if="!scope.length" :size="15" class="tw:shrink-0 tw:text-primary" />
        </button>
        <hr class="tw:my-1 tw:border-divider" />
        <button
          v-for="col in columns"
          :key="col.name"
          type="button"
          role="menuitemcheckbox"
          :aria-checked="scope.includes(col.name)"
          class="tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-2 tw:rounded-md tw:px-3 tw:py-2 tw:text-sm tw:text-on-sidebar tw:transition-colors tw:hover:bg-main-hover"
          @click="toggle(col.name)"
        >
          <span class="tw:truncate">{{ col.label }}</span>
          <IconCheck
            v-if="scope.includes(col.name)"
            :size="15"
            class="tw:shrink-0 tw:text-primary"
          />
        </button>
      </div>
    </template>
  </BasePopover>
</template>
