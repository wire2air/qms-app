<script setup>
import { IconShield } from '@tabler/icons-vue'
defineProps({
  roles: {
    type: Array,
    required: true,
  },
  loading: {
    type: Boolean,
    default: false,
  },
})
</script>

<template>
  <div class="tw:flex-1 tw:overflow-y-auto tw:space-y-2">
    <div v-if="loading" class="tw:flex tw:flex-col tw:gap-3">
      <div
        v-for="i in 4"
        :key="i"
        class="tw:rounded-lg tw:border tw:border-divider tw:bg-card tw:p-4"
      >
        <div class="tw:flex tw:items-center tw:gap-3">
          <BaseSkeleton variant="rect" width="40px" height="40px" />
          <div class="tw:flex tw:flex-1 tw:flex-col tw:gap-2">
            <BaseSkeleton variant="text" width="30%" />
            <BaseSkeleton variant="text" width="50%" />
          </div>
        </div>
      </div>
    </div>

    <BaseEmptyState
      v-else-if="roles.length === 0"
      :icon="IconShield"
      title="No roles found"
      description="Create your first role to get started."
    />

    <!-- Role Cards -->
    <RolesListingRow v-for="role in roles" :key="role.id" :role="role" />
  </div>
</template>
