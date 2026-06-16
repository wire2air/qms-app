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
  <div v-if="loading" class="tw:flex tw:flex-col tw:gap-2">
    <div
      v-for="i in 6"
      :key="i"
      class="tw:flex tw:items-center tw:gap-3 tw:rounded-lg tw:border tw:border-divider tw:bg-card tw:p-3"
    >
      <BaseSkeleton variant="circle" width="36px" height="36px" />
      <div class="tw:flex tw:flex-1 tw:flex-col tw:gap-2">
        <BaseSkeleton variant="text" width="40%" />
        <BaseSkeleton variant="text" width="25%" />
      </div>
    </div>
  </div>

  <BaseEmptyState v-else-if="users.length === 0" :icon="IconUsers" title="No users found" />

  <div v-else class="tw:flex tw:flex-col tw:gap-2">
    <UsersListItem v-for="user in users" :key="user.id" :user="user" />
  </div>
</template>
