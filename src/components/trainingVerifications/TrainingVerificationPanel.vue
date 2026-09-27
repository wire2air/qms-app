<script setup>
import { IconCheck, IconChevronDown, IconChevronRight } from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession.js'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { get, post } from '@/api'
import { isAllowed } from '@/utils/currentSession.js'

const props = defineProps({
  instance: { type: Object, required: true },
})

const emit = defineEmits(['verified'])
const toast = useToast()

// The correct answers are no longer part of the instance snapshot (they used to
// sync straight into the learner's browser). Reviewers fetch them from the
// permission-gated endpoint instead; a failure just means no highlighting.
const answerKey = ref(null)
watch(
  () => props.instance?.id,
  async (id) => {
    answerKey.value = null
    if (!id) return
    try {
      const data = await get(`/v1/services/trainingInstances/${id}/answer-key`)
      answerKey.value = data?.answerKey ?? null
    } catch (err) {
      console.error('[training] could not load the assessment answer key', err)
    }
  },
  { immediate: true },
)

const training = useLiveQueryWithDeps(
  [() => props.instance?.trainingId],
  async (db, [id]) => (id ? db.Training.findByPk(id) : null),
  { models: ['Training'] },
)

// All assignees of this instance that are still pending verification.
// FAILED is included because the backend transitions the instance to
// PENDING_VERIFICATION once retries are exhausted — the manager still
// needs to either send for retraining or override-approve.
const pendingAssignees = useLiveQueryWithDeps(
  [() => props.instance?.id],
  async (db, [id]) => {
    if (!id) return []
    const all = await db.TrainingAssignee.where('trainingInstanceId', id).exec()
    return all.filter((a) => a.status === 'COMPLETED' || a.status === 'FAILED')
  },

  { models: ['TrainingAssignee'], initial: [] },
)

const isManager = computed(() => training.value?.managerId === currentSession.value?.userId)

/**
 * Who is accountable for verifying this training.
 *
 * The panel knew the manager all along — isManager above gates the whole
 * surface on it — but never said who it was. Someone looking at a pending
 * verification could not tell whose sign-off it was waiting on without
 * opening the training itself (reported 2026-09-27). It matters most to the
 * people who CANNOT act: the refusal below tells them only that they are not
 * the manager, not who is.
 */
const manager = useLiveQueryWithDeps(
  [() => training.value?.managerId],
  async (db, [id]) => (id ? db.User.findByPk(id) : null),
  { models: ['User'] },
)
const managerName = computed(() => {
  const m = manager.value
  if (!m) return ''
  return `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || m.email
})

// Selection — default to all pending whenever the instance changes
/**
 * Segregation of duties, mirrored from the server.
 *
 * Competency verification is a second person attesting that the learner can do
 * the job, so verifying yourself is not a control. The API refuses it outright
 * (controllers/trainingInstances.js — "You cannot verify your own training"),
 * but this panel offered the row anyway: `manager_id` may legitimately name
 * someone who is also in the cohort, and for them the checkbox was ticked BY
 * DEFAULT, the buttons were live, and Approve failed at the server.
 *
 * Reported 2026-09-27: "i can see approve, reject button and select checkboxes
 * and when press approve server rejects it, ideally it should be disabled."
 *
 * The rule is per ROW, not per panel — a manager who is one of several
 * trainees still verifies everybody else in the same action.
 */
const isSelf = (a) => a.userId === currentSession.value?.userId

/**
 * Who may move the accountability.
 *
 * Verification stays manager-only — deciding WHO the manager is, is admin
 * work, and `training_instances:manage` is the verb that already gates every
 * other administrative action on an instance. Offered to people who are NOT
 * the manager as well: they are exactly who hits the dead end when the named
 * manager is away or is themselves a trainee.
 */
const canReassignManager = computed(() => isAllowed(['training_instances:manage']))
const showReassign = ref(false)
const traineeUserIds = computed(() => (pendingAssignees.value ?? []).map((a) => a.userId))

const selectedAssigneeIds = ref([])
watch(
  () => pendingAssignees.value,
  (list) => {
    // Never pre-select yourself; the server would refuse the whole batch.
    selectedAssigneeIds.value = list.filter((a) => !isSelf(a)).map((a) => a.id)
  },
  { immediate: true },
)

function toggleAssignee(id) {
  const row = pendingAssignees.value.find((a) => a.id === id)
  if (row && isSelf(row)) return
  if (selectedAssigneeIds.value.includes(id)) {
    selectedAssigneeIds.value = selectedAssigneeIds.value.filter((x) => x !== id)
  } else {
    selectedAssigneeIds.value = [...selectedAssigneeIds.value, id]
  }
}

/** Rows this person may actually act on — everyone but themselves. */
const verifiableAssignees = computed(() => pendingAssignees.value.filter((a) => !isSelf(a)))

// Per-assignee answer review — manager can expand a row to see what the
// trainee picked vs. the correct answers. Uses the instance snapshot's
// assessment so question text/options match what the trainee actually saw,
// even if the source training was edited after launch.
const expandedAssigneeIds = ref(new Set())
function toggleExpand(id) {
  const next = new Set(expandedAssigneeIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedAssigneeIds.value = next
}
const assessmentQuestions = computed(() => props.instance?.snapshot?.assessment ?? [])
const passingScore = computed(() => props.instance?.snapshot?.passingScore ?? 70)

// Pass/fail: COMPLETED assignees passed the assessment; FAILED exhausted retries.
const isPassed = (a) => a.status === 'COMPLETED'
const selectedAssignees = computed(() =>
  pendingAssignees.value.filter((a) => selectedAssigneeIds.value.includes(a.id)),
)
// Approve (+ competency criteria) is only offered when EVERY selected employee
// passed. A mixed or all-failed selection can only be rejected → retraining.
const allSelectedPassed = computed(
  () => selectedAssignees.value.length > 0 && selectedAssignees.value.every(isPassed),
)
// Effective decision sent to the backend: a failed selection is always a reject.
const effectiveReject = computed(() => form.value.retrainingRequired || !allSelectedPassed.value)

function toggleAll() {
  if (selectedAssigneeIds.value.length === verifiableAssignees.value.length) {
    selectedAssigneeIds.value = []
  } else {
    selectedAssigneeIds.value = verifiableAssignees.value.map((a) => a.id)
  }
}

const form = ref({
  demonstratedUnderstanding: false,
  canPerformIndependently: false,
  practicalObservationCompleted: false,
  retrainingRequired: false,
  notes: '',
})

watch(
  () => props.instance?.id,
  () => {
    form.value = {
      demonstratedUnderstanding: false,
      canPerformIndependently: false,
      practicalObservationCompleted: false,
      retrainingRequired: false,
      notes: '',
    }
  },
)

const showEsignDialog = ref(false)
const submitting = ref(false)

const assigneeError = ref('')
const competencyError = ref('')

watch(selectedAssigneeIds, () => {
  if (selectedAssigneeIds.value.length > 0) assigneeError.value = ''
})

watch(
  () => [
    form.value.demonstratedUnderstanding,
    form.value.canPerformIndependently,
    form.value.practicalObservationCompleted,
    form.value.retrainingRequired,
  ],
  () => {
    competencyError.value = ''
  },
)

function openSignDialog() {
  assigneeError.value = ''
  competencyError.value = ''

  if (selectedAssigneeIds.value.length === 0) {
    assigneeError.value = 'Select at least one employee'
    return
  }
  // Approval requires the three competency confirmations. A failed selection is
  // always a reject, so the competency gate doesn't apply.
  if (!effectiveReject.value) {
    if (
      !form.value.demonstratedUnderstanding ||
      !form.value.canPerformIndependently ||
      !form.value.practicalObservationCompleted
    ) {
      competencyError.value = 'Confirm all three competency criteria or select Reject'
      return
    }
  }
  showEsignDialog.value = true
}

async function onEsignVerified(esign) {
  submitting.value = true
  try {
    const data = await post(`/v1/services/trainingInstances/${props.instance.id}/verify`, {
      assigneeIds: selectedAssigneeIds.value,
      demonstratedUnderstanding: !effectiveReject.value && form.value.demonstratedUnderstanding,
      canPerformIndependently: !effectiveReject.value && form.value.canPerformIndependently,
      practicalObservationCompleted:
        !effectiveReject.value && form.value.practicalObservationCompleted,
      retrainingRequired: effectiveReject.value,
      notes: form.value.notes,
      // The verifier's credential, not just their claimed method — the server
      // now authenticates this before writing the competency record.
      esign,
    })
    showEsignDialog.value = false
    const employeeLabel = `${data.verifiedCount} employee${data.verifiedCount === 1 ? '' : 's'}`
    const successMessage = form.value.retrainingRequired
      ? `Retraining instance launched for ${employeeLabel}`
      : `Verified ${employeeLabel}`
    toast.notify({ type: 'positive', message: successMessage })
    emit('verified', data)
  } catch (err) {
    toast.notify({ type: 'negative', message: err?.message || 'Verification failed' })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div v-if="!instance" class="tw:p-8 tw:text-center tw:text-secondary tw:italic">
    Select a training instance to verify.
  </div>
  <div v-else-if="!isManager" class="tw:p-8 tw:text-center tw:text-secondary">
    <p>
      Only the training manager can verify assignees for this training.
      <template v-if="managerName">That is {{ managerName }}.</template>
    </p>
    <!-- The dead end this refusal used to be: a manager on leave, or one who
         is a trainee on their own instance, left nothing that could move.
         Widening who may attest would weaken the control; moving the
         accountability does not. -->
    <BaseButton
      v-if="canReassignManager"
      variant="outline"
      size="sm"
      class="tw:mt-3"
      @click="showReassign = true"
    >
      Reassign verifier
    </BaseButton>
  </div>
  <BaseCard v-else class="tw:flex tw:flex-col tw:gap-5">
    <!-- Header -->
    <div class="tw:flex tw:items-start tw:justify-between">
      <div>
        <h2 class="tw:text-lg tw:font-semibold tw:text-on-sidebar">
          {{ instance.snapshot?.title || '—' }}
        </h2>
        <p class="tw:text-sm tw:text-secondary">
          Launched {{ instance.createdAt?.formatDate('date') }} · Passing score
          {{ instance.snapshot?.passingScore ?? 70 }}%
          <template v-if="managerName"> · Verified by {{ managerName }}</template>
        </p>
        <BaseButton
          v-if="canReassignManager"
          variant="secondary"
          size="sm"
          class="tw:mt-1"
          @click="showReassign = true"
        >
          Reassign verifier
        </BaseButton>
      </div>
      <TrainingInstanceStatusBadgeById :statusId="instance.status" />
    </div>

    <!-- Assignee selection -->
    <div class="tw:border tw:border-divider tw:rounded-lg">
      <div
        class="tw:flex tw:items-center tw:justify-between tw:px-4 tw:py-2 tw:border-b tw:border-divider tw:bg-gray-50"
      >
        <span class="tw:text-sm tw:font-semibold tw:text-on-sidebar">
          Employees ({{ selectedAssigneeIds.length }}/{{ pendingAssignees.length }} selected)
        </span>
        <button
          v-if="pendingAssignees.length > 1"
          class="tw:text-xs tw:text-primary tw:hover:underline"
          @click="toggleAll"
        >
          {{
            selectedAssigneeIds.length === pendingAssignees.length ? 'Deselect all' : 'Select all'
          }}
        </button>
      </div>
      <div class="tw:divide-y tw:divide-divider">
        <div v-for="a in pendingAssignees" :key="a.id">
          <div class="tw:flex tw:items-center tw:gap-3 tw:px-4 tw:py-2.5 tw:hover:bg-gray-50">
            <input
              type="checkbox"
              :checked="selectedAssigneeIds.includes(a.id)"
              :disabled="isSelf(a)"
              :title="isSelf(a) ? 'You cannot verify your own training' : undefined"
              :class="isSelf(a) ? 'tw:cursor-not-allowed' : 'tw:cursor-pointer'"
              @change="toggleAssignee(a.id)"
            />
            <UserBadgeById :userId="a.userId" />
            <BaseChip v-if="isSelf(a)" size="sm"> You — someone else must verify </BaseChip>
            <span
              class="tw:text-xs tw:font-semibold tw:px-1.5 tw:py-0.5 tw:rounded"
              :class="
                isPassed(a) ? 'tw:bg-green-100 tw:text-green-700' : 'tw:bg-red-100 tw:text-red-700'
              "
            >
              {{ isPassed(a) ? 'Passed' : 'Failed' }}
            </span>
            <span class="tw:text-xs tw:text-secondary tw:ml-auto"
              >Score: {{ a.score ?? '—' }}%</span
            >
            <span class="tw:text-xs tw:text-secondary">
              Completed
              <template v-if="a.completedAt">{{ a.completedAt.formatDate('date') }}</template>
            </span>
            <button
              v-if="assessmentQuestions.length"
              type="button"
              class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-primary tw:hover:underline tw:ml-2"
              @click="toggleExpand(a.id)"
            >
              <IconChevronDown v-if="expandedAssigneeIds.has(a.id)" :size="14" />
              <IconChevronRight v-else :size="14" />
              {{ expandedAssigneeIds.has(a.id) ? 'Hide answers' : 'View answers' }}
            </button>
          </div>
          <div
            v-if="expandedAssigneeIds.has(a.id) && assessmentQuestions.length"
            class="tw:px-4 tw:py-3 tw:bg-gray-50/60 tw:border-t tw:border-divider"
          >
            <TrainingAssessmentView
              :answers="a.assessmentAnswers ?? {}"
              :questions="assessmentQuestions"
              :passingScore="passingScore"
              :attemptCount="a.attemptCount ?? 0"
              :maxAttempts="instance.snapshot?.maxAttempts ?? 1"
              :readonly="true"
              :showCorrect="true"
              :answerKey="answerKey"
            />
          </div>
        </div>
      </div>
    </div>

    <p v-if="assigneeError" class="tw:text-sm tw:text-red-600">{{ assigneeError }}</p>

    <!-- Nothing this person may act on — every pending row is their own.
         Without this the buttons are simply dead: correct, but unexplained,
         which is how the previous version's server-side refusal felt. -->
    <div
      v-if="pendingAssignees.length && !verifiableAssignees.length"
      class="tw:border tw:border-amber-200 tw:bg-amber-50/60 tw:rounded-lg tw:p-3 tw:text-sm tw:text-amber-800"
    >
      This training is assigned to you, and competency verification has to be done by someone other
      than the trainee. Someone else with access to Training Verification must sign this
      off<template v-if="managerName"> — normally {{ managerName }}</template
      >.
    </div>

    <!-- Mixed/failed selection: approval is not available -->
    <div
      v-if="selectedAssigneeIds.length && !allSelectedPassed"
      class="tw:border tw:border-amber-200 tw:bg-amber-50/60 tw:rounded-lg tw:p-3 tw:text-sm tw:text-amber-800"
    >
      One or more selected employees didn't pass — only <strong>Reject &amp; Retraining</strong> is
      available. Select only passed employees to approve.
    </div>

    <!-- Competency criteria — only when every selected employee passed -->
    <div v-if="allSelectedPassed" class="tw:border tw:border-divider tw:rounded-lg tw:p-4">
      <BaseText as="h3" class="tw:text-sm tw:font-semibold tw:text-on-sidebar tw:mb-3">
        Manager Competency Verification
        <span v-if="managerName" class="tw:font-normal tw:text-secondary">
          — {{ managerName }}
        </span>
      </BaseText>
      <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
        <label class="tw:flex tw:items-start tw:gap-2 tw:cursor-pointer">
          <input
            v-model="form.demonstratedUnderstanding"
            type="checkbox"
            :disabled="form.retrainingRequired"
            class="tw:mt-0.5"
          />
          <span class="tw:text-sm">Employee demonstrated understanding</span>
        </label>
        <label class="tw:flex tw:items-start tw:gap-2 tw:cursor-pointer">
          <input
            v-model="form.canPerformIndependently"
            type="checkbox"
            :disabled="form.retrainingRequired"
            class="tw:mt-0.5"
          />
          <span class="tw:text-sm">Can perform task independently</span>
        </label>
        <label class="tw:flex tw:items-start tw:gap-2 tw:cursor-pointer">
          <input
            v-model="form.practicalObservationCompleted"
            type="checkbox"
            :disabled="form.retrainingRequired"
            class="tw:mt-0.5"
          />
          <span class="tw:text-sm">Practical observation completed</span>
        </label>
      </div>
    </div>

    <p v-if="competencyError" class="tw:text-sm tw:text-red-600">{{ competencyError }}</p>

    <!-- Reject toggle — a choice only when approval is possible (all passed).
         For a failed/mixed selection reject is forced, so the toggle is hidden. -->
    <div
      v-if="allSelectedPassed"
      class="tw:border tw:border-amber-200 tw:bg-amber-50/40 tw:rounded-lg tw:p-4"
    >
      <label class="tw:flex tw:items-start tw:gap-2 tw:cursor-pointer">
        <input v-model="form.retrainingRequired" type="checkbox" class="tw:mt-0.5" />
        <div>
          <span class="tw:text-sm tw:font-semibold tw:text-amber-800"
            >Reject — Retraining required</span
          >
          <p class="tw:text-xs tw:text-amber-700 tw:mt-0.5">
            Mark the selected employees as not yet competent. A new training instance will be
            launched for them.
          </p>
        </div>
      </label>
    </div>

    <!-- Notes -->
    <BaseField v-slot="{ id: fieldId }" label="Manager Notes">
      <BaseTextarea
        :id="fieldId"
        v-model="form.notes"
        :rows="3"
        placeholder="Add any observations or feedback..."
      />
    </BaseField>

    <!-- Actions -->
    <div class="tw:flex tw:items-center tw:justify-between tw:pt-3 tw:border-t tw:border-divider">
      <p class="tw:text-xs tw:text-secondary">
        {{
          effectiveReject
            ? 'A new training instance will be launched for the selected employees.'
            : 'Selected employees will be marked Verified upon approval.'
        }}
      </p>
      <BaseButton
        v-if="allSelectedPassed && !form.retrainingRequired"
        variant="primary"
        :loading="submitting"
        :disabled="!selectedAssigneeIds.length"
        @click="openSignDialog"
      >
        <IconCheck :size="16" class="tw:mr-1" />
        Approve & Close
      </BaseButton>
      <BaseButton
        v-else
        variant="danger"
        :loading="submitting"
        :disabled="!selectedAssigneeIds.length"
        @click="openSignDialog"
      >
        Reject & Send to Retraining
      </BaseButton>
    </div>

    <WorkflowInstanceEsignAuthDialog v-model="showEsignDialog" @verified="onEsignVerified" />
  </BaseCard>

  <TrainingReassignManagerDialog
    v-if="instance && canReassignManager"
    v-model="showReassign"
    :instanceId="instance.id"
    :traineeUserIds="traineeUserIds"
    :currentManagerId="training?.managerId ?? null"
  />
</template>
