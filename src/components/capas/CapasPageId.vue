<script setup>
import { buildCapaBanners, buildCapaSections, buildCapaActions } from './capaDetailConfig.js'
import { currentSession, isAllowed, canUseAi } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { post } from '@/api'
import { DateTime } from 'luxon'
import { useRecordTrail } from '@/composables/useRecordTrail.js'

const props = defineProps({
  id: { type: String, required: true },
})

const router = useRouter()
const route = useRoute()
const { visit: visitTrail } = useRecordTrail()

const capa = useLiveQueryWithDeps([() => props.id], async (db, [id]) => db.Capa.findByPk(id), {
  models: ['Capa'],
})
watch(
  capa,
  (c) => {
    if (c?.id) visitTrail({ type: 'CAPA', id: c.id, label: c.capaNumber, path: route.path })
  },
  { immediate: true },
)

const loading = computed(() => capa.value === undefined)

const isEditable = computed(
  () => capa.value && capa.value.statusId !== 'CLOSED' && capa.value.statusId !== 'CANCELLED',
)

useAutoSave(capa)

const saving = ref(false)
const saveError = ref(null)

const showCloseDialog = ref(false)
const closing = ref(false)
const showCancelDialog = ref(false)
const cancelling = ref(false)
const cancelReason = ref('')
const showAuditLog = ref(false)

// ─── E-signature dialog state ────────────────────────────────────────────────
// CFR 21 Part 11 §11.50/§11.70: both Close and Cancel require an authenticated
// signature. We capture credentials via WorkflowInstanceEsignAuthDialog (same
// dialog the workflow-step approvals use), then send them to the backend
// which verifies before mutating.
const showEsignDialog = ref(false)
// 'close' | 'cancel' — set when the user clicks the action button so the
// esign @verified handler knows which controller to call.
const pendingEsignAction = ref(null)

// ─── Close-CAPA additional state ─────────────────────────────────────────────
// Industry-standard effectiveness-check presets (days from close). 90 is the
// default per ISO 13485 / 21 CFR 820.100 practice — long enough to observe
// the corrective action's effect, short enough to keep cycle time reasonable.
const EC_PRESETS = [
  { label: '30 days', days: 30 },
  { label: '60 days', days: 60 },
  { label: '90 days', days: 90 },
  { label: '180 days', days: 180 },
  { label: '365 days', days: 365 },
]
const closeEcPresetDays = ref(90)
const closeEcCustomDate = ref(null) // DateTime | null — when set, overrides the preset
const closeComments = ref('')

// Effective EC date: custom calendar pick if set, else "today + preset days".
const closeEffectivenessDate = computed(() => {
  if (closeEcCustomDate.value) return closeEcCustomDate.value
  if (closeEcPresetDays.value == null) return null
  return DateTime.now().plus({ days: closeEcPresetDays.value }).startOf('day')
})

// `incompleteStepCount`, `canClose`, `closeDisabledReason` are defined
// further down after `allWorkflowInstanceStepIds` is declared (TDZ).

// Build a flat list of related entity ids so the audit dialog covers the
// CAPA itself + its workflow plumbing (instance, steps, assignments) +
// effectiveness checks. AuditLogDialog filters logs by these tuples.
const allWorkflowInstanceIds = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [capaId]) => {
    if (!capaId) return []
    const rows = await db.WorkflowInstance.where('[resourceType+resourceId]', [
      'Capa',
      capaId,
    ]).exec()
    return rows.map((r) => r.id)
  },

  { models: ['WorkflowInstance'], initial: [] },
)

const allWorkflowInstanceStepIds = useLiveQueryWithDeps(
  [() => allWorkflowInstanceIds.value.join(',')],
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

const allEffectivenessCheckIds = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [capaId]) => {
    if (!capaId) return []
    const rows = await db.CapaEffectivenessCheck.where('capaId', capaId).exec()
    return rows.map((r) => r.id)
  },

  { models: ['CapaEffectivenessCheck'], initial: [] },
)

const auditIncludeEntities = computed(() => [
  { entityType: 'Capas', entityIds: [props.id] },
  { entityType: 'WorkflowInstances', entityIds: allWorkflowInstanceIds.value },
  { entityType: 'WorkflowInstanceSteps', entityIds: allWorkflowInstanceStepIds.value },
  { entityType: 'CapaEffectivenessChecks', entityIds: allEffectivenessCheckIds.value },
])

// Count of workflow steps still open (not APPROVED / SKIPPED / CANCELLED).
// Backend re-validates on close; this is the UI gate. Declared after
// `allWorkflowInstanceStepIds` to avoid the TDZ that bit us when this
// lived next to the other close-dialog state.
const incompleteStepCount = useLiveQueryWithDeps(
  [() => allWorkflowInstanceStepIds.value.join(',')],
  async (db, [idsStr]) => {
    if (!idsStr) return 0
    const ids = idsStr.split(',')
    const steps = await Promise.all(ids.map((id) => db.WorkflowInstanceStep.findByPk(id)))
    return steps.filter((s) => s && !['APPROVED', 'SKIPPED', 'CANCELLED'].includes(s.statusId))
      .length
  },

  { models: ['WorkflowInstanceStep'], initial: 0 },
)
const canClose = computed(() => incompleteStepCount.value === 0 && !!closeEffectivenessDate.value)

// Why the "Sign & Close" action is blocked — surfaced as the submit button's
// native tooltip via BaseDialogFooter's `submitTitle`.
const closeDisabledReason = computed(() => {
  if (incompleteStepCount.value > 0) {
    return `${incompleteStepCount.value} workflow step${
      incompleteStepCount.value === 1 ? '' : 's'
    } still open. Complete or skip them first.`
  }
  if (!closeEffectivenessDate.value) return 'Pick an effectiveness check date.'
  return ''
})

function openPrintView() {
  if (!capa.value?.id) return
  // Centralised print: /<companyCode>/print?module=Capa&id=...
  // Dispatched via components/print/modules/index.js → CapaPrint.vue, which
  // wraps PrintLayout for shared chrome.
  const params = new URLSearchParams({ module: 'Capa', id: capa.value.id })
  const url = getCompanyPath(`/print?${params.toString()}`)
  window.open(url, '_blank', 'noopener,noreferrer')
}

// Co-author model: the Responsible Party (ownerId) OR the Initiator (createdBy)
// may drive owner-level actions on the CAPA. Mirrors CAPA_MODULE_CONFIG.authorField.
const isOwner = computed(() => {
  const uid = currentSession.value?.userId
  return !!uid && (capa.value?.ownerId === uid || capa.value?.createdBy === uid)
})

function openCloseDialog() {
  saveError.value = null
  // Seed the EC preset from the CAPA's planning preference (default 90).
  // If the saved interval is one of the standard chips we pre-select that
  // chip; otherwise we leave it on the preference value (the chip row
  // won't highlight, but the resulting date still computes correctly).
  closeEcPresetDays.value = capa.value?.ecIntervalDays ?? 90
  closeEcCustomDate.value = null
  closeComments.value = ''
  showCloseDialog.value = true
}

// User confirms in the Close dialog → open the esign auth dialog. The
// actual POST happens in the @verified handler below once credentials
// come back.
function handleCloseCapa() {
  if (!canClose.value) return
  saveError.value = null
  pendingEsignAction.value = 'close'
  showEsignDialog.value = true
}

function openCancelDialog() {
  cancelReason.value = ''
  saveError.value = null
  showCancelDialog.value = true
}

function handleCancelCapa() {
  if (!capa.value || !cancelReason.value.trim()) return
  saveError.value = null
  pendingEsignAction.value = 'cancel'
  showEsignDialog.value = true
}

// Esign dialog returns { method, provider, token }. We fire the right
// controller based on which action was pending.
async function onEsignVerified({ method, provider, token }) {
  showEsignDialog.value = false
  if (pendingEsignAction.value === 'close') {
    closing.value = true
    saveError.value = null
    try {
      await post(`/v1/services/capas/${props.id}/close`, {
        effectivenessCheckAt: closeEffectivenessDate.value.toISO(),
        comments: closeComments.value.trim() || null,
        method,
        provider: provider || null,
        token,
      })
      showCloseDialog.value = false
      router.push(getCompanyPath('/capas'))
    } catch (e) {
      saveError.value = e.message || 'Failed to close CAPA'
      // Keep the close dialog open so the user can see the error and retry.
      showCloseDialog.value = true
    } finally {
      closing.value = false
      pendingEsignAction.value = null
    }
  } else if (pendingEsignAction.value === 'cancel') {
    cancelling.value = true
    saveError.value = null
    try {
      await post(`/v1/services/capas/${props.id}/cancel`, {
        reason: cancelReason.value.trim(),
        method,
        provider: provider || null,
        token,
      })
      showCancelDialog.value = false
      router.push(getCompanyPath('/capas'))
    } catch (e) {
      saveError.value = e.message || 'Failed to cancel CAPA'
      showCancelDialog.value = true
    } finally {
      cancelling.value = false
      pendingEsignAction.value = null
    }
  }
}

// ─── Open CAPA (DRAFT → workflow active) ─────────────────────────────────────
// Confirmation dialog before the Draft → Active transition. Once opened,
// the CAPA becomes a permanent audit record — actions / effectiveness
// checks all hang off this row.
const showOpenDialog = ref(false)

function openOpenDialog() {
  saveError.value = null
  showOpenDialog.value = true
}

async function handleSubmitForReview() {
  if (!capa.value) return
  saving.value = true
  saveError.value = null
  try {
    await post(`/v1/services/capas/${props.id}/submitForReview`, {})
    showOpenDialog.value = false
  } catch (e) {
    saveError.value = e.message || 'Failed to open CAPA'
  } finally {
    saving.value = false
  }
}

// ─── Delete draft CAPA (DRAFT-only) ──────────────────────────────────────────
const showDeleteDialog = ref(false)
const deleting = ref(false)

async function handleDeleteDraft() {
  if (!capa.value || capa.value.statusId !== 'DRAFT' || deleting.value) return
  deleting.value = true
  saveError.value = null
  try {
    await capa.value.delete()
    showDeleteDialog.value = false
    router.push(getCompanyPath('/capas'))
  } catch (e) {
    saveError.value = e.message || 'Failed to delete draft'
  } finally {
    deleting.value = false
  }
}

const isOverdue = computed(() => {
  if (!capa.value?.dueDate) return false
  if (capa.value.statusId === 'CLOSED') return false
  return capa.value.dueDate < DateTime.now()
})

const workflowInstance = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    const results = await db.WorkflowInstance.where('[resourceType+resourceId]', [
      'Capa',
      id,
    ]).exec()
    return results.find((i) => i.statusId === 'IN_PROGRESS') || results[0] || null
  },
  { models: ['WorkflowInstance'] },
)

// Resolve the WorkflowVersion (for label + workflowId link target). Prefer the
// instance's version; fall back to the CAPA's directly-assigned version if no
// instance exists yet (DRAFT CAPAs).
const workflowVersion = useLiveQueryWithDeps(
  [() => workflowInstance.value?.workflowVersionId ?? capa.value?.workflowVersionId],

  async (db, [versionId]) => {
    if (!versionId) return null
    return db.WorkflowVersion.findByPk(versionId)
  },
  { models: ['WorkflowVersion'] },
)

const workflow = useLiveQueryWithDeps(
  [() => workflowVersion.value?.workflowId],

  async (db, [workflowId]) => {
    if (!workflowId) return null
    return db.Workflow.findByPk(workflowId)
  },
  { models: ['Workflow'] },
)

function workflowVersionLabel(v) {
  if (!v) return ''
  return v.versionLabel || `${v.versionMajor ?? 1}.${v.versionMinor ?? 0}`
}

const editingTitle = ref(false)

// Cross-module shortcut: spawn a Change Request seeded from this CAPA.
const canCreateChangeRequest = computed(() => isAllowed(['changeRequests:create']))
function onCreateLinkedChangeRequest() {
  router.push({
    path: getCompanyPath('/change-requests/create'),
    query: { source: 'CAPA', sourceId: props.id },
  })
}

// ─── BaseDetailLayout config (SP-6) ──────────────────────────────────────────
const capaBanners = computed(() => buildCapaBanners(capa.value, { isEditable: isEditable.value }))
const capaActions = computed(() =>
  buildCapaActions(
    {
      isOwner: isOwner.value,
      statusId: capa.value?.statusId,
      canClose: canClose.value,
      closeDisabledReason: closeDisabledReason.value,
      canCreateChangeRequest: canCreateChangeRequest.value,
      saving: saving.value,
      closing: closing.value,
      cancelling: cancelling.value,
    },
    {
      openOpen: openOpenDialog,
      openClose: openCloseDialog,
      openCancel: openCancelDialog,
      print: openPrintView,
      createCr: onCreateLinkedChangeRequest,
      openAudit() {
        showAuditLog.value = true
      },
      openDelete() {
        showDeleteDialog.value = true
      },
    },
  ),
)
const capaDetailConfig = computed(() =>
  defineDetailConfig({
    variant: 'standard',
    width: 'standard',
    breadcrumbs: [
      { label: 'CAPAs', to: getCompanyPath('/capas') },
      { label: capa.value?.capaNumber || capa.value?.title || 'Loading…' },
    ],
    banners: () => capaBanners.value,
    actions: capaActions.value,
    sections: buildCapaSections(capa.value),
  }),
)
</script>

<template>
  <BaseDetailLayout
    :config="capaDetailConfig"
    :record="capa"
    :loading="loading"
    :notFound="!loading && !capa"
    notFoundTitle="CAPA not found"
    notFoundDescription="This CAPA could not be found."
  >
    <template #title>
      <BaseTextInput
        v-if="editingTitle && isEditable"
        v-model="capa.title"
        placeholder="CAPA title"
        autofocus
        class="tw:mb-2"
        @blur="editingTitle = false"
      />
      <BaseClickableRow
        v-else
        class="tw:text-base tw:font-semibold tw:text-on-main"
        :class="isEditable ? 'tw:hover:text-primary' : ''"
        :disabled="!isEditable"
        aria-label="Edit CAPA title"
        @click="editingTitle = true"
      >
        {{ capa?.title }}
      </BaseClickableRow>
    </template>

    <template #status>
      <CapaStatusBadgeById v-if="capa" :statusId="capa.statusId" />
      <CapaPriorityBadgeById v-if="capa?.priorityId" :priorityId="capa.priorityId" />
    </template>

    <template v-if="capa" #meta>
      <span class="tw:font-mono">{{ capa.capaNumber }}</span>
      <template v-if="capa.typeId"> · <CapaTypeBadgeById :typeId="capa.typeId" /></template>
      <template v-if="capa.initiatedAt">
        · Initiated {{ capa.initiatedAt.formatDate('date') }}</template
      >
    </template>

    <template #actions>
      <div class="tw:flex tw:items-center tw:gap-2">
        <DetailActionBar :actions="capaActions" />
        <AskAiButton
          v-if="canUseAi && capa?.id"
          entityType="Capa"
          :entityId="capa.id"
          :entityTitle="capa.title"
          :entityNumber="capa.capaNumber"
        />
      </div>
    </template>

    <template v-if="capa" #section-details>
      <RecordTrailBreadcrumb />

      <!-- Related records lineage (NC / complaint / finding → this CAPA).
           Self-hides when there are no links. -->
      <RecordLineagePanel :id="id" type="Capa" />

      <!-- Raised-from-Audit context (scoped): audit header + only the
           findings/failed requirements this CAPA addresses. Self-hides
           when the CAPA didn't originate from an audit. Visible to
           assignees without audits:read — see AuditOriginPanel. -->
      <AuditOriginPanel entityType="Capa" :entityId="id" />

      <!-- CAPA Details card (description + classification grid) -->
      <FormSection title="CAPA Details">
        <template #actions>
          <!-- At-a-glance indicator of which assignee pool the
               workflow draws from. Mirrors the NC chip — a CAPA
               spawned from a supplier NC inherits both
               isSupplierFacing and supplierId from the source
               (see CapasCreate watch on sourceNc), so this stays
               in sync with how the workflow actually routes its
               non-APPROVAL steps. -->
          <span
            v-if="capa.isSupplierFacing"
            class="tw:text-micro tw:rounded tw:bg-violet-100 tw:text-violet-700 tw:px-1.5 tw:py-0.5 tw:font-normal tw:normal-case"
            title="Supplier-facing: non-approval workflow steps draw from this CAPA's supplier users. Approval steps stay internal."
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
          v-model="capa.description"
          :editable="isEditable"
          clickToEdit
          clickToEditLabel="Add a description…"
          placeholder="Add a description…"
          class="tw:mb-4"
        />

        <div class="tw:grid tw:grid-cols-3 tw:gap-3">
          <div class="tw:flex tw:flex-col tw:gap-1">
            <div class="tw:text-xs tw:text-secondary">Priority</div>
            <CapaPriorityBadgeById :priorityId="capa.priorityId" />
          </div>
          <div class="tw:flex tw:flex-col tw:gap-1">
            <div class="tw:text-xs tw:text-secondary">Type</div>
            <CapaTypeBadgeById :typeId="capa.typeId" />
          </div>
          <div class="tw:flex tw:flex-col tw:gap-1">
            <div class="tw:text-xs tw:text-secondary">Source</div>
            <CapaSourceBadgeById :sourceId="capa.sourceType" />
          </div>
          <div class="tw:flex tw:flex-col tw:gap-1">
            <div class="tw:text-xs tw:text-secondary">Initiated</div>
            <span class="tw:text-sm tw:font-medium">
              {{ capa.initiatedAt?.formatDate('date') || '—' }}
            </span>
          </div>
        </div>
      </FormSection>

      <!-- Admin-defined custom fields. Self-hides when none configured. -->
      <CustomFieldsCard entityType="Capa" :entityId="id" :editable="isEditable" />
    </template>

    <template v-if="capa" #section-workflow>
      <!-- Workflow steps. In DRAFT (no instance yet) we render the
           template-step preview so the owner can plan assignments.
           Once they Submit, the workflow instance exists and the
           live CapaWorkflowDetail takes over. -->
      <CapaWorkflowDraftPreview
        v-if="!workflowInstance && capa?.statusId === 'DRAFT'"
        :capaId="id"
        :isOwner="isOwner"
      />
      <CapaWorkflowDetail
        v-else
        :capaId="id"
        :workflowInstanceId="workflowInstance?.id"
        :isOwner="isOwner"
      />
    </template>

    <template v-if="capa" #section-effectiveness>
      <!-- Effectiveness Check (post-closure follow-up) -->
      <CapaEffectivenessCheckCard :capaId="id" :isOwner="isOwner" />

      <!-- External access — read-only panel populated by workflow-
           step assignment (autoShareSupplierUsers). The product
           decision (2026-05-29) is that supplier visibility on CAPA
           is workflow-driven, not manual. See SharedWithPanel.vue.
           Only relevant on supplier-facing CAPAs — external access is
           only ever granted on those, so hide the section otherwise. -->
      <SharedWithPanel v-if="capa?.isSupplierFacing" entityType="Capa" :entityId="id" />
    </template>

    <template v-if="capa" #rail>
      <!-- 1. Status & schedule -->
      <BaseRailCard title="Status &amp; schedule">
        <BaseDetailField label="Number">
          <BaseText variant="body" weight="medium" class="tw:font-mono tw:break-words">
            {{ capa.capaNumber }}
          </BaseText>
        </BaseDetailField>
        <BaseDetailField label="Status">
          <CapaStatusBadgeById :statusId="capa.statusId" />
        </BaseDetailField>
        <BaseDetailField label="Due">
          <BaseDateField v-if="isEditable" v-model="capa.dueDate" mode="date" class="tw:w-full" />
          <BaseText
            v-else
            variant="body"
            weight="medium"
            :class="isOverdue ? 'tw:text-red-600' : ''"
          >
            {{ capa.dueDate?.formatDate('date') || '—' }}
          </BaseText>
        </BaseDetailField>
        <BaseDetailField
          v-if="capa.verifiedAt"
          label="Verified"
          :value="capa.verifiedAt.formatDate('dateTime')"
        />
        <BaseDetailField
          v-if="capa.closedAt"
          label="Closed"
          :value="capa.closedAt.formatDate('dateTime')"
        />
      </BaseRailCard>

      <!-- 2. People -->
      <BaseRailCard title="People">
        <!-- Initiator = who raised the CAPA (createdBy, immutable). -->
        <BaseDetailField label="Initiator">
          <UserBadgeById v-if="capa.createdBy" :userId="capa.createdBy" />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
        <!-- Responsible party = drives the CAPA to closure; effectiveness
             checks + default workflow assignment route here. -->
        <BaseDetailField label="Responsible party">
          <UserSelectMenu v-if="isEditable" v-model="capa.ownerId" :required="true" />
          <UserBadgeById v-else-if="capa.ownerId" :userId="capa.ownerId" />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
        <BaseDetailField label="Site">
          <SiteSelectMenu v-if="isEditable" v-model="capa.siteId" :required="true" />
          <SiteBadgeById v-else-if="capa.siteId" :siteId="capa.siteId" />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
        <BaseDetailField label="Department">
          <DepartmentSelectMenu v-if="isEditable" v-model="capa.departmentId" :required="true" />
          <DepartmentBadgeById v-else-if="capa.departmentId" :departmentId="capa.departmentId" />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
        <BaseDetailField v-if="capa.supplierId" label="Supplier">
          <SupplierBadgeById :supplierId="capa.supplierId" />
        </BaseDetailField>
      </BaseRailCard>

      <!-- 3. Notify (cc) — groups/people emailed + in-app on status change -->
      <BaseRailCard title="Notify (cc)">
        <NotificationCcField
          v-model:groupIds="capa.notifyGroupIds"
          v-model:userIds="capa.notifyUserIds"
          :editable="isEditable"
          hint=""
        />
      </BaseRailCard>

      <!-- 4. Related — workflow template link -->
      <BaseRailCard v-if="workflow && workflowVersion" title="Related">
        <!-- Workflow template card -->
        <RouterLink
          :to="
            getCompanyPath(
              `/workflow-templates/${workflow.id}?version=${encodeURIComponent(
                workflowVersionLabel(workflowVersion),
              )}`,
            )
          "
          class="tw:flex tw:flex-col tw:gap-2 tw:hover:text-primary tw:transition-colors"
        >
          <div class="tw:text-xs tw:text-secondary tw:uppercase tw:font-semibold">
            Workflow template
          </div>
          <div class="tw:flex tw:items-center tw:justify-between tw:gap-2">
            <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:truncate">
              {{ workflow.name }}
            </span>
            <span
              class="tw:text-xs tw:font-mono tw:text-secondary tw:bg-main-hover tw:px-2 tw:py-0.5 tw:rounded"
            >
              v{{ workflowVersionLabel(workflowVersion) }}
            </span>
          </div>
        </RouterLink>
      </BaseRailCard>
    </template>
  </BaseDetailLayout>

  <!-- ─── Dialogs (siblings after </BaseDetailLayout>) ──────────────── -->

  <BaseDialog v-model="showCloseDialog" title="Close CAPA" maxWidth="lg">
    <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
      <!-- Gate 1: workflow step completion -->
      <div
        class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:border"
        :class="
          incompleteStepCount === 0
            ? 'tw:bg-green-50 tw:border-green-200'
            : 'tw:bg-red-50 tw:border-red-200'
        "
      >
        <div
          class="tw:shrink-0 tw:mt-0.5 tw:font-bold"
          :class="incompleteStepCount === 0 ? 'tw:text-green-600' : 'tw:text-red-600'"
        >
          {{ incompleteStepCount === 0 ? '✓' : '⚠' }}
        </div>
        <div
          class="tw:text-sm"
          :class="incompleteStepCount === 0 ? 'tw:text-green-800' : 'tw:text-red-800'"
        >
          <template v-if="incompleteStepCount === 0">
            All workflow steps and sub-tasks are complete.
          </template>
          <template v-else>
            <strong>{{ incompleteStepCount }}</strong> workflow step{{
              incompleteStepCount === 1 ? '' : 's'
            }}
            still open. Complete, skip, or cancel them before closing.
          </template>
        </div>
      </div>

      <!-- Gate 2: effectiveness check date -->
      <BaseField label="Effectiveness Check Date" required>
        <p class="tw:text-xs tw:text-secondary tw:mb-2">
          When should the corrective action's effectiveness be verified? Industry standard is 90
          days from close.
        </p>
        <div class="tw:flex tw:flex-wrap tw:gap-2 tw:mb-3">
          <button
            v-for="preset in EC_PRESETS"
            :key="preset.days"
            type="button"
            class="tw:px-3 tw:py-1 tw:rounded-full tw:text-xs tw:font-medium tw:border tw:transition-colors"
            :class="
              !closeEcCustomDate && closeEcPresetDays === preset.days
                ? 'tw:bg-primary tw:text-white tw:border-primary'
                : 'tw:bg-white tw:text-secondary tw:border-divider tw:hover:bg-main-hover'
            "
            @click="
              () => {
                closeEcPresetDays = preset.days
                closeEcCustomDate = null
              }
            "
          >
            {{ preset.label }}
          </button>
        </div>
        <div class="tw:flex tw:items-center tw:gap-2">
          <span class="tw:text-xs tw:text-secondary">Or pick a specific date:</span>
          <BaseDateField v-model="closeEcCustomDate" mode="date" />
        </div>
        <p v-if="closeEffectivenessDate" class="tw:text-xs tw:text-secondary tw:mt-2">
          Will schedule for: <strong>{{ closeEffectivenessDate.formatDate('date') }}</strong>
        </p>
      </BaseField>

      <!-- Optional closure comments -->
      <BaseField v-slot="{ id: fieldId }" label="Closure Comments" optional>
        <BaseTextarea
          :id="fieldId"
          v-model="closeComments"
          :rows="3"
          placeholder="Summary of the corrective action and verification of completion"
        />
      </BaseField>

      <!-- CFR 21 Part 11 notice -->
      <div
        class="tw:flex tw:items-start tw:gap-2 tw:p-3 tw:rounded-lg tw:bg-blue-50 tw:border tw:border-blue-200 tw:text-xs tw:text-blue-800"
      >
        <div class="tw:shrink-0 tw:mt-0.5">🔒</div>
        <div>
          CFR 21 Part 11 — Closing this CAPA finalises the controlled record and requires an
          e-signature. You'll be prompted to confirm your identity on the next step.
        </div>
      </div>

      <p v-if="saveError" class="tw:text-xs tw:text-red-600">{{ saveError }}</p>
    </div>
    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Sign & Close CAPA"
        submitVariant="danger"
        :loading="closing"
        :disabled="!canClose"
        :submitTitle="canClose ? undefined : closeDisabledReason"
        @cancel="close"
        @submit="handleCloseCapa"
      />
    </template>
  </BaseDialog>

  <!-- E-sign dialog — used for both Close and Cancel. CFR-11 §11.100
       (unique user signature) + §11.200 (two ID components). The
       pendingEsignAction flag routes the @verified callback to the
       right controller. -->
  <WorkflowInstanceEsignAuthDialog v-model="showEsignDialog" @verified="onEsignVerified" />

  <!-- Audit Log Dialog — CAPA + its WorkflowInstance, steps and
       effectiveness checks all roll up into one timeline. -->
  <AuditLogDialog
    v-model="showAuditLog"
    :includeEntities="auditIncludeEntities"
    :title="`Audit Log — ${capa?.capaNumber ?? 'CAPA'}`"
  />

  <BaseDialog v-model="showCancelDialog" title="Cancel CAPA" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
      <div
        class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-amber-50 tw:border tw:border-amber-200"
      >
        <div class="tw:text-amber-600 tw:shrink-0 tw:mt-0.5">⚠</div>
        <div class="tw:text-sm tw:text-amber-800">
          Cancelling will abort any in-progress workflow and mark the CAPA cancelled. The reason
          below is recorded on the row and in the audit log.
        </div>
      </div>
      <BaseField v-slot="{ id: fieldId }" label="Reason">
        <BaseTextarea
          :id="fieldId"
          v-model="cancelReason"
          :rows="3"
          placeholder="Why is this CAPA being cancelled?"
        />
      </BaseField>
      <!-- CFR 21 Part 11 notice -->
      <div
        class="tw:flex tw:items-start tw:gap-2 tw:p-3 tw:rounded-lg tw:bg-blue-50 tw:border tw:border-blue-200 tw:text-xs tw:text-blue-800"
      >
        <div class="tw:shrink-0 tw:mt-0.5">🔒</div>
        <div>
          CFR 21 Part 11 — Cancelling a CAPA is a regulated decision and requires an e-signature.
          You'll confirm your identity on the next step.
        </div>
      </div>
      <p v-if="saveError" class="tw:text-xs tw:text-red-600">{{ saveError }}</p>
    </div>
    <template #footer="{ close }">
      <BaseDialogFooter
        cancelLabel="Keep Open"
        submitLabel="Sign & Cancel CAPA"
        submitVariant="danger"
        :loading="cancelling"
        :disabled="!cancelReason.trim()"
        @cancel="close"
        @submit="handleCancelCapa"
      />
    </template>
  </BaseDialog>

  <!-- Open CAPA confirmation — Draft → Active transition. -->
  <BaseDialog v-model="showOpenDialog" title="Open CAPA" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <p class="tw:text-sm tw:text-on-main">
        Opening this CAPA starts the assigned workflow and makes it a
        <strong>permanent audit record</strong>.
      </p>
      <ul class="tw:text-sm tw:text-secondary tw:list-disc tw:pl-5 tw:space-y-1">
        <li>Most fields stay editable until the CAPA is closed.</li>
        <li>It can no longer be deleted — only closed or cancelled with a recorded reason.</li>
        <li>The workflow's first step becomes active and reviewers get tasks.</li>
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
        submitLabel="Open CAPA"
        :loading="saving"
        @cancel="close"
        @submit="handleSubmitForReview"
      />
    </template>
  </BaseDialog>

  <!-- Delete draft CAPA -->
  <BaseDialog v-model="showDeleteDialog" title="Delete Draft CAPA" maxWidth="md">
    <p class="tw:text-sm tw:text-on-main tw:mb-3">
      Delete this draft CAPA? This permanently removes the record. Drafts have no audit history yet,
      so this is safe.
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
</template>
