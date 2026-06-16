<script setup>
import { IconPrinter, IconClipboardList } from '@tabler/icons-vue'
import { currentSession, isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { post } from '@/api'
import { DateTime } from 'luxon'

const props = defineProps({
  id: { type: String, required: true },
})

const router = useRouter()

const capa = useLiveQueryWithDeps([() => props.id], async (db, [id]) => db.Capa.findByPk(id))

const loading = computed(() => capa.value === undefined)

const breadcrumbs = computed(() => [
  { label: 'CAPAs', to: getCompanyPath('/capas') },
  { label: capa.value?.capaNumber || capa.value?.title || 'Loading…' },
])

const isFirstLoad = ref(true)
const isEditable = computed(
  () =>
    capa.value &&
    capa.value.statusId !== 'CLOSED' &&
    capa.value.statusId !== 'CANCELLED',
)

const debouncedSave = useDebounceFn(async () => {
  if (!capa.value) return
  await capa.value.save()
}, 500)

watch(
  capa,
  () => {
    if (isFirstLoad.value) {
      isFirstLoad.value = false
      return
    }
    if (capa.value) debouncedSave()
  },
  { deep: true },
)

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
  { initial: [] },
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
  { initial: [] },
)

const allEffectivenessCheckIds = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [capaId]) => {
    if (!capaId) return []
    const rows = await db.CapaEffectivenessCheck.where('capaId', capaId).exec()
    return rows.map((r) => r.id)
  },
  { initial: [] },
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
    return steps.filter(
      (s) => s && !['APPROVED', 'SKIPPED', 'CANCELLED'].includes(s.statusId),
    ).length
  },
  { initial: 0 },
)
const canClose = computed(
  () => incompleteStepCount.value === 0 && !!closeEffectivenessDate.value,
)
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

const isOwner = computed(
  () => capa.value?.ownerId && capa.value.ownerId === currentSession.value?.userId,
)

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

const workflowInstance = useLiveQueryWithDeps([() => props.id], async (db, [id]) => {
  const results = await db.WorkflowInstance.where('[resourceType+resourceId]', ['Capa', id]).exec()
  return results.find((i) => i.statusId === 'IN_PROGRESS') || results[0] || null
})

// Resolve the WorkflowVersion (for label + workflowId link target). Prefer the
// instance's version; fall back to the CAPA's directly-assigned version if no
// instance exists yet (DRAFT CAPAs).
const workflowVersion = useLiveQueryWithDeps(
  [() => workflowInstance.value?.workflowVersionId ?? capa.value?.workflowVersionId],
  async (db, [versionId]) => {
    if (!versionId) return null
    return db.WorkflowVersion.findByPk(versionId)
  },
)

const workflow = useLiveQueryWithDeps(
  [() => workflowVersion.value?.workflowId],
  async (db, [workflowId]) => {
    if (!workflowId) return null
    return db.Workflow.findByPk(workflowId)
  },
)

function workflowVersionLabel(v) {
  if (!v) return ''
  return v.versionLabel || `${v.versionMajor ?? 1}.${v.versionMinor ?? 0}`
}

// Resolve the originating Nonconformance only when this CAPA was spawned
// from one (source_type='NC' → source_id points at a Nonconformance row).
const sourceNc = useLiveQueryWithDeps(
  [() => capa.value?.sourceType, () => capa.value?.sourceId],
  async (db, [sourceType, sourceId]) => {
    if (sourceType !== 'NC' || !sourceId) return null
    return db.Nonconformance.findByPk(sourceId)
  },
)

const editingTitle = ref(false)
const editingDescription = ref(false)

// Cross-module shortcut: spawn a Change Request seeded from this CAPA.
const canCreateChangeRequest = computed(() => isAllowed(['changeRequests:create']))
function onCreateLinkedChangeRequest() {
  router.push({
    path: getCompanyPath('/change-requests/create'),
    query: { source: 'CAPA', sourceId: props.id },
  })
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:h-full">
    <SafeTeleport to="#main-header-title">
      <BaseBreadcrumbs :items="breadcrumbs" />
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <div class="tw:flex tw:items-center tw:gap-2">
        <AskAiButton
          v-if="capa?.id"
          entityType="Capa"
          :entityId="capa.id"
          :entityTitle="capa.title"
          :entityNumber="capa.capaNumber"
        />
        <BaseButton v-if="capa?.id" variant="secondary" @click="openPrintView">
          <IconPrinter :size="20" class="tw:mr-1" />
          Print
        </BaseButton>
        <BaseButton v-if="capa?.id" variant="secondary" @click="showAuditLog = true">
          <IconClipboardList :size="20" class="tw:mr-1" />
          Audit Log
        </BaseButton>
        <BaseButton
          v-if="isOwner && capa?.statusId === 'DRAFT'"
          variant="outline"
          :disabled="deleting"
          @click="showDeleteDialog = true"
        >
          Delete
        </BaseButton>
        <BaseButton
          v-if="isOwner && capa?.statusId === 'DRAFT'"
          variant="primary"
          :disabled="saving"
          @click="openOpenDialog"
        >
          Open CAPA
        </BaseButton>
        <BaseButton
          v-if="isOwner && capa?.statusId === 'PENDING'"
          variant="secondary"
          :disabled="cancelling"
          @click="openCancelDialog"
        >
          Cancel CAPA
        </BaseButton>
        <BaseButton
          v-if="isOwner && capa?.statusId === 'PENDING'"
          variant="danger"
          :disabled="closing"
          @click="openCloseDialog"
        >
          Close CAPA
        </BaseButton>
        <BaseButton
          v-if="canCreateChangeRequest && capa?.id && !['DRAFT'].includes(capa?.statusId)"
          variant="outline"
          @click="onCreateLinkedChangeRequest"
        >
          Create Change Request
        </BaseButton>
      </div>
    </SafeTeleport>

    <BaseSpinner v-if="loading" centered size="md" />

    <div v-else-if="capa" class="tw:overflow-y-auto tw:flex-1">
      <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
        <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-[65fr_25fr] tw:gap-4 tw:items-start">
          <!-- Left column -->
          <div class="tw:flex tw:flex-col tw:gap-4">
            <!-- CAPA Details -->
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
              <div
                class="tw:flex tw:items-center tw:gap-2 tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
              >
                <div
                  class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider"
                >
                  CAPA Details
                </div>
                <!-- At-a-glance indicator of which assignee pool the
                     workflow draws from. Mirrors the NC chip — a CAPA
                     spawned from a supplier NC inherits both
                     isSupplierFacing and supplierId from the source
                     (see CapasCreate watch on sourceNc), so this stays
                     in sync with how the workflow actually routes its
                     non-APPROVAL steps. -->
                <span
                  v-if="capa.isSupplierFacing"
                  class="tw:text-[10px] tw:rounded tw:bg-violet-100 tw:text-violet-700 tw:px-1.5 tw:py-0.5 tw:font-normal tw:normal-case"
                  title="Supplier-facing: non-approval workflow steps draw from this CAPA's supplier users. Approval steps stay internal."
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
                v-model="capa.title"
                placeholder="CAPA title"
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
                {{ capa.title }}
              </div>

              <div v-if="editingDescription && isEditable" class="capa-detail-editor tw:mb-4">
                <BaseRichTextEditor
                  v-model="capa.description"
                  placeholder="Add a description…"
                  @blur="editingDescription = false"
                />
              </div>
              <div v-else class="tw:mb-4" @click="isEditable && (editingDescription = true)">
                <div
                  v-if="capa.description"
                  class="tw:text-sm tw:text-secondary tw:leading-relaxed tw:prose tw:max-w-none"
                  :class="isEditable ? 'tw:cursor-pointer tw:hover:text-primary' : ''"
                  v-html="capa.description"
                />
                <p
                  v-else
                  class="tw:text-sm tw:text-secondary tw:leading-relaxed"
                  :class="isEditable ? 'tw:cursor-pointer tw:hover:text-primary' : ''"
                >
                  {{ isEditable ? 'Add a description…' : '—' }}
                </p>
              </div>

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
                <div v-if="sourceNc" class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Source NC</div>
                  <RouterLink
                    :to="getCompanyPath(`/nonconformances/${sourceNc.id}`)"
                    class="tw:text-sm tw:font-mono tw:font-medium tw:text-primary tw:hover:underline"
                  >
                    {{ sourceNc.ncNumber }}
                  </RouterLink>
                </div>
              </div>
            </div>

            <!-- Raised-from-Audit context (scoped): audit header + only the
                 findings/failed requirements this CAPA addresses. Self-hides
                 when the CAPA didn't originate from an audit. Visible to
                 assignees without audits:read — see AuditOriginPanel. -->
            <AuditOriginPanel entityType="Capa" :entityId="id" />

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

            <!-- Effectiveness Check (post-closure follow-up) -->
            <CapaEffectivenessCheckCard :capaId="id" :isOwner="isOwner" />

            <!-- External access — read-only panel populated by workflow-
                 step assignment (autoShareSupplierUsers). The product
                 decision (2026-05-29) is that supplier visibility on CAPA
                 is workflow-driven, not manual. See SharedWithPanel.vue.
                 Only relevant on supplier-facing CAPAs — external access is
                 only ever granted on those, so hide the section otherwise. -->
            <SharedWithPanel v-if="capa?.isSupplierFacing" entityType="Capa" :entityId="id" />
          </div>

          <!-- Right column -->
          <div class="tw:flex tw:flex-col tw:gap-4">
            <!-- Meta card -->
            <aside
              class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5 tw:flex! tw:flex-col tw:gap-4"
            >
              <div class="tw:flex tw:flex-col tw:gap-1">
                <div class="tw:text-xs tw:text-secondary tw:uppercase tw:font-semibold">Number</div>
                <div class="tw:text-sm tw:font-mono tw:text-on-main">{{ capa.capaNumber }}</div>
              </div>
              <div class="tw:flex tw:flex-col tw:gap-1">
                <div class="tw:text-xs tw:text-secondary tw:uppercase tw:font-semibold">Status</div>
                <CapaStatusBadgeById :statusId="capa.statusId" />
              </div>
              <div class="tw:flex tw:flex-col tw:gap-1">
                <div class="tw:text-xs tw:text-secondary tw:uppercase tw:font-semibold">Owner</div>
                <UserBadgeById :userId="capa.ownerId" />
              </div>
              <div class="tw:flex tw:flex-col tw:gap-1">
                <div class="tw:text-xs tw:text-secondary tw:uppercase tw:font-semibold">Site</div>
                <SiteBadgeById :siteId="capa.siteId" />
              </div>
              <div class="tw:flex tw:flex-col tw:gap-1">
                <div class="tw:text-xs tw:text-secondary tw:uppercase tw:font-semibold">
                  Department
                </div>
                <DepartmentBadgeById :departmentId="capa.departmentId" />
              </div>
              <div v-if="capa.supplierId" class="tw:flex tw:flex-col tw:gap-1">
                <div class="tw:text-xs tw:text-secondary tw:uppercase tw:font-semibold">
                  Supplier
                </div>
                <SupplierBadgeById :supplierId="capa.supplierId" />
              </div>
              <div class="tw:flex tw:flex-col tw:gap-1">
                <div class="tw:text-xs tw:text-secondary tw:uppercase tw:font-semibold">Due</div>
                <span
                  class="tw:text-sm tw:font-medium"
                  :class="isOverdue ? 'tw:text-red-600' : 'tw:text-on-main'"
                >
                  {{ capa.dueDate?.formatDate('date') || '—' }}
                </span>
              </div>
              <div v-if="capa.verifiedAt" class="tw:flex tw:flex-col tw:gap-1">
                <div class="tw:text-xs tw:text-secondary tw:uppercase tw:font-semibold">
                  Verified
                </div>
                <span class="tw:text-sm tw:text-on-main">
                  {{ capa.verifiedAt.formatDate('dateTime') }}
                </span>
              </div>
              <div v-if="capa.closedAt" class="tw:flex tw:flex-col tw:gap-1">
                <div class="tw:text-xs tw:text-secondary tw:uppercase tw:font-semibold">Closed</div>
                <span class="tw:text-sm tw:text-on-main">
                  {{ capa.closedAt.formatDate('dateTime') }}
                </span>
              </div>
            </aside>

            <!-- Workflow template card -->
            <RouterLink
              v-if="workflow && workflowVersion"
              :to="
                getCompanyPath(
                  `/workflow-templates/${workflow.id}?version=${encodeURIComponent(
                    workflowVersionLabel(workflowVersion),
                  )}`,
                )
              "
              class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5 tw:flex tw:flex-col tw:gap-2 tw:hover:border-primary tw:hover:bg-main-hover tw:transition-colors"
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
          </div>
        </div>
      </div>
    </div>

    <div v-else class="tw:p-5">
      <BaseEmptyState
        :icon="null"
        title="CAPA not found"
        description="This CAPA could not be found."
      />
    </div>

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
          <div class="tw:text-sm" :class="incompleteStepCount === 0 ? 'tw:text-green-800' : 'tw:text-red-800'">
            <template v-if="incompleteStepCount === 0">
              All workflow steps and sub-tasks are complete.
            </template>
            <template v-else>
              <strong>{{ incompleteStepCount }}</strong> workflow step{{
                incompleteStepCount === 1 ? '' : 's'
              }} still open. Complete, skip, or cancel them before closing.
            </template>
          </div>
        </div>

        <!-- Gate 2: effectiveness check date -->
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-2">
            Effectiveness Check Date <span class="tw:text-red-500">*</span>
          </p>
          <p class="tw:text-xs tw:text-secondary tw:mb-2">
            When should the corrective action's effectiveness be verified?
            Industry standard is 90 days from close.
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
            <BaseDatePicker v-model="closeEcCustomDate" />
          </div>
          <p
            v-if="closeEffectivenessDate"
            class="tw:text-xs tw:text-secondary tw:mt-2"
          >
            Will schedule for: <strong>{{ closeEffectivenessDate.formatDate('date') }}</strong>
          </p>
        </div>

        <!-- Optional closure comments -->
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            Closure Comments (optional)
          </p>
          <BaseTextarea
            v-model="closeComments"
            :rows="3"
            placeholder="Summary of the corrective action and verification of completion"
          />
        </div>

        <!-- CFR 21 Part 11 notice -->
        <div class="tw:flex tw:items-start tw:gap-2 tw:p-3 tw:rounded-lg tw:bg-blue-50 tw:border tw:border-blue-200 tw:text-xs tw:text-blue-800">
          <div class="tw:shrink-0 tw:mt-0.5">🔒</div>
          <div>
            CFR 21 Part 11 — Closing this CAPA finalises the controlled record
            and requires an e-signature. You'll be prompted to confirm your
            identity on the next step.
          </div>
        </div>

        <p v-if="saveError" class="tw:text-xs tw:text-red-600">{{ saveError }}</p>
      </div>
      <template #footer="{ close }">
        <BaseButton variant="secondary" :disabled="closing" @click="close">Cancel</BaseButton>
        <BaseButton
          variant="danger"
          :loading="closing"
          :disabled="!canClose || closing"
          :title="canClose ? undefined : closeDisabledReason"
          @click="handleCloseCapa"
        >
          Sign &amp; Close CAPA
        </BaseButton>
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
        <div class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-amber-50 tw:border tw:border-amber-200">
          <div class="tw:text-amber-600 tw:shrink-0 tw:mt-0.5">⚠</div>
          <div class="tw:text-sm tw:text-amber-800">
            Cancelling will abort any in-progress workflow and mark the CAPA
            cancelled. The reason below is recorded on the row and in the
            audit log.
          </div>
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Reason</p>
          <BaseTextarea
            v-model="cancelReason"
            :rows="3"
            placeholder="Why is this CAPA being cancelled?"
          />
        </div>
        <!-- CFR 21 Part 11 notice -->
        <div class="tw:flex tw:items-start tw:gap-2 tw:p-3 tw:rounded-lg tw:bg-blue-50 tw:border tw:border-blue-200 tw:text-xs tw:text-blue-800">
          <div class="tw:shrink-0 tw:mt-0.5">🔒</div>
          <div>
            CFR 21 Part 11 — Cancelling a CAPA is a regulated decision and
            requires an e-signature. You'll confirm your identity on the
            next step.
          </div>
        </div>
        <p v-if="saveError" class="tw:text-xs tw:text-red-600">{{ saveError }}</p>
      </div>
      <template #footer="{ close }">
        <BaseButton variant="secondary" :disabled="cancelling" @click="close">Keep Open</BaseButton>
        <BaseButton
          variant="danger"
          :loading="cancelling"
          :disabled="!cancelReason.trim() || cancelling"
          @click="handleCancelCapa"
        >
          Sign &amp; Cancel CAPA
        </BaseButton>
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
        <BaseButton variant="outline" :disabled="saving" @click="close">Cancel</BaseButton>
        <BaseButton
          variant="primary"
          :loading="saving"
          :disabled="saving"
          @click="handleSubmitForReview"
        >
          Open CAPA
        </BaseButton>
      </template>
    </BaseDialog>

    <!-- Delete draft CAPA -->
    <BaseDialog v-model="showDeleteDialog" title="Delete Draft CAPA" maxWidth="md">
      <p class="tw:text-sm tw:text-on-main tw:mb-3">
        Delete this draft CAPA? This permanently removes the record.
        Drafts have no audit history yet, so this is safe.
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
  </div>
</template>

<style scoped>
.capa-detail-editor :deep(.rich-text-editor-content) {
  max-height: 12rem;
  overflow-y: auto;
}
</style>
