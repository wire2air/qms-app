<script setup>
import { IconRobot, IconPlus } from '@tabler/icons-vue'

const showCreateDialog = ref(false)

function openDialog() {
  showCreateDialog.value = true
}
</script>

<template>
  <BasePage width="standard" density="compact">
    <PageHeader :icon="IconRobot" title="API Tokens" />

    <SafeTeleport to="#main-header-actions">
      <BaseButton @click="openDialog">
        <IconPlus class="tw:size-4" />
        Create Token
      </BaseButton>
    </SafeTeleport>

    <!-- Page Header -->
    <div class="tw:flex tw:items-center tw:justify-between">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">API Tokens</div>
        <div class="tw:text-sm tw:text-secondary tw:max-w-2xl">
          Personal access tokens for connecting external AI clients (Claude Desktop, IDEs) to the
          QMS MCP server. Tokens carry your identity and permissions — keep them secret.
        </div>
      </div>
    </div>

    <AiPatList @create="openDialog" />
  </BasePage>

  <AiPatCreateDialog v-model="showCreateDialog" />
</template>
