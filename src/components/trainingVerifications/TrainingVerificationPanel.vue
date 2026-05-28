<script setup>
import { IconCheck, IconChevronDown, IconChevronRight } from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession.js'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'

const props = defineProps({
  instance: { type: Object, required: true },
})

const emit = defineEmits(['verified'])
const toast = useToast()

const training = useLiveQueryWithDeps([() => props.instance?.trainingId], async (db, [id]) =>
  id ? db.Training.findByPk(id) : null,
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
  { initial: [] },
)

const isManager = computed(() => training.value?.managerId === currentSession.value?.userId)

// Selection — default to all pending whenever the instance changes
const selectedAssigneeIds = ref([])
watch(
  () => pendingAssignees.value,
  (list) => {
    selectedAssigneeIds.value = list.map((a) => a.id)
  },
  { immediate: true },
)

function toggleAssignee(id) {
  if (selectedAssigneeIds.value.includes(id)) {
    selectedAssigneeIds.value = selectedAssigneeIds.value.filter((x) => x !== id)
  } else {
    selectedAssigneeIds.value = [...selectedAssigneeIds.value, id]
  }
}

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

function toggleAll() {
  if (selectedAssigneeIds.value.length === pendingAssignees.value.length) {
    selectedAssigneeIds.value = []
  } else {
    selectedAssigneeIds.value = pendingAssignees.value.map((a) => a.id)
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

function openSignDialog() {
  if (selectedAssigneeIds.value.length === 0) {
    toast.notify({ type: 'negative', message: 'Select at least one employee' })
    return
  }
  if (!form.value.retrainingRequired) {
    if (
      !form.value.demonstratedUnderstanding ||
      !form.value.canPerformIndependently ||
      !form.value.practicalObservationCompleted
    ) {
      toast.notify({
        type: 'negative',
        message: 'Confirm all three competency criteria or select Reject',
      })
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
      demonstratedUnderstanding: form.value.demonstratedUnderstanding,
      canPerformIndependently: form.value.canPerformIndependently,
      practicalObservationCompleted: form.value.practicalObservationCompleted,
      retrainingRequired: form.value.retrainingRequired,
      notes: form.value.notes,
      signatureMethod: esign?.method ?? 'password',
    })
    showEsignDialog.value = false
    toast.notify({
      type: 'positive',
      message: form.value.retrainingRequired
        ? `Retraining instance launched for ${data.verifiedCount} employee${data.verifiedCount === 1 ? '' : 's'}`
        : `Verified ${data.verifiedCount} employee${data.verifiedCount === 1 ? '' : 's'}`,
    })
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
    Only the training manager can verify assignees for this training.
  </div>
  <div
    v-else
    class="tw:bg-white tw:rounded-xl tw:border tw:border-divider tw:p-5 tw:flex tw:flex-col tw:gap-5"
  >
    <!-- Header -->
    <div class="tw:flex tw:items-start tw:justify-between">
      <div>
        <h2 class="tw:text-lg tw:font-bold tw:text-on-sidebar">
          {{ instance.snapshot?.title || '—' }}
        </h2>
        <p class="tw:text-sm tw:text-secondary">
          Launched {{ instance.createdAt?.formatDate('date') }} · Passing score
          {{ instance.snapshot?.passingScore ?? 70 }}%
        </p>
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
              class="tw:cursor-pointer"
              @change="toggleAssignee(a.id)"
            />
            <UserBadgeById :userId="a.userId" />
            <span class="tw:text-xs tw:text-secondary tw:ml-auto">Score: {{ a.score ?? '—' }}%</span>
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
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Competency criteria -->
    <div class="tw:border tw:border-divider tw:rounded-lg tw:p-4">
      <p class="tw:text-sm tw:font-semibold tw:text-on-sidebar tw:mb-3">
        Manager Competency Verification
      </p>
      <div class="tw:grid tw:grid-cols-2 tw:gap-3">
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

    <!-- Reject -->
    <div class="tw:border tw:border-amber-200 tw:bg-amber-50/40 tw:rounded-lg tw:p-4">
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
    <div>
      <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Manager Notes</p>
      <BaseTextarea
        v-model="form.notes"
        :rows="3"
        placeholder="Add any observations or feedback..."
      />
    </div>

    <!-- Actions -->
    <div class="tw:flex tw:items-center tw:justify-between tw:pt-3 tw:border-t tw:border-divider">
      <p class="tw:text-xs tw:text-secondary">
        {{
          form.retrainingRequired
            ? 'A new training instance will be launched for the selected employees.'
            : 'Selected employees will be marked Verified upon approval.'
        }}
      </p>
      <BaseButton
        v-if="!form.retrainingRequired"
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
  </div>
</template>
