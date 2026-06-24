<script setup>
import { required } from '@shared/components/form/validators.js'
import { post } from '@/api'

const emit = defineEmits(['created'])
const open = defineModel({ type: Boolean, default: false })
const toast = useToast()
const saving = ref(false)
const saveError = ref('')
const formRef = ref(null)

const blank = () => ({
  title: '',
  description: '',
  categoryId: null,
  severityId: null,
  departmentId: null,
  siteId: null,
  assignedToUserId: null,
  occurrenceDate: null,
  anonymousSubmission: false,
})
const form = ref(blank())

watch(open, (v) => {
  if (v) {
    form.value = blank()
    saveError.value = ''
  }
})

async function onValidSubmit() {
  saving.value = true
  saveError.value = ''
  try {
    // Action RPC (not entity CRUD) — server mints the EV-###### number.
    // See CLAUDE.md rule #4 exception.
    const res = await post('/v1/services/qualityEvents', {
      title: form.value.title.trim(),
      description: form.value.description?.trim() || null,
      categoryId: form.value.categoryId,
      severityId: form.value.severityId,
      departmentId: form.value.departmentId,
      siteId: form.value.siteId,
      assignedToUserId: form.value.assignedToUserId,
      occurrenceDate: form.value.occurrenceDate
        ? (form.value.occurrenceDate.toFormat?.('yyyy-LL-dd') ?? form.value.occurrenceDate)
        : null,
      anonymousSubmission: form.value.anonymousSubmission,
    })
    toast.success('Event logged')
    emit('created', res?.qualityEvent ?? res)
    open.value = false
  } catch (e) {
    saveError.value = e.message || 'Failed to log event'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="open" title="Log Event" maxWidth="lg">
    <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
        <BaseField label="Title" required :value="form.title" :rules="[required()]">
          <template #default="field">
            <BaseTextInput
              v-bind="field"
              v-model="form.title"
              placeholder="Short summary of the observation"
            />
          </template>
        </BaseField>

        <BaseField label="Description">
          <template #default="field">
            <BaseTextarea
              v-bind="field"
              v-model="form.description"
              :rows="3"
              placeholder="What did you observe? Where? Any immediate context."
            />
          </template>
        </BaseField>

        <div class="tw:grid tw:grid-cols-2 tw:gap-3">
          <BaseField label="Category">
            <EventCategorySelectMenu v-model="form.categoryId" :required="false" />
          </BaseField>
          <BaseField label="Severity">
            <EventSeveritySelectMenu v-model="form.severityId" :required="false" />
          </BaseField>
          <BaseField label="Site / Location">
            <SiteSelectMenu v-model="form.siteId" :required="false" />
          </BaseField>
          <BaseField label="Department">
            <DepartmentSelectMenu v-model="form.departmentId" :required="false" />
          </BaseField>
          <BaseField label="Assign To">
            <UserSelectMenu v-model="form.assignedToUserId" :required="false" />
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Occurrence Date">
            <BaseDatePicker :id="fieldId" v-model="form.occurrenceDate" />
          </BaseField>
        </div>

        <BaseField label="Anonymous submission">
          <div class="tw:flex tw:items-center tw:gap-2">
            <BaseSwitch v-model="form.anonymousSubmission" />
            <span class="tw:text-xs tw:text-secondary"
              >Hide the reporter's identity on this event</span
            >
          </div>
        </BaseField>
      </div>
    </BaseForm>

    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Log Event"
        :loading="saving"
        :error="saveError"
        @cancel="close"
        @submit="formRef.submit()"
      />
    </template>
  </BaseDialog>
</template>
