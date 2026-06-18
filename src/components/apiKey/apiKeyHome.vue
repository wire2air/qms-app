<script setup>
import { IconKey, IconPlus } from '@tabler/icons-vue'

const showCreateDialog = ref(false)

function openDialog() {
  showCreateDialog.value = true
}
</script>

<template>
  <BasePage width="standard">
    <PageHeader
      :icon="IconKey"
      title="API Keys"
      subtitle="Manage your personal API keys for programmatic access."
    >
      <template #actions>
        <BaseButton @click="openDialog">
          <IconPlus class="tw:size-4" />
          Create API Key
        </BaseButton>
      </template>
    </PageHeader>

    <ApiKeyList @create="openDialog" />
  </BasePage>

  <ApiKeyCreateDialog v-model="showCreateDialog" />
</template>
