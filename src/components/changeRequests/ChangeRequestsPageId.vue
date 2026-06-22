<script setup>
import { IconAlertTriangle, IconPrinter, IconClipboardList } from '@tabler/icons-vue'
import { post } from '@/api'
import { currentSession, isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { DateTime } from 'luxon'
import { useRecordTrail } from '@/composables/useRecordTrail.js'

const props = defineProps({
  id: { type: String, required: true },
})

const router = useRouter()
const route = useRoute()
const toast = useToast()
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
const canUpdate = computed(() => isAllowed(['changeRequests:update']))
const canDelete = computed(() => isAllowed(['changeRequests:delete']))

const isEditable = computed(
  () => cr.value && cr.value.statusId === 'DRAFT' && canUpdate.value && isOwner.value,
)

// Inline auto-save while DRAFT (mirrors NC + CAPA).
const { saveError } = useAutoSave(cr, {
  enabled: () => cr.value?.statusId === 'DRAFT' && isOwner.value,
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
function openCancelDialog() {
  cancelReason.value = ''
  saveError.value = null
  showCancelDialog.value = true
}
function handleCancelClick() {
  if (!cancelReason.value.trim()) {
    toast.warning('A cancel reason is required')
    return
  }
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
</script>

<template>
  <BaseDetailPage
    :breadcrumbs="breadcrumbs"
    :loading="loading"
    :notFound="!loading && !cr"
    notFoundTitle="Change Request not found"
    notFoundDescription="This Change Request could not be found."
    width="standard"
  >
    <template #actions>
      <!-- Lifecycle (left) -->
      <BaseButton
        v-if="isOwner && cr?.statusId === 'DRAFT'"
        variant="primary"
        :disabled="opening"
        @click="openOpenDialog"
      >
        Submit for Approval
      </BaseButton>
      <BaseButton
        v-if="isOwner && canClose"
        variant="danger"
        :disabled="closing"
        @click="openCloseDialog"
      >
        Close
      </BaseButton>
      <BaseButton
        v-if="isOwner && cr && !['DRAFT', 'CLOSED', 'REJECTED', 'CANCELLED'].includes(cr.statusId)"
        variant="outline"
        :disabled="cancelling"
        @click="openCancelDialog"
      >
        Cancel
      </BaseButton>
      <BaseButton
        v-if="isOwner && canDelete && cr?.statusId === 'DRAFT'"
        variant="outline"
        :disabled="deleting"
        @click="showDeleteDialog = true"
      >
        Delete
      </BaseButton>

      <!-- Utilities (right) -->
      <BaseButton v-if="cr?.id" variant="secondary" @click="openPrintView">
        <IconPrinter :size="20" class="tw:mr-1" />
        Print
      </BaseButton>
      <BaseButton v-if="cr?.id" variant="secondary" @click="showAuditLog = true">
        <IconClipboardList :size="20" class="tw:mr-1" />
        Audit Log
      </BaseButton>
      <AskAiButton
        v-if="cr?.id"
        entityType="ChangeRequest"
        :entityId="cr.id"
        :entityTitle="cr.title"
        :entityNumber="cr.crNumber"
      />
    </template>

    <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
      <RecordTrailBreadcrumb />
      <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-[65fr_16fr] tw:gap-4 tw:items-start">
        <!-- Left column -->
        <div class="tw:flex tw:flex-col tw:gap-4">
          <!-- Details card -->
          <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
            <BaseText
              variant="overline"
              class="tw:block tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
            >
              Change Request Details
            </BaseText>

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
              {{ cr.title }}
            </div>

            <BaseRichTextField
              v-model="cr.description"
              :editable="isEditable"
              clickToEdit
              clickToEditLabel="Add a description…"
              placeholder="Describe the change…"
              class="tw:mb-4"
            />

            <div class="tw:grid tw:grid-cols-3 tw:gap-3">
              <div class="tw:flex tw:flex-col tw:gap-1">
                <div class="tw:text-xs tw:text-secondary">Change Type</div>
                <ChangeTypeBadgeById :changeTypeId="cr.changeTypeId" />
              </div>
              <div class="tw:flex tw:flex-col tw:gap-1">
                <div class="tw:text-xs tw:text-secondary">Classification</div>
                <span class="tw:text-sm tw:font-medium">{{ cr.classification || '—' }}</span>
              </div>
              <div class="tw:flex tw:flex-col tw:gap-1">
                <div class="tw:text-xs tw:text-secondary">Priority</div>
                <ChangeRequestPriorityBadgeById :priorityId="cr.priorityId" />
              </div>
              <div class="tw:flex tw:flex-col tw:gap-1">
                <div class="tw:text-xs tw:text-secondary">Initiated</div>
                <span class="tw:text-sm tw:font-medium">
                  {{ cr.initiatedAt ? cr.initiatedAt.formatDate('date') : '—' }}
                </span>
              </div>
            </div>
          </div>

          <!-- Reason + Justification -->
          <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
            <BaseText
              variant="overline"
              class="tw:block tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
            >
              Reason &amp; Justification
            </BaseText>
            <div class="tw:mb-4">
              <div class="tw:text-xs tw:font-medium tw:text-secondary tw:mb-1">
                Reason for Change
              </div>
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
          </div>

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
        </div>

        <!-- Right column -->
        <div class="tw:flex tw:flex-col tw:gap-3">
          <!-- Overview side card. Grouped into subsections with quiet
                 dividers so the right rail stays scannable — same pattern
                 NC uses (Identification → People & Location → Schedule).
                 Change Type / Classification / Priority / Initiated stay
                 in the main "Change Request Details" grid because they're
                 required at create. -->
          <BaseOverviewPanel>
            <BaseDetailSection title="General">
              <BaseDetailField label="CR number">
                <BaseText variant="body" weight="medium" class="tw:font-mono tw:break-words">
                  {{ cr.crNumber || '—' }}
                </BaseText>
              </BaseDetailField>
              <BaseDetailField label="Status">
                <ChangeRequestStatusBadgeById :statusId="cr.statusId" />
              </BaseDetailField>
            </BaseDetailSection>

            <BaseDetailSection title="Ownership" divided>
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
                <DepartmentSelectMenu
                  v-if="isEditable"
                  v-model="cr.departmentId"
                  :required="true"
                />
                <DepartmentBadgeById v-else-if="cr.departmentId" :departmentId="cr.departmentId" />
                <BaseText v-else color="secondary">—</BaseText>
              </BaseDetailField>
            </BaseDetailSection>

            <!-- Notify (cc) — groups/people emailed + in-app on status change -->
            <BaseDetailSection title="Notify (cc)" divided>
              <NotificationCcField
                v-model:groupIds="cr.notifyGroupIds"
                v-model:userIds="cr.notifyUserIds"
                :editable="isEditable"
                hint=""
              />
            </BaseDetailSection>

            <BaseDetailSection title="Schedule" divided>
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
                  {{
                    cr.targetImplementationDate
                      ? cr.targetImplementationDate.formatDate('date')
                      : '—'
                  }}
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
            </BaseDetailSection>
          </BaseOverviewPanel>
        </div>
      </div>
    </div>

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
        <BaseField v-slot="{ id: fieldId }" label="Reason" required>
          <BaseTextarea
            :id="fieldId"
            v-model="cancelReason"
            :rows="3"
            placeholder="Why is this Change Request being cancelled?"
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
  </BaseDetailPage>
</template>
