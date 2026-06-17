<script setup>
import {
  IconCircleCheck,
  IconClock,
  IconUserCheck,
  IconClipboard,
  IconMessage,
  IconInfoCircle,
  IconBell,
  IconChevronRight,
  IconUserShare,
  IconRefresh,
  IconCalendarExclamation,
} from '@tabler/icons-vue'
import { DateTime } from 'luxon'
import { getCompanyPath } from '@/utils/routeHelpers'

const props = defineProps({
  notification: { type: Object, required: true },
})
const emit = defineEmits(['close'])
const router = useRouter()

const timeAgo = computed(() => {
  return props.notification.createdAt ? props.notification.createdAt.toRelative() : ''
})

const TYPE_ICON_MAP = {
  DOCUMENT_APPROVED: IconCircleCheck,
  WORKFLOW_ACTION_REQUIRED: IconClock,
  RECORD_ASSIGNED: IconUserCheck,
  TASK_ASSIGNED: IconClipboard,
  TASK_REASSIGNED: IconUserShare,
  TASK_STATUS_CHANGED: IconRefresh,
  TASK_DUE_TOMORROW: IconCalendarExclamation,
  DOCUMENT_MESSAGE: IconMessage,
  SYSTEM: IconInfoCircle,
}

const TYPE_COLOR_MAP = {
  DOCUMENT_APPROVED: 'tw:text-green-600',
  WORKFLOW_ACTION_REQUIRED: 'tw:text-amber-600',
  RECORD_ASSIGNED: 'tw:text-blue-600',
  TASK_ASSIGNED: 'tw:text-purple-600',
  TASK_REASSIGNED: 'tw:text-purple-600',
  TASK_STATUS_CHANGED: 'tw:text-blue-600',
  TASK_DUE_TOMORROW: 'tw:text-orange-600',
  DOCUMENT_MESSAGE: 'tw:text-blue-600',
  SYSTEM: 'tw:text-gray-600',
}

const typeIcon = computed(() => TYPE_ICON_MAP[props.notification.notificationTypeId] || IconBell)
const typeColor = computed(
  () => TYPE_COLOR_MAP[props.notification.notificationTypeId] || 'tw:text-gray-600',
)

const RESOURCE_ROUTES = {
  Document: (id) => getCompanyPath(`/documents/${id}`),
  Record: (id) => getCompanyPath(`/records/${id}`),
  WorkflowInstance: (id) => getCompanyPath(`/workflow-instances/${id}`),
  TaskInstance: (id) => getCompanyPath(`/task-instances/${id}`),
  // Equipment has no detail page yet — land on the list (calibration reminders).
  Equipment: () => getCompanyPath('/equipment'),
}

const resourcePath = computed(() => {
  const { resourceType, resourceId } = props.notification
  if (!resourceType || !resourceId) return null
  const builder = RESOURCE_ROUTES[resourceType]
  if (!builder) return null
  return builder(resourceId)
})

async function handleClick() {
  if (!props.notification.isRead) {
    props.notification.isRead = true
    props.notification.readAt = DateTime.now()
    await props.notification.save()
  }
  emit('close')
  if (resourcePath.value) {
    router.push(resourcePath.value)
  }
}
</script>

<template>
  <button
    class="tw:w-full tw:text-left tw:flex tw:items-start tw:gap-3 tw:px-4 tw:py-3 tw:transition-colors tw:hover:bg-main-hover tw:border-0 tw:cursor-pointer"
    :class="!notification.isRead ? 'tw:bg-blue-50/50' : 'tw:bg-sidebar'"
    @click="handleClick"
  >
    <component :is="typeIcon" :size="24" :class="typeColor" class="tw:shrink-0 tw:mt-0.5" />

    <div class="tw:flex-1 tw:min-w-0">
      <p
        class="tw:text-sm tw:text-on-main tw:truncate"
        :class="!notification.isRead ? 'tw:font-semibold' : 'tw:font-normal'"
      >
        {{ notification.title }}
      </p>
      <p v-if="notification.message" class="tw:text-xs tw:text-secondary tw:mt-0.5 tw:line-clamp-2">
        {{ notification.message }}
      </p>
      <p class="tw:text-xs tw:text-gray-400 tw:mt-1">
        {{ timeAgo }}
        <span v-if="notification.creator">
          &middot; {{ notification.creator.firstName }} {{ notification.creator.lastName }}
        </span>
      </p>
    </div>

    <div
      v-if="!notification.isRead"
      class="tw:w-2.5 tw:h-2.5 tw:rounded-full tw:bg-blue-500 tw:shrink-0 tw:mt-1.5"
    />
    <IconChevronRight
      v-else-if="resourcePath"
      :size="18"
      class="tw:text-gray-400 tw:shrink-0 tw:mt-0.5"
    />
  </button>
</template>
