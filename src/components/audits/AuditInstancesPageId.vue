<script setup>
/**
 * Audit Instance detail page.
 *
 * Layout: header carries the audit number + status badge +
 * lifecycle CTAs (Start / Submit for Close-Out / Cancel / Delete);
 * main column = three cards (Details, Requirements, Team); right
 * rail = Overview + history-ish metadata. Inline auto-save for
 * scope / objectives / scheduled-date via debounced PATCH (BE runs
 * cross-field invariants the SyncEngine would skip).
 *
 * Lifecycle gating — the user can drive DRAFT → SCHEDULED →
 * IN_PROGRESS → CANCELLED directly. REVIEW / COMPLETED / CLOSED are
 * the workflow engine's territory (driven via the Submit dialog and
 * the task-action surface).
 */
import {
  IconArrowBack,
  IconChecklist,
  IconClipboardCheck,
  IconUsers,
  IconClipboardList,
  IconBolt,
  IconPaperclip,
  IconSend,
  IconPlayerPlay,
  IconBan,
  IconPlus,
  IconTrash,
  IconPrinter,
} from '@tabler/icons-vue'
import { useAuditScoring } from '@/composables/useAuditScoring'
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
// Action RPCs (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { patch, post, del } from '@/api'

const props = defineProps({
  id: { type: String, required: true },
})

const toast = useToast()
const router = useRouter()

const auditInstance = useLiveQueryWithDeps([() => props.id], async (db, [id]) =>
  db.AuditInstance.findByPk(id),
)

// #1 — conformance scoring rollup (shared with the printable report).
const { scoring } = useAuditScoring(() => props.id)

function openReport() {
  router.push({ path: getCompanyPath('/print'), query: { module: 'AuditInstance', id: props.id } })
}
const loading = computed(() => auditInstance.value === undefined)

const canUpdate = computed(() => isAllowed(['audits:update']))
const canDelete = computed(() => isAllowed(['audits:delete']))
const isOwner = computed(() => !!currentSession.value?.isOwner)
const isEditable = computed(
  () =>
    (canUpdate.value || isOwner.value) &&
    !['CLOSED', 'CANCELLED', 'REVIEW'].includes(auditInstance.value?.statusId),
)

// #14/#16 — is the current user a shared auditee/supplier on this audit? They
// get a read-only audit EXCEPT they may upload to the Document Request section.
const myShares = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return []
    return db.SharedWithUser.where('[entityType+entityId]', ['AuditInstance', id]).exec()
  },
  { initial: [] },
)
const isAuditee = computed(() =>
  myShares.value.some((s) => s.userId === currentSession.value?.userId),
)
// Document Request is writable by editors OR a shared auditee (upload only),
// but not once the audit is sealed (CLOSED / CANCELLED).
const docRequestReadonly = computed(
  () =>
    !isEditable.value &&
    !(isAuditee.value && !['CLOSED', 'CANCELLED'].includes(auditInstance.value?.statusId)),
)

const breadcrumbs = computed(() => [
  { label: 'Audits', to: getCompanyPath('/audits?tab=instances') },
  { label: 'Audits', to: getCompanyPath('/audits?tab=instances') },
  { label: auditInstance.value?.auditNumber || 'Loading…' },
])

// ─── Inline auto-save (PATCH) ────────────────────────────────────
const scheduledDateStr = ref('')
const isFirstLoad = ref(true)
const saving = ref(false)
const saveError = ref(null)

function toDateInput(dt) {
  if (!dt) return ''
  if (dt.toFormat) return dt.toFormat('yyyy-LL-dd')
  return String(dt).slice(0, 10)
}

watch(
  auditInstance,
  (a) => {
    if (!a) return
    if (isFirstLoad.value) {
      scheduledDateStr.value = toDateInput(a.scheduledDate)
      isFirstLoad.value = false
      return
    }
    if (!isEditable.value) return
    debouncedSave()
  },
  { deep: true },
)
watch(scheduledDateStr, () => {
  if (isFirstLoad.value || !isEditable.value) return
  debouncedSave()
})

const debouncedSave = useDebounceFn(async () => {
  const a = auditInstance.value
  if (!a) return
  saving.value = true
  saveError.value = null
  try {
    await patch(`/v1/services/auditInstances/${a.id}`, {
      scope: a.scope ?? null,
      objectives: a.objectives ?? null,
      scheduledDate: scheduledDateStr.value || null,
      leadAuditorUserId: a.leadAuditorUserId || null,
      departmentId: a.departmentId || null,
      siteId: a.siteId || null,
    })
  } catch (e) {
    saveError.value = e.message || 'Failed to save'
    toast.error(saveError.value)
  } finally {
    saving.value = false
  }
}, 500)

const editingScope = ref(false)
const editingObjectives = ref(false)

// ─── Lifecycle button visibility / handlers ───────────────────────
const canStart = computed(() => auditInstance.value?.statusId === 'SCHEDULED' && isEditable.value)
const canSubmitForCloseOut = computed(
  () =>
    !!auditInstance.value &&
    isEditable.value &&
    ['DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'REJECTED'].includes(auditInstance.value.statusId),
)
const canCancel = computed(
  () =>
    !!auditInstance.value &&
    isEditable.value &&
    !['CLOSED', 'CANCELLED', 'REVIEW'].includes(auditInstance.value.statusId),
)

// Main-column tab (Information / Requirements / Findings).
const tab = ref('info')

const showSubmitDialog = ref(false)
const showCancelDialog = ref(false)
const showDeleteDialog = ref(false)
// Audit-log dialog — opens the full per-entity activity history.
// Includes every workflow event (reject reasons, reassignments,
// approvals, reopen requests, cancels) plus all metadata updates.
const showAuditLog = ref(false)
const transitioning = ref(false)

async function startAudit() {
  if (!auditInstance.value?.id || transitioning.value) return
  transitioning.value = true
  try {
    await patch(`/v1/services/auditInstances/${auditInstance.value.id}`, {
      statusId: 'IN_PROGRESS',
    })
    toast.success('Audit started')
  } catch (e) {
    toast.error(e.message || 'Failed to start audit')
  } finally {
    transitioning.value = false
  }
}

async function confirmCancel() {
  if (!auditInstance.value?.id || transitioning.value) return
  transitioning.value = true
  try {
    await patch(`/v1/services/auditInstances/${auditInstance.value.id}`, {
      statusId: 'CANCELLED',
    })
    toast.success('Audit cancelled')
    showCancelDialog.value = false
  } catch (e) {
    toast.error(e.message || 'Failed to cancel audit')
  } finally {
    transitioning.value = false
  }
}

async function handleDelete() {
  if (!auditInstance.value?.id || transitioning.value) return
  transitioning.value = true
  try {
    await del(`/v1/services/auditInstances/${auditInstance.value.id}`)
    toast.success('Audit archived')
    showDeleteDialog.value = false
    router.push(getCompanyPath('/audits?tab=instances'))
  } catch (e) {
    toast.error(e.message || 'Failed to delete audit')
  } finally {
    transitioning.value = false
  }
}

// ─── Team management ─────────────────────────────────────────────
const teamMembers = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [instanceId]) => {
    if (!instanceId) return []
    const rows = await db.AuditTeamMember.where('auditInstanceId', instanceId).exec()
    return rows.sort((a, b) => {
      if (a.roleOnAudit !== b.roleOnAudit) return a.roleOnAudit === 'LEAD' ? -1 : 1
      return (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0)
    })
  },
  { initial: [] },
)

const showAddMemberDialog = ref(false)
const addMemberForm = ref({ userId: null, roleOnAudit: 'TEAM' })
const addingMember = ref(false)
watch(showAddMemberDialog, (open) => {
  if (open) addMemberForm.value = { userId: null, roleOnAudit: 'TEAM' }
})

async function handleAddMember() {
  if (!addMemberForm.value.userId || addingMember.value) return
  addingMember.value = true
  try {
    await post(`/v1/services/auditInstances/${props.id}/team`, {
      userId: addMemberForm.value.userId,
      roleOnAudit: addMemberForm.value.roleOnAudit,
    })
    toast.success('Team member added')
    showAddMemberDialog.value = false
  } catch (e) {
    toast.error(e.message || 'Failed to add team member')
  } finally {
    addingMember.value = false
  }
}

async function toggleMemberRole(member) {
  if (!isEditable.value) return
  const nextRole = member.roleOnAudit === 'LEAD' ? 'TEAM' : 'LEAD'
  try {
    await patch(`/v1/services/auditInstances/${props.id}/team/${member.id}`, {
      roleOnAudit: nextRole,
    })
  } catch (e) {
    toast.error(e.message || 'Failed to update role')
  }
}

async function removeMember(member) {
  if (!isEditable.value) return
  try {
    await del(`/v1/services/auditInstances/${props.id}/team/${member.id}`)
  } catch (e) {
    toast.error(e.message || 'Failed to remove member')
  }
}

// ─── Responses progress (mirrors execution panel for the rail) ────
const responseCount = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [instanceId]) => {
    if (!instanceId) return 0
    const rows = await db.AuditRequirementResponse.where('auditInstanceId', instanceId).exec()
    return rows.length
  },
  { initial: 0 },
)
const clauseCount = computed(() => auditInstance.value?.requirementSchema?.length ?? 0)

// Findings progress counts — surfaces an at-a-glance "how many
// findings still need work" badge in the overview rail.
const findingsByStatus = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [instanceId]) => {
    if (!instanceId) return { open: 0, total: 0 }
    const rows = await db.AuditFinding.where('auditInstanceId', instanceId).exec()
    const open = rows.filter((f) => !['CLOSED', 'CANCELLED'].includes(f.statusId)).length
    return { open, total: rows.length }
  },
  { initial: { open: 0, total: 0 } },
)

const auditTabs = computed(() => [
  { id: 'info', label: 'Information', icon: IconClipboardCheck, count: null },
  { id: 'requirements', label: 'Requirements', icon: IconClipboardList, count: clauseCount.value },
  { id: 'findings', label: 'Findings', icon: IconBolt, count: findingsByStatus.value.total },
])
</script>

<template>
  <div class="tw:flex tw:flex-col tw:h-full">
    <SafeTeleport to="#main-header-title">
      <BaseBreadcrumbs :items="breadcrumbs" />
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <div class="tw:flex tw:items-center tw:gap-2">
        <BaseButton
          v-if="auditInstance"
          variant="outline"
          size="sm"
          @click="router.push(getCompanyPath('/audits?tab=instances'))"
        >
          <IconArrowBack :size="16" class="tw:mr-1" />
          Back
        </BaseButton>
        <BaseButton v-if="auditInstance" variant="outline" size="sm" @click="openReport">
          <IconPrinter :size="16" class="tw:mr-1" />
          Report
        </BaseButton>
        <BaseButton
          v-if="canStart"
          variant="primary"
          size="sm"
          :disabled="transitioning"
          @click="startAudit"
        >
          <IconPlayerPlay :size="16" class="tw:mr-1" />
          Start Audit
        </BaseButton>
        <BaseButton
          v-if="canSubmitForCloseOut"
          variant="primary"
          size="sm"
          :disabled="findingsByStatus.open > 0"
          :title="
            findingsByStatus.open > 0
              ? `Resolve or close all findings first — ${findingsByStatus.open} still open.`
              : 'Submit this audit for close-out'
          "
          @click="showSubmitDialog = true"
        >
          <IconSend :size="16" class="tw:mr-1" />
          Submit for Close-Out
          <span v-if="findingsByStatus.open > 0" class="tw:ml-1 tw:text-[10px] tw:opacity-80">
            ({{ findingsByStatus.open }} open)
          </span>
        </BaseButton>
        <BaseButton
          v-if="canCancel"
          variant="outline"
          size="sm"
          :disabled="transitioning"
          @click="showCancelDialog = true"
        >
          <IconBan :size="16" class="tw:mr-1" />
          Cancel
        </BaseButton>
        <BaseButton
          v-if="auditInstance"
          variant="secondary"
          size="sm"
          @click="showAuditLog = true"
        >
          <IconClipboardCheck :size="16" class="tw:mr-1" />
          Audit Log
        </BaseButton>
        <BaseButton
          v-if="canDelete && auditInstance && auditInstance.statusId !== 'CLOSED'"
          variant="danger"
          size="sm"
          :disabled="transitioning"
          @click="showDeleteDialog = true"
        >
          Delete
        </BaseButton>
      </div>
    </SafeTeleport>

    <div v-if="loading" class="tw:flex tw:items-center tw:justify-center tw:h-full">
      <div
        class="tw:animate-spin tw:rounded-full tw:size-12 tw:border-4 tw:border-primary tw:border-t-transparent"
      />
    </div>

    <BaseEmptyState
      v-else-if="!auditInstance"
      title="Audit not found"
      description="This audit could not be found."
    />

    <div v-else class="tw:overflow-y-auto tw:flex-1">
      <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
        <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-[1fr_320px] tw:gap-4 tw:items-start">
          <div class="tw:flex tw:flex-col tw:gap-4">
            <!-- Tabs: Information (details + agenda + document request +
                 close-out) · Requirements · Findings. The right rail stays
                 persistent across tabs. -->
            <div class="tw:flex tw:border-b tw:border-divider">
              <button
                v-for="t in auditTabs"
                :key="t.id"
                type="button"
                class="tw:px-4 tw:py-2 tw:border-b-2 tw:font-semibold tw:text-sm tw:flex tw:items-center tw:gap-2 tw:bg-transparent tw:cursor-pointer"
                :class="
                  tab === t.id
                    ? 'tw:border-primary tw:text-primary'
                    : 'tw:border-transparent tw:text-secondary tw:hover:text-on-sidebar'
                "
                @click="tab = t.id"
              >
                <component :is="t.icon" :size="16" />
                {{ t.label }}
                <span
                  v-if="t.count != null"
                  class="tw:text-[10px] tw:font-normal tw:bg-main-hover tw:text-secondary tw:rounded tw:px-1.5 tw:py-0.5"
                >
                  {{ t.count }}
                </span>
              </button>
            </div>

            <!-- Details card -->
            <div v-show="tab === 'info'" class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
              <div
                class="tw:flex tw:items-center tw:justify-between tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
              >
                <div
                  class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider"
                >
                  Audit Details
                </div>
                <AuditInstanceStatusBadgeById :statusId="auditInstance.statusId" />
              </div>

              <div class="tw:grid tw:grid-cols-2 tw:gap-3 tw:mb-4">
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Standard</div>
                  <AuditStandardBadgeById
                    v-if="auditInstance.auditStandardId"
                    :standardId="auditInstance.auditStandardId"
                  />
                  <span v-else class="tw:text-sm tw:text-secondary">—</span>
                </div>
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Scheduled</div>
                  <BaseTextInput
                    v-if="isEditable"
                    v-model="scheduledDateStr"
                    type="date"
                    size="sm"
                  />
                  <span v-else class="tw:text-sm">
                    {{ auditInstance.scheduledDate ? auditInstance.scheduledDate.formatDate('date') : '—' }}
                  </span>
                </div>
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Lead Auditor</div>
                  <UserSelectMenu
                    v-if="isEditable"
                    v-model="auditInstance.leadAuditorUserId"
                  />
                  <UserBadgeById
                    v-else-if="auditInstance.leadAuditorUserId"
                    :userId="auditInstance.leadAuditorUserId"
                  />
                  <span v-else class="tw:text-sm tw:text-secondary">—</span>
                </div>
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Department</div>
                  <DepartmentSelectMenu
                    v-if="isEditable"
                    v-model="auditInstance.departmentId"
                  />
                  <DepartmentBadgeById
                    v-else-if="auditInstance.departmentId"
                    :departmentId="auditInstance.departmentId"
                  />
                  <span v-else class="tw:text-sm tw:text-secondary">—</span>
                </div>
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Site</div>
                  <SiteSelectMenu v-if="isEditable" v-model="auditInstance.siteId" />
                  <SiteBadgeById v-else-if="auditInstance.siteId" :siteId="auditInstance.siteId" />
                  <span v-else class="tw:text-sm tw:text-secondary">—</span>
                </div>
                <div
                  v-if="auditInstance.programTypeId === 'SUPPLIER'"
                  class="tw:flex tw:flex-col tw:gap-1"
                >
                  <div class="tw:text-xs tw:text-secondary">Supplier</div>
                  <SupplierBadgeById
                    v-if="auditInstance.supplierId"
                    :supplierId="auditInstance.supplierId"
                  />
                  <span v-else class="tw:text-sm tw:text-secondary">—</span>
                </div>
              </div>

              <!-- Scope / Objectives — click-to-edit, long form -->
              <div class="tw:flex tw:flex-col tw:gap-3">
                <div>
                  <p
                    class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1"
                  >
                    Scope
                  </p>
                  <BaseTextarea
                    v-if="editingScope && isEditable"
                    v-model="auditInstance.scope"
                    :rows="3"
                    placeholder="What's in scope for this audit?"
                    @blur="editingScope = false"
                  />
                  <div
                    v-else
                    class="tw:text-sm tw:whitespace-pre-line tw:text-on-main"
                    :class="isEditable ? 'tw:cursor-pointer tw:hover:text-primary' : ''"
                    @click="isEditable && (editingScope = true)"
                  >
                    {{ auditInstance.scope || (isEditable ? 'Add scope…' : '—') }}
                  </div>
                </div>
                <div>
                  <p
                    class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1"
                  >
                    Objectives
                  </p>
                  <BaseTextarea
                    v-if="editingObjectives && isEditable"
                    v-model="auditInstance.objectives"
                    :rows="3"
                    placeholder="What outcomes does this audit need to produce?"
                    @blur="editingObjectives = false"
                  />
                  <div
                    v-else
                    class="tw:text-sm tw:whitespace-pre-line tw:text-on-main"
                    :class="isEditable ? 'tw:cursor-pointer tw:hover:text-primary' : ''"
                    @click="isEditable && (editingObjectives = true)"
                  >
                    {{ auditInstance.objectives || (isEditable ? 'Add objectives…' : '—') }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Supplier-audit agenda (#15): select clauses + send to supplier. -->
            <AuditAgendaPanel
              v-if="auditInstance.programTypeId === 'SUPPLIER' && tab === 'info'"
              :auditInstance="auditInstance"
              :readonly="!isEditable"
            />

            <!-- Requirements execution -->
            <div v-show="tab === 'requirements'" class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-4 tw:flex tw:items-center tw:gap-2"
              >
                <IconClipboardList :size="14" />
                Requirements
              </div>
              <AuditRequirementExecutionPanel
                :auditInstance="auditInstance"
                :readonly="!isEditable"
              />
            </div>

            <!-- Findings -->
            <div v-show="tab === 'findings'" class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-4 tw:flex tw:items-center tw:gap-2"
              >
                <IconBolt :size="14" />
                Findings
              </div>
              <AuditFindingsPanel :auditInstance="auditInstance" :readonly="!isEditable" />
            </div>

            <!-- Document Request — the documents requested for the audit.
                 The auditee uploads new files or links existing records
                 here (renamed from "Evidence"). -->
            <div v-show="tab === 'info'" class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-4 tw:flex tw:items-center tw:gap-2"
              >
                <IconPaperclip :size="14" />
                Document Request
              </div>
              <AuditEvidencePanel
                :auditInstance="auditInstance"
                scope="audit"
                :readonly="docRequestReadonly"
              />
            </div>

            <!-- Close-Out Workflow — appears once the audit has been
                 Submitted-for-Close-Out (workflowInstanceId is set).
                 Reviewers see Approve / Reject buttons inside each step card
                 via the unified WorkflowStep component. -->
            <div
              v-if="auditInstance.workflowInstanceId && tab === 'info'"
              class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5"
            >
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-4 tw:flex tw:items-center tw:gap-2"
              >
                <IconSend :size="14" />
                Close-Out Workflow
              </div>
              <AuditInstanceWorkflowDetail
                :auditInstanceId="auditInstance.id"
                :workflowInstanceId="auditInstance.workflowInstanceId"
                :isOwner="auditInstance.createdBy === currentSession?.userId"
              />
            </div>

          </div>

          <!-- Right rail -->
          <div class="tw:flex tw:flex-col tw:gap-3">
            <!-- Conformance score (#1) -->
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-3 tw:flex tw:items-center tw:gap-2"
              >
                <IconClipboardCheck :size="14" />
                Conformance
              </div>
              <div class="tw:flex tw:items-center tw:gap-3 tw:mb-3">
                <div
                  class="tw:text-3xl tw:font-extrabold"
                  :class="scoring.pass ? 'tw:text-emerald-600' : 'tw:text-red-600'"
                >
                  {{ scoring.conformancePct == null ? '—' : `${scoring.conformancePct}%` }}
                </div>
                <span
                  class="tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-wide tw:rounded tw:px-2 tw:py-0.5"
                  :class="scoring.pass ? 'tw:bg-emerald-100 tw:text-emerald-700' : 'tw:bg-red-100 tw:text-red-700'"
                >
                  {{ scoring.pass ? 'Pass' : 'Fail' }}
                </span>
              </div>
              <div class="tw:grid tw:grid-cols-2 tw:gap-x-3 tw:gap-y-1 tw:text-xs">
                <div class="tw:flex tw:justify-between"><span class="tw:text-secondary">Conforming</span><span class="tw:font-medium">{{ scoring.counts.CONFORMING }}</span></div>
                <div class="tw:flex tw:justify-between"><span class="tw:text-secondary">Minor NC</span><span class="tw:font-medium">{{ scoring.counts.MINOR_NC }}</span></div>
                <div class="tw:flex tw:justify-between"><span class="tw:text-secondary">Major NC</span><span class="tw:font-medium tw:text-red-600">{{ scoring.counts.MAJOR_NC }}</span></div>
                <div class="tw:flex tw:justify-between"><span class="tw:text-secondary">OFI</span><span class="tw:font-medium">{{ scoring.counts.OFI }}</span></div>
                <div class="tw:flex tw:justify-between"><span class="tw:text-secondary">N/A</span><span class="tw:font-medium">{{ scoring.counts.NA }}</span></div>
                <div class="tw:flex tw:justify-between"><span class="tw:text-secondary">Assessed</span><span class="tw:font-medium">{{ scoring.assessed }}</span></div>
              </div>
            </div>

            <!-- Team -->
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
              <div
                class="tw:flex tw:items-center tw:justify-between tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
              >
                <div
                  class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:flex tw:items-center tw:gap-2"
                >
                  <IconUsers :size="14" />
                  Audit Team
                  <span class="tw:font-normal tw:normal-case tw:text-secondary tw:ml-1">
                    {{ teamMembers.length }}
                  </span>
                </div>
                <BaseButton
                  v-if="isEditable"
                  variant="outline"
                  size="sm"
                  @click="showAddMemberDialog = true"
                >
                  <template #icon><IconPlus :size="14" /></template>
                  Add
                </BaseButton>
              </div>

              <div
                v-if="!teamMembers.length"
                class="tw:py-8 tw:text-center tw:text-sm tw:text-secondary tw:italic"
              >
                No team members yet.
              </div>
              <div v-else class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
                <div
                  v-for="member in teamMembers"
                  :key="member.id"
                  class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:py-2"
                >
                  <div class="tw:flex tw:items-center tw:gap-2 tw:min-w-0">
                    <UserBadgeById :userId="member.userId" />
                    <button
                      type="button"
                      class="tw:text-[10px] tw:font-semibold tw:uppercase tw:tracking-wide tw:rounded tw:px-2 tw:py-0.5 tw:cursor-pointer tw:border-0"
                      :class="
                        member.roleOnAudit === 'LEAD'
                          ? 'tw:bg-amber-100 tw:text-amber-700'
                          : 'tw:bg-blue-100 tw:text-blue-700'
                      "
                      :title="isEditable ? 'Click to toggle LEAD / TEAM' : ''"
                      :disabled="!isEditable"
                      @click="toggleMemberRole(member)"
                    >
                      {{ member.roleOnAudit }}
                    </button>
                  </div>
                  <button
                    v-if="isEditable"
                    type="button"
                    class="tw:text-red-600 tw:hover:bg-red-50 tw:rounded tw:p-1 tw:cursor-pointer tw:bg-transparent tw:border-0"
                    title="Remove from team"
                    @click="removeMember(member)"
                  >
                    <IconTrash :size="14" />
                  </button>
                </div>
              </div>
            </div>
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4">
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-2 tw:border-b tw:border-divider tw:mb-3"
              >
                Overview
              </div>
              <div class="tw:flex tw:flex-col">
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Audit Number</span>
                  <code class="tw:text-xs tw:font-mono tw:bg-main-hover tw:px-2 tw:py-0.5 tw:rounded">
                    {{ auditInstance.auditNumber || '—' }}
                  </code>
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Type</span>
                  <span class="tw:text-xs">{{ auditInstance.programTypeId }}</span>
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Progress</span>
                  <span class="tw:text-xs tw:font-medium">
                    {{ responseCount }} / {{ clauseCount }} clauses
                  </span>
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Findings</span>
                  <span class="tw:text-xs tw:font-medium">
                    {{ findingsByStatus.open }} open / {{ findingsByStatus.total }} total
                  </span>
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Started</span>
                  <span class="tw:text-xs">
                    {{ auditInstance.startedAt ? auditInstance.startedAt.formatDate('date') : '—' }}
                  </span>
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Completed</span>
                  <span class="tw:text-xs">
                    {{ auditInstance.completedAt ? auditInstance.completedAt.formatDate('date') : '—' }}
                  </span>
                </div>
                <div v-if="saving" class="tw:text-[11px] tw:text-secondary tw:italic tw:pt-1">
                  Saving…
                </div>
                <div v-else-if="saveError" class="tw:text-[11px] tw:text-red-600 tw:pt-1">
                  {{ saveError }}
                </div>
              </div>
            </div>

            <div
              v-if="auditInstance.auditProgramId"
              class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4"
            >
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-2 tw:border-b tw:border-divider tw:mb-3 tw:flex tw:items-center tw:gap-2"
              >
                <IconChecklist :size="14" />
                Spawned From
              </div>
              <p class="tw:text-xs tw:text-secondary tw:italic">
                Minted by the daily generator off an audit program.
              </p>
              <BaseButton
                variant="outline"
                size="sm"
                class="tw:mt-2"
                @click="
                  router.push(getCompanyPath(`/audits/programs/${auditInstance.auditProgramId}`))
                "
              >
                Open Program
              </BaseButton>
            </div>
          </div>
        </div>
      </div>
    </div>

    <AuditInstanceSubmitDialog
      v-if="auditInstance"
      v-model="showSubmitDialog"
      :auditInstanceId="auditInstance.id"
    />

    <BaseDialog v-model="showAddMemberDialog" title="Add Team Member" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            User <span class="tw:text-red-500">*</span>
          </p>
          <UserSelectMenu v-model="addMemberForm.userId" />
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Role</p>
          <BaseInlineSelect
            v-model="addMemberForm.roleOnAudit"
            :items="[
              { id: 'TEAM', name: 'Team Member' },
              { id: 'LEAD', name: 'Lead Auditor' },
            ]"
            :required="true"
          />
          <p class="tw:text-[11px] tw:text-secondary tw:mt-1">
            Promoting to LEAD demotes the current lead (if any).
          </p>
        </div>
      </div>
      <template #footer>
        <BaseButton variant="outline" :disabled="addingMember" @click="showAddMemberDialog = false">
          Cancel
        </BaseButton>
        <BaseButton
          variant="primary"
          :loading="addingMember"
          :disabled="addingMember || !addMemberForm.userId"
          @click="handleAddMember"
        >
          Add
        </BaseButton>
      </template>
    </BaseDialog>

    <BaseDialog v-model="showCancelDialog" title="Cancel Audit" maxWidth="md">
      <p class="tw:text-sm tw:text-on-main tw:mb-3">
        Cancel <strong>{{ auditInstance?.auditNumber }}</strong>?
        Existing requirement responses + team data stay intact — the audit is just
        marked CANCELLED. Use Delete to remove the row entirely.
      </p>
      <div class="tw:flex tw:justify-end tw:gap-2 tw:pt-3 tw:border-t tw:border-divider">
        <BaseButton variant="outline" :disabled="transitioning" @click="showCancelDialog = false">
          Keep
        </BaseButton>
        <BaseButton variant="danger" :disabled="transitioning" @click="confirmCancel">
          {{ transitioning ? 'Cancelling…' : 'Cancel Audit' }}
        </BaseButton>
      </div>
    </BaseDialog>

    <BaseDialog v-model="showDeleteDialog" title="Archive Audit" maxWidth="md">
      <p class="tw:text-sm tw:text-on-main tw:mb-3">
        Archive <strong>{{ auditInstance?.auditNumber }}</strong>?
        Soft-delete; admins can restore via Settings if needed.
      </p>
      <div class="tw:flex tw:justify-end tw:gap-2 tw:pt-3 tw:border-t tw:border-divider">
        <BaseButton variant="outline" :disabled="transitioning" @click="showDeleteDialog = false">
          Cancel
        </BaseButton>
        <BaseButton variant="danger" :disabled="transitioning" @click="handleDelete">
          {{ transitioning ? 'Archiving…' : 'Archive' }}
        </BaseButton>
      </div>
    </BaseDialog>

    <!-- Full audit-log dialog. Includes the AuditInstance row itself
         plus the parent WorkflowInstance (for cross-step activity)
         and the child Findings (so reviewers can see the related
         finding history without leaving the audit). -->
    <AuditLogDialog
      v-if="auditInstance?.id"
      v-model="showAuditLog"
      entityType="AuditInstance"
      :entityId="auditInstance.id"
      :title="`Audit Log — ${auditInstance.auditNumber || 'Audit'}`"
      :includeEntities="
        auditInstance.workflowInstanceId
          ? [{ entityType: 'WorkflowInstance', entityIds: [auditInstance.workflowInstanceId] }]
          : []
      "
    />
  </div>
</template>
