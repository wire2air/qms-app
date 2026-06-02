<script setup>
import { IconMail, IconLock } from '@tabler/icons-vue'

defineProps({
  messages: { type: Array, default: () => [] },
})
</script>

<template>
  <div v-if="!messages.length" class="tw:text-sm tw:text-secondary tw:italic tw:py-6 tw:text-center">
    No replies yet.
  </div>
  <div v-else class="tw:flex tw:flex-col tw:gap-3">
    <div
      v-for="m in messages"
      :key="m.id"
      class="tw:rounded-lg tw:border tw:p-4 tw:flex tw:flex-col tw:gap-2"
      :class="
        m.isInternal
          ? 'tw:bg-amber-50 tw:border-amber-200'
          : m.direction === 'INBOUND'
            ? 'tw:bg-blue-50 tw:border-blue-100'
            : 'tw:bg-white tw:border-divider'
      "
    >
      <div class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:flex-wrap">
        <div class="tw:flex tw:items-center tw:gap-2 tw:text-sm">
          <UserBadgeById v-if="m.authorUserId" :userId="m.authorUserId" />
          <span v-else class="tw:font-medium tw:text-on-main">
            {{ m.authorName || m.authorEmail || 'Customer' }}
          </span>
          <span class="tw:text-xs tw:text-secondary">
            {{ m.direction === 'INBOUND' ? 'replied' : 'wrote' }}
          </span>
          <BaseBadge
            v-if="m.isInternal"
            class="tw:bg-amber-100 tw:text-amber-700 tw:gap-1"
          >
            <IconLock :size="12" />
            Internal note
          </BaseBadge>
          <BaseBadge
            v-else-if="m.deliveredViaEmail"
            class="tw:bg-emerald-100 tw:text-emerald-700 tw:gap-1"
          >
            <IconMail :size="12" />
            Emailed
          </BaseBadge>
        </div>
        <span class="tw:text-xs tw:text-secondary">
          {{ m.createdAt?.formatDate('dateTime') }}
        </span>
      </div>
      <div class="tw:text-sm tw:text-on-main tw:whitespace-pre-wrap">{{ m.body }}</div>
    </div>
  </div>
</template>
