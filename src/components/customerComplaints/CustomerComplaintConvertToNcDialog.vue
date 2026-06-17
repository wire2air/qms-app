<script setup>
import { DateTime } from 'luxon'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { currentSession } from '@/utils/currentSession.js'

/**
 * Convert one or more customer complaints into a single NC.
 * Collects the NC-required fields (site / department / severity / owner
 * / workflow) the same way Raise NC does; type defaults to
 * CUSTOMER_RETURN and detection source is fixed to CUSTOMER_COMPLAINT
 * server-side.
 */
const props = defineProps({
  complaints: { type: Array, default: () => [] },
})

const emit = defineEmits(['converted'])
const model = defineModel({ type: Boolean, default: false })

const toast = useToast()
const saving = ref(false)

const form = ref({
  title: '',
  siteId: null,
  departmentId: null,
  typeId: 'CUSTOMER_RETURN',
  severityId: 'MINOR',
  detectedAt: DateTime.now(),
  ownerId: currentSession.value?.userId ?? null,
  priorityId: null,
  workflowVersionId: null,
})

watch(model, (open) => {
  if (!open) return
  const first = props.complaints[0]
  form.value.title =
    props.complaints.length === 1
      ? first?.subject || ''
      : `Customer complaints: ${props.complaints.map((c) => c.complaintNumber).join(', ')}`
  form.value.detectedAt =
    props.complaints
      .map((c) => c.createdAt)
      .filter(Boolean)
      .sort((a, b) => a.toMillis() - b.toMillis())[0] ?? DateTime.now()
  form.value.priorityId = first?.priorityId ?? null
  form.value.ownerId = currentSession.value?.userId ?? null
})

async function handleConvert() {
  if (!form.value.title.trim()) {
    toast.notify({ type: 'negative', message: 'Title is required' })
    return
  }
  if (!form.value.siteId || !form.value.departmentId) {
    toast.notify({ type: 'negative', message: 'Site and department are required' })
    return
  }
  if (!form.value.ownerId) {
    toast.notify({ type: 'negative', message: 'Owner is required' })
    return
  }
  if (!form.value.workflowVersionId) {
    toast.notify({ type: 'negative', message: 'Workflow is required' })
    return
  }
  saving.value = true
  try {
    const response = await post('/v1/services/customerComplaints/convertToNc', {
      complaintIds: props.complaints.map((c) => c.id),
      title: form.value.title.trim(),
      siteId: form.value.siteId,
      departmentId: form.value.departmentId,
      typeId: form.value.typeId,
      severityId: form.value.severityId,
      detectedAt: form.value.detectedAt?.toISODate?.() ?? String(form.value.detectedAt),
      ownerId: form.value.ownerId,
      priorityId: form.value.priorityId,
      workflowVersionId: form.value.workflowVersionId,
    })
    emit('converted', response.nonconformance.id)
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to convert to NC' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="model" title="Convert to Nonconformance" maxWidth="lg">
    <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
      <!-- Which complaints feed the NC -->
      <div class="tw:flex tw:flex-col tw:gap-1">
        <BaseText variant="overline">
          Converting {{ complaints.length }} complaint{{ complaints.length === 1 ? '' : 's' }}
        </BaseText>
        <div class="tw:flex tw:flex-wrap tw:gap-1.5">
          <span
            v-for="c in complaints"
            :key="c.id"
            class="tw:text-xs tw:font-mono tw:bg-gray-100 tw:text-gray-700 tw:rounded tw:px-2 tw:py-0.5"
          >
            {{ c.complaintNumber }}
          </span>
        </div>
        <p class="tw:text-xs tw:text-secondary">
          A single draft NC is created and each complaint is linked to it and marked
          <strong>Converted to NC</strong>.
        </p>
      </div>

      <div class="tw:grid tw:grid-cols-2 tw:gap-3">
        <BaseField v-slot="{ id: fieldId }" label="NC title" required class="tw:col-span-2">
          <BaseTextInput :id="fieldId" v-model="form.title" placeholder="Title for the new NC…" />
        </BaseField>
        <BaseField label="Site" required>
          <SiteSelectMenu v-model="form.siteId" required />
        </BaseField>
        <BaseField label="Department" required>
          <DepartmentSelectMenu v-model="form.departmentId" :siteId="form.siteId" required />
        </BaseField>
        <BaseField label="NC Type">
          <NcTypeSelectMenu v-model="form.typeId" required />
        </BaseField>
        <BaseField label="Owner" required>
          <UserSelectMenu v-model="form.ownerId" required />
        </BaseField>
        <BaseField label="Severity" required>
          <div class="tw:flex tw:gap-2">
            <BaseButton
              v-for="sev in ['MINOR', 'MAJOR', 'CRITICAL']"
              :key="sev"
              class="tw:flex-1 tw:justify-center"
              :variant="form.severityId === sev ? 'primary' : 'outline'"
              @click="form.severityId = sev"
            >
              {{ sev.charAt(0) + sev.slice(1).toLowerCase() }}
            </BaseButton>
          </div>
        </BaseField>
        <BaseField label="Detected date" required>
          <BaseDatePicker v-model="form.detectedAt" />
        </BaseField>
      </div>

      <BaseField label="NC workflow" required>
        <WorkflowVersionSelect
          v-model="form.workflowVersionId"
          moduleId="NON_CONFORMANCE"
          dense
        />
      </BaseField>
    </div>
    <template #footer="{ close }">
      <BaseButton variant="outline" :disabled="saving" @click="close">Cancel</BaseButton>
      <BaseButton variant="primary" :disabled="saving" @click="handleConvert">
        {{ saving ? 'Converting…' : 'Create NC' }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>
