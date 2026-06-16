<script setup>
const filters = defineModel('filters', {
  type: Object,
  required: true,
})

const STATUS_OPTIONS = [
  { id: null, name: 'All' },
  { id: 'ACTIVE', name: 'Active' },
  { id: 'INVITED', name: 'Invited' },
  { id: 'INACTIVE', name: 'Inactive' },
]

const showClear = computed(
  () => !!(filters.value.search || filters.value.userStatusId || filters.value.roleId),
)

function clearAll() {
  filters.value = { ...filters.value, search: '', userStatusId: null, roleId: null }
}
</script>

<template>
  <BaseFilterBar
    v-model:search="filters.search"
    searchPlaceholder="Search users…"
    :showClear="showClear"
    @clear="clearAll"
  >
    <template #filters>
      <RoleSelectMenu v-model="filters.roleId" nullLabel="All roles" />

      <!-- Status chips -->
      <div class="tw:flex tw:items-center tw:gap-1">
        <button
          v-for="opt in STATUS_OPTIONS"
          :key="String(opt.id)"
          class="tw:px-3 tw:py-1.5 tw:rounded-lg tw:text-sm tw:font-medium tw:transition-colors"
          :class="
            filters.userStatusId === opt.id
              ? 'tw:bg-primary tw:text-white'
              : 'tw:bg-gray-100 tw:text-secondary tw:hover:bg-gray-200'
          "
          @click="filters.userStatusId = opt.id"
        >
          {{ opt.name }}
        </button>
      </div>
    </template>
  </BaseFilterBar>
</template>
