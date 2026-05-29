<script setup>
/**
 * Draft-mode workflow preview. While the NC is in DRAFT (no workflow
 * instance exists yet) the owner needs to see the steps that will fire
 * once they click Open NC, and pre-assign a user to each step. Choices
 * are saved to `nc.pendingReviewers` ({ workflowStepId: [userId, …] })
 * on the row; `submitNcForReview` consumes that map to seed the
 * UserOnWorkflowInstanceStep rows when the workflow finally launches.
 *
 * Mirrors CapaWorkflowDraftPreview — same shape, just keyed on NC.
 */

const props = defineProps({
  ncId: { type: String, required: true },
  isOwner: { type: Boolean, default: false },
})

const toast = useToast()

const nc = useLiveQueryWithDeps([() => props.ncId], async (db, [id]) =>
  id ? db.Nonconformance.findByPk(id) : null,
)

// Template steps from the workflow version selected on the NC. Only
// roots — child steps are CAPA-specific.
const templateSteps = useLiveQueryWithDeps(
  [() => nc.value?.workflowVersionId],
  async (db, [versionId]) => {
    if (!versionId) return []
    const all = await db.WorkflowStep.where('workflowVersionId', versionId)
      .orderBy('stepOrder', 'asc')
      .exec()
    return all.filter((s) => !s.parentStepId)
  },
  { initial: [] },
)

// Role assignments per template step (WorkflowStepRole pivot), grouped by
// stepId so the per-step assignee picker can be filtered to users who hold
// at least one of the step's eligible roles.
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

// Approval steps stay internal even on a supplier-facing NC — final
// approval can't be delegated to the supplier; see submitNcForReview.
function isApprovalStep(step) {
  return step?.stepType === 'APPROVAL'
}
function usesSupplierPickerFor(step) {
  return !!nc.value?.isSupplierFacing && !isApprovalStep(step)
}

// For a supplier-facing NC, the picker pool is the supplier's users.
// Surface that list here so we can auto-default each step to the first
// candidate (common case: a supplier has one POC user — saves a click).
const supplierUsers = useLiveQueryWithDeps(
  [() => nc.value?.supplierId, () => nc.value?.isSupplierFacing],
  async (db, [supplierId, isSupplierFacing]) => {
    if (!isSupplierFacing || !supplierId) return []
    const all = await db.User.where('supplierId', supplierId).exec()
    return all.filter(
      (u) => u.kind === 'EXTERNAL_SUPPLIER' && u.userStatusId === 'ACTIVE',
    )
  },
  { initial: [] },
)

function currentAssignee(stepId) {
  const list = nc.value?.pendingReviewers?.[stepId]
  return Array.isArray(list) && list.length ? list[0] : null
}

const saving = ref(false)

// Single-user-per-step model (wrapped in an array to match the backend's
// multi-user `reviewers` map shape). Swap the picker to multi-select
// later without changing the persisted shape if needed.
async function handleAssigneeChange(stepId, userId) {
  if (!nc.value) return
  saving.value = true
  try {
    const next = { ...(nc.value.pendingReviewers || {}) }
    if (userId) {
      next[stepId] = [userId]
    } else {
      delete next[stepId]
    }
    nc.value.pendingReviewers = next
    await nc.value.save()
  } catch (e) {
    toast.error(e?.message || 'Failed to save assignment')
  } finally {
    saving.value = false
  }
}

const hasWorkflow = computed(() => !!nc.value?.workflowVersionId)

// Auto-pick a sensible default for each step on a supplier-facing NC so
// the owner doesn't have to click N times when the obvious choice
// applies. Only fills empty slots; never overwrites an explicit pick.
//   APPROVAL step → owner (final approval stays internal)
//   other step    → first active supplier user (common case: one POC)
watch(
  [
    supplierUsers,
    templateSteps,
    () => nc.value?.isSupplierFacing,
    () => nc.value?.statusId,
    () => nc.value?.ownerId,
  ],
  ([users, steps, isSupplierFacing, statusId, ownerId]) => {
    if (!nc.value || !isSupplierFacing || statusId !== 'DRAFT') return
    if (!steps.length) return
    const firstSupplierUserId = users.length ? users[0].id : null
    const next = { ...(nc.value.pendingReviewers || {}) }
    let changed = false
    for (const step of steps) {
      const existing = next[step.id]
      if (Array.isArray(existing) && existing.length) continue
      const defaultUserId = isApprovalStep(step) ? ownerId : firstSupplierUserId
      if (!defaultUserId) continue
      next[step.id] = [defaultUserId]
      changed = true
    }
    if (changed) {
      nc.value.pendingReviewers = next
      nc.value.save().catch(() => {
        // swallow — the user can still pick manually if this errors
      })
    }
  },
  { immediate: true },
)
</script>

<template>
  <div
    v-if="nc && hasWorkflow"
    class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5 tw:flex tw:flex-col tw:gap-4"
  >
    <div
      class="tw:flex tw:items-center tw:justify-between tw:pb-3 tw:border-b tw:border-divider"
    >
      <div>
        <h3 class="tw:text-sm tw:font-bold tw:text-on-main">Workflow Plan</h3>
        <p class="tw:text-xs tw:text-secondary tw:mt-0.5">
          Assign a user to each step. The workflow launches with these assignments
          when you click <strong>Open NC</strong>.
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
          <div class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
            <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:truncate">
              {{ step.name }}
            </span>
            <span
              v-if="nc.isSupplierFacing && isApprovalStep(step)"
              class="tw:text-[10px] tw:rounded tw:bg-amber-100 tw:text-amber-800 tw:px-1.5 tw:py-0.5"
              title="Approval steps stay internal even on supplier-facing records."
            >
              Approval · Internal only
            </span>
          </div>
          <div
            v-if="step.description"
            class="tw:text-xs tw:text-secondary tw:mt-0.5 tw:line-clamp-2"
          >
            {{ step.description }}
          </div>
        </div>
        <div class="tw:w-72 tw:shrink-0">
          <!-- Supplier-facing NC: picker swaps to supplier users for the
               NC's supplier, ignores the template's role pool — EXCEPT
               for APPROVAL steps, which stay on the internal role pool
               (final approval can't be delegated to the supplier).
               Backend refuses submit otherwise (see submitNcForReview). -->
          <UserSelectMenu
            v-if="isOwner && usesSupplierPickerFor(step)"
            :modelValue="currentAssignee(step.id)"
            kind="EXTERNAL_SUPPLIER"
            :supplierId="nc.supplierId"
            @update:modelValue="(uid) => handleAssigneeChange(step.id, uid)"
          />
          <UserSelectMenu
            v-else-if="isOwner"
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
