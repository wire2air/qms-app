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

const filterTabs = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
]
</script>

<template>
  <div class="tw:py-6">
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
    <BaseTabs v-model="filter" :tabs="filterTabs" ariaLabel="Notification filter" class="tw:mb-4" />

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
