<script setup>
import { IconRobot, IconPlus } from '@tabler/icons-vue'

const showCreateDialog = ref(false)

function openDialog() {
  showCreateDialog.value = true
}
</script>

<template>
  <BasePage width="standard">
    <PageHeader
      :icon="IconRobot"
      title="API Tokens"
      subtitle="Personal access tokens for connecting external AI clients (Claude Desktop, IDEs) to the QMS MCP server. Tokens carry your identity and permissions — keep them secret."
    >
      <template #actions>
        <BaseButton @click="openDialog">
          <IconPlus class="tw:size-4" />
          Create Token
        </BaseButton>
      </template>
    </PageHeader>

    <AiPatList @create="openDialog" />
  </BasePage>

  <AiPatCreateDialog v-model="showCreateDialog" />
</template>
