<script setup>
import { IconKey } from '@tabler/icons-vue'

const emit = defineEmits(['create'])

const apiKeys = useLiveQuery(async (db) => db.ApiKey.where().exec(), { initial: [] })
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-2">
    <!-- Loading State -->
    <div v-if="apiKeys === undefined" class="tw:flex tw:justify-center tw:py-12">
      <BaseSpinner size="lg" />
    </div>

    <!-- Empty State -->
    <template v-else-if="apiKeys.length === 0">
      <BaseEmptyState
        :icon="IconKey"
        title="No API keys yet"
        description="Create an API key to get started."
      />
      <div class="tw:flex tw:justify-center">
        <BaseButton @click="emit('create')">Create API Key</BaseButton>
      </div>
    </template>

    <!-- Key Cards -->
    <ApiKeyListItem v-for="key in apiKeys" :key="key.id" :apiKey="key" />
  </div>
</template>
