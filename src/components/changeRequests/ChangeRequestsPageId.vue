<script setup>
import {
  buildChangeRequestBanners,
  buildChangeRequestSections,
  buildChangeRequestActions,
} from './changeRequestDetailConfig.js'
import { IconAlertTriangle } from '@tabler/icons-vue'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { currentSession, isAllowed, canUseAi } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { DateTime } from 'luxon'
import { useRecordTrail } from '@/composables/useRecordTrail.js'
import {
  CHANGE_NATURES,
  CHANGE_DURATIONS,
  YES_NO_OPTIONS,
  crOptionLabel,
} from './changeRequestOptions.js'

const props = defineProps({
  id: { type: String, required: true },
})

const router = useRouter()
const route = useRoute()
const { visit: visitTrail } = useRecordTrail()

const cr = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => db.ChangeRequest.findByPk(id),
  { models: ['ChangeRequest'] },
)
watch(
  cr,
  (c) => {
    if (c?.id) visitTrail({ type: 'CR', id: c.id, label: c.crNumber, path: route.path })
  },
  { immediate: true },
)
const loading = computed(() => cr.value === undefined)

const breadcrumbs = computed(() => [
  { label: 'Change Requests', to: getCompanyPath('/change-requests') },
  { label: cr.value?.crNumber || cr.value?.title || 'Loading…' },
])

// Co-author model: the Responsible Party (ownerId) OR the Initiator (createdBy)
// may drive owner-level actions on the CR. Mirrors CHANGE_REQUEST_MODULE_CONFIG.authorField.
const isOwner = computed(() => {
  const uid = currentSession.value?.userId
  return !!uid && (cr.value?.ownerId === uid || cr.value?.createdBy === uid)
})
const canUpdate = computed(() => isAllowed(['change_control:update']))
const canDelete = computed(() => isAllowed(['change_control:delete']))

const isEditable = computed(
  () => cr.value && cr.value.statusId === 'DRAFT' && canUpdate.value && isOwner.value,
)

const toast = useToast()

// Inline auto-save while DRAFT (mirrors NC + CAPA).
// CR-H3: the captured saveError is only rendered inside the Open/Cancel/Close
// dialogs, so a failed INLINE field save (title/description/rail) was silent to
// the user. Surface it as a toast — pessimistic saves mean a failure persisted
// nothing.
const { saveError } = useAutoSave(cr, {
  enabled: () => cr.value?.statusId === 'DRAFT' && isOwner.value,
  onError: (e) => toast.error(e?.message || 'Failed to save change request'),
})

const workflowInstance = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    const results = await db.WorkflowInstance.where('[resourceType+resourceId]', [
      'ChangeRequest',
      id,
    ]).exec()
    return results.find((i) => i.statusId === 'IN_PROGRESS') || results[0] || null
  },
  { models: ['WorkflowInstance'] },
)

const isOverdue = computed(() => {
  if (!cr.value?.dueDate) return false
  if (['CLOSED', 'CANCELLED', 'REJECTED'].includes(cr.value.statusId)) return false
  return cr.value.dueDate < DateTime.now()
})

// ─── Open CR (Draft → Under Review) ─────────────────────────────────────────
const showOpenDialog = ref(false)
const opening = ref(false)
function openOpenDialog() {
  saveError.value = null
  showOpenDialog.value = true
}
async function handleOpenCr() {
  if (!cr.value) return
  opening.value = true
  saveError.value = null
  try {
    await post(`/v1/services/changeRequests/${props.id}/submitForReview`, {})
    showOpenDialog.value = false
  } catch (e) {
    saveError.value = e.message || 'Failed to open Change Request'
  } finally {
    opening.value = false
  }
}

// ─── Cancel CR (post-submit abandon) ────────────────────────────────────────
const showCancelDialog = ref(false)
const showCancelEsign = ref(false)
const cancelling = ref(false)
const cancelReason = ref('')
const cancelReasonError = ref('')
function openCancelDialog() {
  cancelReason.value = ''
  cancelReasonError.value = ''
  saveError.value = null
  showCancelDialog.value = true
}
function handleCancelClick() {
  if (!cancelReason.value.trim()) {
    cancelReasonError.value = 'A cancel reason is required'
    return
  }
  cancelReasonError.value = ''
  showCancelEsign.value = true
}
async function onCancelEsignVerified({ method, provider, token }) {
  showCancelEsign.value = false
  cancelling.value = true
  saveError.value = null
  try {
    await post(`/v1/services/changeRequests/${props.id}/cancel`, {
      method,
      provider: provider || null,
      token,
      reason: cancelReason.value.trim(),
    })
    showCancelDialog.value = false
    router.push(getCompanyPath('/change-requests'))
  } catch (e) {
    saveError.value = e.message || 'Failed to cancel'
    showCancelDialog.value = true
  } finally {
    cancelling.value = false
  }
}

// ─── Close CR (terminal success) ────────────────────────────────────────────
const showCloseDialog = ref(false)
const showCloseEsign = ref(false)
const closing = ref(false)
const closeComments = ref('')

const closeBlockedReason = computed(() => {
  if (!cr.value) return null
  if (
    !['APPROVED', 'IN_IMPLEMENTATION', 'PENDING_EFFECTIVENESS', 'ON_HOLD'].includes(
      cr.value.statusId,
    )
  ) {
    return `Cannot close from status ${cr.value.statusId} — use Cancel for pre-approval abandonment.`
  }
  return null
})
const canClose = computed(() => !closeBlockedReason.value)

function openCloseDialog() {
  if (!canClose.value) return
  closeComments.value = ''
  saveError.value = null
  showCloseDialog.value = true
}
function handleCloseClick() {
  if (!canClose.value) return
  showCloseEsign.value = true
}
async function onCloseEsignVerified({ method, provider, token }) {
  showCloseEsign.value = false
  closing.value = true
  saveError.value = null
  try {
    await post(`/v1/services/changeRequests/${props.id}/close`, {
      method,
      provider: provider || null,
      token,
      comments: closeComments.value.trim() || null,
    })
    showCloseDialog.value = false
    router.push(getCompanyPath('/change-requests'))
  } catch (e) {
    saveError.value = e.message || 'Failed to close'
    showCloseDialog.value = true
  } finally {
    closing.value = false
  }
}

// ─── Delete draft ────────────────────────────────────────────────────────────
const showDeleteDialog = ref(false)
const deleting = ref(false)
async function handleDeleteDraft() {
  if (!cr.value || cr.value.statusId !== 'DRAFT' || deleting.value) return
  deleting.value = true
  saveError.value = null
  try {
    await cr.value.delete()
    showDeleteDialog.value = false
    router.push(getCompanyPath('/change-requests'))
  } catch (e) {
    saveError.value = e.message || 'Failed to delete draft'
  } finally {
    deleting.value = false
  }
}

// ─── Print + Audit Log ──────────────────────────────────────────────────────
const showAuditLog = ref(false)
function openPrintView() {
  if (!cr.value?.id) return
  const params = new URLSearchParams({ module: 'ChangeRequest', id: cr.value.id })
  window.open(getCompanyPath(`/print?${params.toString()}`), '_blank', 'noopener,noreferrer')
}
const allWfInstanceIds = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return []
    const rows = await db.WorkflowInstance.where('[resourceType+resourceId]', [
      'ChangeRequest',
      id,
    ]).exec()
    return rows.map((r) => r.id)
  },

  { models: ['WorkflowInstance'], initial: [] },
)
const allWfStepIds = useLiveQueryWithDeps(
  [() => allWfInstanceIds.value.join(',')],
  async (db, [idsStr]) => {
    if (!idsStr) return []
    const ids = idsStr.split(',')
    const lists = await Promise.all(
      ids.map((id) => db.WorkflowInstanceStep.where('workflowInstanceId', id).exec()),
    )
    return lists.flat().map((s) => s.id)
  },

  { models: ['WorkflowInstanceStep'], initial: [] },
)
const auditIncludeEntities = computed(() => [
  { entityType: 'ChangeRequests', entityIds: [props.id] },
  { entityType: 'WorkflowInstances', entityIds: allWfInstanceIds.value },
  { entityType: 'WorkflowInstanceSteps', entityIds: allWfStepIds.value },
])

// ─── Editing toggles for inline fields ───────────────────────────────────────
const editingTitle = ref(false)

// ─── BaseDetailLayout config (SP-6) ──────────────────────────────────────────
const changeRequestBanners = computed(() =>
  buildChangeRequestBanners(cr.value, { isEditable: isEditable.value }),
)
const changeRequestSections = computed(() => buildChangeRequestSections(cr.value))
const changeRequestActions = computed(() =>
  buildChangeRequestActions(
    {
      isOwner: isOwner.value,
      canDelete: canDelete.value,
      statusId: cr.value?.statusId,
      canClose: canClose.value,
      closing: closing.value,
      cancelling: cancelling.value,
      opening: opening.value,
      deleting: deleting.value,
    },
    {
      openOpen: openOpenDialog,
      openClose: openCloseDialog,
      openCancel: openCancelDialog,
      print: openPrintView,
      openAudit() {
        showAuditLog.value = true
      },
      openDelete() {
        showDeleteDialog.value = true
      },
    },
  ),
)

const changeRequestDetailConfig = computed(() =>
  defineDetailConfig({
    variant: 'standard',
    width: 'standard',
    breadcrumbs: breadcrumbs.value,
    banners: () => changeRequestBanners.value,
    actions: changeRequestActions.value,
    sections: changeRequestSections.value,
  }),
)
</script>

<template>
  <BaseDetailLayout
    :config="changeRequestDetailConfig"
    :record="cr"
    :loading="loading"
    :notFound="!loading && !cr"
    notFoundTitle="Change Request not found"
    notFoundDescription="This Change Request could not be found."
  >
    <template #title>
      <BaseTextInput
        v-if="editingTitle && isEditable"
        v-model="cr.title"
        placeholder="CR title"
        autofocus
        class="tw:mb-2"
        @blur="editingTitle = false"
      />
      <div
        v-else
        class="tw:text-base tw:font-semibold tw:text-on-main tw:mb-2"
        :class="isEditable ? 'tw:cursor-pointer tw:hover:text-primary' : ''"
        @click="isEditable && (editingTitle = true)"
      >
        {{ cr?.title }}
      </div>
    </template>

    <template #status>
      <ChangeRequestStatusBadgeById v-if="cr" :statusId="cr.statusId" />
    </template>

    <template v-if="cr" #meta>
      <span class="">{{ cr.crNumber }}</span>
      <template v-if="cr.changeTypeId">
        · <ChangeTypeBadgeById :changeTypeId="cr.changeTypeId"
      /></template>
      <template v-if="cr.initiatedAt">
        · Initiated {{ cr.initiatedAt.formatDate('date') }}</template
      >
    </template>

    <template #actions>
      <div class="tw:flex tw:items-center tw:gap-2">
        <DetailActionBar :actions="changeRequestActions" />
        <AskAiButton
          v-if="canUseAi && cr?.id"
          entityType="ChangeRequest"
          :entityId="cr.id"
          :entityTitle="cr.title"
          :entityNumber="cr.crNumber"
        />
      </div>
    </template>

    <template v-if="cr" #section-details>
      <RecordTrailBreadcrumb />

      <!-- Details card -->
      <FormSection title="Change Request Details">
        <BaseRichTextField
          v-model="cr.description"
          :editable="isEditable"
          clickToEdit
          clickToEditLabel="Add a description…"
          placeholder="Describe the change…"
        />
      </FormSection>

      <!-- Admin-defined custom fields. Self-hides when none configured. -->
      <CustomFieldsCard entityType="ChangeRequest" :entityId="id" :editable="isEditable" />
    </template>

    <template v-if="cr" #section-reason>
      <!-- Reason + Justification -->
      <FormSection title="Reason &amp; Justification">
        <div class="tw:mb-4">
          <div class="tw:text-xs tw:font-medium tw:text-secondary tw:mb-1">Reason for Change</div>
          <BaseRichTextField
            v-model="cr.reasonForChange"
            :editable="isEditable"
            placeholder="What's driving this change?"
            textClass="tw:text-sm tw:text-on-main tw:leading-relaxed"
          />
        </div>
        <div>
          <div class="tw:text-xs tw:font-medium tw:text-secondary tw:mb-1">
            Business Justification
          </div>
          <BaseRichTextField
            v-model="cr.businessJustification"
            :editable="isEditable"
            placeholder="Cost / quality / compliance impact"
            textClass="tw:text-sm tw:text-on-main tw:leading-relaxed"
          />
        </div>
      </FormSection>
    </template>

    <template v-if="cr" #section-workflow>
      <!-- Related records lineage (NC / finding → this CR). Self-hides
           when there are no links. -->
      <RecordLineagePanel :id="id" type="ChangeRequest" />

      <!-- Raised-from-Audit context (scoped) — self-hides when this CR
           wasn't spawned from an audit finding. -->
      <AuditOriginPanel entityType="ChangeRequest" :entityId="id" />

      <!-- Workflow: draft preview while DRAFT, live section after Open -->
      <ChangeRequestWorkflowDraftPreview
        v-if="!workflowInstance && cr.statusId === 'DRAFT'"
        :crId="id"
        :isOwner="isOwner"
      />
      <ChangeRequestWorkflowSection
        v-else-if="workflowInstance"
        :crId="id"
        :workflowInstanceId="workflowInstance.id"
        :isOwner="isOwner"
      />
    </template>

    <template v-if="cr" #rail>
      <!-- 1. General — CR number, status, change type, classification, priority, initiated.
           Responsive grid: pairs up two-per-row when the rail is wide enough,
           collapses to one-per-row when narrow. -->
      <BaseRailCard title="General">
        <div class="tw:grid tw:gap-x-4 tw:gap-y-3 tw:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]">
          <BaseDetailField label="CR number">
            <BaseText variant="body" weight="medium" class="tw:break-words">
              {{ cr.crNumber || '—' }}
            </BaseText>
          </BaseDetailField>
          <BaseDetailField label="Status">
            <ChangeRequestStatusBadgeById :statusId="cr.statusId" />
          </BaseDetailField>
          <BaseDetailField label="Change Type">
            <ChangeTypeBadgeById v-if="cr.changeTypeId" :changeTypeId="cr.changeTypeId" />
            <BaseText v-else color="secondary">—</BaseText>
          </BaseDetailField>
          <BaseDetailField label="Classification">
            <BaseText variant="body" weight="medium">{{ cr.classification || '—' }}</BaseText>
          </BaseDetailField>
          <BaseDetailField label="Priority">
            <ChangeRequestPriorityBadgeById v-if="cr.priorityId" :priorityId="cr.priorityId" />
            <BaseText v-else color="secondary">—</BaseText>
          </BaseDetailField>
          <BaseDetailField
            label="Initiated"
            :value="cr.initiatedAt ? cr.initiatedAt.formatDate('date') : null"
          />
        </div>
      </BaseRailCard>

      <!-- 1b. Change Details — intake classifiers captured at create; editable
           inline until the CR is terminal. -->
      <BaseRailCard title="Change Details">
        <div class="tw:grid tw:gap-x-4 tw:gap-y-3 tw:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]">
          <BaseDetailField label="Planned or Emergency">
            <BaseSelect
              v-if="isEditable"
              v-model="cr.changeNature"
              :options="CHANGE_NATURES"
              optionLabel="name"
              optionValue="id"
              nullLabel="—"
            />
            <BaseText v-else variant="body" weight="medium">
              {{ crOptionLabel(CHANGE_NATURES, cr.changeNature) || '—' }}
            </BaseText>
          </BaseDetailField>
          <BaseDetailField label="Temporary or Permanent">
            <BaseSelect
              v-if="isEditable"
              v-model="cr.changeDuration"
              :options="CHANGE_DURATIONS"
              optionLabel="name"
              optionValue="id"
              nullLabel="—"
            />
            <BaseText v-else variant="body" weight="medium">
              {{ crOptionLabel(CHANGE_DURATIONS, cr.changeDuration) || '—' }}
            </BaseText>
          </BaseDetailField>
          <BaseDetailField label="Regulatory Impact">
            <BaseSelect
              v-if="isEditable"
              v-model="cr.regulatoryImpact"
              :options="YES_NO_OPTIONS"
              optionLabel="name"
              optionValue="id"
              nullLabel="—"
            />
            <BaseText v-else variant="body" weight="medium">
              {{ crOptionLabel(YES_NO_OPTIONS, cr.regulatoryImpact) || '—' }}
            </BaseText>
          </BaseDetailField>
          <BaseDetailField label="Customer Notification Required">
            <BaseSelect
              v-if="isEditable"
              v-model="cr.customerNotificationRequired"
              :options="YES_NO_OPTIONS"
              optionLabel="name"
              optionValue="id"
              nullLabel="—"
            />
            <BaseText v-else variant="body" weight="medium">
              {{ crOptionLabel(YES_NO_OPTIONS, cr.customerNotificationRequired) || '—' }}
            </BaseText>
          </BaseDetailField>
        </div>
      </BaseRailCard>

      <!-- 2. Ownership -->
      <BaseRailCard title="Ownership" grid>
        <!-- Initiator = who raised the change request (createdBy, immutable). -->
        <BaseDetailField label="Initiator">
          <UserBadgeById v-if="cr.createdBy" :userId="cr.createdBy" />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
        <!-- Responsible party = drives the CR to closure; default
             workflow assignment routes here. -->
        <BaseDetailField label="Responsible party">
          <UserSelectMenu v-if="isEditable" v-model="cr.ownerId" :required="true" />
          <UserBadgeById v-else-if="cr.ownerId" :userId="cr.ownerId" />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
        <BaseDetailField label="Site">
          <SiteSelectMenu v-if="isEditable" v-model="cr.siteId" :required="true" />
          <SiteBadgeById v-else-if="cr.siteId" :siteId="cr.siteId" />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
        <BaseDetailField label="Department">
          <DepartmentSelectMenu v-if="isEditable" v-model="cr.departmentId" :required="true" />
          <DepartmentBadgeById v-else-if="cr.departmentId" :departmentId="cr.departmentId" />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
      </BaseRailCard>

      <!-- 3. Notify (cc) — groups/people emailed + in-app on status change -->
      <BaseRailCard title="Notify (cc)">
        <NotificationCcField
          v-model:groupIds="cr.notifyGroupIds"
          v-model:userIds="cr.notifyUserIds"
          :editable="isEditable"
          hint=""
        />
      </BaseRailCard>

      <!-- 4. Schedule -->
      <BaseRailCard title="Schedule">
        <BaseDetailField label="Due date">
          <BaseDateField v-if="isEditable" v-model="cr.dueDate" mode="date" class="tw:w-full" />
          <span
            v-else
            class="tw:text-sm tw:font-medium tw:flex tw:items-center tw:gap-1 tw:flex-nowrap"
            :class="isOverdue ? 'tw:text-red-600' : ''"
          >
            <span>{{ cr.dueDate ? cr.dueDate.formatDate('date') : '—' }}</span>
            <IconAlertTriangle v-if="isOverdue" :size="16" class="tw:text-red-600" />
          </span>
        </BaseDetailField>
        <BaseDetailField label="Target implementation">
          <BaseDateField
            v-if="isEditable"
            v-model="cr.targetImplementationDate"
            mode="date"
            class="tw:w-full"
          />
          <BaseText v-else variant="body" weight="medium">
            {{ cr.targetImplementationDate ? cr.targetImplementationDate.formatDate('date') : '—' }}
          </BaseText>
        </BaseDetailField>
        <BaseDetailField
          label="Submitted"
          :value="cr.submittedAt ? cr.submittedAt.formatDate('date') : null"
        />
        <BaseDetailField
          label="Approved"
          :value="cr.approvedAt ? cr.approvedAt.formatDate('date') : null"
        />
      </BaseRailCard>
    </template>
  </BaseDetailLayout>

  <!-- Submit-for-Approval dialog -->
  <BaseDialog v-model="showOpenDialog" title="Submit for Approval" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <p class="tw:text-sm tw:text-on-main">
        Submitting starts the approval workflow and makes this Change Request a
        <strong>permanent audit record</strong>.
      </p>
      <ul class="tw:text-sm tw:text-secondary tw:list-disc tw:pl-5 tw:space-y-1">
        <li>Reviewers in each approval step receive a task in their inbox.</li>
        <li>Once approved, you'll add implementation sub-tasks for each affected area.</li>
        <li>It can no longer be deleted — only closed or cancelled with a recorded reason.</li>
      </ul>
      <p
        v-if="saveError"
        class="tw:text-xs tw:text-red-600 tw:bg-red-50 tw:border tw:border-red-200 tw:rounded-md tw:p-2"
      >
        {{ saveError }}
      </p>
    </div>
    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Submit for Approval"
        :loading="opening"
        @cancel="close"
        @submit="handleOpenCr"
      />
    </template>
  </BaseDialog>

  <!-- Cancel CR dialog -->
  <BaseDialog v-model="showCancelDialog" title="Cancel Change Request" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <p class="tw:text-sm tw:text-on-main">
        Cancelling permanently terminates this Change Request. The record stays in the audit log;
        you cannot re-open it.
      </p>
      <BaseField v-slot="{ id: fieldId }" label="Reason" required :error="cancelReasonError">
        <BaseTextarea
          :id="fieldId"
          v-model="cancelReason"
          :rows="3"
          placeholder="Why is this Change Request being cancelled?"
          @input="cancelReasonError = ''"
        />
      </BaseField>
      <p
        v-if="saveError"
        class="tw:text-xs tw:text-red-600 tw:bg-red-50 tw:border tw:border-red-200 tw:rounded-md tw:p-2"
      >
        {{ saveError }}
      </p>
    </div>
    <template #footer="{ close }">
      <BaseDialogFooter
        cancelLabel="Back"
        submitLabel="Sign & Cancel"
        submitVariant="danger"
        :loading="cancelling"
        :disabled="!cancelReason.trim()"
        @cancel="close"
        @submit="handleCancelClick"
      />
    </template>
  </BaseDialog>

  <!-- Close CR dialog -->
  <BaseDialog v-model="showCloseDialog" title="Close Change Request" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <p class="tw:text-sm tw:text-on-main">
        Closing this Change Request marks it complete. The implementation phase is done and
        effectiveness has been verified.
      </p>
      <p
        v-if="closeBlockedReason"
        class="tw:text-sm tw:text-red-700 tw:bg-red-50 tw:border tw:border-red-200 tw:rounded-md tw:p-3"
      >
        {{ closeBlockedReason }}
      </p>
      <BaseField v-slot="{ id: fieldId }" label="Closure notes" optional>
        <BaseTextarea
          :id="fieldId"
          v-model="closeComments"
          :rows="3"
          placeholder="Summary of the change outcome, lessons learned, etc."
        />
      </BaseField>
      <p
        v-if="saveError"
        class="tw:text-xs tw:text-red-600 tw:bg-red-50 tw:border tw:border-red-200 tw:rounded-md tw:p-2"
      >
        {{ saveError }}
      </p>
    </div>
    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Sign & Close"
        :loading="closing"
        :disabled="!canClose"
        @cancel="close"
        @submit="handleCloseClick"
      />
    </template>
  </BaseDialog>

  <!-- Delete draft dialog -->
  <BaseDialog v-model="showDeleteDialog" title="Delete Draft Change Request" maxWidth="md">
    <p class="tw:text-sm tw:text-on-main tw:mb-3">
      Delete this draft Change Request? Drafts have no audit history yet, so this is safe.
    </p>
    <div class="tw:flex tw:justify-end tw:gap-2 tw:pt-3 tw:border-t tw:border-divider">
      <BaseButton variant="outline" :disabled="deleting" @click="showDeleteDialog = false">
        Cancel
      </BaseButton>
      <BaseButton variant="danger" :disabled="deleting" @click="handleDeleteDraft">
        {{ deleting ? 'Deleting…' : 'Delete' }}
      </BaseButton>
    </div>
  </BaseDialog>

  <WorkflowInstanceEsignAuthDialog v-model="showCancelEsign" @verified="onCancelEsignVerified" />
  <WorkflowInstanceEsignAuthDialog v-model="showCloseEsign" @verified="onCloseEsignVerified" />

  <AuditLogDialog
    v-model="showAuditLog"
    :includeEntities="auditIncludeEntities"
    :title="`Audit Log — ${cr?.crNumber ?? 'Change Request'}`"
  />
</template>
