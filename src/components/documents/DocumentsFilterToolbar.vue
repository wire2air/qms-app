<script setup>
/**
 * Applied-filter token bar for the document register. The filter MENU itself
 * (and the quick views) now live in the table toolbar — see DocumentsTable —
 * so this renders only the removable tokens for what is currently applied, and
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
  () => arr('documentTypeId').length || arr('departmentId').length || arr('statusId').length,
)

function clearAll() {
  filters.value = {
    ...filters.value,
    documentTypeId: [],
    departmentId: [],
    statusId: [],
  }
}
</script>

<template>
  <!-- Sticky workspace toolbar: pins below the app bar while the list scrolls. -->
  <div
    v-if="hasChips"
    class="tw:sticky tw:top-0 tw:z-sticky tw:flex tw:flex-wrap tw:items-center tw:gap-1.5 tw:bg-main tw:pt-1 tw:pb-2.5"
  >
    <span class="tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wider tw:text-secondary">
      Filters
    </span>
    <DocumentTypeBadgeById
      v-for="id in arr('documentTypeId')"
      :key="`ty-${id}`"
      :documentTypeId="id"
      clearable
      @clear="removeValue('documentTypeId', id)"
    />
    <DepartmentBadgeById
      v-for="id in arr('departmentId')"
      :key="`dp-${id}`"
      :departmentId="id"
      clearable
      @clear="removeValue('departmentId', id)"
    />
    <DocumentVersionStatusBadgeById
      v-for="id in arr('statusId')"
      :key="`st-${id}`"
      :statusId="id"
      clearable
      @clear="removeValue('statusId', id)"
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
