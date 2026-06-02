<script setup>
import { DateTime } from 'luxon'
import { post } from '@/api'
import { currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { NC_MODULE } from '@/components/workflow/workflowModule.js'

const props = defineProps({
  complaint: { type: Object, required: true },
})

const modelValue = defineModel({ type: Boolean, default: false })

const router = useRouter()
const toast = useToast()
const submitting = ref(false)

const form = ref({
  title: '',
  description: '',
  siteId: null,
  departmentId: null,
  typeId: null,
  sourceId: 'CUSTOMER_COMPLAINT',
  severityId: 'MINOR',
  detectedAt: DateTime.now(),
  dueDate: null,
  ownerId: currentSession.value?.userId ?? null,
  productId: null,
  supplierId: null,
  workflowVersionId: null,
  ncIssueTypeId: null,
  priorityId: null,
})

watch(
  () => props.complaint,
  (c) => {
    if (!c) return
    form.value = {
      ...form.value,
      title: c.subject || '',
      description: c.description || '',
      productId: c.productId || null,
      supplierId: c.supplierId || null,
      priorityId:
        c.priorityId === 'URGENT'
          ? 'CRITICAL'
          : c.priorityId === 'HIGH'
            ? 'HIGH'
            : c.priorityId === 'MEDIUM'
              ? 'MEDIUM'
              : 'LOW',
    }
  },
  { immediate: true },
)

function close() {
  modelValue.value = false
}

async function handleSubmit() {
  if (!form.value.title?.trim()) {
    toast.notify({ type: 'negative', message: 'Title is required' })
    return
  }
  for (const [field, label] of [
    ['siteId', 'Site'],
    ['departmentId', 'Department'],
    ['typeId', 'NC type'],
    ['sourceId', 'Source'],
    ['severityId', 'Severity'],
    ['ownerId', 'Owner'],
    ['workflowVersionId', 'Workflow'],
  ]) {
    if (!form.value[field]) {
      toast.notify({ type: 'negative', message: `${label} is required` })
      return
    }
  }
  submitting.value = true
  try {
    // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
    // The server allocates the NC number under a row-level lock and
    // writes the junction rows atomically; the client must not split
    // these into two requests.
    const res = await post('/v1/services/customerComplaints/createNonconformance', {
      complaintIds: [props.complaint.id],
      nc: {
        ...form.value,
        detectedAt:
          form.value.detectedAt instanceof DateTime
            ? form.value.detectedAt.toISO()
            : form.value.detectedAt,
        dueDate:
          form.value.dueDate instanceof DateTime
            ? form.value.dueDate.toISO()
            : form.value.dueDate,
      },
    })
    toast.notify({
      type: 'positive',
      message: `NC ${res?.nonconformance?.ncNumber ?? ''} created and linked`,
    })
    close()
    const ncId = res?.nonconformance?.id
    if (ncId) router.push(getCompanyPath(`/nonconformances/${ncId}`))
  } catch (err) {
    toast.notify({ type: 'negative', message: err?.message || 'Failed to create NC' })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="modelValue" title="Generate Nonconformance from this complaint">
    <div class="tw:flex tw:flex-col tw:gap-4">
      <div class="tw:text-xs tw:text-secondary">
        Creates a DRAFT NC linked to ticket
        <span class="tw:font-mono">{{ complaint.complaintNumber }}</span>
        . You can pick step reviewers and open the workflow from the NC page after creation.
      </div>

      <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
        <div class="tw:flex tw:flex-col tw:gap-1 tw:md:col-span-2">
          <label class="tw:text-sm tw:font-medium tw:text-secondary">
            Title <span class="tw:text-red-500">*</span>
          </label>
          <BaseTextInput v-model="form.title" />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-1 tw:md:col-span-2">
          <label class="tw:text-sm tw:font-medium tw:text-secondary">Description</label>
          <BaseTextarea v-model="form.description" rows="4" />
        </div>

        <div class="tw:flex tw:flex-col tw:gap-1">
          <label class="tw:text-sm tw:font-medium tw:text-secondary">
            Site <span class="tw:text-red-500">*</span>
          </label>
          <SiteSelectMenu v-model="form.siteId" required />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-1">
          <label class="tw:text-sm tw:font-medium tw:text-secondary">
            Department <span class="tw:text-red-500">*</span>
          </label>
          <DepartmentSelectMenu v-model="form.departmentId" required />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-1">
          <label class="tw:text-sm tw:font-medium tw:text-secondary">
            NC type <span class="tw:text-red-500">*</span>
          </label>
          <NcTypeSelectMenu v-model="form.typeId" required />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-1">
          <label class="tw:text-sm tw:font-medium tw:text-secondary">
            Source <span class="tw:text-red-500">*</span>
          </label>
          <NcSourceSelectMenu v-model="form.sourceId" required />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-1">
          <label class="tw:text-sm tw:font-medium tw:text-secondary">
            Severity <span class="tw:text-red-500">*</span>
          </label>
          <NcSeveritySelectMenu v-model="form.severityId" required />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-1">
          <label class="tw:text-sm tw:font-medium tw:text-secondary">
            Owner <span class="tw:text-red-500">*</span>
          </label>
          <UserSelectMenu v-model="form.ownerId" required />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-1">
          <label class="tw:text-sm tw:font-medium tw:text-secondary">
            Detected <span class="tw:text-red-500">*</span>
          </label>
          <BaseDatePicker v-model="form.detectedAt" />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-1">
          <label class="tw:text-sm tw:font-medium tw:text-secondary">Due date</label>
          <BaseDatePicker v-model="form.dueDate" />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-1 tw:md:col-span-2">
          <label class="tw:text-sm tw:font-medium tw:text-secondary">
            Workflow <span class="tw:text-red-500">*</span>
          </label>
          <WorkflowVersionSelect
            v-model="form.workflowVersionId"
            :moduleId="NC_MODULE.workflowVersionModuleId"
          />
        </div>
      </div>
    </div>

    <template #actions>
      <BaseButton variant="outline" :disabled="submitting" @click="close">Cancel</BaseButton>
      <BaseButton variant="primary" :loading="submitting" @click="handleSubmit">
        Create NC + link
      </BaseButton>
    </template>
  </BaseDialog>
</template>
