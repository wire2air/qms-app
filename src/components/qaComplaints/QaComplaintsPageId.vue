<script setup>
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { DateTime } from 'luxon'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { useRecordTrail } from '@/composables/useRecordTrail.js'

/**
 * QA investigation view of a customer complaint. Same record as the support
 * Customer Complaints detail page, but framed for quality: no customer
 * conversation / reply surface. QA reviews the complaint, records the QA
 * fields (lot/batch/region/symptoms) via custom fields, keeps an internal
 * investigation trail (QA notes), changes status/disposition, and escalates
 * to NC. The support UI still owns the customer-facing side.
 */
const props = defineProps({
  id: { type: String, required: true },
})

const router = useRouter()
const route = useRoute()
const toast = useToast()
const { visit: visitTrail } = useRecordTrail()

const complaint = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => db.CustomerComplaint.findByPk(id),
  { models: ['CustomerComplaint'] },
)
watch(
  complaint,
  (c) => {
    if (c?.id)
      visitTrail({ type: 'Complaint', id: c.id, label: c.complaintNumber, path: route.path })
  },
  { immediate: true },
)

const loading = computed(() => complaint.value === undefined)

const breadcrumbs = computed(() => [
  { label: 'Complaints', to: getCompanyPath('/complaints') },
  { label: complaint.value?.complaintNumber || complaint.value?.subject || 'Loading…' },
])

const canUpdate = computed(() => isAllowed(['customerComplaints:update']))
const canConvert = computed(
  () => isAllowed(['customerComplaints:update']) && isAllowed(['nonconformances:create']),
)

const isTerminal = computed(() => ['CLOSED', 'CONVERTED_TO_NC'].includes(complaint.value?.statusId))
const isEditable = computed(() => complaint.value && !isTerminal.value && canUpdate.value)

// Inline edit auto-save (description / priority / assignee / group).
const { saveError } = useAutoSave(complaint)
const editingDescription = ref(false)

// ─── Lifecycle action RPCs (status / disposition) ────────────────────────────
const acting = ref(false)

async function runAction(path, body = {}) {
  acting.value = true
  saveError.value = null
  try {
    await post(`/v1/services/customerComplaints/${props.id}/${path}`, body)
  } catch (e) {
    saveError.value = e.message || 'Action failed'
    toast.notify({ type: 'negative', message: saveError.value })
  } finally {
    acting.value = false
  }
}

const showCloseDialog = ref(false)
const closeComment = ref('')

async function handleClose() {
  await runAction('close', { comment: closeComment.value.trim() || null })
  showCloseDialog.value = false
  closeComment.value = ''
}

// ─── Owner closure approval (e-sign) ──────────────────────────────────────────
const currentUserId = computed(() => currentSession.value?.userId)
const isOwner = computed(
  () => complaint.value?.ownerId && complaint.value.ownerId === currentUserId.value,
)
const pendingApproval = computed(() => complaint.value?.statusId === 'PENDING_APPROVAL')

const showApproveDialog = ref(false)
const approvePin = ref('')
const approveComment = ref('')

async function handleApproveClosure() {
  await runAction('approveClosure', {
    method: 'PIN',
    token: approvePin.value,
    comment: approveComment.value.trim() || null,
  })
  showApproveDialog.value = false
  approvePin.value = ''
  approveComment.value = ''
}

// ─── Convert to NC ────────────────────────────────────────────────────────────
const showConvertDialog = ref(false)

function onConverted(ncId) {
  showConvertDialog.value = false
  router.push(getCompanyPath(`/nonconformances/${ncId}`))
}

// ─── Linked NC (via the generic nc_source_links table) ───────────────────────
const ncLinks = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [complaintId]) => {
    if (!complaintId) return []
    return db.NcSourceLink.where('[sourceType+sourceId]', ['CUSTOMER_COMPLAINT', complaintId]).exec()
  },
  { models: ['NcSourceLink'], initial: [] },
)
const linkedNcIdList = computed(() => ncLinks.value.map((l) => l.ncId).join(','))
const linkedNcs = useLiveQueryWithDeps(
  [() => linkedNcIdList.value],
  async (db, [idsStr]) => {
    if (!idsStr) return []
    const rows = await Promise.all(idsStr.split(',').map((id) => db.Nonconformance.findByPk(id)))
    return rows.filter(Boolean)
  },
  { models: ['Nonconformance'], initial: [] },
)

// ─── Audit log ────────────────────────────────────────────────────────────────
const showAuditLog = ref(false)
const auditIncludeEntities = computed(() => [
  { entityType: 'CustomerComplaint', entityIds: [props.id] },
  { entityType: 'CustomerComplaints', entityIds: [props.id] },
])

// ─── Header actions ───────────────────────────────────────────────────────────
const complaintActions = computed(() => {
  const statusId = complaint.value?.statusId
  return [
    {
      id: 'convert',
      label: 'Create NC',
      variant: 'primary',
      priority: 100,
      visible: canConvert.value && !isTerminal.value,
      disabled: acting.value,
      onSelect: () => (showConvertDialog.value = true),
    },
    {
      id: 'approveClosure',
      label: 'Approve closure',
      variant: 'primary',
      priority: 95,
      visible: pendingApproval.value && isOwner.value,
      disabled: acting.value,
      onSelect: () => (showApproveDialog.value = true),
    },
    {
      id: 'resolve',
      label: 'Resolve',
      variant: 'outline',
      priority: 80,
      visible: isEditable.value && !pendingApproval.value && statusId !== 'RESOLVED',
      disabled: acting.value,
      onSelect: () => runAction('resolve'),
    },
    {
      id: 'hold',
      label: 'Put on hold',
      variant: 'outline',
      priority: 70,
      visible: isEditable.value && !pendingApproval.value && statusId !== 'ON_HOLD',
      disabled: acting.value,
      onSelect: () => runAction('hold'),
    },
    {
      // Backend routes Close → PENDING_APPROVAL when the company requires owner
      // approval, otherwise closes directly.
      id: 'close',
      label: 'Close',
      variant: 'outline',
      priority: 60,
      visible: isEditable.value && !pendingApproval.value,
      disabled: acting.value,
      onSelect: () => (showCloseDialog.value = true),
    },
    {
      id: 'reopen',
      label: 'Reopen',
      variant: 'outline',
      priority: 60,
      visible: canUpdate.value && statusId === 'CLOSED',
      disabled: acting.value,
      onSelect: () => runAction('reopen'),
    },
    {
      id: 'audit',
      label: 'Audit log',
      variant: 'ghost',
      priority: 10,
      visible: true,
      onSelect: () => (showAuditLog.value = true),
    },
  ]
})

const complaintDetailConfig = computed(() =>
  defineDetailConfig({
    variant: 'standard',
    width: 'standard',
    breadcrumbs: breadcrumbs.value,
    banners: () =>
      isTerminal.value
        ? [
            {
              id: 'read-only',
              tone: 'neutral',
              title: 'Read-only',
              message: `This complaint is ${complaint.value?.statusId === 'CONVERTED_TO_NC' ? 'escalated to NC' : 'closed'} and read-only.`,
            },
          ]
        : [],
    actions: complaintActions.value,
    sections: [{ id: 'investigation', label: 'Investigation' }],
  }),
)
</script>

<template>
  <BaseDetailLayout
    :config="complaintDetailConfig"
    :record="complaint"
    :loading="loading"
    :notFound="!loading && !complaint"
    notFoundTitle="Complaint not found"
    notFoundDescription="This complaint could not be found."
  >
    <template #title>
      <div class="tw:text-base tw:font-semibold tw:text-on-main tw:mb-2">
        {{ complaint?.subject }}
      </div>
    </template>

    <template #status>
      <CustomerComplaintStatusBadgeById v-if="complaint" :statusId="complaint.statusId" />
    </template>

    <template v-if="complaint" #meta>
      <span>{{ complaint.complaintNumber }}</span>
      <template v-if="complaint.sourceId">
        · <CustomerComplaintSourceBadgeById :sourceId="complaint.sourceId" />
      </template>
      <template v-if="complaint.createdAt"> · {{ complaint.createdAt.formatDate('date') }} </template>
    </template>

    <template #actions>
      <div class="tw:flex tw:items-center tw:gap-2">
        <DetailActionBar :actions="complaintActions" />
        <AskAiButton
          v-if="complaint?.id"
          entityType="CustomerComplaint"
          :entityId="complaint.id"
          :entityTitle="complaint.subject"
          :entityNumber="complaint.complaintNumber"
        />
      </div>
    </template>

    <template v-if="complaint" #section-investigation>
      <RecordTrailBreadcrumb />
      <div
        v-if="saveError"
        class="tw:bg-red-50 tw:border tw:border-red-200 tw:text-red-700 tw:rounded-md tw:p-2 tw:text-sm"
      >
        {{ saveError }}
      </div>

      <!-- Complaint summary (read-only reference for the investigator) -->
      <FormSection title="Complaint">
        <BaseTextarea
          v-if="editingDescription && isEditable"
          v-model="complaint.description"
          placeholder="Description…"
          :rows="4"
          class="tw:mb-2"
          @blur="editingDescription = false"
        />
        <div v-else class="tw:mb-2" @click="isEditable && (editingDescription = true)">
          <p
            class="tw:text-sm tw:text-secondary tw:leading-relaxed tw:whitespace-pre-wrap"
            :class="isEditable ? 'tw:cursor-pointer tw:hover:text-primary' : ''"
          >
            {{ complaint.description || (isEditable ? 'Add a description…' : '—') }}
          </p>
        </div>
      </FormSection>

      <!-- Investigation (rich text + attachments) — structured, QA-completed. -->
      <FormSection title="Investigation">
        <RichTextAttachments
          v-model="complaint.investigation"
          :readonly="!isEditable"
          placeholder="Document the investigation — findings, analysis, evidence…"
        />
      </FormSection>

      <!-- Review Summary (rich text + attachments). -->
      <FormSection title="Review summary">
        <RichTextAttachments
          v-model="complaint.reviewSummary"
          :readonly="!isEditable"
          placeholder="Reviewer's summary and conclusion…"
        />
      </FormSection>

      <!-- QA Investigation notes — internal thread (no customer conversation). -->
      <CustomerComplaintQaNotes :complaintId="id" :canUpdate="isEditable" />

      <!-- Attachments (photos / evidence) -->
      <CustomerComplaintAttachmentsPanel :complaintId="id" :canUpdate="isEditable" />
    </template>

    <template v-if="complaint" #rail>
      <!-- ══ UNSTRUCTURED / PROVENANCE (from intake, import or Zendesk) ══ -->
      <!-- 1. General -->
      <BaseRailCard title="Complaint" grid>
        <BaseDetailField label="Complaint number">
          <BaseText variant="body" weight="medium" class="tw:break-words">
            {{ complaint.complaintNumber || '—' }}
          </BaseText>
        </BaseDetailField>
        <BaseDetailField label="Status">
          <CustomerComplaintStatusBadgeById :statusId="complaint.statusId" />
        </BaseDetailField>
        <BaseDetailField label="Intake source">
          <CustomerComplaintSourceBadgeById :sourceId="complaint.sourceId" />
        </BaseDetailField>
        <BaseDetailField label="Received" :value="complaint.createdAt?.formatDate('date')" />
      </BaseRailCard>

      <!-- 2. Customer information (unstructured — arrives with the complaint) -->
      <BaseRailCard title="Customer information" grid>
        <BaseDetailField label="Name" :value="complaint.customerName || '—'" />
        <BaseDetailField label="Company" :value="complaint.customerCompany || '—'" />
        <BaseDetailField label="Email" :value="complaint.customerEmail || '—'" />
        <BaseDetailField label="Phone" :value="complaint.customerPhone || '—'" />
        <BaseDetailField label="Customer type">
          <ComplaintLookupSelectMenu
            v-if="isEditable"
            v-model="complaint.customerTypeId"
            model="ComplaintCustomerType"
          />
          <ComplaintLookupBadge
            v-else
            :id="complaint.customerTypeId"
            model="ComplaintCustomerType"
          />
        </BaseDetailField>
      </BaseRailCard>

      <!-- 3. Additional information — custom fields (Zendesk/import extras). -->
      <CustomFieldsCard entityType="CustomerComplaint" :entityId="id" :editable="isEditable" />

      <!-- ══ STRUCTURED — completed by the QA team ══ -->
      <!-- 4. Classification -->
      <BaseRailCard title="Classification" grid>
        <BaseDetailField label="Complaint source">
          <ComplaintLookupSelectMenu
            v-if="isEditable"
            v-model="complaint.complaintSourceId"
            model="ComplaintSourceType"
          />
          <ComplaintLookupBadge v-else :id="complaint.complaintSourceId" model="ComplaintSourceType" />
        </BaseDetailField>
        <BaseDetailField label="Category">
          <ComplaintLookupSelectMenu
            v-if="isEditable"
            v-model="complaint.categoryId"
            model="ComplaintCategory"
          />
          <ComplaintLookupBadge v-else :id="complaint.categoryId" model="ComplaintCategory" />
        </BaseDetailField>
        <BaseDetailField label="Sub-category">
          <ComplaintLookupSelectMenu
            v-if="isEditable"
            v-model="complaint.subCategoryId"
            model="ComplaintSubCategory"
            parentField="categoryId"
            :parentId="complaint.categoryId"
          />
          <ComplaintLookupBadge v-else :id="complaint.subCategoryId" model="ComplaintSubCategory" />
        </BaseDetailField>
        <BaseDetailField label="Type">
          <ComplaintLookupSelectMenu
            v-if="isEditable"
            v-model="complaint.complaintTypeId"
            model="ComplaintType"
          />
          <ComplaintLookupBadge v-else :id="complaint.complaintTypeId" model="ComplaintType" />
        </BaseDetailField>
        <BaseDetailField label="Severity">
          <ComplaintLookupSelectMenu
            v-if="isEditable"
            v-model="complaint.severityId"
            model="ComplaintSeverity"
          />
          <ComplaintLookupBadge v-else :id="complaint.severityId" model="ComplaintSeverity" />
        </BaseDetailField>
        <BaseDetailField label="Risk level">
          <ComplaintLookupSelectMenu
            v-if="isEditable"
            v-model="complaint.riskLevelId"
            model="ComplaintRiskLevel"
          />
          <ComplaintLookupBadge v-else :id="complaint.riskLevelId" model="ComplaintRiskLevel" />
        </BaseDetailField>
        <BaseDetailField label="Regulatory reportable">
          <BaseCheckbox v-if="isEditable" v-model="complaint.regulatoryReportable" />
          <BaseText v-else color="secondary">{{ complaint.regulatoryReportable ? 'Yes' : 'No' }}</BaseText>
        </BaseDetailField>
        <BaseDetailField label="Safety issue">
          <BaseCheckbox v-if="isEditable" v-model="complaint.safetyIssue" />
          <BaseText v-else color="secondary">{{ complaint.safetyIssue ? 'Yes' : 'No' }}</BaseText>
        </BaseDetailField>
      </BaseRailCard>

      <!-- 5. Product & origin -->
      <BaseRailCard title="Product & origin" grid>
        <BaseDetailField label="Product / Service">
          <ProductSelectMenu v-if="isEditable" v-model="complaint.productId" :required="false" />
          <ProductBadgeById v-else-if="complaint.productId" :productId="complaint.productId" />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
        <BaseDetailField label="Product code / SKU">
          <BaseTextInput v-if="isEditable" v-model="complaint.productCodeSku" size="sm" />
          <BaseText v-else color="secondary">{{ complaint.productCodeSku || '—' }}</BaseText>
        </BaseDetailField>
        <BaseDetailField label="Batch / Lot / Serial">
          <BaseTextInput v-if="isEditable" v-model="complaint.batchLotSerial" size="sm" />
          <BaseText v-else color="secondary">{{ complaint.batchLotSerial || '—' }}</BaseText>
        </BaseDetailField>
        <BaseDetailField label="Quantity affected">
          <BaseTextInput v-if="isEditable" v-model.number="complaint.quantityAffected" type="number" size="sm" />
          <BaseText v-else color="secondary">{{ complaint.quantityAffected ?? '—' }}</BaseText>
        </BaseDetailField>
        <BaseDetailField label="Order / Invoice #">
          <BaseTextInput v-if="isEditable" v-model="complaint.orderInvoiceNumber" size="sm" />
          <BaseText v-else color="secondary">{{ complaint.orderInvoiceNumber || '—' }}</BaseText>
        </BaseDetailField>
        <BaseDetailField label="Region">
          <ComplaintLookupSelectMenu v-if="isEditable" v-model="complaint.regionId" model="ComplaintRegion" />
          <ComplaintLookupBadge v-else :id="complaint.regionId" model="ComplaintRegion" />
        </BaseDetailField>
        <BaseDetailField label="Country">
          <ComplaintLookupSelectMenu
            v-if="isEditable"
            v-model="complaint.countryId"
            model="ComplaintCountry"
            parentField="regionId"
            :parentId="complaint.regionId"
          />
          <ComplaintLookupBadge v-else :id="complaint.countryId" model="ComplaintCountry" />
        </BaseDetailField>
        <BaseDetailField label="State / Province">
          <BaseTextInput v-if="isEditable" v-model="complaint.stateProvince" size="sm" />
          <BaseText v-else color="secondary">{{ complaint.stateProvince || '—' }}</BaseText>
        </BaseDetailField>
        <BaseDetailField label="Site / Branch">
          <SiteSelectMenu v-if="isEditable" v-model="complaint.siteId" :required="false" />
          <SiteBadgeById v-else-if="complaint.siteId" :siteId="complaint.siteId" />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
      </BaseRailCard>

      <!-- 6. Ownership, assignment & SLA -->
      <BaseRailCard title="Ownership & SLA" grid>
        <BaseDetailField label="Owner">
          <UserBadgeById v-if="complaint.ownerId" :userId="complaint.ownerId" />
          <BaseText v-else color="secondary" class="tw:italic">Unassigned</BaseText>
        </BaseDetailField>
        <BaseDetailField label="Investigator">
          <UserBadgeById v-if="complaint.assignedTo" :userId="complaint.assignedTo" />
          <BaseText v-else color="secondary" class="tw:italic">Unassigned</BaseText>
        </BaseDetailField>
        <BaseDetailField label="Group">
          <GroupSelectMenu v-if="isEditable" v-model="complaint.assignedTeamId" />
          <GroupBadgeById v-else-if="complaint.assignedTeamId" :teamId="complaint.assignedTeamId" />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
        <BaseDetailField label="Priority">
          <CustomerComplaintPrioritySelectMenu v-if="isEditable" v-model="complaint.priorityId" />
          <CustomerComplaintPriorityBadgeById
            v-else-if="complaint.priorityId"
            :priorityId="complaint.priorityId"
          />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
        <BaseDetailField
          v-if="complaint.investigationStartedAt"
          label="Investigation started"
          :value="complaint.investigationStartedAt.formatDate('date')"
        />
        <BaseDetailField label="Resolution target">
          <BaseText
            v-if="complaint.resolutionTargetAt"
            variant="body"
            weight="medium"
            :class="!isTerminal && complaint.resolutionTargetAt < DateTime.now() ? 'tw:text-red-600' : ''"
          >
            {{ complaint.resolutionTargetAt.formatDate('date') }}
          </BaseText>
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
        <BaseDetailField
          v-if="complaint.closureApprovedBy"
          label="Closure approved by"
        >
          <UserBadgeById :userId="complaint.closureApprovedBy" />
        </BaseDetailField>
      </BaseRailCard>

      <!-- 7. Linked NC -->
      <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4">
        <BaseText variant="overline" class="tw:block tw:pb-2 tw:border-b tw:border-divider tw:mb-3">
          Linked NC
        </BaseText>
        <div v-if="linkedNcs.length" class="tw:flex tw:flex-col tw:gap-2">
          <RouterLink
            v-for="nc in linkedNcs"
            :key="nc.id"
            :to="getCompanyPath(`/nonconformances/${nc.id}`)"
            class="tw:flex tw:items-center tw:justify-between tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2 tw:hover:bg-main-hover"
          >
            <div class="tw:flex tw:items-center tw:gap-2 tw:min-w-0">
              <span class="tw:text-xs tw:text-secondary">{{ nc.ncNumber }}</span>
              <span class="tw:text-sm tw:font-medium tw:truncate">{{ nc.title }}</span>
            </div>
            <NcStatusBadgeById :statusId="nc.statusId" />
          </RouterLink>
        </div>
        <div v-else class="tw:text-sm tw:text-secondary tw:italic">
          No NC escalated from this complaint.
        </div>
      </div>
    </template>
  </BaseDetailLayout>

  <!-- Close dialog -->
  <BaseDialog v-model="showCloseDialog" title="Close Complaint" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <p class="tw:text-sm tw:text-on-main">
        Closing marks this complaint as done. If the customer replies by email, the support ticket
        reopens automatically.
      </p>
      <BaseTextarea v-model="closeComment" :rows="3" placeholder="Closing comment (optional)…" />
    </div>
    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Close Complaint"
        :loading="acting"
        @cancel="close"
        @submit="handleClose"
      />
    </template>
  </BaseDialog>

  <!-- Owner closure approval (e-sign PIN) -->
  <BaseDialog v-model="showApproveDialog" title="Approve closure" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <p class="tw:text-sm tw:text-on-main">
        As the owner, approving closes this complaint. Enter your e-signature PIN to sign the
        approval.
      </p>
      <BaseField label="E-signature PIN" required :value="approvePin">
        <template #default="field">
          <BaseTextInput
            v-bind="field"
            v-model="approvePin"
            type="password"
            placeholder="••••"
            autocomplete="off"
          />
        </template>
      </BaseField>
      <BaseTextarea v-model="approveComment" :rows="2" placeholder="Approval comment (optional)…" />
    </div>
    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Sign & close"
        :loading="acting"
        :disabled="!approvePin"
        @cancel="close"
        @submit="handleApproveClosure"
      />
    </template>
  </BaseDialog>

  <!-- Convert to NC -->
  <CustomerComplaintConvertToNcDialog
    v-model="showConvertDialog"
    :complaints="complaint ? [complaint] : []"
    @converted="onConverted"
  />

  <!-- Audit log -->
  <AuditLogDialog
    v-model="showAuditLog"
    :includeEntities="auditIncludeEntities"
    :title="`Audit Log — ${complaint?.complaintNumber ?? 'Complaint'}`"
  />
</template>
