<script setup>
import { IconSearch, IconFileText, IconBuilding, IconCircleDot } from '@tabler/icons-vue'

const filters = defineModel('filters', { type: Object, required: true })

// Option sources for the cascading filter menu.
const documentTypes = useLiveQuery(
  (db) => db.DocumentType.where().orderBy('displayOrder').exec(),
  { models: ['DocumentType'], initial: [] },
)
const sites = useLiveQuery((db) => db.Site.where().exec(), { models: ['Site'], initial: [] })
const statuses = useLiveQuery((db) => db.FormStatus.where().orderBy('displayOrder').exec(), {
  models: ['FormStatus'],
  initial: [],
})

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
    id: 'siteId',
    label: 'Site',
    icon: IconBuilding,
    group: 'siteId',
    searchable: true,
    options: sites.value.map((s) => ({ value: s.id, label: s.name })),
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
  () => arr('documentTypeId').length || arr('siteId').length || arr('statusId').length,
)
const showClear = computed(() => hasChips.value || !!filters.value.search)

function clearAll() {
  filters.value = {
    ...filters.value,
    search: '',
    documentTypeId: [],
    siteId: [],
    statusId: [],
  }
}
</script>

<template>
  <!-- Scoped search stays in the app header (preserved placement) -->
  <SafeTeleport to="#main-header-search">
    <BaseTextInput
      v-model="filters.search"
      name="search"
      placeholder="Search templates by name or code…"
      clearBtn
      class="tw:flex-1 tw:max-w-md"
    >
      <template #icon>
        <IconSearch :size="16" />
      </template>
    </BaseTextInput>
  </SafeTeleport>

  <div class="tw:flex tw:flex-col tw:gap-2.5">
    <!-- Row 1 — filter menu + view switcher -->
    <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
      <BaseFilterMenu v-model="filters" :items="filterItems" />
      <div class="tw:ms-auto tw:flex tw:items-center tw:gap-2">
        <slot name="actions" />
      </div>
    </div>

    <!-- Row 2 — applied filters as removable tokens -->
    <div v-if="hasChips" class="tw:flex tw:flex-wrap tw:items-center tw:gap-1.5">
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
      <SiteBadgeById
        v-for="id in arr('siteId')"
        :key="`si-${id}`"
        :siteId="id"
        clearable
        @clear="removeValue('siteId', id)"
      />
      <FormTemplateStatusBadgeById
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
