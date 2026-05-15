<script setup>
import { IconChevronRight, IconBan, IconUserMinus } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { post } from '@/api'
import { DateTime } from 'luxon'

const props = defineProps({
  id: { type: String, required: true },
})

const router = useRouter()
const toast = useToast()
const canManage = computed(() => isAllowed(['trainingInstances:manage']))

// ─── Data ─────────────────────────────────────────────────────────────────────
const instance = useLiveQueryWithDeps([() => props.id], async (db, [id]) =>
  db.TrainingInstance.findByPk(id),
)

const allAssignees = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [instanceId]) => db.TrainingAssignee.where('trainingInstanceId', instanceId).exec(),
  { initial: [] },
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
    await post(`/v1/services/trainingInstances/${props.id}/cancel`, { reason: cancelReason.value.trim() })
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
  return { total, completed, verified, retrainRequired, failed, inProgress, assigned, submitted, progress, passRate }
})

// Instance needs manager verification if it's been moved to PENDING_VERIFICATION,
// or there are assignees who passed assessment but haven't been verified yet
// (covers pre-existing COMPLETED instances from before the verification flow shipped).
const needsVerification = computed(() => {
  if (!instance.value) return false
  if (instance.value.status === 'PENDING_VERIFICATION') return true
  if (instance.value.status === 'COMPLETED') {
    return allAssignees.value.some((a) => a.status === 'COMPLETED')
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
</script>

<template>
  <div v-if="loading" class="tw:flex tw:items-center tw:justify-center tw:h-64">
    <BaseSpinner />
  </div>
  <div v-else-if="!instance" class="tw:flex tw:items-center tw:justify-center tw:h-64 tw:text-secondary">
    Training instance not found.
  </div>
  <div v-else class="tw:flex tw:flex-col tw:gap-4 tw:p-5">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-1 tw:text-sm tw:text-secondary">
        <RouterLink :to="getCompanyPath('/training-instances')" class="tw:hover:text-primary">Training Instances</RouterLink>
        <IconChevronRight :size="14" />
        <span class="tw:text-on-sidebar tw:font-medium">{{ instance.snapshot?.title }}</span>
      </div>
    </SafeTeleport>

    <SafeTeleport v-if="canManage && ['ACTIVE', 'PENDING_VERIFICATION'].includes(instance.status)" to="#main-header-actions">
      <BaseButton variant="secondary" @click="openCancelDialog">
        <IconBan :size="16" class="tw:mr-1" /> Cancel Instance
      </BaseButton>
    </SafeTeleport>

    <SafeTeleport v-if="canManage && needsVerification" to="#main-header-actions">
      <BaseButton variant="primary" @click="router.push(getCompanyPath(`/training-verifications/${id}`))">
        Verify Training
      </BaseButton>
    </SafeTeleport>

    <!-- Header -->
    <div class="tw:flex tw:items-start tw:justify-between">
      <div>
        <h1 class="tw:text-2xl tw:font-bold tw:text-on-sidebar">{{ instance.snapshot?.title }}</h1>
        <div class="tw:flex tw:items-center tw:gap-2 tw:mt-1">
          <TrainingInstanceStatusBadgeById :statusId="instance.status" />
          <span
            v-if="instance.dueDate"
            class="tw:text-xs"
            :class="instanceOverdue && instance.status !== 'COMPLETED' ? 'tw:text-red-600 tw:font-medium' : 'tw:text-secondary'"
          >
            Due {{ instance.dueDate.formatDate('date') }}
            <span v-if="instanceOverdue && instance.status !== 'COMPLETED'">· overdue</span>
          </span>
          <span v-if="instanceCompletedAt" class="tw:text-xs tw:text-green-600 tw:font-medium">
            · Completed {{ instanceCompletedAt.formatDate('datetime') }}
          </span>
          <span v-if="instance.cancelledAt" class="tw:text-xs tw:text-red-600 tw:font-medium">
            · Cancelled {{ instance.cancelledAt.formatDate('date') }}
          </span>
        </div>
        <p v-if="instance.status === 'CANCELLED' && instance.cancelReason" class="tw:text-xs tw:text-secondary tw:italic tw:mt-1">
          Reason: {{ instance.cancelReason }}
        </p>
      </div>
    </div>

    <!-- Summary stats -->
    <div class="tw:grid tw:grid-cols-4 tw:gap-3">
      <div class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4">
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary">Assigned</p>
        <p class="tw:text-2xl tw:font-black tw:text-on-sidebar tw:mt-1">{{ stats.total }}</p>
      </div>
      <div class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4">
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary">Verified</p>
        <p class="tw:text-2xl tw:font-black tw:text-green-600 tw:mt-1">{{ stats.verified }}</p>
        <p v-if="stats.completed" class="tw:text-xs tw:text-amber-700 tw:mt-0.5">+{{ stats.completed }} pending</p>
      </div>
      <div class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4">
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary">Retraining</p>
        <p class="tw:text-2xl tw:font-black tw:mt-1" :class="stats.retrainRequired > 0 ? 'tw:text-orange-600' : 'tw:text-on-sidebar'">{{ stats.retrainRequired }}</p>
        <p v-if="stats.failed" class="tw:text-xs tw:text-red-600 tw:mt-0.5">{{ stats.failed }} failed</p>
      </div>
      <div class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4">
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary">Pass rate</p>
        <p
          class="tw:text-2xl tw:font-black tw:mt-1"
          :class="stats.passRate >= 70 ? 'tw:text-green-600' : (stats.submitted === 0 ? 'tw:text-on-sidebar' : 'tw:text-amber-600')"
        >
          {{ stats.passRate }}%
        </p>
      </div>
    </div>

    <!-- Assignee Progress -->
    <div class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-5">
      <h2 class="tw:text-lg tw:font-semibold tw:text-on-sidebar tw:mb-4">Assignee Progress</h2>
      <p v-if="!allAssignees.length" class="tw:text-sm tw:text-secondary tw:italic">No assignees.</p>

      <div v-else class="tw:flex tw:flex-col tw:gap-2">
        <div
          v-for="assignee in allAssignees"
          :key="assignee.id"
          class="tw:grid tw:grid-cols-[1fr_auto_auto_auto_auto_auto] tw:items-center tw:gap-4 tw:px-3 tw:py-2.5 tw:rounded-lg tw:border tw:border-divider tw:bg-white"
          :class="[
            isAssigneeOverdue(assignee) ? 'tw:border-red-200 tw:bg-red-50/30' : '',
            assignee.status === 'REMOVED' ? 'tw:opacity-60' : '',
          ]"
        >
          <div class="tw:flex tw:flex-col">
            <UserBadgeById :userId="assignee.userId" />
            <span v-if="assignee.status === 'REMOVED' && assignee.removalReason" class="tw:text-xs tw:text-secondary tw:italic tw:mt-1">
              Removed: {{ assignee.removalReason }}
            </span>
          </div>

          <span
            class="tw:text-xs"
            :class="isAssigneeOverdue(assignee) ? 'tw:text-red-600 tw:font-medium' : 'tw:text-secondary'"
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
    </div>

    <!-- Remove assignee dialog -->
    <BaseDialog :modelValue="!!removeTarget" :title="'Remove Assignee'" maxWidth="md" @update:modelValue="(v) => !v && closeRemoveDialog()">
      <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
        <div class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-amber-50 tw:border tw:border-amber-200">
          <div class="tw:text-amber-600 tw:shrink-0 tw:mt-0.5">⚠</div>
          <div class="tw:text-sm tw:text-amber-800">
            This assignee will be marked as <strong>Removed</strong> and their training task will be cancelled. The reason below is recorded in the audit log.
          </div>
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Reason</p>
          <BaseTextarea v-model="removeReason" :rows="3" placeholder="Why is this assignee being removed?" />
        </div>
      </div>
      <template #footer="{ close }">
        <BaseButton variant="secondary" @click="close">Cancel</BaseButton>
        <BaseButton
          variant="danger"
          :loading="removing"
          :disabled="!removeReason.trim()"
          @click="handleRemoveAssignee"
        >
          Remove Assignee
        </BaseButton>
      </template>
    </BaseDialog>

    <!-- Cancel instance dialog -->
    <BaseDialog v-model="showCancelDialog" title="Cancel Training Instance" maxWidth="md">
      <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
        <div class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-red-50 tw:border tw:border-red-200">
          <div class="tw:text-red-600 tw:shrink-0 tw:mt-0.5">⚠</div>
          <div class="tw:text-sm tw:text-red-800">
            All active training tasks for assigned employees will be cancelled. The reason below is
            recorded on the instance and in the audit log.
          </div>
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Reason</p>
          <BaseTextarea v-model="cancelReason" :rows="3" placeholder="Why is this training instance being cancelled?" />
        </div>
      </div>
      <template #footer="{ close }">
        <BaseButton variant="secondary" @click="close">Keep Active</BaseButton>
        <BaseButton variant="danger" :loading="cancelling" :disabled="!cancelReason.trim()" @click="handleCancel">
          <IconBan :size="16" class="tw:mr-1" /> Cancel Instance
        </BaseButton>
      </template>
    </BaseDialog>
  </div>
</template>
