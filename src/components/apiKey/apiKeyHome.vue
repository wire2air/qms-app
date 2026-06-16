<script setup>
import { IconKey, IconPlus } from '@tabler/icons-vue'

const showCreateDialog = ref(false)

function openDialog() {
  showCreateDialog.value = true
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3 tw:h-full tw:p-5">
    <PageHeader :icon="IconKey" title="API Keys" />

    <SafeTeleport to="#main-header-actions">
      <BaseButton @click="openDialog">
        <IconPlus class="tw:size-4" />
        Create API Key
      </BaseButton>
    </SafeTeleport>

    <!-- Page Header -->
    <div class="tw:flex tw:items-center tw:justify-between">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">API Keys</div>
        <div class="tw:text-sm tw:text-secondary">
          Manage your personal API keys for programmatic access.
        </div>
      </div>
    </div>

    <ApiKeyList @create="openDialog" />
  </div>

  <ApiKeyCreateDialog v-model="showCreateDialog" />
</template>
