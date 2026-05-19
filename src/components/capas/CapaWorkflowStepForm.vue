<script setup>
import { IconDeviceFloppy, IconSend } from '@tabler/icons-vue'
import DynamicForm from '@/components/form/DynamicForm.js'
import FormSchemaReadonlyView from '@/components/form/FormSchemaReadonlyView.vue'
import { currentSession } from '@/utils/currentSession.js'
import { db } from '@models/index'
import { DateTime } from 'luxon'
import { post } from '@/api'

const props = defineProps({
  instanceStepId: { type: String, required: true },
  capaId: { type: String, required: true },
  // When true (used in the child-step dialog), submitting the form also
  // approves the reviewer's task and emits `done` so the parent dialog can
  // close. The main-step usage leaves this false — that flow uses
  // CapaStepActionsMenu for the approve action.
  autoApprove: { type: Boolean, default: false },
})

const emit = defineEmits(['done'])

const toast = useToast()
const currentUserId = computed(() => currentSession.value?.userId)

const capa = useLiveQueryWithDeps([() => props.capaId], async (db, [id]) =>
  id ? db.Capa.findByPk(id) : null,
)

const instanceStep = useLiveQueryWithDeps([() => props.instanceStepId], async (db, [id]) =>
  id ? db.WorkflowInstanceStep.findByPk(id) : null,
)

const formSchema = computed(() => instanceStep.value?.formSchema || [])
const hasForm = computed(() => formSchema.value.length > 0)

const records = useLiveQueryWithDeps(
  [() => props.instanceStepId, () => props.capaId],
  async (db, [stepInstanceId, capaId]) => {
    if (!stepInstanceId || !capaId) return []
    const all = await db.CapaRecord.where('workflowInstanceStepId', stepInstanceId).exec()
    return all.filter((r) => r.capaId === capaId)
  },
  { initial: [] },
)

const currentUserRecord = computed(
  () => records.value.find((r) => r.userId === currentUserId.value) || null,
)

const submittedRecords = computed(() => records.value.filter((r) => r.submittedAt))

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

const isEditable = computed(() => currentUserTask.value?.statusId === 'ASSIGNED')

const formData = ref({})
const saving = ref(false)
let formSeeded = false

watch(
  [currentUserRecord, capa],
  ([record, capaRecord]) => {
    if (record && !formSeeded) {
      formData.value = {
        ...(record.payload || {}),
        _parent_problem: capaRecord?.description ?? '',
      }
      formSeeded = true
    }
  },
  { immediate: true },
)

watch(capa, (capaRecord) => {
  if (formSeeded) {
    formData.value._parent_problem = capaRecord?.description ?? ''
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
    const { _parent_problem: _1, ...payload } = formData.value || {}
    const existing = currentUserRecord.value
    const submittedAt = submit ? DateTime.now() : (existing?.submittedAt ?? null)
    if (existing) {
      existing.payload = payload
      if (submit) existing.submittedAt = submittedAt
      await existing.save()
    } else {
      const record = db.CapaRecord.create({
        capaId: props.capaId,
        workflowInstanceStepId: props.instanceStepId,
        taskInstanceId: currentUserTask.value.id,
        payload,
        submittedAt,
      })
      await record.save()
    }

    // In dialog mode, submitting the form should also complete the reviewer's
    // task. Only fire when the task is still actionable — otherwise just
    // persist the form draft/submission as usual.
    if (submit && props.autoApprove && currentUserTask.value.statusId === 'ASSIGNED') {
      try {
        await post(`/v1/services/taskInstances/${currentUserTask.value.id}/action`, {
          action: 'COMPLETE_AND_ADVANCE',
          outcomeId: 'COMPLETE_AND_ADVANCE',
        })
        toast.success('Step approved')
        emit('done')
        return
      } catch (actionErr) {
        toast.error(actionErr.message || 'Form saved but approval failed')
        return
      }
    }

    toast.success(submit ? 'Form submitted' : 'Draft saved')
    if (submit && props.autoApprove) emit('done')
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

const usersMap = useLiveQueryWithDeps(
  [() => submittedRecords.value.map((r) => r.userId).join(',')],
  async (db, [idsStr]) => {
    if (!idsStr) return {}
    const ids = [...new Set(idsStr.split(','))]
    const users = await Promise.all(ids.map((id) => db.User.findByPk(id)))
    return Object.fromEntries(users.filter(Boolean).map((u) => [u.id, u]))
  },
  { initial: {} },
)

function getUserName(userId) {
  const u = usersMap.value[userId]
  if (!u) return '—'
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email
}
</script>

<template>
  <template v-if="hasForm">
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

    <template v-else>
      <div class="tw:text-[11px] tw:text-secondary tw:font-medium tw:mb-2">Form data</div>
      <div v-for="record in submittedRecords" :key="record.id" class="tw:mb-3">
        <div
          v-if="submittedRecords.length > 1"
          class="tw:text-[11px] tw:text-secondary tw:font-medium tw:mb-2"
        >
          {{ getUserName(record.userId) }}
        </div>
        <FormSchemaReadonlyView :fields="formSchema" :values="record.payload || {}" />
      </div>

      <div v-if="currentUserRecord && !currentUserRecord.submittedAt">
        <div class="tw:text-[11px] tw:text-amber-600 tw:font-medium tw:mb-2">
          Your draft (not submitted)
        </div>
        <FormSchemaReadonlyView :fields="formSchema" :values="currentUserRecord.payload || {}" />
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
</template>
