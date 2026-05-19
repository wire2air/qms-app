<script setup>
import DynamicForm from '@/components/form/DynamicForm.js'

const props = defineProps({
  capaRecordId: { type: String, default: null },
})

const isOpen = defineModel({ type: Boolean, default: false })

const capaRecord = useLiveQueryWithDeps(
  [() => props.capaRecordId],
  async (db, [id]) => {
    if (!id) return null
    return db.CapaRecord.findByPk(id)
  },
  {
    models: ['CapaRecord', 'Capa', 'TaskInstance', 'WorkflowInstanceStep', 'WorkflowInstance'],
  },
)

const submitter = useLiveQueryWithDeps([() => capaRecord.value?.userId], async (db, [userId]) => {
  if (!userId) return null
  return db.User.findByPk(userId)
})

const instanceStep = useLiveQueryWithDeps(
  [() => capaRecord.value?.workflowInstanceStepId],
  async (db, [id]) => {
    if (!id) return null
    return db.WorkflowInstanceStep.findByPk(id)
  },
)

const hasSchema = computed(
  () => Array.isArray(instanceStep.value?.formSchema) && instanceStep.value.formSchema.length > 0,
)

const formData = computed(() => capaRecord.value?.payload || {})

const submitterName = computed(() => {
  const u = submitter.value
  if (!u) return '—'
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email
})
</script>

<template>
  <BaseDialog v-model="isOpen" title="CAPA Record Submission" maxWidth="lg">
    <div v-if="!capaRecord" class="tw:text-sm tw:text-secondary tw:py-4">Loading…</div>
    <template v-else>
      <div
        class="tw:flex tw:items-center tw:justify-between tw:mb-4 tw:pb-3 tw:border-b tw:border-divider"
      >
        <div class="tw:flex tw:flex-col tw:gap-0.5">
          <span class="tw:text-xs tw:text-secondary">Submitted by</span>
          <span class="tw:text-sm tw:font-medium tw:text-on-main">{{ submitterName }}</span>
        </div>
        <div v-if="capaRecord.submittedAt" class="tw:flex tw:flex-col tw:gap-0.5 tw:items-end">
          <span class="tw:text-xs tw:text-secondary">Submitted at</span>
          <span class="tw:text-sm tw:font-medium tw:text-on-main">
            {{ capaRecord.submittedAt.formatDate('dateTime') }}
          </span>
        </div>
      </div>

      <DynamicForm
        v-if="hasSchema"
        :fields="instanceStep.formSchema"
        :modelValue="formData"
        :readonly="true"
      />
      <div v-else class="tw:text-sm tw:text-secondary tw:italic">
        No form schema defined for this step.
      </div>
    </template>
  </BaseDialog>
</template>
