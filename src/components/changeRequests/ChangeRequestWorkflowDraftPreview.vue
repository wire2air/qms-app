<script setup>
/**
 * Draft-mode workflow preview for Change Requests — same shape as
 * NcWorkflowDraftPreview / CapaWorkflowDraftPreview. The owner picks a
 * reviewer per template step; choices land in cr.pendingReviewers
 * and get applied when submitChangeRequestForReview fires.
 */

const props = defineProps({
  crId: { type: String, required: true },
  isOwner: { type: Boolean, default: false },
})

const toast = useToast()

const cr = useLiveQueryWithDeps([() => props.crId], async (db, [id]) =>
  id ? db.ChangeRequest.findByPk(id) : null,
)

const templateSteps = useLiveQueryWithDeps(
  [() => cr.value?.workflowVersionId],
  async (db, [versionId]) => {
    if (!versionId) return []
    const all = await db.WorkflowStep.where('workflowVersionId', versionId)
      .orderBy('stepOrder', 'asc')
      .exec()
    return all.filter((s) => !s.parentStepId)
  },
  { initial: [] },
)

const stepRoles = useLiveQueryWithDeps(
  [() => templateSteps.value.map((s) => s.id).join(',')],
  async (db, [idsStr]) => {
    const ids = idsStr ? idsStr.split(',') : []
    if (!ids.length) return {}
    const rows = await Promise.all(
      ids.map((id) => db.WorkflowStepRole.where('stepId', id).exec()),
    )
    const map = {}
    ids.forEach((id, i) => {
      map[id] = rows[i].map((r) => r.roleId)
    })
    return map
  },
  { initial: {} },
)

function rolesForStep(stepId) {
  return stepRoles.value[stepId] || []
}

function currentAssignee(stepId) {
  const list = cr.value?.pendingReviewers?.[stepId]
  return Array.isArray(list) && list.length ? list[0] : null
}

const saving = ref(false)

async function handleAssigneeChange(stepId, userId) {
  if (!cr.value) return
  saving.value = true
  try {
    const next = { ...(cr.value.pendingReviewers || {}) }
    if (userId) next[stepId] = [userId]
    else delete next[stepId]
    cr.value.pendingReviewers = next
    await cr.value.save()
  } catch (e) {
    toast.error(e?.message || 'Failed to save assignment')
  } finally {
    saving.value = false
  }
}

const hasWorkflow = computed(() => !!cr.value?.workflowVersionId)
</script>

<template>
  <div
    v-if="cr && hasWorkflow"
    class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5 tw:flex tw:flex-col tw:gap-4"
  >
    <div
      class="tw:flex tw:items-center tw:justify-between tw:pb-3 tw:border-b tw:border-divider"
    >
      <div>
        <h3 class="tw:text-sm tw:font-bold tw:text-on-main">Approval Workflow Plan</h3>
        <p class="tw:text-xs tw:text-secondary tw:mt-0.5">
          Assign a reviewer to each approval step. The workflow launches
          with these assignments when you click <strong>Submit for Approval</strong>.
        </p>
      </div>
      <span v-if="saving" class="tw:text-xs tw:text-secondary">Saving…</span>
    </div>

    <div v-if="!templateSteps.length" class="tw:text-sm tw:text-secondary tw:italic">
      The selected workflow has no steps configured.
    </div>

    <div v-else class="tw:flex tw:flex-col tw:gap-3">
      <div
        v-for="(step, idx) in templateSteps"
        :key="step.id"
        class="tw:flex tw:items-center tw:gap-3 tw:px-4 tw:py-3 tw:rounded-lg tw:border tw:border-divider tw:bg-main-hover/30"
      >
        <span
          class="tw:flex tw:items-center tw:justify-center tw:w-7 tw:h-7 tw:rounded-full tw:bg-primary/10 tw:text-primary tw:text-xs tw:font-bold tw:shrink-0"
        >
          {{ idx + 1 }}
        </span>
        <div class="tw:flex-1 tw:min-w-0">
          <div class="tw:text-sm tw:font-semibold tw:text-on-main tw:truncate">
            {{ step.name }}
          </div>
          <div
            v-if="step.description"
            class="tw:text-xs tw:text-secondary tw:mt-0.5 tw:line-clamp-2"
          >
            {{ step.description }}
          </div>
        </div>
        <div class="tw:w-72 tw:shrink-0">
          <UserSelectMenu
            v-if="isOwner"
            :modelValue="currentAssignee(step.id)"
            :roleIdsFilter="rolesForStep(step.id)"
            @update:modelValue="(uid) => handleAssigneeChange(step.id, uid)"
          />
          <div v-else class="tw:flex tw:items-center tw:gap-2">
            <UserBadgeById
              v-if="currentAssignee(step.id)"
              :userId="currentAssignee(step.id)"
            />
            <span v-else class="tw:text-xs tw:text-secondary tw:italic">Unassigned</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
