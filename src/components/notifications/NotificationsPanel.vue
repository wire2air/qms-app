<script setup>
import { IconBellOff } from '@tabler/icons-vue'
import { DateTime } from 'luxon'

const emit = defineEmits(['close'])
const route = useRoute()

const notifications = useLiveQuery(
  async (db) => db.Notification.where().orderBy('createdAt', 'desc').exec(),
  { initial: [] },
)

const unreadCount = computed(() => notifications.value.filter((n) => !n.isRead).length)
const previewNotifications = computed(() => notifications.value.slice(0, 6))
const viewAllPath = computed(() => `/${route.params.companyCode}/notifications`)

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

function handleViewAll() {
  emit('close')
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:max-h-[inherit]">
    <!-- Header -->
    <div
      class="tw:flex tw:items-center tw:justify-between tw:px-4 tw:py-3 tw:border-b tw:border-divider"
    >
      <span class="tw:font-semibold tw:text-base">Notifications</span>
      <button
        v-if="unreadCount > 0"
        class="tw:text-sm tw:text-primary tw:font-medium tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:underline"
        @click="handleMarkAllRead"
      >
        Mark all read
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="tw:flex tw:justify-center tw:py-8">
      <div
        class="tw:size-8 tw:animate-spin tw:rounded-full tw:border-2 tw:border-primary tw:border-t-transparent"
      ></div>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="notifications.length === 0"
      class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:py-8 tw:text-gray-400"
    >
      <IconBellOff :size="48" class="tw:text-gray-300" />
      <span class="tw:mt-2 tw:text-sm">No notifications yet</span>
    </div>

    <!-- Notification list (latest 6) -->
    <div v-else class="tw:overflow-y-auto tw:divide-y tw:divide-divider">
      <NotificationsItem
        v-for="notification in previewNotifications"
        :key="notification.id"
        :notification="notification"
        @close="emit('close')"
      />
    </div>

    <!-- View all footer -->
    <div
      v-if="notifications.length > 0"
      class="tw:border-t tw:border-divider tw:px-4 tw:py-2.5 tw:text-center"
    >
      <RouterLink
        :to="viewAllPath"
        class="tw:text-sm tw:text-primary tw:font-medium"
        @click="handleViewAll"
      >
        View all notifications
        <span v-if="notifications.length > 6" class="tw:text-gray-400 tw:font-normal">
          ({{ notifications.length }}+)
        </span>
      </RouterLink>
    </div>
  </div>
</template>
