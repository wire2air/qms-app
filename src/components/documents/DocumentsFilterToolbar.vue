<script setup>
const filters = defineModel('filters', {
  type: Object,
  required: true,
})

const showClear = computed(
  () =>
    !!(
      filters.value.search ||
      filters.value.documentTypeId ||
      filters.value.departmentId ||
      filters.value.statusId
    ),
)

function clearAll() {
  filters.value = {
    ...filters.value,
    search: '',
    documentTypeId: null,
    departmentId: null,
    statusId: null,
  }
}
</script>

<template>
  <BaseFilterBar
    v-model:search="filters.search"
    searchPlaceholder="Search documents…"
    :showClear="showClear"
    @clear="clearAll"
  >
    <template #filters>
      <DocumentTypeSelectMenu v-model="filters.documentTypeId" :multiple="false" :required="false" />
      <DepartmentSelectMenu v-model="filters.departmentId" />
      <DocumentVersionStatusSelectMenu
        v-model="filters.statusId"
        label="Status"
        bgColor="white"
        hideBottomSpace
      />
    </template>
  </BaseFilterBar>
</template>
