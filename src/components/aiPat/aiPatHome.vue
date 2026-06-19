<script setup>
import { IconRobot, IconPlus } from '@tabler/icons-vue'

/**
 * API Tokens (AI PATs) — list page.
 *
 * Built on the Enterprise Page Framework list template: `useListLayout`
 * (resolved content state) + `BaseListLayout` (header / state region).
 * No filters — tokens are listed newest-first. PAT create/return uses
 * action-RPC endpoints (handled inside AiPatCreateDialog), not entity CRUD.
 */
const showCreateDialog = ref(false)

// Resolved content state (no filters). Declared before the live query because
// the getters lazily read `tokens`. No `initial` so `tokens === undefined`
// drives the loading state until the first result lands.
const list = useListLayout({
  total: () => tokens.value?.length ?? 0,
  loading: () => tokens.value === undefined,
  empty: () => tokens.value?.length === 0,
})

const tokens = useLiveQuery(
  async (db) => db.AiPat.where().orderBy('createdAt', 'desc').exec(),

  { models: ['AiPat'] },
)

function openDialog() {
  showCreateDialog.value = true
}
</script>

<template>
  <BaseListLayout
    title="API Tokens"
    :icon="IconRobot"
    subtitle="Personal access tokens for connecting external AI clients (Claude Desktop, IDEs) to the QMS MCP server. Tokens carry your identity and permissions — keep them secret."
    :state="list.state.value"
    :emptyIcon="IconRobot"
    emptyTitle="No API tokens yet"
    emptyDescription="Create a token to connect an external AI client (Claude Desktop, IDE) to QMS."
  >
    <template #actions>
      <BaseButton @click="openDialog">
        <IconPlus class="tw:size-4" />
        Create Token
      </BaseButton>
    </template>

    <template #empty-action>
      <BaseButton @click="openDialog">Create Token</BaseButton>
    </template>

    <AiPatList :tokens="tokens" />

    <AiPatCreateDialog v-model="showCreateDialog" />
  </BaseListLayout>
</template>
