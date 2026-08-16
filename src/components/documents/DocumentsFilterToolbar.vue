<script setup>
import { IconFileText, IconBuilding, IconCircleDot } from '@tabler/icons-vue'

const filters = defineModel('filters', { type: Object, required: true })

// Option sources for the cascading filter menu.
const documentTypes = useLiveQuery((db) => db.DocumentType.where().orderBy('displayOrder').exec(), {
  models: ['DocumentType'],
  initial: [],
})
const departments = useLiveQuery((db) => db.Department.where().exec(), {
  models: ['Department'],
  initial: [],
})
const statuses = useLiveQuery(
  (db) => db.DocumentVersionStatus.where().orderBy('displayOrder').exec(),
  { models: ['DocumentVersionStatus'], initial: [] },
)

const filterItems = computed(() => [
  {
    id: 'documentTypeId',
    label: 'Type',
    icon: IconFileText,
    group: 'documentTypeId',
    searchable: true,
    options: documentTypes.value.map((t) => ({ value: t.id, label: t.name })),
  },
  {
    id: 'departmentId',
    label: 'Department',
    icon: IconBuilding,
    group: 'departmentId',
    searchable: true,
    options: departments.value.map((d) => ({ value: d.id, label: d.name })),
  },
  {
    id: 'statusId',
    label: 'Status',
    icon: IconCircleDot,
    group: 'statusId',
    options: statuses.value.map((s) => ({ value: s.id, label: s.name })),
  },
])

function arr(key) {
  return Array.isArray(filters.value[key]) ? filters.value[key] : []
}
function removeValue(key, value) {
  filters.value = { ...filters.value, [key]: arr(key).filter((v) => v !== value) }
}
const hasChips = computed(
  () => arr('documentTypeId').length || arr('departmentId').length || arr('statusId').length,
)
const showClear = computed(() => hasChips.value)

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
    class="tw:sticky tw:top-0 tw:z-sticky tw:flex tw:flex-col tw:gap-2.5 tw:bg-main tw:pt-1 tw:pb-2.5"
  >
    <!-- Row 1 — filter menu (search lives in the table toolbar) -->
    <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
      <div class="tw:ms-auto tw:flex tw:flex-wrap tw:items-center tw:gap-2">
        <BaseFilterMenu v-model="filters" :items="filterItems" />
      </div>
    </div>

    <!-- Row 2 — applied filters as removable tokens -->
    <div v-if="hasChips" class="tw:flex tw:flex-wrap tw:items-center tw:gap-1.5">
      <span
        class="tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wider tw:text-secondary"
      >
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
        v-if="showClear"
        type="button"
        class="tw:ms-1 tw:text-xs tw:font-medium tw:text-primary tw:hover:underline"
        @click="clearAll"
      >
        Clear all
      </button>
    </div>
  </div>
</template>
