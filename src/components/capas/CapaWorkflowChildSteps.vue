<script setup>
import {
  IconCheck,
  IconLoader2,
  IconAlertTriangle,
  IconArrowBackUp,
  IconPlus,
} from '@tabler/icons-vue'
import { DateTime } from 'luxon'
import { post } from '@/api'
import { currentSession } from '@/utils/currentSession.js'
import WorkflowStepActionsMenu from '@/components/workflow/WorkflowStepActionsMenu.vue'
import WorkflowStepForm from '@/components/workflow/WorkflowStepForm.vue'
import { CAPA_MODULE } from '@/components/workflow/workflowModule.js'

const props = defineProps({
  parentInstanceStepId: { type: String, required: true },
  parentStepNumber: { type: [Number, String], default: null },
  workflowInstanceId: { type: String, required: true },
  capaId: { type: String, required: true },
  isOwner: { type: Boolean, default: false },
  allowChildSteps: { type: Boolean, default: false },
})

const emit = defineEmits(['reassign'])

const toast = useToast()
const currentUserId = computed(() => currentSession.value?.id ?? currentSession.value?.userId)

const canAddChild = computed(() => props.isOwner && props.allowChildSteps)

const selectedChildId = ref(null)
const dialogOpen = ref(false)

const selectedChild = computed(
  () => childInstanceSteps.value.find((c) => c.id === selectedChildId.value) || null,
)

const dialogTitle = computed(() => {
  const child = selectedChild.value
  if (!child) return 'Step'
  return `${childStepLabel(child)} · ${childTitle(child)}`
})

function openChild(child) {
  selectedChildId.value = child.id
  dialogOpen.value = true
}

// ─── Add child step dialog ───────────────────────────────────────────────────
// Form state + submit logic live in <CapaAddChildStepDialog>; this component
// just owns the open/close ref.
const addDialogOpen = ref(false)

function openAddDialog() {
  addDialogOpen.value = true
}

// All children (template-spawned or ad-hoc) carry parentInstanceStepId pointing
// at this parent's instance row. One indexed lookup, no WorkflowStep fetch.
const childInstanceSteps = useLiveQueryWithDeps(
  [() => props.parentInstanceStepId],
  async (db, [parentInstanceStepId]) => {
    if (!parentInstanceStepId) return []
    const all = await db.WorkflowInstanceStep.where(
      'parentInstanceStepId',
      parentInstanceStepId,
    ).exec()
    return all.sort((a, b) => a.stepOrder - b.stepOrder)
  },
  { initial: [] },
)

// Template-spawned children store the policy flag on the WorkflowStep
// template; ad-hoc children (no stepId) carry it directly on the instance
// row. Build a lookup so we can pass the resolved flag to each row's
// WorkflowStepActionsMenu — without it, Mark Complete would skip the
// e-sign gate. Mirrors the fallback in WorkflowStep.vue.
const stepDefinitionsById = useLiveQueryWithDeps(
  [
    () =>
      childInstanceSteps.value
        .map((s) => s.stepId)
        .filter(Boolean)
        .join(','),
  ],
  async (db, [idsStr]) => {
    if (!idsStr) return {}
    const ids = [...new Set(idsStr.split(','))]
    const rows = await Promise.all(ids.map((id) => db.WorkflowStep.findByPk(id)))
    return Object.fromEntries(rows.filter(Boolean).map((r) => [r.id, r]))
  },
  { initial: {} },
)

function requireEsignatureFor(child) {
  const onInstance = child?.requireEsignature
  if (onInstance != null) return !!onInstance
  const def = child?.stepId ? stepDefinitionsById.value[child.stepId] : null
  return !!def?.requireEsignature
}

// ─── Per-row Complete & Advance state ────────────────────────────────────────
// The dialog (clicking a row) just saves+submits the form record. Completing
// the task is a separate, e-sign-gated action driven by the inline button
// below — restored to match the develop-branch UX. We need to know per child:
//   (a) whether the current user has an actionable TaskInstance on this step
//   (b) for form-bearing steps, whether they've already submitted the form
// Both are batched live queries keyed off the visible child ids.

const ACTIONABLE_TASK_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'FORM_SUBMITTED']

const tasksByChildStepId = useLiveQueryWithDeps(
  [() => childInstanceSteps.value.map((c) => c.id).join(','), () => currentUserId.value],
  async (db, [idsStr, userId]) => {
    if (!idsStr || !userId) return {}
    const ids = idsStr.split(',')
    const all = await Promise.all(
      ids.map((id) =>
        db.TaskInstance.where('[sourceType+sourceId]', ['WorkflowInstanceStep', id]).exec(),
      ),
    )
    const map = {}
    for (const tasks of all) {
      for (const t of tasks) {
        if (t.assignedTo === userId && ACTIONABLE_TASK_STATUSES.includes(t.statusId)) {
          map[t.sourceId] = t
        }
      }
    }
    return map
  },
  { initial: {} },
)

// Current user's submitted CapaRecord (if any) per child step. We use this
// instead of TaskInstance.statusId because no backend code transitions tasks
// into FORM_SUBMITTED today — `submittedAt` on the record is the only
// authoritative signal that the assignee has finished filling the form.
const submittedRecordsByChildStepId = useLiveQueryWithDeps(
  [
    () => childInstanceSteps.value.map((c) => c.id).join(','),
    () => currentUserId.value,
    () => props.capaId,
  ],
  async (db, [idsStr, userId, capaId]) => {
    if (!idsStr || !userId || !capaId) return {}
    const ids = idsStr.split(',')
    const all = await Promise.all(
      ids.map((id) => db.CapaRecord.where('workflowInstanceStepId', id).exec()),
    )
    const map = {}
    for (const recs of all) {
      const r = recs.find(
        (rec) => rec.userId === userId && rec.capaId === capaId && rec.submittedAt != null,
      )
      if (r) map[r.workflowInstanceStepId] = r
    }
    return map
  },
  { initial: {} },
)

function childHasForm(child) {
  return Array.isArray(child.formSchema) && child.formSchema.length > 0
}

// "Complete & Advance" button visibility rule:
//   - Must be the assignee with an actionable task on this child step
//   - If the step has a form, the user must have already submitted it
//     (so they go through the dialog → Submit first; matches develop-branch UX)
//   - No-form steps: button shows immediately for the assignee
function canCompleteFor(child) {
  const task = tasksByChildStepId.value[child.id]
  if (!task) return false
  if (childHasForm(child)) {
    return !!submittedRecordsByChildStepId.value[child.id]
  }
  return true
}

const showEsignDialog = ref(false)
const pendingChildId = ref(null)
const completing = ref(null) // childId currently being completed (drives per-row disabled state)

function onCompleteClick(child) {
  if (completing.value) return
  pendingChildId.value = child.id
  if (requireEsignatureFor(child)) {
    showEsignDialog.value = true
  } else {
    performComplete()
  }
}

function onEsignVerified({ method, provider, token }) {
  showEsignDialog.value = false
  performComplete({ method, provider, token })
}

async function performComplete(esign = null) {
  const childId = pendingChildId.value
  if (!childId) return
  const task = tasksByChildStepId.value[childId]
  if (!task) return
  completing.value = childId
  try {
    const body = {
      action: 'COMPLETE_AND_ADVANCE',
      outcomeId: 'COMPLETE_AND_ADVANCE',
    }
    if (esign?.method) body.method = esign.method
    if (esign?.token) body.token = esign.token
    if (esign?.provider) body.provider = esign.provider
    await post(`/v1/services/taskInstances/${task.id}/action`, body)
    toast.success('Step completed')
  } catch (e) {
    toast.error(e?.message || 'Failed to complete step')
  } finally {
    completing.value = null
    pendingChildId.value = null
  }
}

const childAssignments = useLiveQueryWithDeps(
  [() => childInstanceSteps.value.map((s) => s.id).join(',')],
  async (db, [idsStr]) => {
    if (!idsStr) return []
    const ids = idsStr.split(',')
    const fetched = await Promise.all(
      ids.map((id) => db.UserOnWorkflowInstanceStep.where('workflowInstanceStepId', id).exec()),
    )
    return fetched.flat()
  },
  { initial: [] },
)

// Resolve the "currently assigned" user from UserOnWorkflowInstanceStep
// (rather than TaskInstance), because PENDING steps have an assignment row
// but no task yet — tasks are only created when the step goes IN_PROGRESS.
function activeAssigneeIdFor(childInstanceStepId) {
  const rows = childAssignments.value.filter(
    (a) => a.workflowInstanceStepId === childInstanceStepId && a.statusId !== 'REASSIGNED',
  )
  if (!rows.length) return null
  const preferred = rows.find((a) => a.statusId === 'ASSIGNED' || a.statusId === 'PENDING')
  return (preferred ?? rows[0]).userId
}

function childTitle(child) {
  return child.name || 'Step'
}

function childStepLabel(child) {
  const ordinal = childInstanceSteps.value.findIndex((c) => c.id === child.id) + 1
  if (!ordinal) return ''
  return props.parentStepNumber != null ? `${props.parentStepNumber}.${ordinal}` : `${ordinal}`
}

function childDueDate(child) {
  if (!child.startedAt || !child.slaDays) return null
  return child.startedAt.plus({ days: child.slaDays })
}

function isOverdue(child) {
  if (child.statusId !== 'IN_PROGRESS') return false
  const due = childDueDate(child)
  return !!due && due < DateTime.now()
}

function daysOverdue(child) {
  const due = childDueDate(child)
  if (!due) return 0
  return Math.floor(DateTime.now().diff(due, 'days').days)
}

function getBadgeClass(child) {
  if (isOverdue(child)) return 'tw:bg-red-100 tw:text-red-700'
  return {
    IN_PROGRESS: 'tw:bg-blue-100 tw:text-blue-700',
    PENDING: 'tw:bg-gray-100 tw:text-gray-600',
    APPROVED: 'tw:bg-green-100 tw:text-green-700',
    CANCELLED: 'tw:bg-red-100 tw:text-red-700',
    SENT_BACK: 'tw:bg-orange-100 tw:text-orange-700',
  }[child.statusId]
}

function getStatusLabel(child) {
  if (isOverdue(child)) return 'Overdue'
  const id = child.statusId
  if (!id) return '—'
  if (id === 'APPROVED') return 'Done'
  if (id === 'IN_PROGRESS') return 'In progress'
  if (id === 'SENT_BACK') return 'Sent back'
  if (id === 'PENDING') return 'Pending'
  return id.replace('_', ' ')
}

function getRowClass(child) {
  if (isOverdue(child)) return 'tw:bg-red-50/60 tw:border-red-100'
  if (child.statusId === 'IN_PROGRESS') return 'tw:bg-blue-50/60 tw:border-blue-100'
  return 'tw:bg-white tw:border-divider'
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-2">
    <div v-if="canAddChild" class="tw:flex tw:justify-end">
      <BaseButton variant="outline" size="sm" @click="openAddDialog">
        <template #icon><IconPlus :size="14" /></template>
        Add child step
      </BaseButton>
    </div>

    <div
      v-for="child in childInstanceSteps"
      :key="child.id"
      class="tw:flex tw:items-center tw:gap-3 tw:px-4 tw:py-3 tw:border tw:rounded-lg tw:cursor-pointer tw:hover:shadow-sm tw:transition-shadow"
      :class="getRowClass(child)"
      @click="openChild(child)"
    >
      <!-- Status icon -->
      <div class="tw:shrink-0">
        <div
          v-if="child.statusId === 'APPROVED'"
          class="tw:size-6 tw:rounded-full tw:bg-green-500 tw:flex tw:items-center tw:justify-center"
        >
          <IconCheck :size="14" class="tw:text-white" stroke-width="3" />
        </div>
        <div
          v-else-if="isOverdue(child)"
          class="tw:size-6 tw:rounded-full tw:bg-red-100 tw:flex tw:items-center tw:justify-center"
        >
          <IconAlertTriangle :size="14" class="tw:text-red-600" />
        </div>
        <div
          v-else-if="child.statusId === 'IN_PROGRESS'"
          class="tw:size-6 tw:rounded-full tw:border-2 tw:border-blue-400 tw:flex tw:items-center tw:justify-center"
        >
          <IconLoader2 :size="14" class="tw:text-blue-600 tw:animate-spin" />
        </div>
        <div
          v-else-if="child.statusId === 'SENT_BACK'"
          class="tw:size-6 tw:rounded-full tw:border-2 tw:border-amber-400 tw:flex tw:items-center tw:justify-center"
        >
          <IconArrowBackUp :size="14" class="tw:text-amber-600" />
        </div>
        <div
          v-else
          class="tw:size-6 tw:rounded-full tw:border-2 tw:border-gray-300 tw:bg-white"
        ></div>
      </div>

      <!-- Title block -->
      <div class="tw:flex tw:flex-col tw:min-w-0 tw:flex-1">
        <div class="tw:text-sm tw:font-semibold tw:text-on-main tw:truncate">
          {{ childStepLabel(child) }} · {{ childTitle(child) }}
        </div>
        <div
          class="tw:text-xs tw:mt-0.5"
          :class="isOverdue(child) ? 'tw:text-red-600' : 'tw:text-secondary'"
        >
          <template v-if="child.statusId === 'APPROVED'">
            <span v-if="child.completedAt"
              >Completed {{ child.completedAt.formatDate('date') }}</span
            >
            <span v-else>Completed</span>
          </template>
          <template v-else-if="isOverdue(child)">
            Was due {{ childDueDate(child).formatDate('date') }} · {{ daysOverdue(child) }} days
            overdue
          </template>
          <template v-else-if="child.statusId === 'IN_PROGRESS'">
            <span v-if="childDueDate(child)">Due {{ childDueDate(child).formatDate('date') }}</span>
            <span v-else>In progress</span>
          </template>
          <template v-else-if="child.statusId === 'SENT_BACK'">Sent back</template>
          <template v-else>Pending</template>
        </div>
      </div>

      <!-- Right cluster -->
      <div class="tw:flex tw:items-center tw:gap-2 tw:shrink-0" @click.stop>
        <UserAvatarById
          v-if="activeAssigneeIdFor(child.id)"
          :userId="activeAssigneeIdFor(child.id)"
          :showCardOnClick="true"
          class="tw:size-7"
        />
        <span v-else class="tw:text-xs tw:text-secondary">—</span>
        <!-- Complete & Advance — only renders for the assignee once the form
             is submitted (or immediately for no-form steps). E-sign is gated
             on the child step's requireEsignature flag. Clicking this is the
             only way to fire COMPLETE_AND_ADVANCE on a child step, so the
             actions menu below hides that outcome to avoid duplicate paths. -->
        <button
          v-if="canCompleteFor(child)"
          class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-green-700 tw:hover:underline tw:cursor-pointer tw:font-medium tw:disabled:opacity-50 tw:disabled:cursor-not-allowed"
          :disabled="completing === child.id"
          @click="onCompleteClick(child)"
        >
          <IconCheck :size="14" />
          {{ completing === child.id ? 'Completing…' : 'Complete & Advance' }}
        </button>
        <BaseBadge class="tw:text-[10px]" :class="getBadgeClass(child)">
          {{ getStatusLabel(child) }}
        </BaseBadge>
        <WorkflowStepActionsMenu
          :module="CAPA_MODULE"
          :instanceStepId="child.id"
          :resourceId="capaId"
          :isOwner="isOwner"
          :requireEsignature="requireEsignatureFor(child)"
          :hideOutcomes="['COMPLETE_AND_ADVANCE']"
          @reassign="(id) => emit('reassign', id)"
        />
      </div>
    </div>

    <BaseDialog v-model="dialogOpen" :title="dialogTitle" maxWidth="2xl">
      <WorkflowStepForm
        v-if="selectedChildId"
        :module="CAPA_MODULE"
        :instanceStepId="selectedChildId"
        :resourceId="capaId"
      />
    </BaseDialog>

    <CapaAddChildStepDialog
      v-model="addDialogOpen"
      :capaId="capaId"
      :parentInstanceStepId="parentInstanceStepId"
    />

    <WorkflowInstanceEsignAuthDialog v-model="showEsignDialog" @verified="onEsignVerified" />
  </div>
</template>
