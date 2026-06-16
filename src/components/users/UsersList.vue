<script setup>
import { IconUsers } from '@tabler/icons-vue'

defineProps({
  users: {
    type: Array,
    default: () => [],
  },
  loading: {
    type: Boolean,
    default: false,
  },
})
</script>

<template>
  <div v-if="loading" class="tw:flex tw:justify-center tw:p-4">
    <BaseSpinner size="md" />
  </div>

  <BaseEmptyState v-else-if="users.length === 0" :icon="IconUsers" title="No users found" />

  <div v-else class="tw:flex tw:flex-col tw:gap-2">
    <UsersListItem v-for="user in users" :key="user.id" :user="user" />
  </div>
</template>
