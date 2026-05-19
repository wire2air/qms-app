<script setup>
import { IconUserCheck, IconArrowBackUp, IconDeviceFloppy, IconSend } from '@tabler/icons-vue'
import DynamicForm from '@/components/form/DynamicForm.js'
import FormSchemaReadonlyView from '@/components/form/FormSchemaReadonlyView.vue'
import { currentSession } from '@/utils/currentSession.js'
import { db } from '@models/index'
import { DateTime } from 'luxon'

const props = defineProps({
  instanceStepId: { type: String, required: true },
  ncId: { type: String, required: true },
  isOwner: { type: Boolean, default: false },
  hasSendBackTargets: { type: Boolean, default: false },
})

const emit = defineEmits(['reassign', 'sendBack'])

const toast = useToast()
const currentUserId = computed(() => currentSession.value?.userId)

// ─── Step instance + definition ──────────────────────────────────────────────
const nc = useLiveQueryWithDeps(
  [() => props.ncId],
  async (db, [id]) => (id ? db.Nonconformance.findByPk(id) : null),
)

const instanceStep = useLiveQueryWithDeps(
  [() => props.instanceStepId],
  async (db, [id]) => (id ? db.WorkflowInstanceStep.findByPk(id) : null),
)

const formSchema = computed(() => instanceStep.value?.formSchema || [])

// ─── Assignments + users ─────────────────────────────────────────────────────
const assignments = useLiveQueryWithDeps(
  [() => props.instanceStepId],
  async (db, [id]) => {
    if (!id) return []
    return db.UserOnWorkflowInstanceStep.where('workflowInstanceStepId', id).exec()
  },
  { initial: [] },
)

const usersMap = useLiveQueryWithDeps(
  [() => assignments.value.map((a) => a.userId).join(',')],
  async (db, [userIdsStr]) => {
    if (!userIdsStr) return {}
    const userIds = [...new Set(userIdsStr.split(','))]
    const users = await Promise.all(userIds.map((id) => db.User.findByPk(id)))
    return Object.fromEntries(users.filter(Boolean).map((u) => [u.id, u]))
  },
  { initial: {} },
)

// ─── NC records for this step ────────────────────────────────────────────────
const records = useLiveQueryWithDeps(
  [() => props.instanceStepId, () => props.ncId],
  async (db, [stepInstanceId, ncId]) => {
    if (!stepInstanceId || !ncId) return []
    const all = await db.NcRecord.where('workflowInstanceStepId', stepInstanceId).exec()
    return all.filter((r) => r.ncId === ncId)
  },
  { initial: [] },
)

const currentUserRecord = computed(
  () => records.value.find((r) => r.userId === currentUserId.value) || null,
)

const submittedRecords = computed(() => records.value.filter((r) => r.submittedAt))

// ─── Current user's task on this step ────────────────────────────────────────
const currentUserTask = useLiveQueryWithDeps(
  [() => props.instanceStepId, () => currentUserId.value],
  async (db, [stepInstanceId, userId]) => {
    if (!stepInstanceId || !userId) return null
    const tasks = await db.TaskInstance.where('[sourceType+sourceId]', [
      'WorkflowInstanceStep',
      stepInstanceId,
    ]).exec()
    return tasks.find((t) => t.assignedTo === userId) || null
  },
)

// Editability: user can create / update the NcRecord while their task is
// still in ASSIGNED state. Once the task transitions (submitted, approved,
// rejected, reassigned, cancelled), the form locks.
const isEditable = computed(() => currentUserTask.value?.statusId === 'ASSIGNED')

// ─── Form state — local working copy, seeded once from the IDB record ────────
const formData = ref({})
const saving = ref(false)
let formSeeded = false

watch(
  [currentUserRecord, nc],
  ([record, ncRecord]) => {
    if (record && !formSeeded) {
      formData.value = {
        ...(record.payload || {}),
        _parent_problem: ncRecord?.description ?? '',
      }
      formSeeded = true
    }
  },
  { immediate: true },
)

// Keep the NC description in sync if the NC is updated after the form is seeded
watch(nc, (ncRecord) => {
  if (formSeeded) {
    formData.value._parent_problem = ncRecord?.description ?? ''
  }
})

async function persistRecord({ submit }) {
  if (saving.value) return
  if (!currentUserTask.value) {
    toast.error('No task assigned to you for this step')
    return
  }
  if (!instanceStep.value) return
  saving.value = true
  try {
    // Strip context-only keys (prefixed with _nc_) before persisting
    const { _parent_problem: _1, ...payload } = formData.value || {}
    const existing = currentUserRecord.value
    const submittedAt = submit ? DateTime.now() : (existing?.submittedAt ?? null)
    if (existing) {
      existing.payload = payload
      if (submit) existing.submittedAt = submittedAt
      await existing.save()
    } else {
      const record = db.NcRecord.create({
        ncId: props.ncId,
        workflowInstanceStepId: props.instanceStepId,
        taskInstanceId: currentUserTask.value.id,
        payload,
        submittedAt,
      })
      await record.save()
    }
    toast.success(submit ? 'Form submitted' : 'Draft saved')
  } catch (e) {
    toast.error(e.message || 'Failed to save form')
  } finally {
    saving.value = false
  }
}

function saveDraft() {
  return persistRecord({ submit: false })
}

function submitForm() {
  return persistRecord({ submit: true })
}

// ─── Display helpers ─────────────────────────────────────────────────────────
function getUserName(userId) {
  const u = usersMap.value[userId]
  if (!u) return '—'
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email
}

function getUserEmail(userId) {
  return usersMap.value[userId]?.email || '—'
}

function getStepStatusClass(statusId) {
  return {
    'tw:bg-blue-100 tw:text-blue-700': statusId === 'IN_PROGRESS',
    'tw:bg-gray-100 tw:text-gray-600': statusId === 'PENDING',
    'tw:bg-green-100 tw:text-green-700': statusId === 'APPROVED',
    'tw:bg-red-100 tw:text-red-700': statusId === 'CANCELLED',
    'tw:bg-orange-100 tw:text-orange-700': statusId === 'SENT_BACK',
  }
}

function getUserStatusClass(statusId) {
  return {
    'tw:bg-gray-100 tw:text-gray-600': statusId === 'PENDING',
    'tw:bg-blue-100 tw:text-blue-700': statusId === 'ASSIGNED',
    'tw:bg-green-100 tw:text-green-700': statusId === 'APPROVED',
    'tw:bg-red-100 tw:text-red-700': statusId === 'REJECTED',
    'tw:bg-orange-100 tw:text-orange-700': statusId === 'REASSIGNED',
    'tw:bg-yellow-100 tw:text-yellow-700': statusId === 'CANCELLED',
  }
}

function getStatusLabel(statusId) {
  if (!statusId) return '—'
  if (statusId === 'APPROVED') return 'Completed'
  return statusId.replace('_', ' ')
}

const canReassign = computed(() => {
  const status = instanceStep.value?.statusId
  return (
    props.isOwner && (status === 'PENDING' || status === 'IN_PROGRESS' || status === 'SENT_BACK')
  )
})

const canSendBack = computed(
  () => props.isOwner && instanceStep.value?.statusId === 'IN_PROGRESS' && props.hasSendBackTargets,
)
</script>

<template>
  <div
    v-if="instanceStep"
    class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5"
  >
    <!-- Step header -->
    <div
      class="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
    >
      <div class="tw:flex tw:items-center tw:gap-2 tw:min-w-0">
        <span
          class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider"
        >
          {{ instanceStep.stepNumber }}. {{ instanceStep.name || 'Step' }}
        </span>
        <BaseBadge class="tw:text-[10px]" :class="getStepStatusClass(instanceStep.statusId)">
          {{ getStatusLabel(instanceStep.statusId) }}
        </BaseBadge>
      </div>
      <div class="tw:flex tw:items-center tw:gap-2">
        <button
          v-if="canSendBack"
          class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-amber-600 tw:hover:text-amber-700 tw:cursor-pointer tw:font-medium"
          @click="emit('sendBack')"
        >
          <IconArrowBackUp :size="14" />
          Send back
        </button>
        <button
          v-if="canReassign"
          class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-primary tw:hover:underline tw:cursor-pointer tw:font-medium"
          @click="emit('reassign', instanceStepId)"
        >
          <IconUserCheck :size="14" />
          Reassign
        </button>
      </div>
    </div>

    <!-- Assignees -->
    <div class="tw:mb-4">
      <div class="tw:text-[11px] tw:text-secondary tw:font-medium tw:mb-2">Assignees</div>
      <div v-if="assignments.length" class="tw:flex tw:flex-col tw:gap-2">
        <div
          v-for="assignment in assignments"
          :key="assignment.id"
          class="tw:flex tw:items-center tw:gap-2"
        >
          <UserAvatarById :userId="assignment.userId" class="tw:size-8" />
          <div class="tw:flex tw:flex-col tw:gap-1 tw:min-w-0">
            <div>
              <span class="tw:text-xs tw:text-on-main tw:font-medium">
                {{ getUserName(assignment.userId) }}
              </span>
              <span
                class="tw:text-[9px] tw:px-1.5 tw:py-0.5 tw:rounded tw:font-medium tw:shrink-0 tw:ml-1"
                :class="getUserStatusClass(assignment.statusId)"
              >
                {{ getStatusLabel(assignment.statusId) }}
              </span>
            </div>
            <span class="tw:text-xs tw:text-secondary tw:truncate">
              {{ getUserEmail(assignment.userId) }}
            </span>
          </div>
        </div>
      </div>
      <span v-else class="tw:text-sm tw:text-secondary">—</span>
    </div>

    <!-- Step form -->
    <template v-if="formSchema.length">
      <!-- Editable: current user has an ASSIGNED task on this step -->
      <template v-if="isEditable">
        <DynamicForm v-model="formData" :fields="formSchema" />
        <div class="tw:mt-4 tw:flex tw:justify-end tw:gap-2">
          <BaseButton variant="outline" :disabled="saving" @click="saveDraft">
            <template #icon><IconDeviceFloppy :size="16" /></template>
            {{ saving ? 'Saving…' : 'Save draft' }}
          </BaseButton>
          <BaseButton variant="primary" :disabled="saving" @click="submitForm">
            <template #icon><IconSend :size="16" /></template>
            Submit
          </BaseButton>
        </div>
      </template>

      <!-- Readonly: render every submitted record, plus the current user's draft if any. -->
      <template v-else>
        <div class="tw:text-[11px] tw:text-secondary tw:font-medium tw:mb-2">Form data</div>
        <div v-for="record in submittedRecords" :key="record.id" class="tw:mb-3">
          <div
            v-if="submittedRecords.length > 1"
            class="tw:text-[11px] tw:text-secondary tw:font-medium tw:mb-2"
          >
            {{ getUserName(record.userId) }}
          </div>
          <FormSchemaReadonlyView
            :fields="formSchema"
            :values="record.payload || {}"
          />
        </div>

        <div v-if="currentUserRecord && !currentUserRecord.submittedAt">
          <div class="tw:text-[11px] tw:text-amber-600 tw:font-medium tw:mb-2">
            Your draft (not submitted)
          </div>
          <FormSchemaReadonlyView
            :fields="formSchema"
            :values="currentUserRecord.payload || {}"
          />
        </div>

        <DynamicForm
          v-if="!submittedRecords.length && !currentUserRecord"
          :fields="formSchema"
          :readonly="true"
          disabled
          :values="{}"
        />
      </template>
    </template>
  </div>
</template>
