<script setup>
import { IconKey, IconPlus } from '@tabler/icons-vue'

const showCreateDialog = ref(false)

// Headless list-page core. This page has no toolbar/filters of its own — it
// just drives the shell's resolved content state (loading / empty / ready)
// off the live query below.
const list = useListLayout({
  filters: {},
  total: () => apiKeys.value?.length ?? 0,
  loading: () => apiKeys.value === undefined,
  empty: () => apiKeys.value?.length === 0,
})

const apiKeys = useLiveQuery(async (db) => db.ApiKey.where().exec(), {
  models: ['ApiKey'],
})

function openDialog() {
  showCreateDialog.value = true
}
</script>

<template>
  <BaseListLayout
    title="API Keys"
    :icon="IconKey"
    subtitle="Manage your personal API keys for programmatic access."
    :state="list.state.value"
    :emptyIcon="IconKey"
    emptyTitle="No API keys yet"
    emptyDescription="Create an API key to get started."
  >
    <template #actions>
      <BaseButton @click="openDialog">
        <IconPlus class="tw:size-4" />
        Create API Key
      </BaseButton>
    </template>

    <template #empty-action>
      <BaseButton @click="openDialog">Create API Key</BaseButton>
    </template>

    <div class="tw:flex tw:flex-col tw:gap-2">
      <ApiKeyListItem v-for="key in apiKeys || []" :key="key.id" :apiKey="key" />
    </div>

    <ApiKeyCreateDialog v-model="showCreateDialog" />
  </BaseListLayout>
</template>
