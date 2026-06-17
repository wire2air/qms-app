<script setup>
/**
 * Draft-mode workflow preview. While the CAPA is in DRAFT (no workflow
 * instance exists yet) the owner needs to see the steps that will fire
 * once they submit, and pre-assign a user to each step. Choices are saved
 * to `capa.pendingReviewers` ({ workflowStepId: [userId, …] }) on the row;
 * `submitCapaForReview` consumes that map to seed the
 * UserOnWorkflowInstanceStep rows when the workflow finally launches.
 */

const props = defineProps({
  capaId: { type: String, required: true },
  isOwner: { type: Boolean, default: false },
})

const toast = useToast()

const capa = useLiveQueryWithDeps(
  [() => props.capaId],
  async (db, [id]) => (id ? db.Capa.findByPk(id) : null),
  { models: ['Capa'] },
)

// Template steps from the workflow version selected on the CAPA. Only
// roots — child steps render nested under their parent via CapaWorkflowStep
// once the workflow actually launches; in draft we just show the top-level
// plan so it doesn't get noisy.
const templateSteps = useLiveQueryWithDeps(
  [() => capa.value?.workflowVersionId],
  async (db, [versionId]) => {
    if (!versionId) return []
    const all = await db.WorkflowStep.where('workflowVersionId', versionId)
      .orderBy('stepOrder', 'asc')
      .exec()
    return all.filter((s) => !s.parentStepId)
  },

  { models: ['WorkflowStep'], initial: [] },
)

// Role assignments per template step (WorkflowStepRole pivot), grouped by
// stepId so the per-step assignee picker can be filtered to users who hold
// at least one of the step's eligible roles.
const stepRoles = useLiveQueryWithDeps(
  [() => templateSteps.value.map((s) => s.id).join(',')],
  async (db, [idsStr]) => {
    const ids = idsStr ? idsStr.split(',') : []
    if (!ids.length) return {}
    const rows = await Promise.all(ids.map((id) => db.WorkflowStepRole.where('stepId', id).exec()))
    const map = {}
    ids.forEach((id, i) => {
      map[id] = rows[i].map((r) => r.roleId)
    })
    return map
  },

  { models: ['WorkflowStepRole'], initial: {} },
)

function rolesForStep(stepId) {
  return stepRoles.value[stepId] || []
}

// Approval steps stay internal even on a supplier-facing CAPA — final
// approval can't be delegated to the supplier; see submitCapaForReview.
function isApprovalStep(step) {
  return step?.stepType === 'APPROVAL'
}
function usesSupplierPickerFor(step) {
  return !!capa.value?.isSupplierFacing && !isApprovalStep(step)
}

// For a supplier-facing CAPA, the picker pool is the supplier's users
// (kind=EXTERNAL_SUPPLIER scoped to capa.supplierId). Surface that list
// here so we can auto-default each step to the first candidate — common
// case: one supplier POC user, no manual click needed.
const supplierUsers = useLiveQueryWithDeps(
  [() => capa.value?.supplierId, () => capa.value?.isSupplierFacing],
  async (db, [supplierId, isSupplierFacing]) => {
    if (!isSupplierFacing || !supplierId) return []
    const all = await db.User.where('supplierId', supplierId).exec()
    return all.filter((u) => u.kind === 'EXTERNAL_SUPPLIER' && u.userStatusId === 'ACTIVE')
  },

  { models: ['User'], initial: [] },
)

function currentAssignee(stepId) {
  const list = capa.value?.pendingReviewers?.[stepId]
  return Array.isArray(list) && list.length ? list[0] : null
}

const saving = ref(false)

// Single-user-per-step model. The backend `reviewers` map allows multi-user
// per step (the bulkCreate iterates the array) so we wrap the selected
// user in an array; if the owner ever needs multi-user we can swap the
// picker to multi-select without changing the persisted shape.
async function handleAssigneeChange(stepId, userId) {
  if (!capa.value) return
  saving.value = true
  try {
    const next = { ...(capa.value.pendingReviewers || {}) }
    if (userId) {
      next[stepId] = [userId]
    } else {
      delete next[stepId]
    }
    capa.value.pendingReviewers = next
    await capa.value.save()
  } catch (e) {
    toast.error(e?.message || 'Failed to save assignment')
  } finally {
    saving.value = false
  }
}

const hasWorkflow = computed(() => !!capa.value?.workflowVersionId)

// Auto-pick a sensible default for each step on a supplier-facing CAPA.
// One-shot — see NcWorkflowDraftPreview for the rationale.
//   APPROVAL step → owner (final approval stays internal)
//   other step    → first active supplier user (common case: one POC)
const autoDefaultDone = ref(false)
watch(
  [
    supplierUsers,
    templateSteps,
    () => capa.value?.isSupplierFacing,
    () => capa.value?.statusId,
    () => capa.value?.ownerId,
  ],
  ([users, steps, isSupplierFacing, statusId, ownerId]) => {
    if (autoDefaultDone.value) return
    if (!capa.value || !isSupplierFacing || statusId !== 'DRAFT') return
    if (!steps.length) return
    if (isSupplierFacing && !users.length && capa.value.supplierId) return
    const firstSupplierUserId = users.length ? users[0].id : null
    const next = { ...(capa.value.pendingReviewers || {}) }
    let changed = false
    for (const step of steps) {
      const existing = next[step.id]
      if (Array.isArray(existing) && existing.length) continue
      const defaultUserId = isApprovalStep(step) ? ownerId : firstSupplierUserId
      if (!defaultUserId) continue
      next[step.id] = [defaultUserId]
      changed = true
    }
    autoDefaultDone.value = true
    if (changed) {
      capa.value.pendingReviewers = next
      capa.value.save().catch(() => {})
    }
  },
  { immediate: true },
)
</script>

<template>
  <div
    v-if="capa && hasWorkflow"
    class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5 tw:flex tw:flex-col tw:gap-4"
  >
    <div class="tw:flex tw:items-center tw:justify-between tw:pb-3 tw:border-b tw:border-divider">
      <div>
        <BaseText as="h3" weight="bold">Workflow Plan</BaseText>
        <p class="tw:text-xs tw:text-secondary tw:mt-0.5">
          Assign a user to each step. The workflow launches with these assignments when you click
          <strong>Submit</strong>.
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
              v-if="capa.isSupplierFacing && isApprovalStep(step)"
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
          <!-- Supplier-facing CAPA: picker swaps to supplier users for
               the CAPA's supplier — EXCEPT APPROVAL steps, which stay
               internal (final approval can't be delegated). -->
          <!-- :required="true" — reviewer picker, never a filter; see
               NcWorkflowDraftPreview comment for full rationale. -->
          <UserSelectMenu
            v-if="isOwner && usesSupplierPickerFor(step)"
            :modelValue="currentAssignee(step.id)"
            kind="EXTERNAL_SUPPLIER"
            :supplierId="capa.supplierId"
            :required="true"
            @update:modelValue="(uid) => handleAssigneeChange(step.id, uid)"
          />
          <UserSelectMenu
            v-else-if="isOwner"
            :modelValue="currentAssignee(step.id)"
            :roleIdsFilter="rolesForStep(step.id)"
            :required="true"
            @update:modelValue="(uid) => handleAssigneeChange(step.id, uid)"
          />
          <div v-else class="tw:flex tw:items-center tw:gap-2">
            <UserBadgeById v-if="currentAssignee(step.id)" :userId="currentAssignee(step.id)" />
            <span v-else class="tw:text-xs tw:text-secondary tw:italic">Unassigned</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
