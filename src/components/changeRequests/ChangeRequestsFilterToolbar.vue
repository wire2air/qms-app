<script setup>
/**
 * Applied-filter token bar for the change-control register. The filter MENU and
 * the quick views now live in the table toolbar — see ChangeRequestsTable — so
 * this renders only the removable tokens for what is currently applied, and
 * disappears entirely when nothing is.
 */
import { IconX } from '@tabler/icons-vue'

const filters = defineModel('filters', { type: Object, required: true })

function arr(key) {
  return Array.isArray(filters.value[key]) ? filters.value[key] : []
}
function removeValue(key, value) {
  filters.value = { ...filters.value, [key]: arr(key).filter((v) => v !== value) }
}
const hasChips = computed(
  () =>
    arr('statusId').length ||
    arr('priorityId').length ||
    arr('changeTypeId').length ||
    filters.value.createdAt,
)

function clearAll() {
  filters.value = {
    ...filters.value,
    statusId: [],
    priorityId: [],
    changeTypeId: [],
    createdAt: null,
  }
}
</script>

<template>
  <!-- Sticky token bar: pins below the app bar while the list scrolls. -->
  <div
    v-if="hasChips"
    class="tw:sticky tw:top-0 tw:z-sticky tw:flex tw:flex-wrap tw:items-center tw:gap-1.5 tw:bg-main tw:pt-1 tw:pb-2.5"
  >
    <span class="tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wider tw:text-secondary">
      Filters
    </span>
    <ChangeRequestStatusBadgeById
      v-for="id in arr('statusId')"
      :key="`st-${id}`"
      :statusId="id"
      clearable
      @clear="removeValue('statusId', id)"
    />
    <ChangeRequestPriorityBadgeById
      v-for="id in arr('priorityId')"
      :key="`pr-${id}`"
      :priorityId="id"
      clearable
      @clear="removeValue('priorityId', id)"
    />
    <ChangeTypeBadgeById
      v-for="id in arr('changeTypeId')"
      :key="`ty-${id}`"
      :changeTypeId="id"
      clearable
      @clear="removeValue('changeTypeId', id)"
    />
    <span
      v-if="filters.createdAt"
      class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded-md tw:border tw:border-divider tw:bg-card tw:py-0.5 tw:ps-2 tw:pe-1 tw:text-xs tw:text-secondary"
    >
      Created date
      <button
        type="button"
        aria-label="Clear date filter"
        class="tw:rounded tw:p-0.5 tw:hover:bg-main-hover"
        @click="filters.createdAt = null"
      >
        <IconX class="tw:size-3" />
      </button>
    </span>
    <button
      type="button"
      class="tw:ms-1 tw:text-xs tw:font-medium tw:text-primary tw:hover:underline"
      @click="clearAll"
    >
      Clear all
    </button>
  </div>
</template>
