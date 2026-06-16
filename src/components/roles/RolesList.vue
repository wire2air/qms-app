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
  <div class="tw:flex-1 tw:overflow-y-auto tw:space-y-4">
    <div v-if="loading" class="tw:flex tw:items-center tw:justify-center tw:py-12">
      <BaseSpinner size="lg" />
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
