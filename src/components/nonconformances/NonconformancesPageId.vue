<script setup>
import { IconAlertTriangle } from '@tabler/icons-vue'
import { currentSession, isAllowed, canUseAi } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { post } from '@/api'
import { DateTime } from 'luxon'
import { buildNcBanners, buildNcActions, buildNcSections } from './ncDetailConfig.js'
import { useRecordTrail } from '@/composables/useRecordTrail.js'

const props = defineProps({
  id: { type: String, required: true },
})

const router = useRouter()
const route = useRoute()
const { visit: visitTrail } = useRecordTrail()

const nc = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => db.Nonconformance.findByPk(id),
  { models: ['Nonconformance'] },
)
watch(
  nc,
  (n) => {
    if (n?.id) visitTrail({ type: 'NC', id: n.id, label: n.ncNumber, path: route.path })
  },
  { immediate: true },
)

const loading = computed(() => nc.value === undefined)

const breadcrumbs = computed(() => [
  { label: 'Nonconformances', to: getCompanyPath('/nonconformances') },
  { label: nc.value?.ncNumber || nc.value?.title || 'Loading…' },
])

// ─── Inline disposition auto-save ─────────────────────────────────────────────
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

useAutoSave(nc)

// qtyAffected is DECIMAL on the backend → PostGraphile serializes it as a
// BigFloat *string*. Bind it as a string (not v-model.number, which would set a
// JS number and make the GraphQL mutation throw, blocking autosave for the
// whole record). Empty → null so clearing the field doesn't send an invalid "".
const qtyAffectedModel = computed({
  get: () => nc.value?.qtyAffected ?? '',
  set: (v) => {
    if (!nc.value) return
    nc.value.qtyAffected = v === '' || v === null || v === undefined ? null : String(v)
  },
})

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
    return allSteps.filter((s) => !['APPROVED', 'SKIPPED', 'CANCELLED'].includes(s.statusId)).length
  },

  { models: ['WorkflowInstance', 'WorkflowInstanceStep'], initial: 0 },
)

const linkedCapaCount = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [ncId]) => {
    if (!ncId) return 0
    const rows = await db.Capa.where('[sourceType+sourceId]', ['NC', ncId]).exec()
    return rows.length
  },

  { models: ['Capa'], initial: 0 },
)

const ncDispositionType = useLiveQueryWithDeps(
  [() => nc.value?.dispositionTypeId],

  async (db, [id]) => (id ? db.NcDispositionType.findByPk(id) : null),
  { models: ['NcDispositionType'] },
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

// Co-author model: the Responsible Party (ownerId) OR the Initiator (createdBy)
// may drive owner-level actions on the NC. The backend mirrors this via the
// NC_MODULE_CONFIG authorField ('createdBy').
const isOwner = computed(() => {
  const uid = currentSession.value?.userId
  return !!uid && (nc.value?.ownerId === uid || nc.value?.createdBy === uid)
})

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

const workflowInstance = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    const results = await db.WorkflowInstance.where('[resourceType+resourceId]', [
      'Nonconformance',
      id,
    ]).exec()
    return results.find((i) => i.statusId === 'IN_PROGRESS') || results[0] || null
  },
  { models: ['WorkflowInstance'] },
)

// Resolve the underlying Workflow id from the version so we can link to the
// template (workflow-templates route is keyed by workflow id, not version id).
const workflowVersion = useLiveQueryWithDeps(
  [() => workflowInstance.value?.workflowVersionId ?? nc.value?.workflowVersionId],

  async (db, [versionId]) => {
    if (!versionId) return null
    return db.WorkflowVersion.findByPk(versionId)
  },
  { models: ['WorkflowVersion'] },
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
  { models: ['NcDispositionType'] },
)
const dispositionTracksCost = computed(() => !!selectedDispositionType.value?.tracksCost)

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
    nc.value && !nc.value.isSupplierFacing && nc.value.statusId === 'UNDER_REVIEW' && isOwner.value,
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

  { models: ['WorkflowInstance'], initial: [] },
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

  { models: ['WorkflowInstanceStep'], initial: [] },
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
  { models: ['InspectionLot'] },
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

  { models: ['Capa'], initial: [] },
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

// ─── BaseDetailLayout config (SP-6 Task 2) ───────────────────────────────────
const ncBanners = computed(() =>
  buildNcBanners(nc.value, {
    isEditable: isEditable.value,
    sourceLot: sourceLot.value,
    companyPath: getCompanyPath,
  }),
)
const ncActions = computed(() =>
  buildNcActions(
    {
      isOwner: isOwner.value,
      statusId: nc.value?.statusId,
      canMarkComplete: canMarkComplete.value,
      markCompleteBlockedReason: markCompleteBlockedReason.value,
      canConvert: canConvertToSupplier.value,
      saving: saving.value,
      completing: completing.value,
    },
    {
      openOpen: openOpenDialog,
      openMarkComplete: openMarkCompleteDialog,
      openDelete() {
        showDeleteDialog.value = true
      },
      print: openPrintView,
      openAudit() {
        showAuditLog.value = true
      },
      openConvert: openConvertDialog,
    },
  ),
)
const ncDetailConfig = computed(() =>
  defineDetailConfig({
    variant: 'standard',
    width: 'standard',
    breadcrumbs: breadcrumbs.value,
    banners: () => ncBanners.value,
    actions: ncActions.value,
    sections: buildNcSections(nc.value),
  }),
)
</script>

<template>
  <BaseDetailLayout
    :config="ncDetailConfig"
    :record="nc"
    :loading="loading"
    :notFound="!loading && !nc"
    notFoundTitle="NC not found"
    notFoundDescription="This nonconformance could not be found."
  >
    <template #title>
      <BaseTextInput
        v-if="editingTitle && isEditable"
        v-model="nc.title"
        placeholder="NC title"
        autofocus
        @blur="editingTitle = false"
      />
      <BaseClickableRow
        v-else
        class="tw:text-base tw:font-semibold tw:text-on-main"
        :class="isEditable ? 'tw:hover:text-primary' : ''"
        :disabled="!isEditable"
        aria-label="Edit NC title"
        @click="editingTitle = true"
      >
        {{ nc?.title }}
      </BaseClickableRow>
    </template>

    <template #status>
      <NcStatusBadgeById v-if="nc" :statusId="nc.statusId" />
      <NcSeverityBadgeById v-if="nc?.severityId" :severityId="nc.severityId" />
    </template>

    <template v-if="nc" #meta>
      <span class="">{{ nc.ncNumber }}</span>
      <template v-if="nc.typeId"> · <NcTypeBadgeById :typeId="nc.typeId" /></template>
      <template v-if="nc.detectedAt"> · Detected {{ nc.detectedAt.formatDate('date') }}</template>
    </template>

    <template #actions>
      <div class="tw:flex tw:items-center tw:gap-2">
        <DetailActionBar :actions="ncActions" />
        <AskAiButton
          v-if="canUseAi && nc?.id"
          entityType="Nonconformance"
          :entityId="nc.id"
          :entityTitle="nc.title"
          :entityNumber="nc.ncNumber"
        />
      </div>
    </template>

    <template v-if="nc" #section-details>
      <RecordTrailBreadcrumb />

      <!-- Related records lineage (QC lot / complaint / finding → this NC
           → CAPA / CR). Self-hides when there are no links. -->
      <RecordLineagePanel :id="id" type="Nonconformance" />

      <!-- Raised-from-Audit context (scoped) — self-hides when this NC
           wasn't spawned from an audit finding. -->
      <AuditOriginPanel entityType="Nonconformance" :entityId="id" />

      <!-- NC Details card -->
      <FormSection title="NC Details">
        <template #actions>
          <!-- At-a-glance indicator of which assignee pool the
               workflow draws from. Always visible (not just on
               the DRAFT preview), so you can spot a mislabeled
               supplier-facing NC at any lifecycle stage. -->
          <span
            v-if="nc.isSupplierFacing"
            class="tw:text-micro tw:rounded tw:bg-violet-100 tw:text-violet-700 tw:px-1.5 tw:py-0.5 tw:font-normal tw:normal-case"
            title="Supplier-facing: non-approval workflow steps draw from this NC's supplier users. Approval steps stay internal."
          >
            Supplier-facing
          </span>
          <span
            v-else
            class="tw:text-micro tw:rounded tw:bg-gray-100 tw:text-secondary tw:px-1.5 tw:py-0.5 tw:font-normal tw:normal-case"
          >
            Internal
          </span>
        </template>
        <BaseRichTextField
          v-model="nc.description"
          :editable="isEditable"
          clickToEdit
          clickToEditLabel="Add a description…"
          placeholder="Add a description…"
        />

        <!-- Immediate containment action -->
        <div class="tw:flex tw:flex-col tw:gap-1 tw:mt-4">
          <BaseText variant="overline" class="tw:block"> Immediate containment action </BaseText>
          <BaseRichTextField
            v-model="nc.immediateContainmentAction"
            :editable="isEditable"
            placeholder="Describe the immediate action taken to contain this nonconformance…"
            textClass="tw:text-sm tw:text-on-main tw:leading-relaxed"
          />
        </div>
      </FormSection>

      <!-- Admin-defined custom fields (Settings → Custom Fields). Self-hides when none configured. (merged from develop) -->
      <CustomFieldsCard entityType="Nonconformance" :entityId="id" :editable="isEditable" />
    </template>

    <template v-if="nc" #section-workflow>
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
    </template>

    <template v-if="nc" #section-disposition>
      <!-- Disposition card -->
      <FormSection title="Disposition">
        <template v-if="isEditable">
          <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
            <BaseField label="Disposition">
              <NcDispositionTypeSelectMenu v-model="nc.dispositionTypeId" :required="false" />
            </BaseField>
            <BaseField label="CAPA required?">
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
            </BaseField>
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
              <BaseClickableRow
                v-else
                tag="span"
                class="tw:text-sm tw:font-medium tw:hover:text-primary"
                aria-label="Edit cost of NC"
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
              </BaseClickableRow>
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
              <BaseClickableRow
                v-else
                tag="span"
                class="tw:text-sm tw:font-medium tw:hover:text-primary"
                aria-label="Edit credit from supplier"
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
              </BaseClickableRow>
            </div>
          </div>

          <BaseField v-slot="{ id: fieldId }" label="Disposition notes" class="tw:col-span-2">
            <BaseTextarea
              :id="fieldId"
              v-model="nc.dispositionNotes"
              placeholder="Justify your disposition decision and CAPA choice…"
              :rows="3"
            />
          </BaseField>
        </template>

        <template v-else>
          <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
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
                {{ nc.capaRequired === true ? 'Yes' : nc.capaRequired === false ? 'No' : '—' }}
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
      </FormSection>
    </template>

    <template v-if="nc" #section-capas>
      <!-- Linked CAPAs -->
      <FormSection v-if="nc.capaRequired === true" title="Linked CAPAs">
        <template #actions>
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
        </template>
        <div v-if="linkedCapas.length" class="tw:flex tw:flex-col tw:gap-2">
          <RouterLink
            v-for="linked in linkedCapas"
            :key="linked.id"
            :to="getCompanyPath(`/capas/${linked.id}`)"
            class="tw:flex tw:items-center tw:justify-between tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2 tw:hover:bg-main-hover"
          >
            <div class="tw:flex tw:items-center tw:gap-3 tw:min-w-0">
              <span class="tw:text-xs tw:text-secondary">
                {{ linked.capaNumber }}
              </span>
              <span class="tw:text-sm tw:font-medium tw:text-on-main tw:truncate">
                {{ linked.title }}
              </span>
            </div>
            <CapaStatusBadgeById :statusId="linked.statusId" />
          </RouterLink>
        </div>
        <div v-else class="tw:text-sm tw:text-secondary tw:italic">No CAPAs linked yet.</div>
      </FormSection>
    </template>

    <!-- Right column — stays here until Task 4 moves it into the BaseDetailLayout rail -->
    <template v-if="nc" #rail>
      <!-- 1. General — NC number, status, severity, type, source, priority, issue type, detected.
           Responsive grid: pairs up two-per-row when the rail is wide enough,
           collapses to one-per-row when narrow. -->
      <BaseRailCard title="General">
        <div class="tw:grid tw:gap-x-4 tw:gap-y-3 tw:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]">
          <BaseDetailField label="NC number">
            <BaseText variant="body" weight="medium" class="tw:break-words">
              {{ nc.ncNumber || '—' }}
            </BaseText>
          </BaseDetailField>
          <BaseDetailField label="Status">
            <div class="tw:flex tw:items-center tw:gap-1.5 tw:flex-wrap">
              <NcStatusBadgeById :statusId="nc.statusId" />
              <BaseBadge
                v-if="nc.markedCompleteAt"
                class="tw:text-micro tw:bg-emerald-100 tw:text-emerald-700"
                title="Marked complete by owner — pending final close"
              >
                Completed
              </BaseBadge>
            </div>
          </BaseDetailField>
          <BaseDetailField label="Severity">
            <NcSeveritySelectMenu
              v-if="editingSeverity && isEditable"
              v-model="nc.severityId"
              :required="true"
              @blur="editingSeverity = false"
            />
            <BaseClickableRow
              v-else
              tag="span"
              :class="isEditable ? 'tw:hover:opacity-70' : ''"
              :disabled="!isEditable"
              aria-label="Edit severity"
              @click="editingSeverity = true"
            >
              <NcSeverityBadgeById :severityId="nc.severityId" />
            </BaseClickableRow>
          </BaseDetailField>
          <BaseDetailField label="Type">
            <NcTypeBadgeById v-if="nc.typeId" :typeId="nc.typeId" />
            <BaseText v-else color="secondary">—</BaseText>
          </BaseDetailField>
          <BaseDetailField label="Source">
            <NcSourceBadgeById v-if="nc.sourceId" :sourceId="nc.sourceId" />
            <BaseText v-else color="secondary">—</BaseText>
          </BaseDetailField>
          <BaseDetailField label="Priority">
            <BaseInlineSelect
              v-if="isEditable"
              v-model="nc.priorityId"
              :items="[
                { id: 'LOW', name: 'Low' },
                { id: 'MEDIUM', name: 'Medium' },
                { id: 'HIGH', name: 'High' },
                { id: 'CRITICAL', name: 'Critical' },
              ]"
            />
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
            <BaseText v-else color="secondary">—</BaseText>
          </BaseDetailField>
          <BaseDetailField label="Issue type">
            <NcIssueTypeSelectMenu v-if="isEditable" v-model="nc.ncIssueTypeId" />
            <NcIssueTypeBadgeById v-else-if="nc.ncIssueTypeId" :issueTypeId="nc.ncIssueTypeId" />
            <BaseText v-else color="secondary">—</BaseText>
          </BaseDetailField>
          <BaseDetailField label="Detected">
            <BaseDateField
              v-if="editingDetected && isEditable"
              v-model="nc.detectedAt"
              mode="date"
              class="tw:w-full"
              @blur="editingDetected = false"
            />
            <BaseClickableRow
              v-else
              tag="span"
              class="tw:text-sm tw:font-medium"
              :class="isEditable ? 'tw:hover:text-primary' : ''"
              :disabled="!isEditable"
              aria-label="Edit detected date"
              @click="editingDetected = true"
            >
              {{ nc.detectedAt ? nc.detectedAt.formatDate('date') : '—' }}
            </BaseClickableRow>
          </BaseDetailField>
        </div>
      </BaseRailCard>

      <!-- 2. People — initiator, responsible party, site, department -->
      <BaseRailCard title="People" grid>
        <!-- Initiator = who raised the NC (createdBy, immutable). -->
        <BaseDetailField label="Initiator">
          <UserBadgeById v-if="nc.createdBy" :userId="nc.createdBy" />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
        <!-- Responsible party = drives the NC to closure; effectiveness
             checks + default workflow assignment route here. -->
        <BaseDetailField label="Responsible party">
          <UserSelectMenu v-if="isEditable" v-model="nc.ownerId" :required="true" />
          <UserBadgeById v-else-if="nc.ownerId" :userId="nc.ownerId" />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
        <BaseDetailField label="Site">
          <SiteSelectMenu v-if="isEditable" v-model="nc.siteId" :required="true" />
          <SiteBadgeById v-else-if="nc.siteId" :siteId="nc.siteId" />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
        <BaseDetailField label="Department">
          <DepartmentSelectMenu v-if="isEditable" v-model="nc.departmentId" :required="true" />
          <DepartmentBadgeById v-else-if="nc.departmentId" :departmentId="nc.departmentId" />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
      </BaseRailCard>

      <!-- 3. Schedule — due date -->
      <BaseRailCard title="Schedule">
        <BaseDetailField label="Due date">
          <BaseDateField
            v-if="editingDueDate && isEditable"
            v-model="nc.dueDate"
            mode="date"
            class="tw:w-full"
            @blur="editingDueDate = false"
          />
          <BaseClickableRow
            v-else
            tag="span"
            class="tw:text-sm tw:font-medium tw:flex tw:items-center tw:gap-1 tw:flex-nowrap"
            :class="[isOverdue ? 'tw:text-red-600' : '', isEditable ? 'tw:hover:text-primary' : '']"
            :disabled="!isEditable"
            aria-label="Edit due date"
            @click="editingDueDate = true"
          >
            <span>{{ nc.dueDate ? nc.dueDate.formatDate('date') : '—' }}</span>
            <IconAlertTriangle v-if="isOverdue" :size="16" class="tw:text-red-600" />
          </BaseClickableRow>
        </BaseDetailField>
      </BaseRailCard>

      <!-- 4. Notify (cc) — groups/people emailed + in-app on status change -->
      <BaseRailCard title="Notify (cc)">
        <NotificationCcField
          v-model:groupIds="nc.notifyGroupIds"
          v-model:userIds="nc.notifyUserIds"
          :editable="isEditable"
          hint=""
        />
      </BaseRailCard>

      <!-- 5. Product impact — supplier, supplier-facing + Convert path, product, qty+UOM, PO/Order/Lot.
               Collapsed by default; editable rows always render so a missing value can be ADDED;
               read-only mode keeps hiding empties. -->
      <BaseRailCard
        v-if="
          isEditable ||
          nc.supplierId ||
          nc.productId ||
          nc.qtyAffected ||
          nc.poNumber ||
          nc.orderNumber ||
          nc.lotNumber
        "
        title="Product impact"
        :defaultOpen="false"
      >
        <BaseDetailField v-if="isEditable || nc.supplierId" label="Supplier">
          <SupplierSelectMenu
            v-if="isEditable && nc.statusId === 'DRAFT'"
            v-model="nc.supplierId"
          />
          <SupplierBadgeById v-else-if="nc.supplierId" :supplierId="nc.supplierId" />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
        <!-- Supplier facing — free toggle while DRAFT; once OPEN the
             owner can still CONVERT internal → supplier-facing. -->
        <BaseDetailField label="Supplier facing">
          <BaseInlineSelect
            v-if="isEditable && nc.statusId === 'DRAFT'"
            v-model="audienceModel"
            :items="[
              { id: 'INTERNAL', name: 'No — internal' },
              { id: 'SUPPLIER', name: 'Yes — supplier facing' },
            ]"
            :required="true"
          />
          <div v-else class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
            <span
              class="tw:text-micro tw:rounded tw:px-1.5 tw:py-0.5"
              :class="
                nc.isSupplierFacing
                  ? 'tw:bg-violet-100 tw:text-violet-700'
                  : 'tw:bg-gray-100 tw:text-secondary'
              "
            >
              {{ nc.isSupplierFacing ? 'Supplier-facing' : 'Internal' }}
            </span>
            <button
              v-if="canConvertToSupplier"
              class="tw:text-caption tw:font-medium tw:text-violet-700 tw:underline tw:bg-transparent tw:border-0 tw:cursor-pointer tw:p-0"
              @click="openConvertDialog"
            >
              Convert…
            </button>
          </div>
        </BaseDetailField>
        <BaseDetailField v-if="isEditable || nc.productId" label="Product">
          <ProductSelectMenu v-if="isEditable" v-model="nc.productId" :allowCreate="false" />
          <ProductBadgeById v-else-if="nc.productId" :productId="nc.productId" />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
        <BaseDetailField v-if="isEditable || nc.qtyAffected" label="Qty affected">
          <div v-if="isEditable" class="tw:flex tw:gap-1">
            <BaseTextInput v-model="qtyAffectedModel" type="number" size="sm" class="tw:flex-1" />
            <BaseTextInput v-model="nc.unitOfMeasure" size="sm" placeholder="UOM" class="tw:w-16" />
          </div>
          <BaseText v-else variant="body" weight="medium">
            {{ nc.qtyAffected }} {{ nc.unitOfMeasure }}
          </BaseText>
        </BaseDetailField>
        <BaseDetailField v-if="isEditable || nc.poNumber" label="PO #">
          <BaseTextInput v-if="isEditable" v-model="nc.poNumber" size="sm" />
          <BaseText v-else variant="body" weight="medium" class="tw:break-words">
            {{ nc.poNumber }}
          </BaseText>
        </BaseDetailField>
        <BaseDetailField v-if="isEditable || nc.orderNumber" label="Order #">
          <BaseTextInput v-if="isEditable" v-model="nc.orderNumber" size="sm" />
          <BaseText v-else variant="body" weight="medium" class="tw:break-words">
            {{ nc.orderNumber }}
          </BaseText>
        </BaseDetailField>
        <BaseDetailField v-if="isEditable || nc.lotNumber" label="Lot #">
          <BaseTextInput v-if="isEditable" v-model="nc.lotNumber" size="sm" />
          <BaseText v-else variant="body" weight="medium" class="tw:break-words">
            {{ nc.lotNumber }}
          </BaseText>
        </BaseDetailField>
      </BaseRailCard>

      <!-- 6. Related — CAPA state, linked complaints, workflow info card, shared-with panel -->
      <BaseRailCard title="Related">
        <BaseDetailField label="CAPA">
          <BaseText
            variant="body"
            weight="medium"
            :class="nc.capaRequired === null ? 'tw:text-secondary tw:italic' : ''"
          >
            {{
              nc.capaRequired === true
                ? 'Required'
                : nc.capaRequired === false
                  ? 'Not required'
                  : 'Not yet decided'
            }}
          </BaseText>
        </BaseDetailField>

        <!-- Customer complaints this NC was converted from — resolves
             via nc_source_links, self-hides when there are none. -->
        <NcLinkedComplaintsPanel :ncId="id" />

        <!-- Workflow panel -->
        <div v-if="nc.workflowVersionId || workflowInstance">
          <BaseText
            variant="overline"
            class="tw:block tw:pb-2 tw:border-b tw:border-divider tw:mb-3"
          >
            NC workflow
          </BaseText>

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

        <!-- External access — read-only panel populated by workflow-
             step assignment (autoShareSupplierUsers). Product decision
             (2026-05-29): supplier visibility on NCs is workflow-
             driven, not manual. Only meaningful on supplier-facing
             NCs — internal NCs never share externally. -->
        <SharedWithPanel v-if="nc.isSupplierFacing" entityType="Nonconformance" :entityId="id" />
      </BaseRailCard>

      <!-- Workflow detail component (steps, reassign, send-back, record viewer) -->
    </template>

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
            All gates are satisfied — every workflow step is complete, the disposition is recorded
            with notes
            <template v-if="nc?.capaRequired === true">, a CAPA is linked</template>
            <template v-if="ncDispositionType?.tracksCost">, and Cost of NC is entered</template>.
            Approving signs the closure and transitions the NC to <strong>Closed</strong> — this is
            the final action.
          </div>
        </div>

        <div>
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">
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
            CFR 21 Part 11 — Approving and closing this NC is an attested regulated action and
            requires an e-signature. You'll confirm your identity on the next step.
          </div>
        </div>

        <p v-if="saveError" class="tw:text-xs tw:text-red-600">{{ saveError }}</p>
      </div>
      <template #footer="{ close }">
        <BaseDialogFooter
          submitLabel="Sign & Close"
          :loading="completing"
          @cancel="close"
          @submit="handleMarkCompleteClick"
        />
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
        <BaseDialogFooter
          submitLabel="Open NC"
          :loading="saving"
          @cancel="close"
          @submit="handleSubmitForReview"
        />
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
        Delete this draft nonconformance? This permanently removes the record. Drafts have no audit
        history yet, so this is safe.
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
          Investigation points at a supplier? Converting keeps everything already entered on this NC
          and re-routes the remaining workflow to the supplier:
        </p>
        <ul class="tw:text-xs tw:text-secondary tw:list-disc tw:pl-5 tw:space-y-1">
          <li>Completed steps and their history are untouched.</li>
          <li>
            Open and upcoming non-approval steps are reassigned to the supplier's portal user —
            previous assignees stay visible in step history as
            <span class="tw:font-semibold">Reassigned</span>.
          </li>
          <li>Final approval steps remain internal.</li>
          <li>The NC stays open; nothing restarts.</li>
        </ul>
        <BaseField
          label="Supplier"
          required
          hint="The supplier needs at least one active portal user."
        >
          <SupplierSelectMenu v-model="convertSupplierId" class="tw:w-full" />
        </BaseField>
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
  </BaseDetailLayout>
</template>
