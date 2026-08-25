<script setup>
/**
 * Applied-filter token bar for the quality-events register. The filter MENU and
 * the quick views now live in the table toolbar — see QualityEventsTable — so
 * this renders only the removable tokens for what is currently applied, and
 * disappears entirely when nothing is.
 */
const filters = defineModel('filters', { type: Object, required: true })

function arr(key) {
  return Array.isArray(filters.value[key]) ? filters.value[key] : []
}
function removeValue(key, value) {
  filters.value = { ...filters.value, [key]: arr(key).filter((v) => v !== value) }
}
const hasChips = computed(
  () => arr('statusId').length || arr('categoryId').length || arr('severityId').length,
)

function clearAll() {
  filters.value = {
    ...filters.value,
    statusId: [],
    categoryId: [],
    severityId: [],
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
    <QualityEventStatusBadgeById
      v-for="id in arr('statusId')"
      :key="`st-${id}`"
      :statusId="id"
      clearable
      @clear="removeValue('statusId', id)"
    />
    <EventCategoryBadgeById
      v-for="id in arr('categoryId')"
      :key="`ca-${id}`"
      :categoryId="id"
      clearable
      @clear="removeValue('categoryId', id)"
    />
    <EventSeverityBadgeById
      v-for="id in arr('severityId')"
      :key="`sv-${id}`"
      :severityId="id"
      clearable
      @clear="removeValue('severityId', id)"
    />
    <button
      type="button"
      class="tw:ms-1 tw:text-xs tw:font-medium tw:text-primary tw:hover:underline"
      @click="clearAll"
    >
      Clear all
    </button>
  </div>
</template>
