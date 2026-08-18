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
import { resolveTaskInstanceRoute } from '@/utils/taskRoute.js'
import { db } from '@models/index'

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

/**
 * Canonicalise the snake_case analytics vocabulary to the PascalCase one used
 * as keys below.
 *
 * Two vocabularies reach this resolver. Almost every emitter sends the model
 * name (`Nonconformance`), but the analytics worker tasks are raw-SQL jobs with
 * no model in scope and send the TABLE name instead — `evaluate_analytics_alerts`
 * emits `resourceType: 'analytics_alert'`. Both must land on the same page here
 * AND in the email builder, which normalises identically
 * (`analyticsCanonicalType` in `@qability/shared/utils/companyAppUrl.js`).
 *
 * Accepts singular or plural (`analytics_alert`, `analytics_alerts`) because the
 * emitter and the table disagree about which one they use.
 */
function canonicalResourceType(resourceType) {
  if (!resourceType.startsWith('analytics_')) return resourceType
  const singular = resourceType.endsWith('s') ? resourceType.slice(0, -1) : resourceType
  return singular
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}

// Deep-link targets for a notification's `resourceType`. This table is the
// in-app HALF of a pair: the email half is `entityRouteSegment` in
// `@qability/shared/utils/companyAppUrl.js`. ONE notification row feeds both,
// so a type that resolves differently in the two places sends the emailed link
// and the in-app link to different pages — nothing tests that, and nobody finds
// out until a customer says so. Add a type to BOTH or to neither.
const RESOURCE_ROUTES = {
  Document: (id) => getCompanyPath(`/documents/${id}`),
  Record: (id) => getCompanyPath(`/records/${id}`),
  WorkflowInstance: (id) => getCompanyPath(`/workflow-instances/${id}`),
  // TaskInstance has NO standalone detail route (/task-instances/:id 404s) — it
  // is resolved to its host entity in resolveTarget() below, matching the task
  // inbox and the email deep link.
  // Equipment has no detail page yet — land on the list (calibration reminders).
  Equipment: () => getCompanyPath('/equipment'),

  // ── Analytics ──────────────────────────────────────────────────────────
  // Dashboards and reports are the only analytics records with a page of
  // their own, so they are the only ones that carry an id.
  AnalyticsDashboard: (id) => getCompanyPath(`/analytics/dashboards/${id}`),
  AnalyticsReport: (id) => getCompanyPath(`/analytics/reports/${id}`),
  // A schedule is configuration hanging off a report and a run is a row in
  // that report's history — neither is addressable, so both stop at the
  // reports list. Resolving to the PARENT report would be a better landing
  // spot, but it needs an id lookup the email builder (synchronous, no DB
  // handle) cannot do, and a link that lands somewhere different depending on
  // whether you clicked the email or the bell is worse than one that lands one
  // level up in both.
  AnalyticsReportSchedule: () => getCompanyPath('/analytics/reports'),
  AnalyticsReportRun: () => getCompanyPath('/analytics/reports'),
  // Alerts have no UI surface at all yet; the analytics home is the honest
  // destination until one exists.
  AnalyticsAlert: () => getCompanyPath('/analytics'),
  AnalyticsAlertEvent: () => getCompanyPath('/analytics'),
  // AnalyticsWidget is deliberately ABSENT. A widget is a layout cell inside a
  // dashboard, not a record anyone navigates to; anything worth notifying about
  // a widget (an alert on its metric) is worth notifying about its DASHBOARD,
  // and the emitter already holds that id. Registering it would encode the lie
  // that a widget id is navigable and silently drop the id on the way. It falls
  // through to the analytics fallback below instead.
}

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
      'add it to RESOURCE_ROUTES here AND to the backend entityRouteSegment',
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
  return resourceType === 'TaskInstance' || !!RESOURCE_ROUTES[canonicalResourceType(resourceType)]
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
  const canonicalType = canonicalResourceType(resourceType)
  const builder = RESOURCE_ROUTES[canonicalType]
  return builder ? builder(resourceId) : fallbackTarget(resourceType, canonicalType)
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
