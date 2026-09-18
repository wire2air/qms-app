<script setup>
/**
 * BaseFilterBar — standard filter toolbar for list/table pages.
 *
 * A search box + a #filters slot for entity dropdowns + an optional "Clear"
 * affordance. Pairs with useTableFilters. Replaces the bespoke *FilterToolbar
 * components that each re-implemented the same layout.
 *
 *   <BaseFilterBar v-model:search="filters.search" :showClear="hasActiveFilters" @clear="reset">
 *     <template #filters>
 *       <SiteSelectMenu v-model="filters.siteId" />
 *       <StatusSelectMenu v-model="filters.statusId" />
 *     </template>
 *   </BaseFilterBar>
 */
import { IconSearch, IconX } from '@tabler/icons-vue'

defineProps({
  searchPlaceholder: { type: String, default: 'Search…' },
  // show the "Clear" button (wire to hasActiveFilters from useTableFilters)
  showClear: { type: Boolean, default: false },
  // hide the search box entirely (filters-only bars)
  hideSearch: { type: Boolean, default: false },
})

defineEmits(['clear'])

const search = defineModel('search', { type: String, default: '' })
</script>

<template>
  <div
    class="tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-divider tw:bg-card tw:p-2"
  >
    <div v-if="!hideSearch" class="tw:min-w-50 tw:flex-1">
      <BaseTextInput v-model="search" name="filter-search" :placeholder="searchPlaceholder" clearBtn size="sm">
        <template #icon>
          <IconSearch :size="16" />
        </template>
      </BaseTextInput>
    </div>

    <slot name="filters" />

    <div class="tw:ml-auto tw:flex tw:items-center tw:gap-2">
      <slot name="actions" />
      <button
        v-if="showClear"
        class="tw:flex tw:items-center tw:gap-1 tw:rounded-md tw:px-2 tw:py-1.5 tw:text-xs tw:font-medium tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-main tw:transition-colors"
        @click="$emit('clear')"
      >
        <IconX :size="14" />
        Clear
      </button>
    </div>
  </div>
</template>
