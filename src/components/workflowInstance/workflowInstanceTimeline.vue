<script setup>
import {
  IconCheck,
  IconHourglass,
  IconX,
  IconPencil,
  IconLock,
  IconBinaryTree,
} from '@tabler/icons-vue'

const props = defineProps({
  workflowInstanceId: { type: String, default: null },
})

// Build hierarchical step entries: each root step in stepOrder, immediately
// followed by its children (also in stepOrder). Each entry carries a
// displayNumber — "1", "1.1", "2", "2.1" — so child steps render with their
// parent.child notation in the timeline header.
const stepEntries = useLiveQueryWithDeps(
  [() => props.workflowInstanceId],
  async (db, [workflowInstanceId]) => {
    if (!workflowInstanceId) return []
    const instanceSteps = await db.WorkflowInstanceStep.where(
      'workflowInstanceId',
      workflowInstanceId,
    ).exec()
    if (!instanceSteps.length) return []

    const stepDefs = await Promise.all(
      [...new Set(instanceSteps.map((s) => s.stepId))].map((id) => db.WorkflowStep.findByPk(id)),
    )
    const defById = new Map(stepDefs.filter(Boolean).map((d) => [d.id, d]))

    // Collapse to the latest WorkflowInstanceStep per stepId — send-back can
    // produce multiple rows per stepId.
    const latestByStepId = new Map()
    for (const s of instanceSteps) {
      const existing = latestByStepId.get(s.stepId)
      if (!existing || s.createdAt > existing.createdAt) latestByStepId.set(s.stepId, s)
    }
    const latest = [...latestByStepId.values()]

    function stepOrderOf(is) {
      return defById.get(is.stepId)?.stepOrder ?? 0
    }
    function parentOf(is) {
      return defById.get(is.stepId)?.parentStepId ?? null
    }

    const roots = latest
      .filter((s) => !parentOf(s))
      .sort((a, b) => stepOrderOf(a) - stepOrderOf(b))

    const entries = []
    roots.forEach((root, rootIdx) => {
      const rootNum = rootIdx + 1
      entries.push({ instanceStep: root, displayNumber: `${rootNum}` })
      const children = latest
        .filter((s) => parentOf(s) === root.stepId)
        .sort((a, b) => stepOrderOf(a) - stepOrderOf(b))
      children.forEach((child, ci) => {
        entries.push({
          instanceStep: child,
          displayNumber: `${rootNum}.${ci + 1}`,
          isChild: true,
        })
      })
    })
    return entries
  },
)

const loading = computed(() => stepEntries.value === undefined)

function stepState(step) {
  const statusName = step.statusId
  if (statusName === 'APPROVED') return 'completed'
  if (statusName === 'IN_PROGRESS') return 'active'
  if (statusName === 'REJECTED') return 'rejected'
  if (statusName === 'CHANGES_REQUESTED') return 'changesRequested'
  return 'pending'
}
</script>

<template>
  <div class="tw:space-y-4">
    <h2 class="tw:text-lg tw:font-bold tw:text-on-main tw:px-1">Workflow</h2>

    <div v-if="loading" class="tw:flex tw:justify-center tw:py-12">
      <div
        class="tw:animate-spin tw:rounded-full tw:h-8 tw:w-8 tw:border-2 tw:border-primary tw:border-t-transparent"
      />
    </div>

    <div
      v-else-if="!stepEntries.length"
      class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:py-12 tw:text-secondary tw:gap-3"
    >
      <IconBinaryTree :size="40" class="tw:opacity-30" />
      <p class="tw:text-sm tw:font-medium">No workflow data available</p>
    </div>

    <template v-else>
      <div
        v-for="(entry, idx) in stepEntries"
        :key="entry.instanceStep.id"
        class="tw:relative tw:pl-8 tw:group"
        :class="{ 'tw:ml-6': entry.isChild }"
      >
        <!-- Vertical connector line -->
        <div
          v-if="idx < stepEntries.length - 1"
          class="tw:absolute tw:left-2.75 tw:top-6 tw:bottom-0 tw:w-0.5 tw:bg-divider"
        ></div>

        <!-- Completed step icon -->
        <div
          v-if="stepState(entry.instanceStep) === 'completed'"
          class="tw:absolute tw:left-0 tw:top-6 tw:size-6 tw:rounded-full tw:bg-emerald-500 tw:flex tw:items-center tw:justify-center tw:text-white tw:z-10"
        >
          <IconCheck :size="14" />
        </div>

        <!-- Active step icon -->
        <div
          v-else-if="stepState(entry.instanceStep) === 'active'"
          class="tw:absolute tw:left-0 tw:top-6 tw:size-6 tw:rounded-full tw:bg-primary tw:flex tw:items-center tw:justify-center tw:text-white tw:z-10 tw:shadow-[0_0_10px_rgba(19,109,236,0.3)]"
        >
          <IconHourglass :size="14" />
        </div>

        <!-- Rejected step icon -->
        <div
          v-else-if="stepState(entry.instanceStep) === 'rejected'"
          class="tw:absolute tw:left-0 tw:top-6 tw:size-6 tw:rounded-full tw:bg-red-500 tw:flex tw:items-center tw:justify-center tw:text-white tw:z-10"
        >
          <IconX :size="14" />
        </div>

        <!-- Changes Requested step icon -->
        <div
          v-else-if="stepState(entry.instanceStep) === 'changesRequested'"
          class="tw:absolute tw:left-0 tw:top-6 tw:size-6 tw:rounded-full tw:bg-orange-500 tw:flex tw:items-center tw:justify-center tw:text-white tw:z-10"
        >
          <IconPencil :size="14" />
        </div>

        <!-- Pending step icon -->
        <div
          v-else
          class="tw:absolute tw:left-0 tw:top-6 tw:size-6 tw:rounded-full tw:bg-main tw:border-2 tw:border-divider tw:flex tw:items-center tw:justify-center tw:text-secondary tw:z-10"
        >
          <IconLock :size="14" />
        </div>

        <!-- Step cards -->
        <WorkflowInstanceStepCompleted
          v-if="stepState(entry.instanceStep) === 'completed'"
          :instanceStepId="entry.instanceStep.id"
          :displayNumber="entry.displayNumber"
        />
        <WorkflowInstanceStepActive
          v-else-if="stepState(entry.instanceStep) === 'active'"
          :instanceStepId="entry.instanceStep.id"
          :displayNumber="entry.displayNumber"
        />
        <WorkflowInstanceStepRejected
          v-else-if="stepState(entry.instanceStep) === 'rejected'"
          :instanceStepId="entry.instanceStep.id"
          :displayNumber="entry.displayNumber"
        />
        <WorkflowInstanceStepRejected
          v-else-if="stepState(entry.instanceStep) === 'changesRequested'"
          :instanceStepId="entry.instanceStep.id"
          :displayNumber="entry.displayNumber"
        />
        <WorkflowInstanceStepPending
          v-else
          :instanceStepId="entry.instanceStep.id"
          :displayNumber="entry.displayNumber"
        />
      </div>
    </template>
  </div>
</template>
