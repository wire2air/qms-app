<script setup>
/**
 * My open tasks — actionable TaskInstances assigned to the current user,
 * soonest due first. Row click goes to the task inbox.
 */
import { currentSession } from '@/utils/currentSession'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { resolveTaskInstanceRoute } from '@/utils/taskRoute.js'
import { DateTime } from 'luxon'
import { IconCircleCheck } from '@tabler/icons-vue'

const ENTITY_LABEL = {
  DocumentVersion: 'Document',
  Nonconformance: 'NC',
  Capa: 'CAPA',
  ChangeRequest: 'Change Request',
  TrainingAssignee: 'Training',
  TrainingInstance: 'Training Verification',
  LogBook: 'Log Book',
  AssignmentInstance: 'Inspection / Log',
  FieldRecord: 'Flagged Log',
  AuditInstance: 'Audit',
  AuditStandardVersion: 'Audit Standard',
  InspectionLot: 'QC Lot',
}

// Resolve the deep link for a task's host entity — shared with the task inbox
// and the "task assigned" notification (see @/utils/taskRoute).
const resolveRoute = resolveTaskInstanceRoute

const tasks = useLiveQueryWithDeps(
  [() => currentSession.value?.userId],
  async (db, [userId]) => {
    if (!userId) return []
    const rows = await db.TaskInstance.where('assignedTo', userId).exec()
    const open = rows
      .filter((t) => ['ASSIGNED', 'FORM_SUBMITTED'].includes(t.statusId))
      .sort((a, b) => {
        const da = a.dueDate?.toMillis?.() ?? Infinity
        const dbb = b.dueDate?.toMillis?.() ?? Infinity
        return da - dbb
      })
    return Promise.all(open.map(async (t) => ({ task: t, route: await resolveRoute(db, t) })))
  },
  { initial: [] },
)

function isOverdue(t) {
  return t.dueDate && t.dueDate < DateTime.now()
}
</script>

<template>
  <DashboardWidgetCard title="My Tasks" :count="tasks.length" linkTo="/task-instances" tone="blue">
    <BaseEmptyState v-if="!tasks.length" dense :icon="IconCircleCheck" title="You're all caught up" />
    <RouterLink
      v-for="{ task: t, route } in tasks.slice(0, 6)"
      :key="t.id"
      :to="getCompanyPath(route)"
      class="tw:flex tw:items-center tw:gap-3 tw:px-4 tw:py-2.5 tw:border-t tw:first:border-t-0 tw:border-divider tw:hover:bg-main-hover tw:transition-colors"
    >
      <div class="tw:flex-1 tw:min-w-0">
        <div class="tw:text-sm tw:font-medium tw:text-on-main tw:truncate">
          {{ ENTITY_LABEL[t.entityType] || t.entityType }}
          <span v-if="t.taskKindId" class="tw:text-xs tw:text-secondary">· {{ t.taskKindId.replaceAll('_', ' ').toLowerCase() }}</span>
        </div>
        <div v-if="t.comment" class="tw:text-xs tw:text-secondary tw:truncate">{{ t.comment }}</div>
      </div>
      <span
        v-if="t.dueDate"
        class="tw:text-xs tw:font-medium tw:whitespace-nowrap"
        :class="isOverdue(t) ? 'tw:text-bad' : 'tw:text-secondary'"
      >
        {{ t.dueDate.formatDate('date') }}
      </span>
    </RouterLink>
  </DashboardWidgetCard>
</template>
