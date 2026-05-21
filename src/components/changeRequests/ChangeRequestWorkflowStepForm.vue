<script setup>
/**
 * Per-user form responses for an ACTION-typed CR workflow step.
 * Mirrors CapaWorkflowStepForm — different entity binding (CrRecord
 * instead of CapaRecord, change_request_id instead of capa_id) and a
 * different parent-context value injected for prompt-aware fields
 * (the CR description rather than the CAPA problem statement).
 *
 * APPROVAL-typed steps never mount this component — those gates are
 * comment-only, handled by ChangeRequestWorkflowStep + the actions
 * menu directly.
 */
import { IconDeviceFloppy, IconSend } from '@tabler/icons-vue'
import DynamicForm from '@/components/form/DynamicForm.js'
import FormSchemaReadonlyView from '@/components/form/FormSchemaReadonlyView.vue'
import { currentSession } from '@/utils/currentSession.js'
import { db } from '@models/index'
import { DateTime } from 'luxon'
import { post } from '@/api'

const props = defineProps({
  instanceStepId: { type: String, required: true },
  crId: { type: String, required: true },
  autoApprove: { type: Boolean, default: false },
  hideSubmit: { type: Boolean, default: false },
})

const emit = defineEmits(['done'])

const toast = useToast()
const currentUserId = computed(() => currentSession.value?.id ?? currentSession.value?.userId)

const cr = useLiveQueryWithDeps([() => props.crId], async (db, [id]) =>
  id ? db.ChangeRequest.findByPk(id) : null,
)

const instanceStep = useLiveQueryWithDeps([() => props.instanceStepId], async (db, [id]) =>
  id ? db.WorkflowInstanceStep.findByPk(id) : null,
)

const formSchema = computed(() => instanceStep.value?.formSchema || [])
const hasForm = computed(() => formSchema.value.length > 0)

const records = useLiveQueryWithDeps(
  [() => props.instanceStepId, () => props.crId],
  async (db, [stepInstanceId, crId]) => {
    if (!stepInstanceId || !crId) return []
    const all = await db.CrRecord.where('workflowInstanceStepId', stepInstanceId).exec()
    return all.filter((r) => r.changeRequestId === crId)
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
  [currentUserRecord, cr],
  ([record, crRecord]) => {
    if (record && !formSeeded) {
      formData.value = {
        ...(record.payload || {}),
        _parent_problem: crRecord?.description ?? '',
      }
      formSeeded = true
    }
  },
  { immediate: true },
)

watch(cr, (crRecord) => {
  if (formSeeded) {
    formData.value._parent_problem = crRecord?.description ?? ''
  }
})

async function persistRecord({ submit, esign }) {
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
      const record = db.CrRecord.create({
        changeRequestId: props.crId,
        workflowInstanceStepId: props.instanceStepId,
        taskInstanceId: currentUserTask.value.id,
        payload,
        submittedAt,
      })
      await record.save()
    }

    if (submit && props.autoApprove && currentUserTask.value.statusId === 'ASSIGNED') {
      try {
        const body = {
          action: 'COMPLETE_AND_ADVANCE',
          outcomeId: 'COMPLETE_AND_ADVANCE',
        }
        if (esign?.method) body.method = esign.method
        if (esign?.token) body.token = esign.token
        if (esign?.provider) body.provider = esign.provider
        await post(`/v1/services/taskInstances/${currentUserTask.value.id}/action`, body)
        toast.success('Step completed')
        emit('done')
        return
      } catch (actionErr) {
        toast.error(actionErr.message || 'Form saved but completion failed')
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

function submitForm(esign) {
  return persistRecord({ submit: true, esign })
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

defineExpose({ submit: submitForm, saving })
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
        <BaseButton v-if="!hideSubmit" variant="primary" :disabled="saving" @click="submitForm">
          <template #icon><IconSend :size="16" /></template>
          Submit
        </BaseButton>
      </div>
    </template>

    <template v-else>
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
