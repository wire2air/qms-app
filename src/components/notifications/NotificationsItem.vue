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
  IconAlertTriangle,
  IconAlertCircle,
  IconTool,
  IconCertificate,
  IconFileText,
  IconFlag,
  IconNotebook,
  IconPackage,
  IconShieldCheck,
  IconCalendarTime,
  IconUserExclamation,
  IconMailForward,
  IconBellRinging,
  IconClipboardList,
  IconThumbUp,
  IconRobot,
  IconUsers,
} from '@tabler/icons-vue'
import { DateTime } from 'luxon'
import { getCompanyPath } from '@/utils/routeHelpers'
import { resolveTaskInstanceRoute } from '@/utils/taskRoute.js'
import {
  canonicalResourceType,
  hasNotificationRoute,
  notificationPath,
} from '@/utils/notificationRoutes.js'
import { db } from '@models/index'

const props = defineProps({
  notification: { type: Object, required: true },
})
const emit = defineEmits(['close'])
const router = useRouter()

const timeAgo = computed(() => {
  return props.notification.createdAt ? props.notification.createdAt.toRelative() : ''
})

// Covers all 37 seeded notification_types (was 9/31 — docs/modules/notifications
// finding #8). Anything added to the catalog after this falls back to the
// generic bell/gray below, same as before; the gap is now "a type nobody has
// picked an icon for yet", not "most of the catalog".
const TYPE_ICON_MAP = {
  DOCUMENT_APPROVED: IconCircleCheck,
  WORKFLOW_ACTION_REQUIRED: IconClock,
  RECORD_ASSIGNED: IconUserCheck,
  TASK_ASSIGNED: IconClipboard,
  TASK_REASSIGNED: IconUserShare,
  TASK_STATUS_CHANGED: IconRefresh,
  TASK_DUE_TOMORROW: IconCalendarExclamation,
  TASK_OVERDUE: IconAlertCircle,
  TASK_OVERDUE_ESCALATED: IconAlertTriangle,
  TASK_ACTED_BY_OTHER: IconUsers,
  DOCUMENT_MESSAGE: IconMessage,
  DOCUMENT_NEW_VERSION_SHARED: IconFileText,
  SYSTEM: IconInfoCircle,
  NOTIFICATION_RULE: IconBellRinging,
  AUTOMATION_RULE: IconRobot,
  ASSET_REQUEST_RECEIVED: IconPackage,
  ASSIGNMENT_MISSED: IconUserExclamation,
  AUDIT_READINESS_NUDGE: IconClipboardList,
  CUSTOMER_COMPLAINT_ASSIGNED: IconFlag,
  CUSTOMER_COMPLAINT_CREATED: IconFlag,
  CUSTOMER_COMPLAINT_CONVERTED_TO_NC: IconAlertTriangle,
  CUSTOMER_COMPLAINT_REPLY_RECEIVED: IconMailForward,
  EQUIPMENT_CALIBRATION_DUE: IconTool,
  EQUIPMENT_PM_DUE: IconTool,
  FIELD_RECORD_DIGEST: IconNotebook,
  FIELD_RECORD_FLAGGED: IconFlag,
  FIELD_RECORD_FLAGGED_CRITICAL: IconAlertTriangle,
  FIELD_RECORD_REJECTED: IconAlertCircle,
  FIELD_RECORD_RETURNED_FOR_INFO: IconMailForward,
  LOG_BOOK_ENTRY_DUE: IconNotebook,
  SUPPLIER_CERTIFICATE_EXPIRING: IconCertificate,
  TRAINING_ASSIGNED: IconClipboardList,
  TRAINING_COMPLETED: IconThumbUp,
  TRAINING_ESCALATION: IconAlertTriangle,
  TRAINING_INSTANCE_COMPLETED: IconCircleCheck,
  TRAINING_REMINDER: IconCalendarTime,
  TRAINING_VERIFICATION_REQUIRED: IconShieldCheck,
}

const TYPE_COLOR_MAP = {
  DOCUMENT_APPROVED: 'tw:text-green-600',
  WORKFLOW_ACTION_REQUIRED: 'tw:text-amber-600',
  RECORD_ASSIGNED: 'tw:text-blue-600',
  TASK_ASSIGNED: 'tw:text-purple-600',
  TASK_REASSIGNED: 'tw:text-purple-600',
  TASK_STATUS_CHANGED: 'tw:text-blue-600',
  TASK_DUE_TOMORROW: 'tw:text-orange-600',
  TASK_OVERDUE: 'tw:text-red-600',
  TASK_OVERDUE_ESCALATED: 'tw:text-red-600',
  TASK_ACTED_BY_OTHER: 'tw:text-blue-600',
  DOCUMENT_MESSAGE: 'tw:text-blue-600',
  DOCUMENT_NEW_VERSION_SHARED: 'tw:text-blue-600',
  SYSTEM: 'tw:text-gray-600',
  NOTIFICATION_RULE: 'tw:text-blue-600',
  AUTOMATION_RULE: 'tw:text-purple-600',
  ASSET_REQUEST_RECEIVED: 'tw:text-blue-600',
  ASSIGNMENT_MISSED: 'tw:text-red-600',
  AUDIT_READINESS_NUDGE: 'tw:text-amber-600',
  CUSTOMER_COMPLAINT_ASSIGNED: 'tw:text-purple-600',
  CUSTOMER_COMPLAINT_CREATED: 'tw:text-orange-600',
  CUSTOMER_COMPLAINT_CONVERTED_TO_NC: 'tw:text-red-600',
  CUSTOMER_COMPLAINT_REPLY_RECEIVED: 'tw:text-blue-600',
  EQUIPMENT_CALIBRATION_DUE: 'tw:text-amber-600',
  EQUIPMENT_PM_DUE: 'tw:text-amber-600',
  FIELD_RECORD_DIGEST: 'tw:text-gray-600',
  FIELD_RECORD_FLAGGED: 'tw:text-orange-600',
  FIELD_RECORD_FLAGGED_CRITICAL: 'tw:text-red-600',
  FIELD_RECORD_REJECTED: 'tw:text-red-600',
  FIELD_RECORD_RETURNED_FOR_INFO: 'tw:text-orange-600',
  LOG_BOOK_ENTRY_DUE: 'tw:text-amber-600',
  SUPPLIER_CERTIFICATE_EXPIRING: 'tw:text-amber-600',
  TRAINING_ASSIGNED: 'tw:text-purple-600',
  TRAINING_COMPLETED: 'tw:text-green-600',
  TRAINING_ESCALATION: 'tw:text-red-600',
  TRAINING_INSTANCE_COMPLETED: 'tw:text-green-600',
  TRAINING_REMINDER: 'tw:text-amber-600',
  TRAINING_VERIFICATION_REQUIRED: 'tw:text-blue-600',
}

const typeIcon = computed(() => TYPE_ICON_MAP[props.notification.notificationTypeId] || IconBell)
const typeColor = computed(
  () => TYPE_COLOR_MAP[props.notification.notificationTypeId] || 'tw:text-gray-600',
)

/**
 * Where a notification whose `resourceType` nobody registered lands.
 *
 * Doing NOTHING — the previous behaviour — is the worst available outcome: the
 * panel closes, the page does not move, and the user clicks again rather than
 * reporting it, so a missing row above survives release after release. A warning
 * plus a real destination makes it a bug someone can actually file.
 *
 * Unmapped `Analytics*` types land on the analytics home, matching the email
 * resolver's namespace fallback. Everything else lands on the notifications
 * list, which at least shows the message the user was trying to open. (The two
 * resolvers can only agree this far: the email builder cannot verify that a
 * route exists, so its own last resort still guesses a plural segment.)
 */
function fallbackTarget(resourceType, canonicalType) {
  console.warn(
    `[notifications] no deep-link route for resourceType "${resourceType}" — ` +
      'add it to RESOURCE_ROUTES in @/utils/notificationRoutes.js AND to the ' +
      'backend entityRouteSegment',
  )
  return getCompanyPath(canonicalType.startsWith('Analytics') ? '/analytics' : '/notifications')
}

// Whether this notification has a REGISTERED destination — drives the chevron
// affordance. Deliberately narrower than resolveTarget(): an unregistered type
// still navigates (loudly, to a fallback page), but showing a chevron for it
// would advertise a destination we do not actually have.
const hasTarget = computed(() => {
  const { resourceType, resourceId } = props.notification
  if (!resourceType || !resourceId) return false
  return resourceType === 'TaskInstance' || hasNotificationRoute(resourceType)
})

// Resolve the (company-prefixed) destination at click time. A TaskInstance needs
// an async IDB lookup to map to its host entity, so this can't be a plain computed.
async function resolveTarget() {
  const { resourceType, resourceId } = props.notification
  if (!resourceType || !resourceId) return null
  if (resourceType === 'TaskInstance') {
    const task = await db.TaskInstance.findByPk(resourceId)
    return getCompanyPath(await resolveTaskInstanceRoute(db, task))
  }
  const path = notificationPath(resourceType, resourceId)
  if (path) return getCompanyPath(path)
  return fallbackTarget(resourceType, canonicalResourceType(resourceType))
}

async function handleClick() {
  if (!props.notification.isRead) {
    props.notification.isRead = true
    props.notification.readAt = DateTime.now()
    await props.notification.save()
  }
  // Resolve before closing so the async lookup isn't racing an unmount.
  const target = await resolveTarget()
  emit('close')
  if (target) {
    router.push(target)
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
      v-else-if="hasTarget"
      :size="18"
      class="tw:text-gray-400 tw:shrink-0 tw:mt-0.5"
    />
  </button>
</template>
