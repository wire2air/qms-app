<script setup>
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { DateTime } from 'luxon'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { get, post } from '@/api'
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
  async (db, [id]) => db.Complaint.findByPk(id),
  { models: ['Complaint'] },
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

const canUpdate = computed(() => isAllowed(['complaints:update']))
const canConvert = computed(
  () => isAllowed(['complaints:update']) && isAllowed(['ncr:create']),
)

const isTerminal = computed(() => ['CLOSED', 'CONVERTED_TO_NC'].includes(complaint.value?.statusId))
const isEditable = computed(() => complaint.value && !isTerminal.value && canUpdate.value)

// The complaint narrative is only editable for manually-entered complaints —
// imported / external-source (email, web form, integrations) descriptions are
// the original captured content and stay read-only.
const MANUAL_SOURCES = ['WEB', 'PHONE', 'OTHER']
const isManualSource = computed(() => MANUAL_SOURCES.includes(complaint.value?.sourceId))
const descriptionEditable = computed(() => isEditable.value && isManualSource.value)

// Quality-Event-style tabs.
const activeTab = ref('details')
const tabs = [
  { value: 'details', label: 'Complaint details' },
  { value: 'review', label: 'QA Review' },
  { value: 'escalations', label: 'Escalations' },
]

// Inline edit auto-save (description / priority / assignee / group).
const { saveError } = useAutoSave(complaint)

// ─── Lifecycle action RPCs (status / disposition) ────────────────────────────
const acting = ref(false)

async function runAction(path, body = {}) {
  acting.value = true
  saveError.value = null
  try {
    await post(`/v1/services/complaints/${props.id}/${path}`, body)
  } catch (e) {
    saveError.value = e.message || 'Action failed'
    toast.notify({ type: 'negative', message: saveError.value })
  } finally {
    acting.value = false
  }
}

// ─── Owner + approval (approve = close) ───────────────────────────────────────
const currentUserId = computed(() => currentSession.value?.userId)
const isOwner = computed(
  () => complaint.value?.ownerId && complaint.value.ownerId === currentUserId.value,
)

// The current user's actionable task on the active APPROVAL step — drives the
// top "Approve & Close" action. Approving it completes the workflow, which
// auto-closes the complaint (see complaintHandler.onComplete).
const showEsignDialog = ref(false)
const myApprovalTask = useLiveQueryWithDeps(
  [() => workflowInstanceId.value, () => currentUserId.value],
  async (db, [wiId, uid]) => {
    if (!wiId || !uid) return null
    const steps = await db.WorkflowInstanceStep.where('workflowInstanceId', wiId).exec()
    const approvalStep = steps.find((s) => s.stepType === 'APPROVAL' && s.statusId === 'IN_PROGRESS')
    if (!approvalStep) return null
    const tasks = await db.TaskInstance.where('[sourceType+sourceId]', [
      'WorkflowInstanceStep',
      approvalStep.id,
    ]).exec()
    return (
      tasks.find(
        (t) =>
          t.assignedTo === uid &&
          t.taskKindId === 'APPROVAL' &&
          ['ASSIGNED', 'FORM_SUBMITTED', 'PENDING'].includes(t.statusId),
      ) || null
    )
  },
  { models: ['WorkflowInstanceStep', 'TaskInstance'], initial: null },
)

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

// ─── Similar complaints (Postgres full-text "more like this") ─────────────────
// Server-ranked by term overlap on the indexed content (subject/description/
// investigation/review). Fuzzy + stemmed — catches wording/typo variants the
// old exact product/category/batch match missed. No AI.
const relatedComplaints = ref([])
async function loadSimilar() {
  if (!props.id) return
  try {
    // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
    const resp = await get(`/v1/services/complaints/${props.id}/similar`)
    relatedComplaints.value = (resp?.results ?? []).map((r) => ({
      id: r.complaintId,
      complaintNumber: r.complaintNumber,
      subject: r.subject,
      statusId: r.statusId,
    }))
  } catch {
    relatedComplaints.value = []
  }
}
watch(() => props.id, loadSimilar, { immediate: true })
// The source's index updates async after edits — refetch once it settles.
watch(
  () =>
    [
      complaint.value?.subject,
      complaint.value?.description,
      complaint.value?.investigation,
      complaint.value?.reviewSummary,
    ].join('|'),
  useDebounceFn(loadSimilar, 2500),
)

// ─── Manually-linked similar complaints (record_links relation SIMILAR) ───────
const similarLinks = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return []
    const all = await db.RecordLink.where().exec()
    return all.filter(
      (l) =>
        l.relation === 'SIMILAR' &&
        ((l.fromType === 'Complaint' && l.fromId === id) ||
          (l.toType === 'Complaint' && l.toId === id)),
    )
  },
  { models: ['RecordLink'], initial: [] },
)
const linkedSimilarIds = computed(() =>
  similarLinks.value.map((l) => (l.fromId === props.id ? l.toId : l.fromId)),
)
const linkedSimilar = useLiveQueryWithDeps(
  [() => linkedSimilarIds.value.join(',')],
  async (db, [idsStr]) => {
    if (!idsStr) return []
    const rows = await Promise.all(idsStr.split(',').map((id) => db.Complaint.findByPk(id)))
    return rows.filter(Boolean)
  },
  { models: ['Complaint'], initial: [] },
)

// Picker options — complaints available to link (exclude self + already linked).
const pickerComplaintId = ref(null)
const linkableOptions = useLiveQueryWithDeps(
  [() => props.id, () => linkedSimilarIds.value.join(',')],
  async (db, [id, linkedStr]) => {
    const linked = new Set(linkedStr ? linkedStr.split(',') : [])
    const rows = await db.Complaint.where().exec()
    return rows
      .filter((r) => r.id !== id && !linked.has(r.id))
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      .map((r) => ({ id: r.id, name: `${r.complaintNumber || '—'} — ${r.subject}` }))
  },
  { models: ['Complaint'], initial: [] },
)

async function addSimilarLink(targetId) {
  if (!targetId) return
  await runAction('linkSimilar', { targetComplaintId: targetId })
  pickerComplaintId.value = null
}
async function removeSimilarLink(targetId) {
  await runAction('unlinkSimilar', { targetComplaintId: targetId })
}

// ─── QA-review workflow instance + close gating ──────────────────────────────
const workflowInstance = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return null
    const rows = await db.WorkflowInstance.where('[resourceType+resourceId]', [
      'Complaint',
      id,
    ]).exec()
    return (
      rows.find((w) => w.statusId === 'IN_PROGRESS') ||
      rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))[0] ||
      null
    )
  },
  { models: ['WorkflowInstance'], initial: null },
)
const workflowInstanceId = computed(() => workflowInstance.value?.id ?? null)

async function handleSubmitForReview() {
  await runAction('submitForReview', {})
}

// Approve the pending approval task (e-signed) → workflow completes → auto-close.
async function onApprovalEsign(esign) {
  showEsignDialog.value = false
  if (!myApprovalTask.value) return
  acting.value = true
  saveError.value = null
  try {
    const body = { action: 'COMPLETE_AND_ADVANCE', outcomeId: 'COMPLETE_AND_ADVANCE' }
    if (esign?.method) body.method = esign.method
    if (esign?.token) body.token = esign.token
    if (esign?.provider) body.provider = esign.provider
    await post(`/v1/services/taskInstances/${myApprovalTask.value.id}/action`, body)
    toast.notify({ type: 'positive', message: 'Approved and closed' })
  } catch (e) {
    saveError.value = e.message || 'Approval failed'
    toast.notify({ type: 'negative', message: saveError.value })
  } finally {
    acting.value = false
  }
}

// ─── Audit log ────────────────────────────────────────────────────────────────
const showAuditLog = ref(false)
const auditIncludeEntities = computed(() => [
  { entityType: 'Complaint', entityIds: [props.id] },
  { entityType: 'Complaints', entityIds: [props.id] },
])

// ─── Header actions ───────────────────────────────────────────────────────────
const complaintActions = computed(() => {
  const statusId = complaint.value?.statusId
  return [
    {
      // Escalation — shown last of the primary actions (after Close / Hold).
      id: 'convert',
      label: 'Create NC',
      variant: 'primary',
      priority: 80,
      visible: canConvert.value && !isTerminal.value,
      disabled: acting.value,
      onSelect: () => (showConvertDialog.value = true),
    },
    {
      // Fallback: start the QA-review workflow if one isn't running yet
      // (normally it auto-starts at create/accept).
      id: 'submit',
      label: 'Submit for review',
      variant: 'primary',
      priority: 95,
      visible: isEditable.value && !workflowInstanceId.value,
      disabled: acting.value,
      onSelect: handleSubmitForReview,
    },
    {
      // Approve = close: the pending approver signs off at the top (Document-
      // control style) — approving the final step auto-closes the complaint.
      id: 'approveClose',
      label: 'Approve & Close',
      variant: 'primary',
      priority: 100,
      visible: !!myApprovalTask.value && !isTerminal.value,
      disabled: acting.value,
      onSelect: () => (showEsignDialog.value = true),
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
    // No read-only banner — the status chip in the title conveys closed/converted.
    banners: () => [],
    actions: complaintActions.value,
    sections: [{ id: 'details', label: 'Details' }],
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
      <ComplaintStatusBadgeById v-if="complaint" :statusId="complaint.statusId" />
    </template>

    <template v-if="complaint" #meta>
      <span>{{ complaint.complaintNumber }}</span>
      <template v-if="complaint.sourceId">
        · <ComplaintLookupBadge :id="complaint.sourceId" model="ComplaintSourceType" />
      </template>
      <template v-if="complaint.createdAt"> · {{ complaint.createdAt.formatDate('date') }} </template>
    </template>

    <template #actions>
      <div class="tw:flex tw:items-center tw:gap-2">
        <DetailActionBar :actions="complaintActions" />
        <AskAiButton
          v-if="complaint?.id"
          entityType="Complaint"
          :entityId="complaint.id"
          :entityTitle="complaint.subject"
          :entityNumber="complaint.complaintNumber"
        />
      </div>
    </template>

    <template v-if="complaint" #section-details>
      <RecordTrailBreadcrumb />
      <div
        v-if="saveError"
        class="tw:bg-red-50 tw:border tw:border-red-200 tw:text-red-700 tw:rounded-md tw:p-2 tw:text-sm tw:mb-3"
      >
        {{ saveError }}
      </div>

      <BaseTabs v-model="activeTab" :tabs="tabs" ariaLabel="Complaint detail">
        <!-- ══ Complaint details ══ -->
        <BaseTabPanel value="details">
          <div class="tw:flex tw:flex-col tw:gap-4">
            <FormSection title="Complaint">
              <RichTextAttachments
                v-model="complaint.description"
                :readonly="!descriptionEditable"
                placeholder="Describe the complaint — attach photos/evidence as needed…"
              />
              <p v-if="!isManualSource" class="tw:text-xs tw:text-secondary tw:mt-2">
                Imported / external-source complaint — the original description is read-only.
              </p>
            </FormSection>

            <BaseRailCard title="Product & origin">
              <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:md:grid-cols-3 tw:gap-x-4 tw:gap-y-3">
                <BaseDetailField label="Product / Service">
                  <ProductSelectMenu
                    v-if="isEditable"
                    v-model="complaint.productId"
                    :required="false"
                    nullLabel="— Select —"
                  />
                  <ProductBadgeById v-else-if="complaint.productId" :productId="complaint.productId" />
                  <BaseText v-else color="secondary">—</BaseText>
                </BaseDetailField>
                <BaseDetailField label="Supplier">
                  <SupplierSelectMenu
                    v-if="isEditable"
                    v-model="complaint.supplierId"
                    :required="false"
                    nullLabel="— Select —"
                  />
                  <SupplierBadgeById v-else-if="complaint.supplierId" :supplierId="complaint.supplierId" />
                  <BaseText v-else color="secondary">—</BaseText>
                </BaseDetailField>
                <BaseDetailField label="Sample received">
                  <BaseCheckbox v-if="isEditable" v-model="complaint.sampleReceived" label="Received" />
                  <BaseText v-else color="secondary">{{ complaint.sampleReceived ? 'Yes' : complaint.sampleReceived === false ? 'No' : '—' }}</BaseText>
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
              </div>
            </BaseRailCard>

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
              <BaseDetailField label="Severity">
                <ComplaintLookupSelectMenu
                  v-if="isEditable"
                  v-model="complaint.severityId"
                  model="ComplaintSeverity"
                />
                <ComplaintLookupBadge v-else :id="complaint.severityId" model="ComplaintSeverity" />
              </BaseDetailField>
            </BaseRailCard>

            <!-- Additional information — custom fields (Zendesk/import extras). -->
            <CustomFieldsCard entityType="Complaint" :entityId="id" :editable="isEditable" />
          </div>
        </BaseTabPanel>

        <!-- ══ QA Review ══ -->
        <BaseTabPanel value="review">
          <div class="tw:flex tw:flex-col tw:gap-4">
            <!-- QA assessment — determined by QA during review. -->
            <BaseRailCard title="QA assessment">
              <div class="tw:flex tw:flex-col tw:gap-4">
                <BaseDetailField label="Risk level">
                  <ComplaintLookupSelectMenu
                    v-if="isEditable"
                    v-model="complaint.riskLevelId"
                    model="ComplaintRiskLevel"
                  />
                  <ComplaintLookupBadge v-else :id="complaint.riskLevelId" model="ComplaintRiskLevel" />
                </BaseDetailField>
                <div v-if="isEditable" class="tw:flex tw:flex-wrap tw:gap-x-6 tw:gap-y-2">
                  <BaseCheckbox v-model="complaint.regulatoryReportable" label="Regulatory reportable" />
                  <BaseCheckbox v-model="complaint.safetyIssue" label="Safety issue" />
                  <BaseCheckbox v-model="complaint.complianceRelated" label="Compliance related" />
                  <BaseCheckbox v-model="complaint.potentialRecall" label="Potential recall" />
                  <BaseCheckbox v-model="complaint.repeatIssue" label="Repeat / recurring issue" />
                </div>
                <div v-else class="tw:flex tw:flex-wrap tw:gap-2">
                  <BaseBadge v-if="complaint.regulatoryReportable" class="tw:bg-amber-100 tw:text-amber-700">Regulatory reportable</BaseBadge>
                  <BaseBadge v-if="complaint.safetyIssue" class="tw:bg-red-100 tw:text-red-700">Safety issue</BaseBadge>
                  <BaseBadge v-if="complaint.complianceRelated" class="tw:bg-amber-100 tw:text-amber-700">Compliance related</BaseBadge>
                  <BaseBadge v-if="complaint.potentialRecall" class="tw:bg-red-100 tw:text-red-700">Potential recall</BaseBadge>
                  <BaseBadge v-if="complaint.repeatIssue" class="tw:bg-purple-100 tw:text-purple-700">Repeat issue</BaseBadge>
                  <span
                    v-if="!complaint.regulatoryReportable && !complaint.safetyIssue && !complaint.complianceRelated && !complaint.potentialRecall && !complaint.repeatIssue"
                    class="tw:text-sm tw:text-secondary"
                  >
                    No flags set.
                  </span>
                </div>
              </div>
            </BaseRailCard>

            <!-- QA review workflow — Investigation → Review Summary → Approval.
                 Rendered directly (no wrapping panel) like NcWorkflowDetail; the
                 step cards are the cards, and the tab already reads "QA Review". -->
            <ComplaintWorkflowDetail
              :complaintId="id"
              :workflowInstanceId="workflowInstanceId"
              :isOwner="isOwner"
            />
          </div>
        </BaseTabPanel>

        <!-- ══ Escalations ══ -->
        <BaseTabPanel value="escalations">
          <div class="tw:flex tw:flex-col tw:gap-4">
            <div v-if="canConvert && !isTerminal" class="tw:flex tw:justify-end">
              <BaseButton variant="primary" :disabled="acting" @click="showConvertDialog = true">
                Create NC
              </BaseButton>
            </div>

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

            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4">
              <div class="tw:flex tw:items-center tw:justify-between tw:pb-2 tw:border-b tw:border-divider tw:mb-3">
                <BaseText variant="overline">Similar complaints</BaseText>
                <span
                  v-if="relatedComplaints.length"
                  class="tw:text-micro tw:rounded tw:bg-amber-100 tw:text-amber-700 tw:px-1.5 tw:py-0.5 tw:font-semibold"
                >
                  {{ relatedComplaints.length }} found
                </span>
              </div>
              <div v-if="relatedComplaints.length" class="tw:flex tw:flex-col tw:gap-2">
                <RouterLink
                  v-for="rc in relatedComplaints"
                  :key="rc.id"
                  :to="getCompanyPath(`/complaints/${rc.id}`)"
                  class="tw:flex tw:items-center tw:justify-between tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2 tw:hover:bg-main-hover"
                >
                  <div class="tw:flex tw:items-center tw:gap-2 tw:min-w-0">
                    <span class="tw:text-xs tw:text-secondary">{{ rc.complaintNumber }}</span>
                    <span class="tw:text-sm tw:font-medium tw:truncate">{{ rc.subject }}</span>
                  </div>
                  <ComplaintStatusBadgeById :statusId="rc.statusId" />
                </RouterLink>
              </div>
              <div v-else class="tw:text-sm tw:text-secondary tw:italic">
                No similar complaints found by text match.
              </div>
            </div>

            <!-- Manually-linked similar complaints (for a recurring issue) -->
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4">
              <BaseText variant="overline" class="tw:block tw:pb-2 tw:border-b tw:border-divider tw:mb-3">
                Similar complaints (linked)
              </BaseText>
              <div v-if="linkedSimilar.length" class="tw:flex tw:flex-col tw:gap-2 tw:mb-3">
                <div
                  v-for="sc in linkedSimilar"
                  :key="sc.id"
                  class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2"
                >
                  <RouterLink
                    :to="getCompanyPath(`/complaints/${sc.id}`)"
                    class="tw:flex tw:items-center tw:gap-2 tw:min-w-0 tw:hover:text-primary"
                  >
                    <span class="tw:text-xs tw:text-secondary">{{ sc.complaintNumber }}</span>
                    <span class="tw:text-sm tw:font-medium tw:truncate">{{ sc.subject }}</span>
                  </RouterLink>
                  <button
                    v-if="isEditable"
                    type="button"
                    class="tw:text-xs tw:text-secondary tw:hover:text-bad tw:bg-transparent tw:border-0 tw:cursor-pointer tw:shrink-0"
                    @click="removeSimilarLink(sc.id)"
                  >
                    Unlink
                  </button>
                </div>
              </div>
              <div v-else class="tw:text-sm tw:text-secondary tw:italic tw:mb-3">
                None linked yet.
              </div>
              <div v-if="isEditable" class="tw:flex tw:items-center tw:gap-2">
                <BaseSelect
                  v-model="pickerComplaintId"
                  :options="linkableOptions"
                  optionLabel="name"
                  optionValue="id"
                  placeholder="Search a complaint to link…"
                  class="tw:flex-1"
                  @update:modelValue="addSimilarLink"
                />
              </div>
            </div>
          </div>
        </BaseTabPanel>
      </BaseTabs>
    </template>

    <template v-if="complaint" #rail>
      <!-- Glanceable summary; detailed fields live in the tabs. -->
      <BaseRailCard title="Complaint" grid>
        <BaseDetailField label="Complaint number">
          <BaseText variant="body" weight="medium" class="tw:break-words">
            {{ complaint.complaintNumber || '—' }}
          </BaseText>
        </BaseDetailField>
        <BaseDetailField label="Status">
          <ComplaintStatusBadgeById :statusId="complaint.statusId" />
        </BaseDetailField>
        <BaseDetailField label="Intake source">
          <ComplaintLookupSelectMenu
            v-if="isEditable"
            v-model="complaint.sourceId"
            model="ComplaintSourceType"
          />
          <ComplaintLookupBadge v-else :id="complaint.sourceId" model="ComplaintSourceType" />
        </BaseDetailField>
        <BaseDetailField label="Received" :value="complaint.createdAt?.formatDate('date')" />
      </BaseRailCard>

      <!-- Customer information -->
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
          <ComplaintLookupBadge v-else :id="complaint.customerTypeId" model="ComplaintCustomerType" />
        </BaseDetailField>
      </BaseRailCard>

      <!-- Ownership, assignment & SLA -->
      <BaseRailCard title="Ownership & SLA" grid>
        <BaseDetailField label="Owner">
          <UserBadgeById v-if="complaint.ownerId" :userId="complaint.ownerId" />
          <BaseText v-else color="secondary" class="tw:italic">Unassigned</BaseText>
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
    </template>
  </BaseDetailLayout>

  <!-- Approver signs off at the top → workflow completes → complaint auto-closes. -->
  <WorkflowInstanceEsignAuthDialog v-model="showEsignDialog" @verified="onApprovalEsign" />

  <!-- Convert to NC -->
  <CustomerComplaintConvertToNcDialog
    v-model="showConvertDialog"
    :complaints="complaint ? [complaint] : []"
    apiPath="complaints"
    @converted="onConverted"
  />

  <!-- Audit log -->
  <AuditLogDialog
    v-model="showAuditLog"
    :includeEntities="auditIncludeEntities"
    :title="`Audit Log — ${complaint?.complaintNumber ?? 'Complaint'}`"
  />
</template>
