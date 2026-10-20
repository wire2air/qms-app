<script setup>
import { IconUserQuestion } from '@tabler/icons-vue'

/** Tiny assignee avatar for inbox rows; a dashed placeholder when unassigned. */
const props = defineProps({
  userId: { type: String, default: null },
  size: { type: String, default: 'xs' },
})
const user = useLiveQueryWithDeps(
  [() => props.userId],
  async (db, [id]) => (id ? db.User.findByPk(id) : null),
  { models: ['User'], initial: null },
)
const name = computed(() =>
  user.value ? [user.value.firstName, user.value.lastName].filter(Boolean).join(' ') : '',
)
</script>

<template>
  <BaseTooltip :content="user ? `Assigned to ${name}` : 'Unassigned'">
    <BaseAvatar v-if="user" :name="name" :src="user.avatar || ''" :size="size" />
    <span
      v-else
      class="tw:flex tw:size-6 tw:items-center tw:justify-center tw:rounded-full tw:border tw:border-dashed tw:border-divider tw:text-secondary"
    >
      <IconUserQuestion :size="12" />
    </span>
  </BaseTooltip>
</template>
