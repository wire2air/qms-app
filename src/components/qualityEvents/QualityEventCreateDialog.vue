<script setup>
import { post } from '@/api'
import { currentSession } from '@/utils/currentSession.js'
import { DateTime } from 'luxon'

const props = defineProps({
  initialValues: { type: Object, default: () => ({}) },
  title: { type: String, default: 'Log Event' },
  submitLabel: { type: String, default: 'Log Event' },
  lockAssignedTo: { type: Boolean, default: false },
})

const emit = defineEmits(['created'])
const open = defineModel({ type: Boolean, default: false })
const toast = useToast()
const saving = ref(false)

const currentUser = useLiveQueryWithDeps(
  [() => currentSession.value?.userId ?? currentSession.value?.id],
  async (db, [uid]) => {
    if (!uid) return null
    return await db.User.findByPk(uid)
  },
  { models: ['User'], initial: null },
)

const blank = () => ({
  title: '',
  description: '',
  categoryId: null,
  severityId: null,
  departmentId: null,
  siteId: null,
  supplierId: null,
  assignedToUserId: null,
  notifyGroupIds: null,
  notifyUserIds: null,
  sourceType: 'MANUAL',
  inspectionLotId: null,
  occurrenceDate: DateTime.now().startOf('day'),
  anonymousSubmission: false,
})
const form = ref(blank())

function hasRichTextContent(value) {
  const raw = (value || '').split('\n[qms-attachments]::')[0]
  const text = raw
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 0
}

function applyUserDefaults(target) {
  const me = currentUser.value
  if (!me) return target
  return {
    ...target,
    siteId: target.siteId ?? me.siteId ?? null,
    departmentId: target.departmentId ?? me.departmentId ?? null,
  }
}

watch(open, (v) => {
  if (v) {
    form.value = { ...applyUserDefaults(blank()), ...props.initialValues }
    if (typeof form.value.occurrenceDate === 'string') {
      const dt = DateTime.fromISO(form.value.occurrenceDate)
      form.value.occurrenceDate = dt.isValid ? dt.startOf('day') : DateTime.now().startOf('day')
    } else if (form.value.occurrenceDate instanceof Date) {
      form.value.occurrenceDate = DateTime.fromJSDate(form.value.occurrenceDate).startOf('day')
    } else if (!form.value.occurrenceDate) {
      form.value.occurrenceDate = DateTime.now().startOf('day')
    }
  }
})

watch(
  () => currentUser.value,
  (me) => {
    if (!open.value || !me) return
    if (!form.value.siteId && me.siteId) form.value.siteId = me.siteId
    if (!form.value.departmentId && me.departmentId) form.value.departmentId = me.departmentId
  },
)

async function handleSave(close) {
  if (!form.value.title.trim()) {
    toast.warning('Title is required')
    return
  }
  if (!hasRichTextContent(form.value.description)) {
    toast.warning('Issue is required')
    return
  }
  if (!form.value.categoryId) {
    toast.warning('Category is required')
    return
  }
  if (!form.value.severityId) {
    toast.warning('Severity is required')
    return
  }
  if (!form.value.siteId) {
    toast.warning('Site is required')
    return
  }
  if ((form.value.sourceType || 'MANUAL') !== 'QC_INSPECTION') {
    if (!form.value.departmentId) {
      toast.warning('Department is required')
      return
    }
  }
  saving.value = true
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
      supplierId: form.value.supplierId,
      assignedToUserId: form.value.assignedToUserId,
      notifyGroupIds: form.value.notifyGroupIds,
      notifyUserIds: form.value.notifyUserIds,
      sourceType: form.value.sourceType || 'MANUAL',
      inspectionLotId: form.value.inspectionLotId || null,
      occurrenceDate: form.value.occurrenceDate
        ? form.value.occurrenceDate.toFormat?.('yyyy-LL-dd') ?? form.value.occurrenceDate
        : null,
      anonymousSubmission: form.value.anonymousSubmission,
    })
    toast.success('Event logged')
    close?.()
    emit('created', res?.qualityEvent ?? res)
  } catch (e) {
    toast.error(e.message || 'Failed to log event')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="open" :title="title" maxWidth="xl">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <BaseField v-slot="{ id: fieldId }" label="Title" required>
        <BaseTextInput :id="fieldId" v-model="form.title" placeholder="Short summary of the observation" />
      </BaseField>

      <BaseField label="Issue" required>
        <div class="issue-editor">
          <RichTextAttachments
            v-model="form.description"
            :readonly="false"
            placeholder="What did you observe? Where? Any immediate context."
          />
        </div>
      </BaseField>

      <div class="tw:grid tw:grid-cols-2 tw:gap-3">
        <BaseField label="Category" required>
          <EventCategorySelectMenu v-model="form.categoryId" :required="true" />
        </BaseField>
        <BaseField label="Severity" required>
          <EventSeveritySelectMenu v-model="form.severityId" :required="true" />
        </BaseField>
        <BaseField label="Site / Location" required>
          <SiteSelectMenu
            v-model="form.siteId"
            :required="true"
            nullLabel="— Select site —"
          />
        </BaseField>
        <BaseField label="Department">
          <DepartmentSelectMenu
            v-model="form.departmentId"
            :siteId="form.siteId"
            :required="false"
            nullLabel="— Select department —"
          />
        </BaseField>
        <BaseField label="Supplier">
          <SupplierSelectMenu
            v-model="form.supplierId"
            :required="false"
            nullLabel="— Select supplier —"
          />
        </BaseField>
        <BaseField label="Assign To">
          <UserSelectMenu
            v-model="form.assignedToUserId"
            :required="false"
            :disabled="lockAssignedTo"
          />
        </BaseField>
        <BaseField v-slot="{ id: fieldId }" label="Occurrence Date">
          <BaseDateField :id="fieldId" v-model="form.occurrenceDate" mode="date" />
        </BaseField>
      </div>

      <BaseField label="Anonymous submission">
        <div class="tw:flex tw:items-center tw:gap-2">
          <BaseSwitch v-model="form.anonymousSubmission" />
          <span class="tw:text-xs tw:text-secondary">Hide the reporter's identity on this event</span>
        </div>
      </BaseField>
    </div>

    <template #footer="{ close }">
      <BaseDialogFooter
        :submitLabel="submitLabel"
        :loading="saving"
        :disabled="saving"
        @cancel="close"
        @submit="() => handleSave(close)"
      />
    </template>
  </BaseDialog>
</template>

<style scoped>
.issue-editor :deep(.tiptap-editor-wrapper) {
  min-height: 180px;
}
</style>
