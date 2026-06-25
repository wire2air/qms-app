<script setup>
import { IconCategory, IconTag, IconCircleDot } from '@tabler/icons-vue'

const filters = defineModel('filters', { type: Object, required: true })

// Option sources for the cascading filter menu.
const families = useLiveQuery((db) => db.ProductFamily.where().orderBy('displayOrder').exec(), {
  models: ['ProductFamily'],
  initial: [],
})
const types = useLiveQuery((db) => db.ProductType.where().orderBy('displayOrder').exec(), {
  models: ['ProductType'],
  initial: [],
})
const statuses = useLiveQuery((db) => db.ProductStatus.where().orderBy('displayOrder').exec(), {
  models: ['ProductStatus'],
  initial: [],
})

const filterItems = computed(() => [
  {
    id: 'productFamilyId',
    label: 'Family',
    icon: IconCategory,
    group: 'productFamilyId',
    searchable: true,
    options: families.value.map((f) => ({ value: f.id, label: f.name })),
  },
  {
    id: 'productTypeId',
    label: 'Type',
    icon: IconTag,
    group: 'productTypeId',
    options: types.value.map((t) => ({ value: t.id, label: t.name })),
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
  () => arr('productFamilyId').length || arr('productTypeId').length || arr('statusId').length,
)
const showClear = computed(() => hasChips.value)

function clearAll() {
  filters.value = {
    ...filters.value,
    productFamilyId: [],
    productTypeId: [],
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
      <span class="tw:text-micro tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary">
        Filters
      </span>
      <ProductFamilyBadgeById
        v-for="id in arr('productFamilyId')"
        :key="`fa-${id}`"
        :productFamilyId="id"
        clearable
        @clear="removeValue('productFamilyId', id)"
      />
      <ProductTypeBadgeById
        v-for="id in arr('productTypeId')"
        :key="`ty-${id}`"
        :productTypeId="id"
        clearable
        @clear="removeValue('productTypeId', id)"
      />
      <ProductStatusBadgeById
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
