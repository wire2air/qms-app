<script setup>
import { IconAlertTriangle, IconPrinter, IconClipboardList } from '@tabler/icons-vue'
import { currentSession, isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { post } from '@/api'
import { DateTime } from 'luxon'

const props = defineProps({
  id: { type: String, required: true },
})

const router = useRouter()

const nc = useLiveQueryWithDeps([() => props.id], async (db, [id]) =>
  db.Nonconformance.findByPk(id),
)

const loading = computed(() => nc.value === undefined)

const breadcrumbs = computed(() => [
  { label: 'Nonconformances', to: getCompanyPath('/nonconformances') },
  { label: nc.value?.ncNumber || nc.value?.title || 'Loading…' },
])

// ─── Inline disposition auto-save ─────────────────────────────────────────────
const isFirstLoad = ref(true)
const canUpdate = computed(() => isAllowed(['nonconformances:update']))
// Page-level fields (title, description, disposition, containment, etc.)
// are owner-controlled. Anyone else with NC module access can READ the
// record (default module behavior) but must not edit it — workflow-step
// forms have their own editability gate inside WorkflowStepForm.
const isEditable = computed(
  () =>
    nc.value &&
    nc.value.statusId !== 'CLOSED' &&
    nc.value.statusId !== 'VOID' &&
    canUpdate.value &&
    isOwner.value,
)

const debouncedSave = useDebounceFn(async () => {
  if (!nc.value) return
  await nc.value.save()
}, 500)

watch(
  nc,
  () => {
    if (isFirstLoad.value) {
      isFirstLoad.value = false
      return
    }
    if (nc.value) debouncedSave()
  },
  { deep: true },
)

const saving = ref(false)
const saveError = ref(null)

// ─── NC-level Approve and Close (the single terminal action) ────────────────
// Reviewer per-step Mark Complete advances the workflow; THIS button is
// what the owner clicks once every step is done. Validates closure
// invariants (per ISO 9001:2015 §8.7 / ISO 13485:2016 §8.3 / 21 CFR
// 820.90): all steps done → disposition picked → notes recorded → linked
// CAPA when capaRequired → cost when disposition tracks it. CFR-11
// e-sign on submit. Backend flags complete + transitions statusId='CLOSED'
// in one transaction — the old separate "Close NC" button was redundant
// and got folded in here.
const showMarkCompleteDialog = ref(false)
const showMarkCompleteEsign = ref(false)
const completing = ref(false)
const completeComments = ref('')

// Count workflow steps still open (NOT in APPROVED/SKIPPED/CANCELLED).
const incompleteStepCount = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [ncId]) => {
    if (!ncId) return 0
    const instances = await db.WorkflowInstance.where('[resourceType+resourceId]', [
      'Nonconformance',
      ncId,
    ]).exec()
    if (!instances.length) return 0
    const stepLists = await Promise.all(
      instances.map((i) => db.WorkflowInstanceStep.where('workflowInstanceId', i.id).exec()),
    )
    const allSteps = stepLists.flat()
    return allSteps.filter(
      (s) => !['APPROVED', 'SKIPPED', 'CANCELLED'].includes(s.statusId),
    ).length
  },
  { initial: 0 },
)

const linkedCapaCount = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [ncId]) => {
    if (!ncId) return 0
    const rows = await db.Capa.where('[sourceType+sourceId]', ['NC', ncId]).exec()
    return rows.length
  },
  { initial: 0 },
)

const ncDispositionType = useLiveQueryWithDeps(
  [() => nc.value?.dispositionTypeId],
  async (db, [id]) => (id ? db.NcDispositionType.findByPk(id) : null),
)

const markCompleteBlockedReason = computed(() => {
  if (!nc.value) return null
  if (nc.value.statusId === 'DRAFT') return 'Submit the NC for review first.'
  if (incompleteStepCount.value > 0) {
    return `${incompleteStepCount.value} workflow step${
      incompleteStepCount.value === 1 ? '' : 's'
    } still open. Complete or skip them first.`
  }
  if (!nc.value.dispositionTypeId) return 'Pick a Disposition before marking complete.'
  if (!nc.value.dispositionNotes?.trim()) {
    return 'Disposition notes are required before marking complete.'
  }
  if (nc.value.capaRequired === true && linkedCapaCount.value === 0) {
    return 'CAPA required is set to Yes — create at least one linked CAPA first.'
  }
  if (ncDispositionType.value?.tracksCost && nc.value.costOfNc == null) {
    return `Cost of NC is required for the “${ncDispositionType.value.name}” disposition.`
  }
  return null
})

const canMarkComplete = computed(() => !markCompleteBlockedReason.value)

function openMarkCompleteDialog() {
  if (!canMarkComplete.value) return
  saveError.value = null
  completeComments.value = ''
  showMarkCompleteDialog.value = true
}

// Two-step click: dialog confirms reason+comments, then esign auth.
function handleMarkCompleteClick() {
  if (!canMarkComplete.value) return
  showMarkCompleteEsign.value = true
}

async function onMarkCompleteEsignVerified({ method, provider, token }) {
  showMarkCompleteEsign.value = false
  completing.value = true
  saveError.value = null
  try {
    await post(`/v1/services/nonconformances/${props.id}/markComplete`, {
      comments: completeComments.value.trim() || null,
      method,
      provider: provider || null,
      token,
    })
    showMarkCompleteDialog.value = false
    // NC is now CLOSED — route back to the list. The detail page would
    // continue to render (read-only) but landing back on the list matches
    // the user's mental model of "this NC is done".
    router.push(getCompanyPath('/nonconformances'))
  } catch (e) {
    saveError.value = e.message || 'Failed to approve and close'
    // Re-open the action dialog so the user sees the error and retries.
    showMarkCompleteDialog.value = true
  } finally {
    completing.value = false
  }
}

const isOwner = computed(
  () => nc.value?.ownerId && nc.value.ownerId === currentSession.value?.userId,
)

// ─── Open NC (DRAFT → UNDER_REVIEW, kicks off workflow) ──────────────────────
// "Open" matches the industry term (Greenlight Guru / ISO 13485 §10.2).
// Confirmation dialog sets expectations: once opened, the NC becomes a
// permanent audit record — most fields stay editable but it can't be
// deleted, only voided/cancelled with reason.
const showOpenDialog = ref(false)

function openOpenDialog() {
  saveError.value = null
  showOpenDialog.value = true
}

async function handleSubmitForReview() {
  if (!nc.value) return
  saving.value = true
  saveError.value = null
  try {
    await post(`/v1/services/nonconformances/${props.id}/submitForReview`, {})
    showOpenDialog.value = false
  } catch (e) {
    saveError.value = e.message || 'Failed to open NC'
  } finally {
    saving.value = false
  }
}

// ─── Delete draft NC (DRAFT-only) ─────────────────────────────────────────────
// Soft-delete via the syncEngine — paranoid mode sets deletedAt. Drafts
// have no workflow / records attached yet so there's nothing to cascade.
// Refused for any non-DRAFT status by the disabled gate below.
const showDeleteDialog = ref(false)
const deleting = ref(false)

async function handleDeleteDraft() {
  if (!nc.value || nc.value.statusId !== 'DRAFT' || deleting.value) return
  deleting.value = true
  saveError.value = null
  try {
    await nc.value.delete()
    showDeleteDialog.value = false
    router.push(getCompanyPath('/nonconformances'))
  } catch (e) {
    saveError.value = e.message || 'Failed to delete draft'
  } finally {
    deleting.value = false
  }
}

const isOverdue = computed(() => {
  if (!nc.value?.dueDate) return false
  if (nc.value.statusId === 'CLOSED' || nc.value.statusId === 'VOID') return false
  return nc.value.dueDate < DateTime.now()
})

const workflowInstance = useLiveQueryWithDeps([() => props.id], async (db, [id]) => {
  const results = await db.WorkflowInstance.where('[resourceType+resourceId]', [
    'Nonconformance',
    id,
  ]).exec()
  return results.find((i) => i.statusId === 'IN_PROGRESS') || results[0] || null
})

// Resolve the underlying Workflow id from the version so we can link to the
// template (workflow-templates route is keyed by workflow id, not version id).
const workflowVersion = useLiveQueryWithDeps(
  [() => workflowInstance.value?.workflowVersionId ?? nc.value?.workflowVersionId],
  async (db, [versionId]) => {
    if (!versionId) return null
    return db.WorkflowVersion.findByPk(versionId)
  },
)

// ─── Inline-edit for cost fields ──────────────────────────────────────────────
const editingCost = ref(false)
const editingCredit = ref(false)

// Look up the selected disposition type so we can decide whether to show
// the Cost of NC field (cost capture is disposition-driven — Scrap /
// Rework / Return-to-Supplier / Regrade track cost; Use-As-Is /
// Quarantine don't). Mirrors ISO/TR 10014:2021 COPQ practice across
// modern QMS products.
const selectedDispositionType = useLiveQueryWithDeps(
  [() => nc.value?.dispositionTypeId],
  async (db, [id]) => (id ? db.NcDispositionType.findByPk(id) : null),
)
const dispositionTracksCost = computed(
  () => !!selectedDispositionType.value?.tracksCost,
)

const toast = useToast()

// ─── Supplier-facing toggle (DRAFT only) ─────────────────────────────────────
// The flag decides which user pool non-approval workflow steps draw from,
// so it's only changeable while DRAFT (no workflow instance exists yet —
// controllers reject changes after that). Flipping it resets the draft
// step-assignee plan (pendingReviewers): those picks came from the other
// pool. The NC row update lands in the audit log via the audit trigger.
const audienceModel = computed({
  get: () => (nc.value?.isSupplierFacing ? 'SUPPLIER' : 'INTERNAL'),
  set: (v) => {
    if (!nc.value) return
    const wantSupplier = v === 'SUPPLIER'
    if (wantSupplier === !!nc.value.isSupplierFacing) return
    if (wantSupplier && !nc.value.supplierId) {
      toast.error('Select a supplier first — a supplier-facing NC needs one.')
      return
    }
    nc.value.isSupplierFacing = wantSupplier
    nc.value.pendingReviewers = {}
  },
})

// ─── Convert OPEN NC → supplier-facing ───────────────────────────────────────
// Investigation on an internal NC concluded it's the supplier's problem.
// Everything entered is retained; the backend re-points every unfinished
// non-approval workflow step at the supplier's default user (old
// assignments parked as REASSIGNED — step history keeps who held them).
const showConvertDialog = ref(false)
const convertSupplierId = ref(null)
const converting = ref(false)
const canConvertToSupplier = computed(
  () =>
    nc.value &&
    !nc.value.isSupplierFacing &&
    nc.value.statusId === 'UNDER_REVIEW' &&
    isOwner.value,
)
function openConvertDialog() {
  convertSupplierId.value = nc.value?.supplierId ?? null
  showConvertDialog.value = true
}
async function confirmConvert() {
  if (converting.value) return
  if (!convertSupplierId.value) {
    toast.error('Select the supplier this NC belongs to.')
    return
  }
  converting.value = true
  try {
    await post(`/v1/services/nonconformances/${props.id}/convertSupplierFacing`, {
      supplierId: convertSupplierId.value,
    })
    toast.success('NC converted to supplier-facing — open steps reassigned to the supplier')
    showConvertDialog.value = false
  } catch (err) {
    toast.error(err?.message || 'Conversion failed')
  } finally {
    converting.value = false
  }
}

// ─── Inline-edit for overview fields ──────────────────────────────────────────
const editingTitle = ref(false)
const editingDescription = ref(false)
const editingSeverity = ref(false)
const editingDetected = ref(false)
const editingDueDate = ref(false)

// ─── Print + Audit Log (parity with CAPA page) ───────────────────────────────
const showAuditLog = ref(false)

function openPrintView() {
  if (!nc.value?.id) return
  const params = new URLSearchParams({ module: 'Nonconformance', id: nc.value.id })
  const url = getCompanyPath(`/print?${params.toString()}`)
  window.open(url, '_blank', 'noopener,noreferrer')
}

// Roll up the NC + its workflow instance + steps so the audit dialog
// shows the full timeline (not just the NC row's own log).
const allNcWorkflowInstanceIds = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [ncId]) => {
    if (!ncId) return []
    const rows = await db.WorkflowInstance.where('[resourceType+resourceId]', [
      'Nonconformance',
      ncId,
    ]).exec()
    return rows.map((r) => r.id)
  },
  { initial: [] },
)

const allNcWorkflowInstanceStepIds = useLiveQueryWithDeps(
  [() => allNcWorkflowInstanceIds.value.join(',')],
  async (db, [idsStr]) => {
    if (!idsStr) return []
    const instanceIds = idsStr.split(',')
    const lists = await Promise.all(
      instanceIds.map((id) => db.WorkflowInstanceStep.where('workflowInstanceId', id).exec()),
    )
    return lists.flat().map((s) => s.id)
  },
  { initial: [] },
)

const auditIncludeEntities = computed(() => [
  { entityType: 'Nonconformances', entityIds: [props.id] },
  { entityType: 'WorkflowInstances', entityIds: allNcWorkflowInstanceIds.value },
  { entityType: 'WorkflowInstanceSteps', entityIds: allNcWorkflowInstanceStepIds.value },
])

// ─── QC origin ────────────────────────────────────────────────────────────────
// A rejected inspection lot auto-creates this NC and stamps its id on
// inspection_lots.nc_id. Reverse-resolve the source lot so the NC owner can
// jump back to the inspection evidence. Lots are few; a scan is fine.
const sourceLot = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [ncId]) => {
    if (!ncId) return null
    const lots = await db.InspectionLot.where().exec()
    return lots.find((l) => l.ncId === ncId) ?? null
  },
)

// ─── Linked CAPAs ─────────────────────────────────────────────────────────────
const canCreateCapa = computed(() => isAllowed(['capas:create']))
const canCreateChangeRequest = computed(() => isAllowed(['changeRequests:create']))

const linkedCapas = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [ncId]) => {
    if (!ncId) return []
    return db.Capa.where('[sourceType+sourceId]', ['NC', ncId]).exec()
  },
  { initial: [] },
)

function onCreateLinkedCapa() {
  router.push({ path: getCompanyPath('/capas/create'), query: { ncId: props.id } })
}

function onCreateLinkedChangeRequest() {
  router.push({
    path: getCompanyPath('/change-requests/create'),
    query: { source: 'NC', sourceId: props.id },
  })
}

// ─── Workflow steps are handled by NcWorkflowDetail component ────────────────
</script>

<template>
  <div class="tw:flex tw:flex-col tw:h-full">
    <SafeTeleport to="#main-header-title">
      <BaseBreadcrumbs :items="breadcrumbs" />
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <div class="tw:flex tw:items-center tw:gap-2">
        <!-- Action buttons (left): lifecycle transitions for the NC. -->
        <BaseButton
          v-if="isOwner && nc?.statusId === 'DRAFT'"
          variant="primary"
          :disabled="saving"
          @click="openOpenDialog"
          >Open NC</BaseButton
        >
        <BaseButton
          v-if="isOwner && nc && !['DRAFT', 'CLOSED', 'VOID'].includes(nc.statusId)"
          variant="primary"
          :disabled="!canMarkComplete || completing"
          :title="markCompleteBlockedReason || undefined"
          @click="openMarkCompleteDialog"
        >
          {{ completing ? 'Closing…' : 'Approve and Close' }}
        </BaseButton>
        <BaseButton
          v-if="isOwner && nc?.statusId === 'DRAFT'"
          variant="outline"
          :disabled="deleting"
          @click="showDeleteDialog = true"
          >Delete</BaseButton
        >

        <!-- Utility buttons (right): always rightmost, parity with CAPA. -->
        <BaseButton v-if="nc?.id" variant="secondary" @click="openPrintView">
          <IconPrinter :size="20" class="tw:mr-1" />
          Print
        </BaseButton>
        <BaseButton v-if="nc?.id" variant="secondary" @click="showAuditLog = true">
          <IconClipboardList :size="20" class="tw:mr-1" />
          Audit Log
        </BaseButton>
        <AskAiButton
          v-if="nc?.id"
          entityType="Nonconformance"
          :entityId="nc.id"
          :entityTitle="nc.title"
          :entityNumber="nc.ncNumber"
        />
      </div>
    </SafeTeleport>

    <BaseSpinner v-if="loading" centered size="md" />

    <div v-else-if="nc" class="tw:overflow-y-auto tw:flex-1">
      <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
        <!-- QC inspection origin — this NC was auto-raised by a rejected lot -->
        <div
          v-if="sourceLot"
          class="tw:bg-blue-50 tw:border tw:border-blue-200 tw:rounded-lg tw:px-4 tw:py-2.5 tw:text-sm tw:flex tw:items-center tw:gap-2 tw:flex-wrap"
        >
          <span class="tw:text-blue-900">
            Raised from rejected QC inspection lot
            <span class="tw:font-mono tw:font-semibold">{{ sourceLot.lotNumber }}</span>
            ({{ sourceLot.inspectionPoint }})
          </span>
          <RouterLink
            :to="getCompanyPath(`/qc-inspection/lots/${sourceLot.id}`)"
            class="tw:text-blue-700 tw:font-medium tw:underline"
          >
            View inspection results
          </RouterLink>
        </div>

        <!-- 2-column layout -->
        <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-[65fr_25fr] tw:gap-4 tw:items-start">
          <!-- Left column -->
          <div class="tw:flex tw:flex-col tw:gap-4">
            <!-- NC Details card -->
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
              <div
                class="tw:flex tw:items-center tw:gap-2 tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
              >
                <div
                  class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider"
                >
                  NC Details
                </div>
                <!-- At-a-glance indicator of which assignee pool the
                     workflow draws from. Always visible (not just on
                     the DRAFT preview), so you can spot a mislabeled
                     supplier-facing NC at any lifecycle stage. -->
                <span
                  v-if="nc.isSupplierFacing"
                  class="tw:text-[10px] tw:rounded tw:bg-violet-100 tw:text-violet-700 tw:px-1.5 tw:py-0.5 tw:font-normal tw:normal-case"
                  title="Supplier-facing: non-approval workflow steps draw from this NC's supplier users. Approval steps stay internal."
                >
                  Supplier-facing
                </span>
                <span
                  v-else
                  class="tw:text-[10px] tw:rounded tw:bg-gray-100 tw:text-secondary tw:px-1.5 tw:py-0.5 tw:font-normal tw:normal-case"
                >
                  Internal
                </span>
              </div>
              <BaseTextInput
                v-if="editingTitle && isEditable"
                v-model="nc.title"
                placeholder="NC title"
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
                {{ nc.title }}
              </div>
              <div v-if="editingDescription && isEditable" class="nc-detail-editor tw:mb-4">
                <BaseRichTextEditor
                  v-model="nc.description"
                  placeholder="Add a description…"
                  @blur="editingDescription = false"
                />
              </div>
              <div v-else class="tw:mb-4" @click="isEditable && (editingDescription = true)">
                <div
                  v-if="nc.description"
                  class="tw:text-sm tw:text-secondary tw:leading-relaxed tw:prose tw:max-w-none"
                  :class="isEditable ? 'tw:cursor-pointer tw:hover:text-primary' : ''"
                  v-html="nc.description"
                />
                <p
                  v-else
                  class="tw:text-sm tw:text-secondary tw:leading-relaxed"
                  :class="isEditable ? 'tw:cursor-pointer tw:hover:text-primary' : ''"
                >
                  {{ isEditable ? 'Add a description…' : '—' }}
                </p>
              </div>

              <!-- Required-at-create fields stay in the main view:
                   Severity, Type, Source, Detected. Optional metadata
                   (Priority, Issue type, Due, Product, Qty, PO #, Order #,
                   Lot #) all moved to the right-side Overview panel to
                   match the "required → main / optional → right" rule. -->
              <div class="tw:grid tw:grid-cols-4 tw:gap-3">
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Severity</div>
                  <NcSeveritySelectMenu
                    v-if="editingSeverity && isEditable"
                    v-model="nc.severityId"
                    :required="true"
                    @blur="editingSeverity = false"
                  />
                  <span
                    v-else
                    :class="isEditable ? 'tw:cursor-pointer tw:hover:opacity-70' : ''"
                    @click="isEditable && (editingSeverity = true)"
                  >
                    <NcSeverityBadgeById :severityId="nc.severityId" />
                  </span>
                </div>
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Type</div>
                  <NcTypeBadgeById :typeId="nc.typeId" />
                </div>
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Source</div>
                  <NcSourceBadgeById :sourceId="nc.sourceId" />
                </div>
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Detected</div>
                  <BaseDatePicker
                    v-if="editingDetected && isEditable"
                    v-model="nc.detectedAt"
                    @blur="editingDetected = false"
                  />
                  <span
                    v-else
                    class="tw:text-sm tw:font-medium"
                    :class="isEditable ? 'tw:cursor-pointer tw:hover:text-primary' : ''"
                    @click="isEditable && (editingDetected = true)"
                  >
                    {{ nc.detectedAt ? nc.detectedAt.formatDate('date') : '—' }}
                  </span>
                </div>
              </div>

              <!-- Immediate containment action -->
              <div class="tw:flex tw:flex-col tw:gap-1 tw:mt-4">
                <label
                  class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider"
                >
                  Immediate containment action
                </label>
                <div v-if="isEditable" class="nc-detail-editor">
                  <BaseRichTextEditor
                    v-model="nc.immediateContainmentAction"
                    placeholder="Describe the immediate action taken to contain this nonconformance…"
                  />
                </div>
                <div
                  v-else-if="nc.immediateContainmentAction"
                  class="tw:text-sm tw:text-on-main tw:leading-relaxed tw:prose tw:max-w-none"
                  v-html="nc.immediateContainmentAction"
                />
                <p v-else class="tw:text-sm tw:text-on-main tw:leading-relaxed">—</p>
              </div>
            </div>

            <!-- Raised-from-Audit context (scoped) — self-hides when this NC
                 wasn't spawned from an audit finding. -->
            <AuditOriginPanel entityType="Nonconformance" :entityId="id" />

            <!-- Workflow steps. In DRAFT (no instance yet) we render the
                 template-step preview so the owner can plan assignments;
                 picks are saved to nc.pendingReviewers and consumed by
                 submitNcForReview when the owner clicks Open NC. -->
            <NcWorkflowDraftPreview
              v-if="!workflowInstance && nc?.statusId === 'DRAFT'"
              :ncId="id"
              :isOwner="isOwner"
            />
            <NcWorkflowDetail
              v-else
              :ncId="id"
              :workflowInstanceId="workflowInstance?.id"
              :isOwner="isOwner"
            />

            <!-- Disposition card -->
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
              >
                Disposition
              </div>

              <template v-if="isEditable">
                <div class="tw:grid tw:grid-cols-2 tw:gap-3">
                  <div class="tw:flex tw:flex-col tw:gap-1">
                    <label class="tw:text-sm tw:font-medium tw:text-secondary"> Disposition </label>
                    <NcDispositionTypeSelectMenu v-model="nc.dispositionTypeId" :required="false" />
                  </div>
                  <div class="tw:flex tw:flex-col tw:gap-1">
                    <label class="tw:text-sm tw:font-medium tw:text-secondary">
                      CAPA required?
                    </label>
                    <div class="tw:flex tw:gap-2">
                      <BaseButton
                        class="tw:flex-1 tw:justify-center"
                        :variant="nc.capaRequired === true ? 'primary' : 'outline'"
                        @click="nc.capaRequired = true"
                        >Yes</BaseButton
                      >
                      <BaseButton
                        class="tw:flex-1 tw:justify-center"
                        :variant="nc.capaRequired === false ? 'primary' : 'outline'"
                        @click="nc.capaRequired = false"
                        >No</BaseButton
                      >
                    </div>
                  </div>
                  <!-- Cost of NC — disposition-driven. Shows + becomes
                       required only when the picked disposition has
                       tracks_cost=true (Scrap / Rework / RTS / Regrade). -->
                  <div v-if="dispositionTracksCost" class="tw:flex tw:flex-col tw:gap-1">
                    <div class="tw:text-xs tw:text-secondary">
                      Cost of NC <span class="tw:text-red-500">*</span>
                    </div>
                    <BaseTextInput
                      v-if="editingCost"
                      v-model="nc.costOfNc"
                      type="number"
                      placeholder="0.00"
                      autofocus
                      @blur="editingCost = false"
                    />
                    <span
                      v-else
                      class="tw:text-sm tw:font-medium tw:cursor-pointer tw:hover:text-primary"
                      @click="editingCost = true"
                    >
                      {{
                        nc.costOfNc != null
                          ? nc.costOfNc.toLocaleString('en-US', {
                              style: 'currency',
                              currency: 'USD',
                            })
                          : '—'
                      }}
                    </span>
                  </div>
                  <!-- Credit from Supplier — offsetting recovery when the
                       supplier reimburses the NC cost. Shown alongside
                       Cost of NC so reporting can compute net COPQ
                       (cost − credit). Optional. -->
                  <div v-if="dispositionTracksCost" class="tw:flex tw:flex-col tw:gap-1">
                    <div class="tw:text-xs tw:text-secondary">Credit from Supplier</div>
                    <BaseTextInput
                      v-if="editingCredit"
                      v-model="nc.creditFromSupplier"
                      type="number"
                      placeholder="0.00"
                      autofocus
                      @blur="editingCredit = false"
                    />
                    <span
                      v-else
                      class="tw:text-sm tw:font-medium tw:cursor-pointer tw:hover:text-primary"
                      @click="editingCredit = true"
                    >
                      {{
                        nc.creditFromSupplier != null
                          ? nc.creditFromSupplier.toLocaleString('en-US', {
                              style: 'currency',
                              currency: 'USD',
                            })
                          : '—'
                      }}
                    </span>
                  </div>
                </div>

                <div class="tw:flex tw:flex-col tw:gap-1 tw:col-span-2">
                  <label class="tw:text-sm tw:font-medium tw:text-secondary">
                    Disposition notes
                  </label>
                  <BaseTextarea
                    v-model="nc.dispositionNotes"
                    placeholder="Justify your disposition decision and CAPA choice…"
                    :rows="3"
                  />
                </div>
              </template>

              <template v-else>
                <div class="tw:grid tw:grid-cols-2 tw:gap-3">
                  <div class="tw:flex tw:flex-col tw:gap-1">
                    <div class="tw:text-xs tw:text-secondary">Disposition</div>
                    <NcDispositionTypeBadgeById
                      v-if="nc.dispositionTypeId"
                      :dispositionTypeId="nc.dispositionTypeId"
                    />
                    <span v-else class="tw:text-sm tw:text-secondary">—</span>
                  </div>
                  <div class="tw:flex tw:flex-col tw:gap-1">
                    <div class="tw:text-xs tw:text-secondary">CAPA required?</div>
                    <span class="tw:text-sm tw:font-medium">
                      {{
                        nc.capaRequired === true ? 'Yes' : nc.capaRequired === false ? 'No' : '—'
                      }}
                    </span>
                  </div>
                  <div v-if="dispositionTracksCost" class="tw:flex tw:flex-col tw:gap-1">
                    <div class="tw:text-xs tw:text-secondary">Cost of NC</div>
                    <span class="tw:text-sm tw:font-medium">
                      {{
                        nc.costOfNc != null
                          ? nc.costOfNc.toLocaleString('en-US', {
                              style: 'currency',
                              currency: 'USD',
                            })
                          : '—'
                      }}
                    </span>
                  </div>
                  <div v-if="dispositionTracksCost" class="tw:flex tw:flex-col tw:gap-1">
                    <div class="tw:text-xs tw:text-secondary">Credit from Supplier</div>
                    <span class="tw:text-sm tw:font-medium">
                      {{
                        nc.creditFromSupplier != null
                          ? nc.creditFromSupplier.toLocaleString('en-US', {
                              style: 'currency',
                              currency: 'USD',
                            })
                          : '—'
                      }}
                    </span>
                  </div>
                  <div class="tw:flex tw:flex-col tw:gap-1 tw:col-span-2">
                    <div class="tw:text-xs tw:text-secondary">Disposition notes</div>
                    <p class="tw:text-sm tw:text-on-main tw:leading-relaxed">
                      {{ nc.dispositionNotes || '—' }}
                    </p>
                  </div>
                </div>
              </template>
            </div>

            <!-- Linked CAPAs -->
            <div
              v-if="nc.capaRequired === true"
              class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5"
            >
              <div
                class="tw:flex tw:items-center tw:justify-between tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
              >
                <div class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider">
                  Linked CAPAs
                </div>
                <div class="tw:flex tw:gap-2">
                  <BaseButton
                    v-if="canCreateChangeRequest"
                    variant="outline"
                    size="sm"
                    @click="onCreateLinkedChangeRequest"
                  >
                    Create Change Request
                  </BaseButton>
                  <BaseButton
                    v-if="canCreateCapa"
                    variant="outline"
                    size="sm"
                    @click="onCreateLinkedCapa"
                  >
                    Create CAPA
                  </BaseButton>
                </div>
              </div>
              <div v-if="linkedCapas.length" class="tw:flex tw:flex-col tw:gap-2">
                <RouterLink
                  v-for="linked in linkedCapas"
                  :key="linked.id"
                  :to="getCompanyPath(`/capas/${linked.id}`)"
                  class="tw:flex tw:items-center tw:justify-between tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2 tw:hover:bg-main-hover"
                >
                  <div class="tw:flex tw:items-center tw:gap-3 tw:min-w-0">
                    <span class="tw:text-xs tw:font-mono tw:text-secondary">
                      {{ linked.capaNumber }}
                    </span>
                    <span class="tw:text-sm tw:font-medium tw:text-on-main tw:truncate">
                      {{ linked.title }}
                    </span>
                  </div>
                  <CapaStatusBadgeById :statusId="linked.statusId" />
                </RouterLink>
              </div>
              <div v-else class="tw:text-sm tw:text-secondary tw:italic">
                No CAPAs linked yet.
              </div>
            </div>
          </div>

          <!-- Right column -->
          <div class="tw:flex tw:flex-col tw:gap-3">
            <!-- External access — read-only panel populated by workflow-
                 step assignment (autoShareSupplierUsers). Product decision
                 (2026-05-29): supplier visibility on NCs is workflow-
                 driven, not manual. Only meaningful on supplier-facing
                 NCs — internal NCs never share externally. -->
            <SharedWithPanel
              v-if="nc.isSupplierFacing"
              entityType="Nonconformance"
              :entityId="id"
            />

            <!-- Customer complaints this NC was converted from — resolves
                 via nc_source_links, self-hides when there are none. -->
            <NcLinkedComplaintsPanel :ncId="id" />

            <!-- Overview side card. Grouped into subsections with quiet
                 dividers so the right rail stays scannable as it grows:
                   Identification → People → Classification → Schedule
                   → Source / Commerce → Related
                 Severity / Detected are NOT duplicated here — they live
                 in the main grid alongside Type + Source. -->
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4">
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-2 tw:border-b tw:border-divider tw:mb-3"
              >
                Overview
              </div>

              <!-- Identification -->
              <div class="tw:flex tw:flex-col">
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">NC number</span>
                  <span class="tw:text-xs tw:font-mono tw:font-medium">
                    {{ nc.ncNumber || '—' }}
                  </span>
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Status</span>
                  <div class="tw:flex tw:items-center tw:gap-1.5">
                    <NcStatusBadgeById :statusId="nc.statusId" />
                    <BaseBadge
                      v-if="nc.markedCompleteAt"
                      class="tw:text-[10px] tw:bg-emerald-100 tw:text-emerald-700"
                      title="Marked complete by owner — pending final close"
                    >
                      Completed
                    </BaseBadge>
                  </div>
                </div>
              </div>

              <!-- People & Location -->
              <div class="tw:border-t tw:border-divider tw:mt-2 tw:pt-1 tw:flex tw:flex-col">
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2 tw:gap-2">
                  <span class="tw:text-xs tw:text-secondary tw:shrink-0">Owner</span>
                  <div v-if="isEditable" class="tw:w-48 tw:min-w-0 tw:flex tw:justify-end">
                    <UserSelectMenu v-model="nc.ownerId" :required="true" />
                  </div>
                  <UserBadgeById v-else-if="nc.ownerId" :userId="nc.ownerId" />
                  <span v-else class="tw:text-sm tw:text-secondary">—</span>
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2 tw:gap-2">
                  <span class="tw:text-xs tw:text-secondary tw:shrink-0">Site</span>
                  <div v-if="isEditable" class="tw:w-48 tw:min-w-0 tw:flex tw:justify-end">
                    <SiteSelectMenu v-model="nc.siteId" :required="true" />
                  </div>
                  <SiteBadgeById v-else-if="nc.siteId" :siteId="nc.siteId" />
                  <span v-else class="tw:text-sm tw:text-secondary">—</span>
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2 tw:gap-2">
                  <span class="tw:text-xs tw:text-secondary tw:shrink-0">Department</span>
                  <div v-if="isEditable" class="tw:w-48 tw:min-w-0 tw:flex tw:justify-end">
                    <DepartmentSelectMenu v-model="nc.departmentId" :required="true" />
                  </div>
                  <DepartmentBadgeById v-else-if="nc.departmentId" :departmentId="nc.departmentId" />
                  <span v-else class="tw:text-sm tw:text-secondary">—</span>
                </div>
              </div>

              <!-- Classification -->
              <div class="tw:border-t tw:border-divider tw:mt-2 tw:pt-1 tw:flex tw:flex-col">
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2 tw:gap-2">
                  <span class="tw:text-xs tw:text-secondary tw:shrink-0">Priority</span>
                  <div v-if="isEditable" class="tw:w-48 tw:min-w-0 tw:flex tw:justify-end">
                    <BaseInlineSelect
                      v-model="nc.priorityId"
                      :items="[
                        { id: 'LOW', name: 'Low' },
                        { id: 'MEDIUM', name: 'Medium' },
                        { id: 'HIGH', name: 'High' },
                        { id: 'CRITICAL', name: 'Critical' },
                      ]"
                    />
                  </div>
                  <span
                    v-else-if="nc.priorityId"
                    class="tw:inline-flex tw:items-center tw:text-xs tw:font-semibold tw:rounded tw:px-2 tw:py-0.5"
                    :class="{
                      'tw:bg-emerald-100 tw:text-emerald-700': nc.priorityId === 'LOW',
                      'tw:bg-amber-100 tw:text-amber-700': nc.priorityId === 'MEDIUM',
                      'tw:bg-orange-100 tw:text-orange-700': nc.priorityId === 'HIGH',
                      'tw:bg-rose-100 tw:text-rose-700': nc.priorityId === 'CRITICAL',
                    }"
                  >
                    {{ nc.priorityId.charAt(0) + nc.priorityId.slice(1).toLowerCase() }}
                  </span>
                  <span v-else class="tw:text-sm tw:text-secondary">—</span>
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2 tw:gap-2">
                  <span class="tw:text-xs tw:text-secondary tw:shrink-0">Issue type</span>
                  <div v-if="isEditable" class="tw:w-48 tw:min-w-0 tw:flex tw:justify-end">
                    <NcIssueTypeSelectMenu v-model="nc.ncIssueTypeId" />
                  </div>
                  <NcIssueTypeBadgeById
                    v-else-if="nc.ncIssueTypeId"
                    :issueTypeId="nc.ncIssueTypeId"
                  />
                  <span v-else class="tw:text-sm tw:text-secondary">—</span>
                </div>
              </div>

              <!-- Schedule -->
              <div class="tw:border-t tw:border-divider tw:mt-2 tw:pt-1 tw:flex tw:flex-col">
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Due date</span>
                  <BaseDatePicker
                    v-if="editingDueDate && isEditable"
                    v-model="nc.dueDate"
                    class="tw:w-36"
                    @blur="editingDueDate = false"
                  />
                  <span
                    v-else
                    class="tw:text-sm tw:font-medium tw:flex tw:items-center tw:gap-1 tw:flex-nowrap"
                    :class="[
                      isOverdue ? 'tw:text-red-600' : '',
                      isEditable ? 'tw:cursor-pointer tw:hover:text-primary' : '',
                    ]"
                    @click="isEditable && (editingDueDate = true)"
                  >
                    <span>{{ nc.dueDate ? nc.dueDate.formatDate('date') : '—' }}</span>
                    <IconAlertTriangle v-if="isOverdue" :size="16" class="tw:text-red-600" />
                  </span>
                </div>
              </div>

              <!-- Source / Commerce. Editable rows always render so a
                   missing value (e.g. PO# on a lot-spawned NC) can be
                   ADDED — read-only mode keeps hiding empties. -->
              <div
                v-if="
                  isEditable || nc.supplierId || nc.productId || nc.qtyAffected ||
                  nc.poNumber || nc.orderNumber || nc.lotNumber
                "
                class="tw:border-t tw:border-divider tw:mt-2 tw:pt-1 tw:flex tw:flex-col"
              >
                <div
                  v-if="isEditable || nc.supplierId"
                  class="tw:flex tw:justify-between tw:items-center tw:py-2 tw:gap-2"
                >
                  <span class="tw:text-xs tw:text-secondary tw:shrink-0">Supplier</span>
                  <div
                    v-if="isEditable && nc.statusId === 'DRAFT'"
                    class="tw:w-48 tw:min-w-0 tw:flex tw:justify-end"
                  >
                    <SupplierSelectMenu v-model="nc.supplierId" />
                  </div>
                  <SupplierBadgeById v-else-if="nc.supplierId" :supplierId="nc.supplierId" />
                  <span v-else class="tw:text-sm tw:text-secondary">—</span>
                </div>
                <!-- Supplier facing — free toggle while DRAFT; once OPEN,
                     the owner can still CONVERT internal → supplier-facing
                     (guided dialog; reassigns open steps to the supplier
                     with full step history). -->
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2 tw:gap-2">
                  <span class="tw:text-xs tw:text-secondary tw:shrink-0">Supplier facing</span>
                  <div
                    v-if="isEditable && nc.statusId === 'DRAFT'"
                    class="tw:w-48 tw:min-w-0 tw:flex tw:justify-end"
                  >
                    <BaseInlineSelect
                      v-model="audienceModel"
                      :items="[
                        { id: 'INTERNAL', name: 'No — internal' },
                        { id: 'SUPPLIER', name: 'Yes — supplier facing' },
                      ]"
                      :required="true"
                    />
                  </div>
                  <div v-else class="tw:flex tw:items-center tw:gap-2">
                    <span
                      class="tw:text-[10px] tw:rounded tw:px-1.5 tw:py-0.5"
                      :class="nc.isSupplierFacing
                        ? 'tw:bg-violet-100 tw:text-violet-700'
                        : 'tw:bg-gray-100 tw:text-secondary'"
                    >
                      {{ nc.isSupplierFacing ? 'Supplier-facing' : 'Internal' }}
                    </span>
                    <button
                      v-if="canConvertToSupplier"
                      class="tw:text-[11px] tw:font-medium tw:text-violet-700 tw:underline tw:bg-transparent tw:border-0 tw:cursor-pointer tw:p-0"
                      @click="openConvertDialog"
                    >
                      Convert…
                    </button>
                  </div>
                </div>
                <div
                  v-if="isEditable || nc.productId"
                  class="tw:flex tw:justify-between tw:items-center tw:py-2 tw:gap-2"
                >
                  <span class="tw:text-xs tw:text-secondary tw:shrink-0">Product</span>
                  <div v-if="isEditable" class="tw:w-48 tw:min-w-0 tw:flex tw:justify-end">
                    <ProductSelectMenu v-model="nc.productId" :allowCreate="false" />
                  </div>
                  <div v-else-if="nc.productId" class="tw:min-w-0 tw:flex tw:justify-end">
                    <ProductBadgeById :productId="nc.productId" />
                  </div>
                  <span v-else class="tw:text-sm tw:text-secondary">—</span>
                </div>
                <div
                  v-if="isEditable || nc.qtyAffected"
                  class="tw:flex tw:justify-between tw:items-center tw:py-2 tw:gap-2"
                >
                  <span class="tw:text-xs tw:text-secondary tw:shrink-0">Qty affected</span>
                  <div v-if="isEditable" class="tw:flex tw:gap-1 tw:w-48">
                    <BaseTextInput v-model.number="nc.qtyAffected" type="number" size="sm" class="tw:flex-1" />
                    <BaseTextInput v-model="nc.unitOfMeasure" size="sm" placeholder="UOM" class="tw:w-16" />
                  </div>
                  <span v-else class="tw:text-sm tw:font-medium">
                    {{ nc.qtyAffected }} {{ nc.unitOfMeasure }}
                  </span>
                </div>
                <div
                  v-if="isEditable || nc.poNumber"
                  class="tw:flex tw:justify-between tw:items-center tw:py-2 tw:gap-2"
                >
                  <span class="tw:text-xs tw:text-secondary tw:shrink-0">PO #</span>
                  <BaseTextInput v-if="isEditable" v-model="nc.poNumber" size="sm" class="tw:w-48" />
                  <span v-else class="tw:text-sm tw:font-medium tw:font-mono">{{ nc.poNumber }}</span>
                </div>
                <div
                  v-if="isEditable || nc.orderNumber"
                  class="tw:flex tw:justify-between tw:items-center tw:py-2 tw:gap-2"
                >
                  <span class="tw:text-xs tw:text-secondary tw:shrink-0">Order #</span>
                  <BaseTextInput v-if="isEditable" v-model="nc.orderNumber" size="sm" class="tw:w-48" />
                  <span v-else class="tw:text-sm tw:font-medium tw:font-mono">{{ nc.orderNumber }}</span>
                </div>
                <div
                  v-if="isEditable || nc.lotNumber"
                  class="tw:flex tw:justify-between tw:items-center tw:py-2 tw:gap-2"
                >
                  <span class="tw:text-xs tw:text-secondary tw:shrink-0">Lot #</span>
                  <BaseTextInput v-if="isEditable" v-model="nc.lotNumber" size="sm" class="tw:w-48" />
                  <span v-else class="tw:text-sm tw:font-medium tw:font-mono">{{ nc.lotNumber }}</span>
                </div>
              </div>

              <!-- Related -->
              <div class="tw:border-t tw:border-divider tw:mt-2 tw:pt-1 tw:flex tw:flex-col">
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">CAPA</span>
                  <span
                    class="tw:text-sm tw:font-medium"
                    :class="nc.capaRequired === null ? 'tw:text-secondary tw:italic' : ''"
                  >
                    {{
                      nc.capaRequired === true
                        ? 'Required'
                        : nc.capaRequired === false
                          ? 'Not required'
                          : 'Not yet decided'
                    }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Workflow panel -->
            <div
              v-if="nc.workflowVersionId || workflowInstance"
              class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4"
            >
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-2 tw:border-b tw:border-divider tw:mb-3"
              >
                NC workflow
              </div>

              <!-- Active workflow instance -->
              <div v-if="workflowInstance">
                <WorkflowInstanceStatusBadgeById :statusId="workflowInstance.statusId" showDot />
                <RouterLink
                  class="tw:mt-3 tw:flex tw:items-center tw:text-sm tw:text-primary tw:font-medium tw:hover:underline"
                  :to="getCompanyPath(`/workflow-instances/${workflowInstance.id}`)"
                >
                  View workflow details →
                </RouterLink>
                <RouterLink
                  v-if="workflowVersion?.workflowId"
                  class="tw:mt-1 tw:flex tw:items-center tw:text-sm tw:text-primary tw:font-medium tw:hover:underline"
                  :to="
                    getCompanyPath(
                      `/workflow-templates/${workflowVersion.workflowId}?version=${encodeURIComponent(
                        workflowVersion.versionLabel ||
                          `${workflowVersion.versionMajor ?? 1}.${workflowVersion.versionMinor ?? 0}`,
                      )}`,
                    )
                  "
                >
                  View workflow template →
                </RouterLink>
              </div>

              <!-- Not yet submitted -->
              <div v-else-if="nc.workflowVersionId" class="tw:text-sm tw:text-secondary">
                workflow assigned but not yet submitted.
              </div>
            </div>

            <!-- Workflow detail component (steps, reassign, send-back, record viewer) -->
          </div>
        </div>
      </div>
    </div>

    <BaseEmptyState
      v-else
      title="NC not found"
      description="This nonconformance could not be found."
    />

    <!-- ─── NC-level Approve and Close dialog ──────────────────────────── -->
    <!-- Shows all closure invariants visually; the button at the page
         header is already disabled when any check fails, so this dialog
         is the confirmation + comments collection step before esign. -->
    <BaseDialog v-model="showMarkCompleteDialog" title="Approve and Close" maxWidth="lg">
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
        <div
          class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:border tw:bg-green-50 tw:border-green-200"
        >
          <div class="tw:shrink-0 tw:mt-0.5 tw:text-green-600 tw:font-bold">✓</div>
          <div class="tw:text-sm tw:text-green-800">
            All gates are satisfied — every workflow step is complete, the
            disposition is recorded with notes
            <template v-if="nc?.capaRequired === true">, a CAPA is linked</template>
            <template v-if="ncDispositionType?.tracksCost">, and Cost of NC is entered</template>.
            Approving signs the closure and transitions the NC to
            <strong>Closed</strong> — this is the final action.
          </div>
        </div>

        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            Completion Notes (optional)
          </p>
          <BaseTextarea
            v-model="completeComments"
            :rows="3"
            placeholder="Summary of the corrective handling — verification of disposition, evidence references, …"
          />
        </div>

        <div
          class="tw:flex tw:items-start tw:gap-2 tw:p-3 tw:rounded-lg tw:bg-blue-50 tw:border tw:border-blue-200 tw:text-xs tw:text-blue-800"
        >
          <div class="tw:shrink-0 tw:mt-0.5">🔒</div>
          <div>
            CFR 21 Part 11 — Approving and closing this NC is an attested
            regulated action and requires an e-signature. You'll confirm
            your identity on the next step.
          </div>
        </div>

        <p v-if="saveError" class="tw:text-xs tw:text-red-600">{{ saveError }}</p>
      </div>
      <template #footer="{ close }">
        <BaseButton variant="outline" :disabled="completing" @click="close">Cancel</BaseButton>
        <BaseButton
          variant="primary"
          :loading="completing"
          :disabled="completing"
          @click="handleMarkCompleteClick"
        >
          Sign &amp; Close
        </BaseButton>
      </template>
    </BaseDialog>

    <WorkflowInstanceEsignAuthDialog
      v-model="showMarkCompleteEsign"
      @verified="onMarkCompleteEsignVerified"
    />

    <!-- Open NC confirmation — explains the audit implications before
         the Draft → Under Review transition. Reviewer picks come from
         pendingReviewers (parked at create time) and are applied
         server-side on submit. -->
    <BaseDialog v-model="showOpenDialog" title="Open Nonconformance" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
        <p class="tw:text-sm tw:text-on-main">
          Opening this NC starts the assigned workflow and makes it a
          <strong>permanent audit record</strong>.
        </p>
        <ul class="tw:text-sm tw:text-secondary tw:list-disc tw:pl-5 tw:space-y-1">
          <li>Most fields stay editable until the NC is closed.</li>
          <li>It can no longer be deleted — only closed or cancelled with a recorded reason.</li>
          <li>The workflow's first step becomes active and the assignee gets a task.</li>
        </ul>
        <div
          v-if="saveError"
          class="tw:bg-red-50 tw:border tw:border-red-200 tw:text-red-700 tw:rounded-md tw:p-2 tw:text-sm"
        >
          {{ saveError }}
        </div>
      </div>
      <template #footer="{ close }">
        <BaseButton variant="outline" :disabled="saving" @click="close">Cancel</BaseButton>
        <BaseButton
          variant="primary"
          :loading="saving"
          :disabled="saving"
          @click="handleSubmitForReview"
        >
          Open NC
        </BaseButton>
      </template>
    </BaseDialog>

    <!-- Audit Log dialog — NC + its workflow instance / steps in one timeline. -->
    <AuditLogDialog
      v-model="showAuditLog"
      :includeEntities="auditIncludeEntities"
      :title="`Audit Log — ${nc?.ncNumber ?? 'NC'}`"
    />

    <!-- Delete draft NC -->
    <BaseDialog v-model="showDeleteDialog" title="Delete Draft NC" maxWidth="md">
      <p class="tw:text-sm tw:text-on-main tw:mb-3">
        Delete this draft nonconformance? This permanently removes the
        record. Drafts have no audit history yet, so this is safe.
      </p>
      <div
        v-if="saveError"
        class="tw:bg-red-50 tw:border tw:border-red-200 tw:text-red-700 tw:rounded-md tw:p-2 tw:text-sm tw:mb-3"
      >
        {{ saveError }}
      </div>
      <div class="tw:flex tw:justify-end tw:gap-2 tw:pt-3 tw:border-t tw:border-divider">
        <BaseButton variant="outline" :disabled="deleting" @click="showDeleteDialog = false">
          Cancel
        </BaseButton>
        <BaseButton variant="danger" :disabled="deleting" @click="handleDeleteDraft">
          {{ deleting ? 'Deleting…' : 'Delete' }}
        </BaseButton>
      </div>
    </BaseDialog>

    <!-- Convert OPEN internal NC → supplier-facing -->
    <BaseDialog v-model="showConvertDialog" title="Convert to Supplier-Facing NC" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-3">
        <p class="tw:text-sm tw:text-on-main">
          Investigation points at a supplier? Converting keeps everything already
          entered on this NC and re-routes the remaining workflow to the supplier:
        </p>
        <ul class="tw:text-xs tw:text-secondary tw:list-disc tw:pl-5 tw:space-y-1">
          <li>Completed steps and their history are untouched.</li>
          <li>
            Open and upcoming non-approval steps are reassigned to the supplier's
            portal user — previous assignees stay visible in step history as
            <span class="tw:font-semibold">Reassigned</span>.
          </li>
          <li>Final approval steps remain internal.</li>
          <li>The NC stays open; nothing restarts.</li>
        </ul>
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">
            Supplier <span class="tw:text-bad">*</span>
          </label>
          <SupplierSelectMenu v-model="convertSupplierId" class="tw:w-full" />
          <p class="tw:text-xs tw:text-secondary tw:mt-1">
            The supplier needs at least one active portal user.
          </p>
        </div>
      </div>
      <div class="tw:flex tw:justify-end tw:gap-2 tw:pt-4 tw:mt-2 tw:border-t tw:border-divider">
        <BaseButton variant="outline" :disabled="converting" @click="showConvertDialog = false">
          Cancel
        </BaseButton>
        <BaseButton :loading="converting" :disabled="!convertSupplierId" @click="confirmConvert">
          Convert &amp; reassign
        </BaseButton>
      </div>
    </BaseDialog>
  </div>
</template>

<style scoped>
.nc-detail-editor :deep(.rich-text-editor-content) {
  max-height: 12rem;
  overflow-y: auto;
}
</style>
