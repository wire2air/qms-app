<script setup>
import { DateTime } from 'luxon'
import { post } from '@/api'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { currentSession } from '@/utils/currentSession.js'
import WorkflowReviewerPickerDialog from '@/components/workflow/WorkflowReviewerPickerDialog.vue'
import { NC_MODULE } from '@/components/workflow/workflowModule.js'

const router = useRouter()
const toast = useToast()
const workflowPickerRef = ref(null)
const saving = ref(false)

const form = ref({
  title: '',
  description: '',
  siteId: null,
  departmentId: null,
  typeId: null,
  sourceId: null,
  severityId: 'MINOR',
  detectedAt: DateTime.now(),
  ownerId: currentSession.value?.userId ?? null,
  productId: null,
  supplierId: null,
  // When true, the workflow attached to this NC routes every step's
  // assignee from supplier users (entity.supplierId) instead of the
  // internal role pool. The internal creator stays as owner; supplier
  // users get co-owner access via the workflow auto-share. Backend
  // requires supplierId to be set when this is true, and refuses
  // changes once the NC leaves DRAFT.
  isSupplierFacing: false,
  // Top-section classification / commercial-reference fields (added
  // 2026-05-29). All optional — intake may not know any of these yet.
  ncIssueTypeId: null,
  priorityId: null,
  dueDate: null,
  poNumber: '',
  orderNumber: '',
  lotNumber: '',
  qtyAffected: null,
  unitOfMeasure: '',
  workflowVersionId: null,
})

function handleSubmit() {
  if (!form.value.title) {
    toast.notify({ type: 'negative', message: 'Title is required' })
    return
  }
  if (!form.value.severityId) {
    toast.notify({ type: 'negative', message: 'Severity is required' })
    return
  }
  if (!form.value.typeId) {
    toast.notify({ type: 'negative', message: 'NC Type is required' })
    return
  }
  if (!form.value.sourceId) {
    toast.notify({ type: 'negative', message: 'Detection source is required' })
    return
  }
  if (!form.value.siteId) {
    toast.notify({ type: 'negative', message: 'Site is required' })
    return
  }
  if (!form.value.departmentId) {
    toast.notify({ type: 'negative', message: 'Department is required' })
    return
  }
  if (!form.value.ownerId) {
    toast.notify({ type: 'negative', message: 'Owner is required' })
    return
  }
  if (form.value.isSupplierFacing && !form.value.supplierId) {
    toast.notify({
      type: 'negative',
      message: 'Pick a supplier before marking this NC as supplier-facing.',
    })
    return
  }
  if (!form.value.detectedAt) {
    toast.notify({ type: 'negative', message: 'Detected date is required' })
    return
  }
  if (!form.value.workflowVersionId) {
    toast.notify({ type: 'negative', message: 'Workflow version is required' })
    return
  }

  // Open reviewer dialog (fire-and-forget, actual NC creation happens on confirm)
  workflowPickerRef.value.submit()
}

async function handleReviewersConfirmed(reviewers) {
  saving.value = true
  try {
    const response = await post('/v1/services/nonconformances', { ...form.value, reviewers })
    router.push(getCompanyPath(`/nonconformances/${response.nonconformance.id}`))
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to create NC' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:h-full">
    <SafeTeleport to="#main-header-title">
      <BaseBreadcrumbs
        :items="[
          { label: 'Nonconformances', to: getCompanyPath('/nonconformances') },
          { label: 'Raise NC' },
        ]"
      />
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <BaseButton variant="primary" :disabled="saving" @click="handleSubmit">Submit</BaseButton>
    </SafeTeleport>

    <div class="tw:overflow-y-auto tw:flex-1">
      <div class="tw:max-w-3xl tw:mx-auto tw:p-6 tw:flex tw:flex-col tw:gap-4">
        <!-- Basic information -->
        <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
          <div
            class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
          >
            Basic information
          </div>
          <div class="tw:flex tw:flex-col tw:gap-3">
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">
                Title <span class="tw:text-red-500">*</span>
              </label>
              <BaseTextInput v-model="form.title" placeholder="Describe the nonconformance…" />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">Description</label>
              <div class="create-nc-editor">
                <BaseRichTextEditor
                  v-model="form.description"
                  placeholder="Provide details about the nonconformance…"
                />
              </div>
            </div>
            <SimilarRecordsPanel
              entityType="Nonconformance"
              :searchInTypes="['Nonconformance']"
              :getText="() => `${form.title} ${form.description || ''}`"
            />
          </div>
        </div>

        <!-- Classification -->
        <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
          <div
            class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
          >
            Classification
          </div>
          <div class="tw:grid tw:grid-cols-2 tw:gap-3">
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
              <DepartmentSelectMenu v-model="form.departmentId" :siteId="form.siteId" required />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">
                NC Type <span class="tw:text-red-500">*</span>
              </label>
              <NcTypeSelectMenu v-model="form.typeId" required />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">
                Detection source <span class="tw:text-red-500">*</span>
              </label>
              <NcSourceSelectMenu v-model="form.sourceId" required />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">Issue type</label>
              <NcIssueTypeSelectMenu v-model="form.ncIssueTypeId" />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">
                Severity <span class="tw:text-red-500">*</span>
              </label>
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
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">Priority</label>
              <div class="tw:flex tw:gap-2">
                <BaseButton
                  v-for="p in ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']"
                  :key="p"
                  class="tw:flex-1 tw:justify-center"
                  :variant="form.priorityId === p ? 'primary' : 'outline'"
                  @click="form.priorityId = form.priorityId === p ? null : p"
                >
                  {{ p.charAt(0) + p.slice(1).toLowerCase() }}
                </BaseButton>
              </div>
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">
                Detected date <span class="tw:text-red-500">*</span>
              </label>
              <BaseDatePicker v-model="form.detectedAt" />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">
                Due date
                <span class="tw:font-normal tw:text-secondary tw:ml-1">(optional)</span>
              </label>
              <BaseDatePicker v-model="form.dueDate" />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1 tw:col-span-2 tw:md:col-span-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">
                Owner <span class="tw:text-red-500">*</span>
              </label>
              <UserSelectMenu v-model="form.ownerId" required />
            </div>
          </div>
        </div>

        <!-- Product & material -->
        <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
          <div
            class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
          >
            Product & material
            <span class="tw:normal-case tw:font-normal tw:text-secondary tw:ml-1">(optional)</span>
          </div>
          <div class="tw:grid tw:grid-cols-2 tw:gap-3">
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">Product</label>
              <ProductSelectMenu v-model="form.productId" :required="false" />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">
                Supplier
                <span v-if="form.isSupplierFacing" class="tw:text-bad">*</span>
              </label>
              <SupplierSelectMenu v-model="form.supplierId" :required="form.isSupplierFacing" />
              <label
                class="tw:flex tw:items-start tw:gap-2 tw:mt-2 tw:cursor-pointer tw:select-none"
              >
                <BaseCheckbox v-model="form.isSupplierFacing" />
                <div>
                  <div class="tw:text-sm tw:text-on-main">Supplier-facing NC</div>
                  <div class="tw:text-[11px] tw:text-secondary">
                    Workflow steps will be reviewed by users from the selected supplier (you'll
                    pick the specific reviewer per step when you open the NC). Lockable once
                    opened.
                  </div>
                </div>
              </label>
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">Qty affected</label>
              <BaseTextInput v-model="form.qtyAffected" type="number" placeholder="0" />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">Unit of measure</label>
              <BaseTextInput v-model="form.unitOfMeasure" placeholder="e.g. sheets, units…" />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">PO #</label>
              <BaseTextInput v-model="form.poNumber" placeholder="Purchase order number" />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">Order #</label>
              <BaseTextInput v-model="form.orderNumber" placeholder="Customer / sales order" />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1 tw:col-span-2">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">Lot #</label>
              <BaseTextInput v-model="form.lotNumber" placeholder="Material / production lot" />
            </div>
          </div>
        </div>

        <!-- Immediate containment action -->
        <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
          <div
            class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
          >
            Immediate containment action
            <span class="tw:normal-case tw:font-normal tw:text-secondary tw:ml-1">(optional)</span>
          </div>
          <div class="create-nc-editor">
            <BaseRichTextEditor
              v-model="form.immediateContainmentAction"
              placeholder="Describe actions taken at the time of detection…"
            />
          </div>
        </div>

        <!-- Workflow -->
        <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
          <div
            class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
          >
            Workflow
            <span class="tw:normal-case tw:font-normal tw:text-secondary tw:ml-1">(optional)</span>
          </div>
          <WorkflowReviewerPickerDialog
            ref="workflowPickerRef"
            v-model="form.workflowVersionId"
            :module="NC_MODULE"
            :isSupplierFacing="form.isSupplierFacing"
            :supplierId="form.supplierId"
            :ownerId="form.ownerId"
            @submit="handleReviewersConfirmed"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.create-nc-editor :deep(.rich-text-editor-content) {
  max-height: 10rem;
  overflow-y: auto;
}
</style>
