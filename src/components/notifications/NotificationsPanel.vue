<script setup>
import { IconBellOff } from '@tabler/icons-vue'
import { DateTime } from 'luxon'

const emit = defineEmits(['close'])

// No `initial: []` — the ref stays `undefined` until the first query result
// arrives, which is what makes `loading` below a real, reachable state instead
// of dead code. Same pattern as NotificationsPage.vue's `allNotifications`.
const notifications = useLiveQuery(
  async (db) => db.Notification.where().orderBy('createdAt', 'desc').exec(),

  { models: ['Notification'] },
)

const loading = computed(() => notifications.value === undefined)
const unreadCount = computed(() => notifications.value?.filter((n) => !n.isRead).length ?? 0)
const previewNotifications = computed(() => (notifications.value ?? []).slice(0, 6))
// The footer's `v-if` runs unconditionally (it's a sibling of the loading
// branch, not part of that if/else chain), so it needs its own null-safe count
// rather than reading `notifications.length` directly while still loading.
const totalCount = computed(() => notifications.value?.length ?? 0)
const viewAllPath = '/notifications'

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
      <BaseSpinner size="md" />
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
      v-if="totalCount > 0"
      class="tw:border-t tw:border-divider tw:px-4 tw:py-2.5 tw:text-center"
    >
      <RouterLink
        :to="viewAllPath"
        class="tw:text-sm tw:text-primary tw:font-medium"
        @click="handleViewAll"
      >
        View all notifications
        <span v-if="totalCount > 6" class="tw:text-gray-400 tw:font-normal">
          ({{ totalCount }}+)
        </span>
      </RouterLink>
    </div>
  </div>
</template>
