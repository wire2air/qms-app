<script setup>
/**
 * Draft-mode workflow preview. While the NC is in DRAFT (no workflow
 * instance exists yet) the owner needs to see the steps that will fire
 * once they click Open NC, and pre-assign a user to each step. Choices
 * are saved to `nc.pendingReviewers` ({ workflowStepId: [userId, …] })
 * on the row; `submitNcForReview` consumes that map to seed the
 * UserOnWorkflowInstanceStep rows when the workflow finally launches.
 *
 * Each step also renders its form schema read-only (2026-08-10) so the
 * whole process is visible BEFORE the NC is opened — same empty-preview
 * mode WorkflowStepForm uses for not-yet-started steps. Workflow
 * SELECTION lives in the page's rail card, not here.
 *
 * Mirrors CapaWorkflowDraftPreview — same shape, just keyed on NC.
 */
import DynamicForm from '@/components/form/DynamicForm.js'

const props = defineProps({
  ncId: { type: String, required: true },
  isOwner: { type: Boolean, default: false },
})

const toast = useToast()

const nc = useLiveQueryWithDeps(
  [() => props.ncId],
  async (db, [id]) => (id ? db.Nonconformance.findByPk(id) : null),
  { models: ['Nonconformance'] },
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
    return all.filter((u) => u.kind === 'EXTERNAL_SUPPLIER' && u.userStatusId === 'ACTIVE')
  },

  { models: ['User'], initial: [] },
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

// Step form for the read-only preview. APPROVAL steps render no form
// (pure approve/reject — same suppression as WorkflowStepForm).
function stepFormSchema(step) {
  if (isApprovalStep(step)) return []
  return Array.isArray(step?.formSchema) ? step.formSchema : []
}

// Initiator (createdBy) role membership — powers the internal auto-default
// below. No `initial` on purpose: undefined = still loading (must wait),
// [] = confirmed the initiator holds no roles.
const initiatorRoleIds = useLiveQueryWithDeps(
  [() => nc.value?.createdBy],
  async (db, [uid]) => {
    if (!uid) return []
    const rows = await db.RoleOnUser.where('userId', uid).exec()
    return rows.map((r) => r.roleId)
  },

  { models: ['RoleOnUser'] },
)

// Auto-pick a sensible default for each step so the owner doesn't have
// to click N times when the obvious choice applies. One-shot — once
// we've initialised the empty slots ONE TIME, the watcher stops touching
// pendingReviewers. Otherwise it fights the user: they remove an
// assignee, the syncBus refresh re-fires the watcher, the empty slot
// gets refilled, the picker flickers between cleared and the
// auto-default. After the first fill the user owns the field; explicit
// clears stick.
//
// Supplier-facing NC:  APPROVAL step → owner (final approval stays
//                      internal); other step → first active supplier user.
// Internal NC (rule 2026-08-10): every step whose candidate pool includes
//                      the INITIATOR (createdBy) defaults to them —
//                      role-less steps qualify everyone, role-gated steps
//                      require the initiator to hold one of the roles.
const autoDefaultDone = ref(false)

// Workflow selection happens in the page's rail card now — when the owner
// switches workflows there, the step list is new and the one-shot default
// must re-run for the new steps. Same when the audience flips (internal ↔
// supplier-facing): the page resets pendingReviewers, so the defaults for
// the OTHER pool must get their one shot.
watch(
  [() => nc.value?.workflowVersionId, () => nc.value?.isSupplierFacing],
  () => {
    autoDefaultDone.value = false
  },
)

watch(
  [
    supplierUsers,
    templateSteps,
    stepRoles,
    initiatorRoleIds,
    () => nc.value?.isSupplierFacing,
    () => nc.value?.statusId,
    () => nc.value?.ownerId,
    () => nc.value?.createdBy,
    () => props.isOwner,
  ],
  ([users, steps, rolesMap, initiatorRoles, isSupplierFacing, statusId, ownerId, createdBy, isOwner]) => {
    if (autoDefaultDone.value) return
    // The plan belongs to the owner/initiator — never write defaults from a
    // bystander's browser (the pickers are owner-only for the same reason).
    if (!isOwner) return
    if (!nc.value || statusId !== 'DRAFT') return
    if (!steps.length) return
    const next = { ...(nc.value.pendingReviewers || {}) }
    let changed = false
    if (isSupplierFacing) {
      // Wait for the supplier-users live query to resolve before we
      // declare done — otherwise we'd flip the flag with an empty list
      // and never get the auto-default.
      if (!users.length && nc.value.supplierId) return
      const firstSupplierUserId = users.length ? users[0].id : null
      for (const step of steps) {
        const existing = next[step.id]
        if (Array.isArray(existing) && existing.length) continue
        const defaultUserId = isApprovalStep(step) ? ownerId : firstSupplierUserId
        if (!defaultUserId) continue
        next[step.id] = [defaultUserId]
        changed = true
      }
    } else {
      if (!createdBy) return
      // Wait for BOTH role queries: the step-role map must cover every
      // step (else a role-gated step transiently looks role-less) and the
      // initiator's roles must be resolved (undefined = loading).
      if (initiatorRoles === undefined) return
      if (!steps.every((s) => Array.isArray(rolesMap[s.id]))) return
      for (const step of steps) {
        const existing = next[step.id]
        if (Array.isArray(existing) && existing.length) continue
        const roleIds = rolesMap[step.id]
        const qualified = !roleIds.length || roleIds.some((rid) => initiatorRoles.includes(rid))
        if (!qualified) continue
        next[step.id] = [createdBy]
        changed = true
      }
    }
    autoDefaultDone.value = true
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
  <div v-if="nc" class="tw:flex tw:flex-col tw:gap-4">
    <!-- No workflow yet (e.g. an NC spawned from a rejected QC lot) —
       selection lives in the rail's Workflow card now. -->
    <BaseCard v-if="!hasWorkflow" class="tw:text-sm tw:text-secondary tw:italic">
      {{
        isOwner
          ? 'No workflow selected yet — pick one from the Workflow card in the right rail.'
          : 'No workflow selected yet — the NC owner picks one before opening.'
      }}
    </BaseCard>

    <BaseCard v-if="hasWorkflow" class="tw:flex tw:flex-col tw:gap-4">
      <div class="tw:flex tw:items-center tw:justify-between tw:pb-3 tw:border-b tw:border-divider">
        <div>
          <BaseText as="h3" weight="bold" class="tw:flex tw:items-center tw:gap-2">
            Workflow Plan
            <span
              v-if="nc.isSupplierFacing"
              class="tw:text-micro tw:rounded tw:bg-violet-100 tw:text-violet-700 tw:px-1.5 tw:py-0.5 tw:font-normal"
              :title="'Supplier-facing: non-approval steps pick from this NC’s supplier users.'"
            >
              Supplier-facing
            </span>
            <span
              v-else
              class="tw:text-micro tw:rounded tw:bg-gray-100 tw:text-secondary tw:px-1.5 tw:py-0.5 tw:font-normal"
            >
              Internal
            </span>
          </BaseText>
          <p class="tw:text-xs tw:text-secondary tw:mt-0.5">
            Assign a user to each step. The workflow launches with these assignments when you click
            <strong>Open NC</strong>.
          </p>
        </div>
        <span v-if="saving" class="tw:text-xs tw:text-secondary">Saving…</span>
      </div>

      <div v-if="!templateSteps.length" class="tw:text-sm tw:text-secondary tw:italic">
        The selected workflow has no steps configured.
      </div>

      <div v-else class="tw:@container tw:flex tw:flex-col tw:gap-3">
        <div
          v-for="(step, idx) in templateSteps"
          :key="step.id"
          class="tw:flex tw:flex-col tw:gap-3 tw:px-4 tw:py-3 tw:rounded-lg tw:border tw:border-divider tw:bg-main-hover/30"
        >
          <div class="tw:flex tw:flex-col tw:gap-3 tw:@2xl:flex-row tw:@2xl:items-center">
          <div class="tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-3">
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
              <!-- Step-type chip — APPROVAL surfaces in amber, ACTION in
                 a quieter slate. Sits next to the picker-pool chip so
                 you can read each row in one glance. -->
              <span
                v-if="isApprovalStep(step)"
                class="tw:text-micro tw:rounded tw:bg-amber-50 tw:text-amber-700 tw:px-1.5 tw:py-0.5 tw:uppercase"
              >
                Approval
              </span>
              <span
                v-else
                class="tw:text-micro tw:rounded tw:bg-gray-100 tw:text-gray-600 tw:px-1.5 tw:py-0.5 tw:uppercase"
              >
                {{ step.stepType || 'Action' }}
              </span>
              <!-- Which pool does THIS step's picker draw from? Makes the
                 supplier-facing-NC-with-an-internal-picker case visible. -->
              <span
                v-if="usesSupplierPickerFor(step)"
                class="tw:text-micro tw:rounded tw:bg-violet-100 tw:text-violet-700 tw:px-1.5 tw:py-0.5"
                title="This step's picker is filtered to supplier users for this NC's supplier."
              >
                Supplier picker
              </span>
              <span
                v-else
                class="tw:text-micro tw:rounded tw:bg-gray-100 tw:text-gray-700 tw:px-1.5 tw:py-0.5"
                :title="
                  nc.isSupplierFacing
                    ? 'Approval steps stay internal even on supplier-facing records.'
                    : 'NC is not supplier-facing; assignees come from the template’s role pool.'
                "
              >
                Internal picker
              </span>
            </div>
            <div
              v-if="step.description"
              class="tw:text-xs tw:text-secondary tw:mt-0.5 tw:line-clamp-2"
            >
              {{ step.description }}
            </div>
          </div>
          </div>
          <div class="tw:w-full tw:shrink-0 tw:@2xl:w-72">
            <!-- Supplier-facing NC: picker swaps to supplier users for the
               NC's supplier, ignores the template's role pool — EXCEPT
               for APPROVAL steps, which stay on the internal role pool
               (final approval can't be delegated to the supplier).
               Backend refuses submit otherwise (see submitNcForReview). -->
            <!-- :required="true" — reviewer picker should never expose
               the "All" null option. The user can still clear the
               selection via the badge's × affordance; once cleared,
               the one-shot autoDefaultDone flag in this component
               prevents the watcher from re-filling. -->
            <UserSelectMenu
              v-if="isOwner && usesSupplierPickerFor(step)"
              :modelValue="currentAssignee(step.id)"
              kind="EXTERNAL_SUPPLIER"
              :supplierId="nc.supplierId"
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

          <!-- Step form, read-only (2026-08-10): the whole form is visible
             before the NC is opened. Same empty-preview mode
             WorkflowStepForm uses for steps nobody has started yet;
             filling happens once the workflow launches and the step's
             assignee gets their task. -->
          <div
            v-if="stepFormSchema(step).length"
            class="tw:border-t tw:border-divider tw:pt-3"
          >
            <p class="tw:text-micro tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-2">
              Step form — preview (fillable once the NC is opened)
            </p>
            <DynamicForm :fields="stepFormSchema(step)" :readonly="true" disabled :values="{}" />
          </div>
        </div>
      </div>
    </BaseCard>
  </div>
</template>
