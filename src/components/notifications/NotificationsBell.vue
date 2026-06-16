<script setup>
import { IconBell } from '@tabler/icons-vue'

const notifications = useLiveQuery(
  async (db) => db.Notification.where().orderBy('createdAt', 'desc').exec(),

  { models: ['Notification'], initial: [] },
)

const unreadCount = computed(() => notifications.value.filter((n) => !n.isRead).length)
</script>

<template>
  <BasePopover placement="bottom-end" :offset="8">
    <template #button>
      <button
        class="tw:relative tw:flex tw:items-center tw:justify-center tw:size-9 tw:rounded-full tw:hover:bg-main-hover tw:transition-colors"
      >
        <IconBell :size="20" class="tw:text-on-main" />
        <span
          v-if="unreadCount > 0"
          class="tw:absolute tw:top-0.5 tw:right-0.5 tw:min-w-4 tw:h-4 tw:bg-red-500 tw:text-white tw:text-[10px] tw:font-bold tw:rounded-full tw:flex tw:items-center tw:justify-center tw:px-0.5"
        >
          {{ unreadCount > 99 ? '99+' : unreadCount }}
        </span>
      </button>
    </template>
    <template #content="{ close }">
      <div class="tw:w-96 tw:max-h-125 tw:overflow-hidden tw:flex tw:flex-col">
        <NotificationsPanel @close="close" />
      </div>
    </template>
  </BasePopover>
</template>
