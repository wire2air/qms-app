<script setup>
import { buildCapaBanners, buildCapaSections, buildCapaActions } from './capaDetailConfig.js'
import { currentSession, isAllowed, isAllowedOnRecord, canUseAi } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { post } from '@/api'
import { useRecordTrail } from '@/composables/useRecordTrail.js'
import { countStepsBlockingClose } from '@/components/workflow/delayStepClose.js'
import {
  canOpenClose as gateCanOpenClose,
  canSubmitClose as gateCanSubmitClose,
  closeBlockedReason as gateCloseBlockedReason,
  closeSubmitBlockedReason as gateCloseSubmitBlockedReason,
} from './capaCloseGates.js'

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

// Page-level fields (title, owner, site, department, due date, custom fields)
// are owner-controlled. Anyone else with CAPA module access can READ the record
// (default module behavior) but must not edit it — workflow-step forms have
// their own editability gate inside WorkflowStepForm. Mirrors NCR.
// Status alone is not authorization: without this, a role scoped to capa
// write=Own could type into another user's CAPA and the RLS UPDATE policy would
// silently match 0 rows (edit looked accepted, never persisted).
//
// That last clause used to read `isOwner.value`, which fixed the phantom save by
// pinning EVERY user to the narrowest tier — a role granted capa:update at site
// or tenant still could not touch a colleague's CAPA. Ownership is custodianship,
// not exclusivity (backend utils/recordAccess.js), so the gate is now custodian
// OR whatever the matrix actually grants, mirroring authz.scope_allowed. The
// phantom save itself is fixed at its source in directSaveStrategy.js.
const canUpdate = computed(() => isAllowed(['capa:update']))
const isEditable = computed(
  () =>
    capa.value &&
    capa.value.statusId !== 'CLOSED' &&
    capa.value.statusId !== 'CANCELLED' &&
    canUpdate.value &&
    (isOwner.value || isAllowedOnRecord('capa:update', capa.value)),
)

const toast = useToast()
// CAPA-H3: surface inline-autosave failures. Saves are pessimistic (API first),
// so a failure means nothing persisted — discarding saveError told the user it
// saved when it didn't. onError is the composable's hook for exactly this.
useAutoSave(capa, {
  enabled: isEditable,
  onError: (e) => toast.error(e?.message || 'Failed to save CAPA changes'),
})

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
// The effectiveness-check presets and date picker lived here until 2026-08-18.
// Closing no longer schedules a check — the workflow's DELAY step owns it — so
// only the closure comments remain.
const closeComments = ref('')

// `incompleteStepCount`, the close gates and their reasons are defined
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
    // Deferred delay steps (effectiveness checks that fire after close) don't
    // block — see stepBlocksClose.
    return countStepsBlockingClose(steps.filter(Boolean))
  },

  { models: ['WorkflowInstanceStep'], initial: 0 },
)
// The two close gates, kept pure + tested in capaCloseGates.js — see that file
// for why they must stay separate (a control that opens a form must not be
// gated on that form's contents).
const canOpenClose = computed(() =>
  gateCanOpenClose({ incompleteStepCount: incompleteStepCount.value }),
)

const closeGateState = computed(() => ({
  incompleteStepCount: incompleteStepCount.value,
  comments: closeComments.value,
}))

const canSubmitClose = computed(() => gateCanSubmitClose(closeGateState.value))

/** Header "Close CAPA" tooltip — workflow only. */
const closeBlockedReason = computed(() =>
  gateCloseBlockedReason({ incompleteStepCount: incompleteStepCount.value }),
)

/** "Sign & Close" tooltip — surfaced via BaseDialogFooter's `submitTitle`. */
const closeDisabledReason = computed(() => gateCloseSubmitBlockedReason(closeGateState.value))

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
  closeComments.value = ''
  showCloseDialog.value = true
}

// User confirms in the Close dialog → open the esign auth dialog. The
// actual POST happens in the @verified handler below once credentials
// come back. Close the confirm dialog first — leaving both open stacks two
// BaseDialogs with competing focus traps, which silently swallows keyboard
// input into the PIN field (verified in a real browser, not a test-only
// artifact).
function handleCloseCapa() {
  if (!canSubmitClose.value) return
  saveError.value = null
  showCloseDialog.value = false
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
  // Close the confirm dialog before opening the esign dialog — leaving both
  // open stacks two BaseDialogs with competing focus traps, which silently
  // swallows keyboard input into the PIN field (same bug as Close above;
  // Cancel was missed when that fix landed).
  showCancelDialog.value = false
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

// ─── Start CAPA (DRAFT → workflow active) ─────────────────────────────────────
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

const showLinkNcDialog = ref(false)
const editingTitle = ref(false)

// Cross-module shortcut: spawn a Change Request seeded from this CAPA.
const canCreateChangeRequest = computed(() => isAllowed(['change_control:create']))
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
      // Verb-scoped, matching what each controller enforces. Custodianship is
      // no longer a bypass — it makes the `own` scope tier match — so an owner
      // still needs capa:close to see Close CAPA, and a non-owner who holds it
      // in scope now does. Cancel is an 'update' action server-side.
      canStart: isAllowedOnRecord('capa:update', capa.value),
      canCloseCapa: isAllowedOnRecord('capa:close', capa.value),
      // Cancel maps to `close` on the server (controllers/capas.js) — gating
      // the button on update offered it to users whose cancel then 403s.
      canCancel: isAllowedOnRecord('capa:close', capa.value),
      canDelete: isAllowedOnRecord('capa:delete', capa.value),
      statusId: capa.value?.statusId,
      canClose: canOpenClose.value,
      closeDisabledReason: closeBlockedReason.value,
      canCreateChangeRequest: canCreateChangeRequest.value,
      canUpdate: canUpdate.value,
      saving: saving.value,
      closing: closing.value,
      cancelling: cancelling.value,
      canViewAuditTrail: isAllowed(['audit_trail:read']),
    },
    {
      openOpen: openOpenDialog,
      openClose: openCloseDialog,
      openCancel: openCancelDialog,
      print: openPrintView,
      createCr: onCreateLinkedChangeRequest,
      linkNc() {
        showLinkNcDialog.value = true
      },
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
      <!-- The editor matches the rendered title's width and weight (2026-08-18):
           at the default input size a long CAPA title scrolled inside a box a
           third the width of the text it replaced, so you edited blind. Enter
           commits, Escape reverts to the read-only row. -->
      <BaseTextInput
        v-if="editingTitle && isEditable"
        v-model="capa.title"
        placeholder="CAPA title"
        autofocus
        class="tw:mb-2 tw:w-full"
        inputClass="tw:text-base tw:font-semibold"
        @keyup.enter="editingTitle = false"
        @keyup.escape="editingTitle = false"
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
      <span class="">{{ capa.capaNumber }}</span>
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
      <RecordLineagePanel
        :id="id"
        type="Capa"
        :canEdit="!!capa && isAllowedOnRecord('capa:update', capa)"
      />

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

        <!-- Same field the create form labels "Problem Statement". -->
        <BaseRichTextField
          v-model="capa.description"
          :editable="isEditable"
          clickToEdit
          clickToEditLabel="Add the problem statement…"
          placeholder="What is the problem this CAPA addresses?…"
        />
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

    <template v-if="capa" #rail>
      <!-- 1. General — number, status, priority, type, source, initiated.
           Responsive grid: pairs up two-per-row when the rail is wide enough,
           collapses to one-per-row when narrow. -->
      <BaseRailCard title="General">
        <div class="tw:grid tw:gap-x-4 tw:gap-y-3 tw:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]">
          <BaseDetailField label="Number">
            <BaseText variant="body" weight="medium" class="tw:break-words">
              {{ capa.capaNumber }}
            </BaseText>
          </BaseDetailField>
          <BaseDetailField label="Status">
            <CapaStatusBadgeById :statusId="capa.statusId" />
          </BaseDetailField>
          <BaseDetailField label="Priority">
            <CapaPriorityBadgeById v-if="capa.priorityId" :priorityId="capa.priorityId" />
            <BaseText v-else color="secondary">—</BaseText>
          </BaseDetailField>
          <BaseDetailField label="Type">
            <CapaTypeBadgeById v-if="capa.typeId" :typeId="capa.typeId" />
            <BaseText v-else color="secondary">—</BaseText>
          </BaseDetailField>
          <BaseDetailField label="Source">
            <CapaSourceBadgeById v-if="capa.sourceType" :sourceId="capa.sourceType" />
            <BaseText v-else color="secondary">—</BaseText>
          </BaseDetailField>
          <!-- Shared quality classification — same taxonomy as Quality Events
               and NCs, inherited from whichever record this CAPA came from. -->
          <BaseDetailField label="Category">
            <EventCategorySelectMenu v-if="isEditable" v-model="capa.categoryId" />
            <EventCategoryBadgeById v-else-if="capa.categoryId" :categoryId="capa.categoryId" />
            <BaseText v-else color="secondary">—</BaseText>
          </BaseDetailField>
          <BaseDetailField
            label="Initiated"
            :value="capa.initiatedAt ? capa.initiatedAt.formatDate('date') : null"
          />
        </div>
      </BaseRailCard>

      <!-- 2. People -->
      <BaseRailCard title="People" grid>
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

      <!-- External sharing — who outside the company can read this. -->
      <RecordShareCard entityType="Capa" :entityId="capa.id" module="capa" :record="capa" />

      <!-- 3. Workflow — below People (same placement as NC, 2026-08-12).
           While DRAFT the owner picks / switches the workflow here (the
           default template is auto-picked at create); once opened it shows
           the running instance's status + links. -->
      <!-- Shared with NC / Change Control / Complaint (2026-08-17). Was a
           local copy rendering the picker as a card grid, which filled the
           rail; the shared card uses a dropdown. -->
      <WorkflowRailCard
        :record="capa"
        moduleId="CAPA"
        resourceType="Capa"
        :canChange="capa.statusId === 'DRAFT' && isOwner"
        :changeHint="
          capa.workflowVersionId
            ? 'You can switch workflows while in draft — step assignments reset on change.'
            : 'Pick the approval workflow this CAPA will follow when you click Start CAPA.'
        "
      />

      <!-- 4. Schedule — closed date only; workflow/effectiveness state lives in
           the Workflow card. Hidden entirely while the CAPA is open. -->
      <BaseRailCard v-if="capa.closedAt" title="Schedule">
        <BaseDetailField label="Closed" :value="capa.closedAt.formatDate('dateTime')" />
      </BaseRailCard>

      <!-- 5. Notifications — cc list, the rules that also apply, and when anything last went out -->
      <RecordNotificationsCard
        v-model:groupIds="capa.notifyGroupIds"
        v-model:userIds="capa.notifyUserIds"
        v-model:emails="capa.notifyEmails"
        entityType="Capa"
        :entityId="capa.id"
        :siteId="capa.siteId"
        :departmentId="capa.departmentId"
        :editable="isEditable"
      />

      <!-- (Workflow template link moved into the dedicated Workflow rail
           card below People — 2026-08-12.) -->
    </template>
  </BaseDetailLayout>

  <!-- ─── Dialogs (siblings after </BaseDetailLayout>) ──────────────── -->

  <CapaLinkNcDialog v-model="showLinkNcDialog" :capaId="id" />

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

      <!-- The effectiveness-check date is gone from this dialog (2026-08-18).
           Closing no longer schedules a check: the workflow's DELAY step owns
           that, and it must already be scheduled or skipped before the record
           can close (stepBlocksClose), so asking again here was a second answer
           to a question already settled. -->
      <!-- Optional closure comments -->
      <BaseField v-slot="{ id: fieldId }" label="Closure Comments" required>
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
        :disabled="!canSubmitClose"
        :submitTitle="canSubmitClose ? undefined : closeDisabledReason"
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

  <!-- Start CAPA confirmation — Draft → Active transition. -->
  <BaseDialog v-model="showOpenDialog" title="Start CAPA" maxWidth="md">
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
        submitLabel="Start CAPA"
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
