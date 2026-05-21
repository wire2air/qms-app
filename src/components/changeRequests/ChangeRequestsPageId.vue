<script setup>
import { IconAlertTriangle, IconPrinter, IconClipboardList } from '@tabler/icons-vue'
import { post } from '@/api'
import { currentSession, isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { DateTime } from 'luxon'

const props = defineProps({
  id: { type: String, required: true },
})

const router = useRouter()
const toast = useToast()

const cr = useLiveQueryWithDeps([() => props.id], async (db, [id]) =>
  db.ChangeRequest.findByPk(id),
)
const loading = computed(() => cr.value === undefined)

const breadcrumbs = computed(() => [
  { label: 'Change Requests', to: getCompanyPath('/change-requests') },
  { label: cr.value?.crNumber || cr.value?.title || 'Loading…' },
])

const isOwner = computed(
  () => cr.value?.ownerId && cr.value.ownerId === currentSession.value?.userId,
)
const canUpdate = computed(() => isAllowed(['changeRequests:update']))
const canDelete = computed(() => isAllowed(['changeRequests:delete']))

const isEditable = computed(
  () =>
    cr.value &&
    cr.value.statusId === 'DRAFT' &&
    canUpdate.value &&
    isOwner.value,
)

// Inline auto-save while DRAFT (mirrors NC + CAPA).
const isFirstLoad = ref(true)
const saving = ref(false)
const saveError = ref(null)

const debouncedSave = useDebounceFn(async () => {
  if (!cr.value || cr.value.statusId !== 'DRAFT') return
  saving.value = true
  try {
    await cr.value.save()
  } catch (e) {
    saveError.value = e.message || 'Failed to save'
  } finally {
    saving.value = false
  }
}, 500)

watch(
  cr,
  () => {
    if (isFirstLoad.value) {
      isFirstLoad.value = false
      return
    }
    if (cr.value && cr.value.statusId === 'DRAFT' && isOwner.value) debouncedSave()
  },
  { deep: true },
)

const workflowInstance = useLiveQueryWithDeps([() => props.id], async (db, [id]) => {
  const results = await db.WorkflowInstance.where('[resourceType+resourceId]', [
    'ChangeRequest',
    id,
  ]).exec()
  return results.find((i) => i.statusId === 'IN_PROGRESS') || results[0] || null
})

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
  { initial: [] },
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
  { initial: [] },
)
const auditIncludeEntities = computed(() => [
  { entityType: 'ChangeRequests', entityIds: [props.id] },
  { entityType: 'WorkflowInstances', entityIds: allWfInstanceIds.value },
  { entityType: 'WorkflowInstanceSteps', entityIds: allWfStepIds.value },
])

// ─── Source link (originating record) ────────────────────────────────────────
const sourceNc = useLiveQueryWithDeps(
  [() => cr.value?.sourceType, () => cr.value?.sourceId],
  async (db, [type, id]) => {
    if (type !== 'NC' || !id) return null
    return db.Nonconformance.findByPk(id)
  },
)
const sourceCapa = useLiveQueryWithDeps(
  [() => cr.value?.sourceType, () => cr.value?.sourceId],
  async (db, [type, id]) => {
    if (type !== 'CAPA' || !id) return null
    return db.Capa.findByPk(id)
  },
)

// ─── Editing toggles for inline fields ───────────────────────────────────────
const editingTitle = ref(false)
const editingDescription = ref(false)
const editingReason = ref(false)
const editingJustification = ref(false)
</script>

<template>
  <div class="tw:flex tw:flex-col tw:h-full">
    <SafeTeleport to="#main-header-title">
      <BaseBreadcrumbs :items="breadcrumbs" />
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <div class="tw:flex tw:items-center tw:gap-2">
        <!-- Lifecycle (left) -->
        <BaseButton
          v-if="isOwner && cr?.statusId === 'DRAFT'"
          variant="primary"
          :disabled="opening"
          @click="openOpenDialog"
        >
          Open Change Request
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
          v-if="
            isOwner &&
            cr &&
            !['DRAFT', 'CLOSED', 'REJECTED', 'CANCELLED'].includes(cr.statusId)
          "
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
      </div>
    </SafeTeleport>

    <div v-if="loading" class="tw:flex tw:items-center tw:justify-center tw:h-full">
      <div
        class="tw:animate-spin tw:rounded-full tw:w-8 tw:h-8 tw:border-2 tw:border-primary tw:border-t-transparent"
      />
    </div>

    <div v-else-if="cr" class="tw:overflow-y-auto tw:flex-1">
      <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
        <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-[1fr_280px] tw:gap-4 tw:items-start">
          <!-- Left column -->
          <div class="tw:flex tw:flex-col tw:gap-4">
            <!-- Details card -->
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
              >
                Change Request Details
              </div>

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

              <BaseTextarea
                v-if="editingDescription && isEditable"
                v-model="cr.description"
                placeholder="Describe the change…"
                autofocus
                rows="3"
                class="tw:mb-4"
                @blur="editingDescription = false"
              />
              <p
                v-else
                class="tw:text-sm tw:text-secondary tw:leading-relaxed tw:whitespace-pre-wrap tw:mb-4"
                :class="isEditable ? 'tw:cursor-pointer tw:hover:text-primary' : ''"
                @click="isEditable && (editingDescription = true)"
              >
                {{ cr.description || (isEditable ? 'Add a description…' : '—') }}
              </p>

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
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Target Implementation</div>
                  <span class="tw:text-sm tw:font-medium">
                    {{
                      cr.targetImplementationDate
                        ? cr.targetImplementationDate.formatDate('date')
                        : '—'
                    }}
                  </span>
                </div>
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Due Date</div>
                  <span
                    class="tw:text-sm tw:font-medium tw:flex tw:items-center tw:gap-1"
                    :class="isOverdue ? 'tw:text-red-600' : ''"
                  >
                    {{ cr.dueDate ? cr.dueDate.formatDate('date') : '—' }}
                    <IconAlertTriangle v-if="isOverdue" :size="14" class="tw:text-red-600" />
                  </span>
                </div>
              </div>

              <div v-if="sourceNc || sourceCapa" class="tw:mt-4 tw:pt-3 tw:border-t tw:border-divider">
                <div class="tw:text-xs tw:font-medium tw:text-secondary tw:mb-2">
                  Originating record
                </div>
                <RouterLink
                  v-if="sourceNc"
                  :to="getCompanyPath(`/nonconformances/${sourceNc.id}`)"
                  class="tw:text-sm tw:text-primary tw:font-medium tw:hover:underline"
                >
                  NC {{ sourceNc.ncNumber || sourceNc.title }}
                </RouterLink>
                <RouterLink
                  v-if="sourceCapa"
                  :to="getCompanyPath(`/capas/${sourceCapa.id}`)"
                  class="tw:text-sm tw:text-primary tw:font-medium tw:hover:underline"
                >
                  CAPA {{ sourceCapa.capaNumber || sourceCapa.title }}
                </RouterLink>
              </div>
            </div>

            <!-- Reason + Justification -->
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
              >
                Reason &amp; Justification
              </div>
              <div class="tw:mb-4">
                <div class="tw:text-xs tw:font-medium tw:text-secondary tw:mb-1">
                  Reason for Change
                </div>
                <BaseTextarea
                  v-if="editingReason && isEditable"
                  v-model="cr.reasonForChange"
                  placeholder="What's driving this change?"
                  autofocus
                  :rows="3"
                  @blur="editingReason = false"
                />
                <p
                  v-else
                  class="tw:text-sm tw:text-on-main tw:leading-relaxed tw:whitespace-pre-wrap"
                  :class="isEditable ? 'tw:cursor-pointer tw:hover:text-primary' : ''"
                  @click="isEditable && (editingReason = true)"
                >
                  {{ cr.reasonForChange || (isEditable ? 'Add reason…' : '—') }}
                </p>
              </div>
              <div>
                <div class="tw:text-xs tw:font-medium tw:text-secondary tw:mb-1">
                  Business Justification
                </div>
                <BaseTextarea
                  v-if="editingJustification && isEditable"
                  v-model="cr.businessJustification"
                  placeholder="Cost / quality / compliance impact"
                  autofocus
                  :rows="3"
                  @blur="editingJustification = false"
                />
                <p
                  v-else
                  class="tw:text-sm tw:text-on-main tw:leading-relaxed tw:whitespace-pre-wrap"
                  :class="isEditable ? 'tw:cursor-pointer tw:hover:text-primary' : ''"
                  @click="isEditable && (editingJustification = true)"
                >
                  {{ cr.businessJustification || (isEditable ? 'Add justification…' : '—') }}
                </p>
              </div>
            </div>

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
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4">
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-2 tw:border-b tw:border-divider tw:mb-3"
              >
                Overview
              </div>
              <div class="tw:flex tw:flex-col tw:divide-y tw:divide-border">
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">CR Number</span>
                  <span class="tw:text-xs tw:font-mono tw:font-medium">{{ cr.crNumber || '—' }}</span>
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Status</span>
                  <ChangeRequestStatusBadgeById :statusId="cr.statusId" />
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Owner</span>
                  <UserBadgeById v-if="cr.ownerId" :userId="cr.ownerId" />
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Site</span>
                  <SiteBadgeById :siteId="cr.siteId" />
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Department</span>
                  <DepartmentBadgeById :departmentId="cr.departmentId" />
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Submitted</span>
                  <span class="tw:text-xs">{{ cr.submittedAt ? cr.submittedAt.formatDate('date') : '—' }}</span>
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Approved</span>
                  <span class="tw:text-xs">{{ cr.approvedAt ? cr.approvedAt.formatDate('date') : '—' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <BaseEmptyState
      v-else
      title="Change Request not found"
      description="This Change Request could not be found."
    />

    <!-- Open CR dialog -->
    <BaseDialog v-model="showOpenDialog" title="Open Change Request" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
        <p class="tw:text-sm tw:text-on-main">
          Opening this Change Request starts the assigned workflow and makes it a
          <strong>permanent audit record</strong>.
        </p>
        <ul class="tw:text-sm tw:text-secondary tw:list-disc tw:pl-5 tw:space-y-1">
          <li>Reviewers in each approval step receive a task in their inbox.</li>
          <li>After approval, you'll add implementation sub-tasks for each affected area.</li>
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
        <BaseButton variant="outline" :disabled="opening" @click="close">Cancel</BaseButton>
        <BaseButton
          variant="primary"
          :loading="opening"
          :disabled="opening"
          @click="handleOpenCr"
        >
          Open Change Request
        </BaseButton>
      </template>
    </BaseDialog>

    <!-- Cancel CR dialog -->
    <BaseDialog v-model="showCancelDialog" title="Cancel Change Request" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
        <p class="tw:text-sm tw:text-on-main">
          Cancelling permanently terminates this Change Request. The record stays
          in the audit log; you cannot re-open it.
        </p>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            Reason <span class="tw:text-red-500">*</span>
          </p>
          <BaseTextarea
            v-model="cancelReason"
            :rows="3"
            placeholder="Why is this Change Request being cancelled?"
          />
        </div>
        <p
          v-if="saveError"
          class="tw:text-xs tw:text-red-600 tw:bg-red-50 tw:border tw:border-red-200 tw:rounded-md tw:p-2"
        >
          {{ saveError }}
        </p>
      </div>
      <template #footer="{ close }">
        <BaseButton variant="outline" :disabled="cancelling" @click="close">Back</BaseButton>
        <BaseButton
          variant="danger"
          :loading="cancelling"
          :disabled="!cancelReason.trim() || cancelling"
          @click="handleCancelClick"
        >
          Sign &amp; Cancel
        </BaseButton>
      </template>
    </BaseDialog>

    <!-- Close CR dialog -->
    <BaseDialog v-model="showCloseDialog" title="Close Change Request" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
        <p class="tw:text-sm tw:text-on-main">
          Closing this Change Request marks it complete. The implementation phase is done
          and effectiveness has been verified.
        </p>
        <p
          v-if="closeBlockedReason"
          class="tw:text-sm tw:text-red-700 tw:bg-red-50 tw:border tw:border-red-200 tw:rounded-md tw:p-3"
        >
          {{ closeBlockedReason }}
        </p>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            Closure notes (optional)
          </p>
          <BaseTextarea
            v-model="closeComments"
            :rows="3"
            placeholder="Summary of the change outcome, lessons learned, etc."
          />
        </div>
        <p
          v-if="saveError"
          class="tw:text-xs tw:text-red-600 tw:bg-red-50 tw:border tw:border-red-200 tw:rounded-md tw:p-2"
        >
          {{ saveError }}
        </p>
      </div>
      <template #footer="{ close }">
        <BaseButton variant="outline" :disabled="closing" @click="close">Cancel</BaseButton>
        <BaseButton
          variant="primary"
          :loading="closing"
          :disabled="closing || !canClose"
          @click="handleCloseClick"
        >
          Sign &amp; Close
        </BaseButton>
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
  </div>
</template>
