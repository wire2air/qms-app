<script setup>
import { IconBellOff, IconCheck } from '@tabler/icons-vue'
import { DateTime } from 'luxon'

const filter = ref('all') // 'all' | 'unread'

const allNotifications = useLiveQuery(
  async (db) => db.Notification.where().orderBy('createdAt', 'desc').exec(),
  { models: ['Notification'] },
)

const loading = computed(() => allNotifications.value === undefined)

const unreadCount = computed(() => allNotifications.value?.filter((n) => !n.isRead).length ?? 0)

const filteredNotifications = computed(() => {
  if (!allNotifications.value) return []
  if (filter.value === 'unread') return allNotifications.value.filter((n) => !n.isRead)
  return allNotifications.value
})

const markAllAsRead = useLiveMutation(async (db) => {
  const all = await db.Notification.where().exec()
  for (const n of all.filter((n) => !n.isRead)) {
    n.isRead = true
    n.readAt = DateTime.now()
    await n.save()
  }
})

async function handleMarkAllRead() {
  await markAllAsRead()
}
</script>

<template>
  <div class="tw:max-w-3xl tw:mx-auto tw:px-4 tw:py-6">
    <!-- Page header -->
    <BaseSectionHeader title="Notifications" :level="1" size="section-title" class="tw:mb-6">
      <template v-if="unreadCount > 0" #subtitle> {{ unreadCount }} unread </template>
      <template #actions>
        <button
          v-if="unreadCount > 0"
          class="tw:flex tw:items-center tw:gap-1.5 tw:text-sm tw:text-primary tw:font-medium tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:underline"
          @click="handleMarkAllRead"
        >
          <IconCheck :size="16" />
          Mark all as read
        </button>
      </template>
    </BaseSectionHeader>

    <!-- Filter tabs -->
    <div class="tw:flex tw:gap-1 tw:mb-4 tw:border-b tw:border-divider">
      <button
        v-for="tab in [
          { id: 'all', label: 'All' },
          { id: 'unread', label: 'Unread' },
        ]"
        :key="tab.id"
        class="tw:px-4 tw:py-2 tw:text-sm tw:font-medium tw:border-b-2 tw:transition-colors tw:bg-transparent tw:cursor-pointer"
        :class="
          filter === tab.id
            ? 'tw:border-primary tw:text-primary'
            : 'tw:border-transparent tw:text-secondary tw:hover:text-on-main'
        "
        @click="filter = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="tw:flex tw:justify-center tw:py-16">
      <BaseSpinner size="lg" />
    </div>

    <!-- Empty state -->
    <div
      v-else-if="filteredNotifications.length === 0"
      class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:py-16 tw:text-gray-400"
    >
      <IconBellOff :size="64" class="tw:text-gray-300" />
      <p class="tw:mt-3 tw:text-base">
        {{ filter === 'unread' ? 'No unread notifications' : 'No notifications yet' }}
      </p>
    </div>

    <!-- Notification list -->
    <div
      v-else
      class="tw:rounded-lg tw:border tw:border-divider tw:overflow-hidden tw:divide-y tw:divide-divider"
    >
      <NotificationsItem
        v-for="notification in filteredNotifications"
        :key="notification.id"
        :notification="notification"
      />
    </div>
  </div>
</template>
