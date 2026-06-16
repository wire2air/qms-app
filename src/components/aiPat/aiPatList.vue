<script setup>
import { IconRobot } from '@tabler/icons-vue'

const emit = defineEmits(['create'])

const tokens = useLiveQuery(
  async (db) => db.AiPat.where().orderBy('createdAt', 'desc').exec(),
  { initial: [] },
)
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-2">
    <!-- Loading State -->
    <div v-if="tokens === undefined" class="tw:flex tw:justify-center tw:py-12">
      <BaseSpinner size="lg" />
    </div>

    <!-- Empty State -->
    <template v-else-if="tokens.length === 0">
      <BaseEmptyState
        :icon="IconRobot"
        title="No API tokens yet"
        description="Create a token to connect an external AI client (Claude Desktop, IDE) to QMS."
      />
      <div class="tw:flex tw:justify-center">
        <BaseButton @click="emit('create')">Create Token</BaseButton>
      </div>
    </template>

    <!-- Token Cards -->
    <AiPatListItem v-for="token in tokens" :key="token.id" :token="token" />
  </div>
</template>
