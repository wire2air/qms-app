<script setup>
import { IconBan, IconUserMinus, IconListSearch } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { DateTime } from 'luxon'
import {
  buildTrainingInstanceBanners,
  buildTrainingInstanceSections,
  buildTrainingInstanceActions,
} from './trainingInstanceDetailConfig.js'

const props = defineProps({
  id: { type: String, required: true },
})

const router = useRouter()
const toast = useToast()
const canManage = computed(() => isAllowed(['training_instances:manage']))

// ─── Data ─────────────────────────────────────────────────────────────────────
const instance = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => db.TrainingInstance.findByPk(id),
  { models: ['TrainingInstance'] },
)

const allAssignees = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [instanceId]) => db.TrainingAssignee.where('trainingInstanceId', instanceId).exec(),

  { models: ['TrainingAssignee'], initial: [] },
)

const loading = computed(() => instance.value === undefined)

// Cancel instance
const showCancelDialog = ref(false)
const cancelReason = ref('')
const cancelling = ref(false)

function openCancelDialog() {
  cancelReason.value = ''
  showCancelDialog.value = true
}

async function handleCancel() {
  if (!cancelReason.value.trim()) return
  cancelling.value = true
  try {
    await post(`/v1/services/trainingInstances/${props.id}/cancel`, {
      reason: cancelReason.value.trim(),
    })
    showCancelDialog.value = false
    router.push(getCompanyPath('/training-instances'))
  } catch (err) {
    toast.notify({ type: 'negative', message: err.message || 'Failed to cancel' })
  } finally {
    cancelling.value = false
  }
}

// ─── Remove assignee ──────────────────────────────────────────────────────────
const removeTarget = ref(null) // the assignee being removed
const removeReason = ref('')
const removing = ref(false)

function openRemoveDialog(assignee) {
  removeTarget.value = assignee
  removeReason.value = ''
}

function closeRemoveDialog() {
  removeTarget.value = null
  removeReason.value = ''
}

async function handleRemoveAssignee() {
  if (!removeTarget.value || !removeReason.value.trim()) return
  removing.value = true
  try {
    await post(
      `/v1/services/trainingInstances/${props.id}/assignees/${removeTarget.value.id}/remove`,
      { reason: removeReason.value.trim() },
    )
    closeRemoveDialog()
  } catch (err) {
    toast.notify({ type: 'negative', message: err.message || 'Failed to remove assignee' })
  } finally {
    removing.value = false
  }
}

// ─── Stats ────────────────────────────────────────────────────────────────────
const stats = computed(() => {
  const all = allAssignees.value
  const total = all.length
  const completed = all.filter((a) => a.status === 'COMPLETED').length
  const verified = all.filter((a) => a.status === 'VERIFIED').length
  const retrainRequired = all.filter((a) => a.status === 'RETRAIN_REQUIRED').length
  const failed = all.filter((a) => a.status === 'FAILED').length
  const inProgress = all.filter((a) => a.status === 'IN_PROGRESS').length
  const assigned = all.filter((a) => a.status === 'ASSIGNED').length
  const passedAssessment = completed + verified + retrainRequired // anyone who reached terminal post-assessment
  const submitted = passedAssessment + failed
  const progress = total > 0 ? Math.round((submitted / total) * 100) : 0
  const passRate = total > 0 ? Math.round(((completed + verified) / total) * 100) : 0
  return {
    total,
    completed,
    verified,
    retrainRequired,
    failed,
    inProgress,
    assigned,
    submitted,
    progress,
    passRate,
  }
})

// Instance needs manager verification if it's been moved to PENDING_VERIFICATION,
// or there are assignees who reached a terminal assessment state (passed or
// failed-out-of-retries) but haven't been verified yet. Failed assignees
// still need the manager to decide retrain-vs-override, so they count.
const needsVerification = computed(() => {
  if (!instance.value) return false
  if (instance.value.status === 'PENDING_VERIFICATION') return true
  if (instance.value.status === 'COMPLETED') {
    return allAssignees.value.some((a) => a.status === 'COMPLETED' || a.status === 'FAILED')
  }
  return false
})

const instanceOverdue = computed(() => {
  const due = instance.value?.dueDate
  if (!due) return false
  return due < DateTime.now()
})

const instanceCompletedAt = computed(() => {
  if (instance.value?.status !== 'COMPLETED') return null
  const dates = allAssignees.value.map((a) => a.completedAt).filter(Boolean)
  if (!dates.length) return null
  return dates.reduce((max, d) => (d > max ? d : max), dates[0])
})

function isAssigneeOverdue(assignee) {
  return instanceOverdue.value && assignee.status !== 'COMPLETED'
}

// ─── Assessment review dialog ────────────────────────────────────────────────
// Manager (canManage) opens a popup with a single assignee's most recent
// answers, with correct/incorrect highlighting (showCorrect). Assignees who
// haven't attempted yet (attemptCount === 0) hide the link.
const reviewAssignee = ref(null)
const assessmentQuestions = computed(() => instance.value?.snapshot?.assessment ?? [])
const hasAssessment = computed(() => assessmentQuestions.value.length > 0)
function openAssessmentReview(assignee) {
  reviewAssignee.value = assignee
}
function closeAssessmentReview() {
  reviewAssignee.value = null
}

// ─── BaseDetailLayout config ──────────────────────────────────────────────────
const breadcrumbs = computed(() => [
  { label: 'Training Instances', to: getCompanyPath('/training-instances') },
  { label: instance.value?.snapshot?.title || 'Loading…' },
])
const trainingInstanceBanners = computed(() => buildTrainingInstanceBanners(instance.value))
const trainingInstanceActions = computed(() =>
  buildTrainingInstanceActions(
    {
      canManage: canManage.value,
      status: instance.value?.status,
      needsVerification: needsVerification.value,
      cancelling: cancelling.value,
    },
    {
      verify: () => router.push(getCompanyPath(`/training-verifications/${props.id}`)),
      openCancel: openCancelDialog,
    },
  ),
)
const trainingInstanceDetailConfig = computed(() =>
  defineDetailConfig({
    variant: 'standard',
    width: 'standard',
    breadcrumbs: breadcrumbs.value,
    banners: () => trainingInstanceBanners.value,
    actions: trainingInstanceActions.value,
    sections: buildTrainingInstanceSections(instance.value),
  }),
)
</script>

<template>
  <BaseDetailLayout
    :config="trainingInstanceDetailConfig"
    :record="instance"
    :loading="loading"
    :notFound="!loading && !instance"
    notFoundTitle="Training instance not found"
    notFoundDescription="This training instance could not be found."
  >
    <template #title>
      <span class="tw:text-base tw:font-semibold tw:text-on-main">{{
        instance?.snapshot?.title
      }}</span>
    </template>

    <template #status>
      <TrainingInstanceStatusBadgeById v-if="instance" :statusId="instance.status" />
    </template>

    <template v-if="instance" #meta>
      <span
        v-if="instance.dueDate"
        :class="
          instanceOverdue && instance.status !== 'COMPLETED' ? 'tw:text-red-600 tw:font-medium' : ''
        "
      >
        Due {{ instance.dueDate.formatDate('date') }}
        <span v-if="instanceOverdue && instance.status !== 'COMPLETED'">· overdue</span>
      </span>
      <span v-if="instanceCompletedAt" class="tw:text-green-600 tw:font-medium">
        · Completed {{ instanceCompletedAt.formatDate('datetime') }}
      </span>
      <span v-if="instance.cancelledAt" class="tw:text-red-600 tw:font-medium">
        · Cancelled {{ instance.cancelledAt.formatDate('date') }}
      </span>
    </template>

    <template #actions>
      <DetailActionBar :actions="trainingInstanceActions" />
    </template>

    <template v-if="instance" #section-details>
      <!-- Summary stats -->
      <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:lg:grid-cols-4 tw:gap-3">
        <div class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4">
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary">Assigned</p>
          <p class="tw:text-2xl tw:font-bold tw:text-on-sidebar tw:mt-1">{{ stats.total }}</p>
        </div>
        <div class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4">
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary">Verified</p>
          <p class="tw:text-2xl tw:font-bold tw:text-green-600 tw:mt-1">{{ stats.verified }}</p>
          <p v-if="stats.completed" class="tw:text-xs tw:text-amber-700 tw:mt-0.5">
            +{{ stats.completed }} pending
          </p>
        </div>
        <div class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4">
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary">Retraining</p>
          <p
            class="tw:text-2xl tw:font-bold tw:mt-1"
            :class="stats.retrainRequired > 0 ? 'tw:text-orange-600' : 'tw:text-on-sidebar'"
          >
            {{ stats.retrainRequired }}
          </p>
          <p v-if="stats.failed" class="tw:text-xs tw:text-red-600 tw:mt-0.5">
            {{ stats.failed }} failed
          </p>
        </div>
        <div class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4">
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary">Pass rate</p>
          <p
            class="tw:text-2xl tw:font-bold tw:mt-1"
            :class="
              stats.passRate >= 70
                ? 'tw:text-green-600'
                : stats.submitted === 0
                  ? 'tw:text-on-sidebar'
                  : 'tw:text-amber-600'
            "
          >
            {{ stats.passRate }}%
          </p>
        </div>
      </div>

      <!-- Assignee Progress -->
      <FormSection title="Assignee Progress">
        <p v-if="!allAssignees.length" class="tw:text-sm tw:text-secondary tw:italic">
          No assignees.
        </p>

        <div v-else class="tw:flex tw:flex-col tw:gap-2">
          <div
            v-for="assignee in allAssignees"
            :key="assignee.id"
            class="tw:grid tw:grid-cols-[1fr_auto_auto_auto_auto_auto_auto] tw:items-center tw:gap-4 tw:px-3 tw:py-2.5 tw:rounded-lg tw:border tw:border-divider tw:bg-white"
            :class="[
              isAssigneeOverdue(assignee) ? 'tw:border-red-200 tw:bg-red-50/30' : '',
              assignee.status === 'REMOVED' ? 'tw:opacity-60' : '',
            ]"
          >
            <div class="tw:flex tw:flex-col">
              <UserBadgeById :userId="assignee.userId" />
              <span
                v-if="assignee.status === 'REMOVED' && assignee.removalReason"
                class="tw:text-xs tw:text-secondary tw:italic tw:mt-1"
              >
                Removed: {{ assignee.removalReason }}
              </span>
            </div>

            <span
              class="tw:text-xs"
              :class="
                isAssigneeOverdue(assignee) ? 'tw:text-red-600 tw:font-medium' : 'tw:text-secondary'
              "
            >
              <template v-if="assignee.status === 'REMOVED' && assignee.removedAt">
                Removed {{ assignee.removedAt.formatDate('date') }}
              </template>
              <template v-else-if="assignee.completedAt">
                Completed {{ assignee.completedAt.formatDate('date') }}
              </template>
              <template v-else-if="instance.dueDate">
                Due {{ instance.dueDate.formatDate('date') }}
                <span v-if="isAssigneeOverdue(assignee)">· overdue</span>
              </template>
              <template v-else>No deadline</template>
            </span>

            <span class="tw:text-xs tw:text-secondary">
              Attempts: {{ assignee.attemptCount ?? 0 }}/{{ instance.snapshot?.maxAttempts ?? 1 }}
            </span>

            <span
              v-if="assignee.score !== null"
              class="tw:text-sm tw:font-semibold tw:w-12 tw:text-right"
              :class="assignee.status === 'COMPLETED' ? 'tw:text-green-600' : 'tw:text-red-600'"
            >
              {{ assignee.score }}%
            </span>
            <span v-else class="tw:text-sm tw:text-secondary tw:w-12 tw:text-right">—</span>

            <TrainingAssigneeStatusBadgeById :statusId="assignee.status" />

            <button
              v-if="canManage && hasAssessment && (assignee.attemptCount ?? 0) > 0"
              class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:text-primary tw:hover:underline"
              title="Review trainee's assessment answers"
              @click="openAssessmentReview(assignee)"
            >
              <IconListSearch :size="14" />
              View answers
            </button>
            <span v-else class="tw:w-[88px]" />

            <button
              v-if="canManage && ['ASSIGNED', 'IN_PROGRESS', 'FAILED'].includes(assignee.status)"
              class="tw:p-1 tw:rounded tw:text-secondary tw:hover:bg-red-50 tw:hover:text-red-600 tw:transition-colors"
              title="Remove assignee"
              @click="openRemoveDialog(assignee)"
            >
              <IconUserMinus :size="16" />
            </button>
            <span v-else class="tw:w-6" />
          </div>
        </div>
      </FormSection>
    </template>
  </BaseDetailLayout>

  <!-- Remove assignee dialog -->
  <BaseDialog
    :modelValue="!!removeTarget"
    :title="'Remove Assignee'"
    maxWidth="md"
    @update:modelValue="(v) => !v && closeRemoveDialog()"
  >
    <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
      <div
        class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-amber-50 tw:border tw:border-amber-200"
      >
        <div class="tw:text-amber-600 tw:shrink-0 tw:mt-0.5">⚠</div>
        <div class="tw:text-sm tw:text-amber-800">
          This assignee will be marked as <strong>Removed</strong> and their training task will be
          cancelled. The reason below is recorded in the audit log.
        </div>
      </div>
      <div>
        <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Reason</p>
        <BaseTextarea
          v-model="removeReason"
          :rows="3"
          placeholder="Why is this assignee being removed?"
        />
      </div>
    </div>
    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Remove Assignee"
        submitVariant="danger"
        :loading="removing"
        :disabled="!removeReason.trim()"
        @cancel="close"
        @submit="handleRemoveAssignee"
      />
    </template>
  </BaseDialog>

  <!-- Assessment review dialog (manager only) -->
  <BaseDialog
    :modelValue="!!reviewAssignee"
    title="Assessment Answers"
    maxWidth="3xl"
    @update:modelValue="(v) => !v && closeAssessmentReview()"
  >
    <div v-if="reviewAssignee" class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
      <div class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:flex-wrap">
        <div class="tw:flex tw:items-center tw:gap-3">
          <UserBadgeById :userId="reviewAssignee.userId" />
          <TrainingAssigneeStatusBadgeById :statusId="reviewAssignee.status" />
        </div>
        <div class="tw:flex tw:items-center tw:gap-3 tw:text-xs tw:text-secondary">
          <span>
            Score:
            <span
              class="tw:font-semibold"
              :class="
                reviewAssignee.status === 'COMPLETED' || reviewAssignee.status === 'VERIFIED'
                  ? 'tw:text-green-600'
                  : 'tw:text-red-600'
              "
            >
              {{ reviewAssignee.score ?? '—' }}%
            </span>
          </span>
          <span>
            Attempts: {{ reviewAssignee.attemptCount ?? 0 }}/{{
              instance.snapshot?.maxAttempts ?? 1
            }}
          </span>
        </div>
      </div>
      <TrainingAssessmentView
        :answers="reviewAssignee.assessmentAnswers ?? {}"
        :questions="assessmentQuestions"
        :passingScore="instance.snapshot?.passingScore ?? 70"
        :attemptCount="reviewAssignee.attemptCount ?? 0"
        :maxAttempts="instance.snapshot?.maxAttempts ?? 1"
        :readonly="true"
        :showCorrect="true"
      />
    </div>
    <template #footer="{ close }">
      <BaseButton variant="secondary" @click="close">Close</BaseButton>
    </template>
  </BaseDialog>

  <!-- Cancel instance dialog -->
  <BaseDialog v-model="showCancelDialog" title="Cancel Training Instance" maxWidth="md">
    <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
      <div
        class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-red-50 tw:border tw:border-red-200"
      >
        <div class="tw:text-red-600 tw:shrink-0 tw:mt-0.5">⚠</div>
        <div class="tw:text-sm tw:text-red-800">
          All active training tasks for assigned employees will be cancelled. The reason below is
          recorded on the instance and in the audit log.
        </div>
      </div>
      <div>
        <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Reason</p>
        <BaseTextarea
          v-model="cancelReason"
          :rows="3"
          placeholder="Why is this training instance being cancelled?"
        />
      </div>
    </div>
    <template #footer="{ close }">
      <BaseDialogFooter
        cancelLabel="Keep Active"
        submitLabel="Cancel Instance"
        submitVariant="danger"
        :loading="cancelling"
        :disabled="!cancelReason.trim()"
        @cancel="close"
        @submit="handleCancel"
      >
        <template #submitIcon><IconBan :size="16" /></template>
      </BaseDialogFooter>
    </template>
  </BaseDialog>
</template>
