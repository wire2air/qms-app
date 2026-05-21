<script setup>
/**
 * Live workflow display for a CR. Shows the workflow instance's steps
 * with their status, current assignee, and progress. Action buttons
 * (reassign, send back, etc.) are deferred to a P2 — for now, reviewers
 * action their tasks via the My Tasks inbox, which routes back here.
 */
import { IconCheck, IconClock, IconLoader2, IconBan, IconArrowBackUp } from '@tabler/icons-vue'

const props = defineProps({
  crId: { type: String, required: true },
  workflowInstanceId: { type: String, default: null },
})

const steps = useLiveQueryWithDeps(
  [() => props.workflowInstanceId],
  async (db, [id]) => {
    if (!id) return []
    const all = await db.WorkflowInstanceStep.where('workflowInstanceId', id)
      .orderBy('stepNumber', 'asc')
      .exec()
    // Latest per stepId (handle send-back churn) + only roots; child
    // sub-tasks render nested below their parent.
    const latestByStepId = new Map()
    for (const s of all) {
      const existing = latestByStepId.get(s.stepId)
      if (!existing || s.createdAt > existing.createdAt) {
        latestByStepId.set(s.stepId, s)
      }
    }
    return [...latestByStepId.values()]
      .filter((s) => !s.parentInstanceStepId)
      .sort((a, b) => a.stepNumber - b.stepNumber)
  },
  { initial: [] },
)

function statusClass(statusId) {
  return {
    'tw:bg-blue-100 tw:text-blue-700': statusId === 'IN_PROGRESS',
    'tw:bg-gray-100 tw:text-gray-600': statusId === 'PENDING',
    'tw:bg-green-100 tw:text-green-700': statusId === 'APPROVED',
    'tw:bg-red-100 tw:text-red-700':
      statusId === 'CANCELLED' || statusId === 'REJECTED',
    'tw:bg-orange-100 tw:text-orange-700': statusId === 'SENT_BACK',
  }
}

function statusLabel(statusId) {
  if (!statusId) return '—'
  if (statusId === 'APPROVED') return 'Completed'
  return statusId.replace('_', ' ')
}
</script>

<template>
  <div
    v-if="workflowInstanceId"
    class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5"
  >
    <div
      class="tw:flex tw:items-center tw:justify-between tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
    >
      <h3 class="tw:text-sm tw:font-bold tw:text-on-main">Workflow Progress</h3>
      <span class="tw:text-xs tw:text-secondary">
        {{ steps.length }} step{{ steps.length === 1 ? '' : 's' }}
      </span>
    </div>

    <div v-if="!steps.length" class="tw:text-sm tw:text-secondary tw:italic">
      No workflow steps to show yet.
    </div>

    <div v-else class="tw:flex tw:flex-col tw:gap-3">
      <div
        v-for="step in steps"
        :key="step.id"
        class="tw:flex tw:items-start tw:gap-3 tw:px-4 tw:py-3 tw:rounded-lg tw:border tw:border-divider"
      >
        <div class="tw:shrink-0 tw:mt-0.5">
          <div
            v-if="step.statusId === 'APPROVED'"
            class="tw:size-7 tw:rounded-full tw:bg-green-500 tw:flex tw:items-center tw:justify-center"
          >
            <IconCheck :size="14" class="tw:text-white" stroke-width="3" />
          </div>
          <div
            v-else-if="step.statusId === 'IN_PROGRESS'"
            class="tw:size-7 tw:rounded-full tw:border-2 tw:border-blue-400 tw:flex tw:items-center tw:justify-center"
          >
            <IconLoader2 :size="14" class="tw:text-blue-600 tw:animate-spin" />
          </div>
          <div
            v-else-if="step.statusId === 'SENT_BACK'"
            class="tw:size-7 tw:rounded-full tw:border-2 tw:border-amber-400 tw:flex tw:items-center tw:justify-center"
          >
            <IconArrowBackUp :size="14" class="tw:text-amber-600" />
          </div>
          <div
            v-else-if="step.statusId === 'CANCELLED'"
            class="tw:size-7 tw:rounded-full tw:bg-red-100 tw:flex tw:items-center tw:justify-center"
          >
            <IconBan :size="14" class="tw:text-red-600" />
          </div>
          <div
            v-else
            class="tw:size-7 tw:rounded-full tw:border-2 tw:border-gray-300 tw:bg-white tw:flex tw:items-center tw:justify-center"
          >
            <IconClock :size="14" class="tw:text-gray-400" />
          </div>
        </div>

        <div class="tw:flex-1 tw:min-w-0">
          <div class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
            <span class="tw:text-sm tw:font-semibold tw:text-on-main">
              {{ step.stepNumber }}. {{ step.name || 'Step' }}
            </span>
            <BaseBadge class="tw:text-[10px]" :class="statusClass(step.statusId)">
              {{ statusLabel(step.statusId) }}
            </BaseBadge>
          </div>
          <div
            v-if="step.description"
            class="tw:text-xs tw:text-secondary tw:mt-1 tw:line-clamp-2"
          >
            {{ step.description }}
          </div>
        </div>

        <ChangeRequestWorkflowStepAssignees
          :instanceStepId="step.id"
          class="tw:shrink-0"
        />
      </div>
    </div>
  </div>
</template>
