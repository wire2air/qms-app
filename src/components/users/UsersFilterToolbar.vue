<script setup>
import { IconSearch } from '@tabler/icons-vue'

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
</script>

<template>
  <div class="tw:bg-main-hover tw:mb-2 tw:rounded-lg">
    <div class="tw:flex tw:flex-wrap tw:items-center tw:p-2 tw:gap-2">
      <!-- Search -->
      <div class="tw:flex-1 tw:min-w-56">
        <BaseTextInput v-model="filters.search" name="search" placeholder="Search users..." clearBtn>
          <template #icon>
            <IconSearch :size="16" />
          </template>
        </BaseTextInput>
      </div>

      <!-- Role filter -->
      <div class="tw:min-w-48">
        <RoleSelectMenu v-model="filters.roleId" nullLabel="All roles" />
      </div>

      <!-- Status chips -->
      <div class="tw:flex tw:items-center tw:gap-1">
        <button
          v-for="opt in STATUS_OPTIONS"
          :key="String(opt.id)"
          class="tw:px-3 tw:py-1.5 tw:rounded-lg tw:text-sm tw:font-medium tw:transition-colors"
          :class="filters.userStatusId === opt.id
            ? 'tw:bg-primary tw:text-white'
            : 'tw:bg-gray-100 tw:text-secondary tw:hover:bg-gray-200'"
          @click="filters.userStatusId = opt.id"
        >
          {{ opt.name }}
        </button>
      </div>
    </div>
  </div>
</template>
