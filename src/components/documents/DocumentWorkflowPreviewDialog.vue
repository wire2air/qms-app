<script setup>
import { IconPlus } from '@tabler/icons-vue'
import { useDocuments } from '@/composables/useDocuments.js'

const props = defineProps({
  documentId: { type: String, required: true },
  versionId: { type: String, required: true },
})
const emit = defineEmits(['confirm'])

const show = defineModel({ type: Boolean, default: false })

const toast = useToast()
const { submitForReview } = useDocuments()
const submitting = ref(false)

// ── Local data from IDB ───────────────────────────────────────────────────
const document = useLiveQueryWithDeps([() => props.documentId], async (db, [documentId]) =>
  db.Document.findByPk(documentId),
)

const allWorkflowSteps = useLiveQueryWithDeps(
  [() => document.value?.workflowVersionId],
  async (db, [workflowVersionId]) =>
    workflowVersionId
      ? db.WorkflowStep.where('workflowVersionId', workflowVersionId).orderBy('stepOrder').exec()
      : [],
  { initial: [] },
)

const stepIds = computed(() => allWorkflowSteps.value.map((s) => s.id))

const allStepRoles = useLiveQueryWithDeps(
  [stepIds],
  async (db, [stepIds]) => db.WorkflowStepRole.where('stepId', stepIds).exec(),
  { initial: [] },
)

// Role membership for any role that appears on any step. We feed this
// into the per-step candidate pool. Templates are role-only — no
// WorkflowStepUser fan-in for the document module — so the role membership
// set IS the pool.
const rolesOnUsers = useLiveQueryWithDeps(
  [allStepRoles],
  async (db, [allStepRoles]) => {
    const roleIds = [...new Set((allStepRoles ?? []).map((sr) => sr.roleId))]
    if (roleIds.length === 0) return []
    return await db.RoleOnUser.where('roleId', roleIds).exec()
  },
  { initial: [] },
)

// Role records for display (name on the role chip below the picker).
const stepRoleRecords = useLiveQueryWithDeps(
  [allStepRoles],
  async (db, [allStepRoles]) => {
    const roleIds = [...new Set((allStepRoles ?? []).map((sr) => sr.roleId))]
    if (roleIds.length === 0) return {}
    const roles = await Promise.all(roleIds.map((id) => db.Role.findByPk(id)))
    return Object.fromEntries(roles.filter(Boolean).map((r) => [r.id, r]))
  },
  { initial: {} },
)

const allUsers = useLiveQuery(
  async (db) => (await db.User.where().exec()).filter((u) => u.userStatusId === 'ACTIVE'),
  { initial: [] },
)

const usersById = computed(() => Object.fromEntries(allUsers.value.map((u) => [u.id, u])))

// Per-step view-model: candidate pool, role label, ALL/ANY policy.
// Picker pool:
//   - Step has roles → union of users in those roles (active only).
//   - Step has no roles → every active internal user. Matches the
//     no-friction template rule for small teams.
// The submitter picks any number ≥ 1 from this list; runtime ALL/ANY
// decides whether the step advances on first approval or only after
// every picked reviewer approves.
const steps = computed(() => {
  const rolesByStep = {}
  for (const sr of allStepRoles.value ?? []) {
    if (!rolesByStep[sr.stepId]) rolesByStep[sr.stepId] = []
    rolesByStep[sr.stepId].push(sr.roleId)
  }

  return allWorkflowSteps.value.map((step) => {
    const stepRoleIds = rolesByStep[step.id] ?? []

    let candidateUsers
    if (stepRoleIds.length === 0) {
      // Role-less step → every active internal user. Documents don't
      // run supplier-facing pickers, so kind=INTERNAL is implicit.
      candidateUsers = allUsers.value.filter((u) => u.kind !== 'EXTERNAL_SUPPLIER')
    } else {
      const candidateIdSet = new Set()
      for (const ru of rolesOnUsers.value) {
        if (stepRoleIds.includes(ru.roleId)) candidateIdSet.add(ru.userId)
      }
      candidateUsers = [...candidateIdSet].map((id) => usersById.value[id]).filter(Boolean)
    }

    const candidates = candidateUsers
      .map((u) => ({
        id: u.id,
        name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
        email: u.email,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    const roleNames = stepRoleIds.map((id) => stepRoleRecords.value[id]?.name).filter(Boolean)

    return {
      ...step,
      candidates,
      roleNames,
    }
  })
})

// Submitter's per-step picks. Keys are stepId, values are userId arrays.
// Reset every time the dialog opens so a previous cancelled draft
// doesn't pre-fill the next attempt.
const selections = reactive({})
watch(show, (isOpen) => {
  if (isOpen) {
    Object.keys(selections).forEach((key) => delete selections[key])
  }
})

// Every step that has at least one candidate must have at least one
// pick. Steps with no candidates (e.g. unrole'd system steps) don't
// need a pick — the backend's fallback handles them.
const allStepsPicked = computed(() => {
  return steps.value.every((s) => {
    if (s.candidates.length === 0) return true
    return Array.isArray(selections[s.id]) && selections[s.id].length > 0
  })
})

const loading = computed(() => document.value === undefined)

// ── Actions ────────────────────────────────────────────────────────────────
async function confirm() {
  if (!allStepsPicked.value) return
  // Strip empty entries so the body is `{ stepId: [u1, u2] }` only for
  // steps the submitter actually picked for.
  const reviewers = {}
  for (const [stepId, userIds] of Object.entries(selections)) {
    if (Array.isArray(userIds) && userIds.length > 0) reviewers[stepId] = userIds
  }
  submitting.value = true
  try {
    await submitForReview(props.documentId, props.versionId, reviewers)
    toast.success('Document submitted for review')
    emit('confirm')
    show.value = false
  } catch (e) {
    toast.error(e.message || 'Failed to submit for review')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" title="Submit for Review" maxWidth="lg" persistent>
    <div class="tw:max-h-[60vh] tw:overflow-auto">
      <div v-if="loading" class="tw:flex tw:items-center tw:justify-center tw:py-12">
        <div
          class="tw:animate-spin tw:rounded-full tw:size-10 tw:border-4 tw:border-primary tw:border-t-transparent"
        />
      </div>

      <div v-else class="tw:space-y-4">
        <p class="tw:text-sm tw:text-secondary tw:px-1">
          Pick the reviewer(s) for each step. The role on the step defines who's eligible;
          <strong>ALL</strong> / <strong>ANY</strong> decides at runtime whether every picked
          reviewer must approve or just the first.
        </p>

        <div v-for="(step, idx) in steps" :key="step.id" class="tw:relative tw:pl-8 tw:group">
          <!-- Vertical connector line -->
          <div
            v-if="idx < steps.length - 1"
            class="tw:absolute tw:left-2.75 tw:top-6 tw:bottom-0 tw:w-0.5 tw:bg-divider"
          ></div>

          <!-- Step circle indicator -->
          <div
            class="tw:absolute tw:left-0 tw:top-6 tw:size-6 tw:rounded-full tw:bg-main tw:border-2 tw:border-divider tw:flex tw:items-center tw:justify-center tw:text-secondary tw:z-10 tw:text-xs tw:font-bold"
          >
            {{ step.stepOrder }}
          </div>

          <!-- Step card -->
          <div
            class="tw:bg-main-hover tw:rounded-xl tw:border tw:border-dashed tw:border-divider tw:p-5"
          >
            <!-- Step header — name + ALL/ANY runtime policy + role chip(s) -->
            <div class="tw:mb-3 tw:flex tw:items-start tw:justify-between tw:gap-3">
              <div>
                <h3 class="tw:font-bold tw:text-on-main">
                  Step {{ step.stepOrder }}: {{ step.name }}
                </h3>
                <p class="tw:text-xs tw:text-secondary tw:mt-0.5">
                  {{
                    step.approvalRule === 'ANY'
                      ? 'ANY — first approval advances the step'
                      : 'ALL — every picked reviewer must approve to advance'
                  }}
                </p>
              </div>
              <span
                class="tw:shrink-0 tw:px-2 tw:py-0.5 tw:rounded-full tw:text-xs tw:font-bold tw:bg-primary/10 tw:text-primary"
              >
                {{ step.approvalRule }}
              </span>
            </div>

            <div
              v-if="step.roleNames.length"
              class="tw:text-[11px] tw:text-secondary tw:mb-2 tw:flex tw:flex-wrap tw:gap-1"
            >
              <span>Eligible roles:</span>
              <span
                v-for="name in step.roleNames"
                :key="name"
                class="tw:bg-secondary/10 tw:text-secondary tw:px-1.5 tw:py-0.5 tw:rounded"
              >
                {{ name }}
              </span>
            </div>

            <!-- Picker — multi-select scoped to role members.
                 The chips at "×" remove a single pick; the "+" chip at
                 the end propagates the click to the menu's button so the
                 dropdown opens for more picks (no stopPropagation on it,
                 unlike "×"). When nothing's picked yet the whole button
                 area shows the placeholder text — clicking anywhere
                 opens the dropdown, no "+" needed. -->
            <BaseSelectMenu
              v-if="step.candidates.length"
              v-model="selections[step.id]"
              :items="step.candidates"
              :multiple="true"
              :required="true"
            >
              <template #button="scope">
                <div
                  v-if="Array.isArray(selections[step.id]) && selections[step.id].length"
                  class="tw:flex tw:flex-wrap tw:items-center tw:gap-1"
                >
                  <span
                    v-for="uid in selections[step.id]"
                    :key="uid"
                    class="tw:text-xs tw:font-medium tw:bg-primary/10 tw:text-primary tw:px-2 tw:py-0.5 tw:rounded-full tw:flex tw:items-center tw:gap-1"
                  >
                    {{ step.candidates.find((c) => c.id === uid)?.name || uid }}
                    <button
                      class="tw:text-primary/70 tw:hover:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:p-0 tw:text-xs tw:leading-none"
                      @click.stop="scope.clear(uid)"
                    >
                      &times;
                    </button>
                  </span>
                  <span
                    v-if="selections[step.id].length < step.candidates.length"
                    class="tw:text-xs tw:font-medium tw:bg-transparent tw:text-primary tw:border tw:border-dashed tw:border-primary/40 tw:hover:border-primary tw:hover:bg-primary/5 tw:px-2 tw:py-0.5 tw:rounded-full tw:flex tw:items-center tw:gap-1 tw:cursor-pointer tw:transition-colors"
                  >
                    <IconPlus :size="12" />
                    Add reviewer
                  </span>
                </div>
                <span v-else class="tw:text-sm tw:text-placeholder"> Select reviewer(s)… </span>
              </template>
            </BaseSelectMenu>

            <p
              v-else-if="step.roleNames.length"
              class="tw:text-xs tw:text-amber-700 tw:bg-amber-50 tw:border tw:border-amber-200 tw:rounded tw:p-2"
            >
              No active users hold the role(s) configured for this step. Assign someone to the role
              before submitting, or pick a different workflow.
            </p>
            <p
              v-else
              class="tw:text-xs tw:text-amber-700 tw:bg-amber-50 tw:border tw:border-amber-200 tw:rounded tw:p-2"
            >
              No active internal users in your company yet — invite someone before submitting.
            </p>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <BaseButton variant="outline" :disabled="submitting" @click="show = false">Cancel</BaseButton>
      <BaseButton
        variant="primary"
        :disabled="submitting || !allStepsPicked"
        :title="
          !allStepsPicked
            ? 'Pick at least one reviewer for each step before submitting.'
            : undefined
        "
        @click="confirm"
      >
        {{ submitting ? 'Submitting…' : 'Submit for Review' }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>
