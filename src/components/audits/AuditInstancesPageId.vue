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
  IconChecklist,
  IconClipboardCheck,
  IconUsers,
  IconClipboardList,
  IconBolt,
  IconSend,
  IconPlus,
  IconTrash,
  IconBulb,
} from '@tabler/icons-vue'
import { useAuditScoring } from '@/composables/useAuditScoring'
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
// Action RPCs (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { patch, post, del } from '@/api'
import {
  buildAuditInstanceBanners,
  buildAuditInstanceTabs,
  buildAuditInstanceActions,
} from './auditInstanceDetailConfig.js'

const props = defineProps({
  id: { type: String, required: true },
})

const toast = useToast()
const router = useRouter()

const auditInstance = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => db.AuditInstance.findByPk(id),
  { models: ['AuditInstance'] },
)

// #1 — conformance scoring rollup (shared with the printable report).
const { scoring, responses } = useAuditScoring(() => props.id)

// Close-out readiness: every LEAF clause (an actual requirement — not a
// parent/section header) must be assessed. A clause is assessed only when its
// response carries a verdict — in-progress responses with no result_id (#27)
// don't count. A clause is a leaf when its id isn't referenced as a parentId.
const respondedIds = computed(
  () => new Set(responses.value.filter((r) => r.resultId).map((r) => r.requirementId)),
)
const assessableClauses = computed(() => {
  const schema = auditInstance.value?.requirementSchema ?? []
  const parentIds = new Set(schema.map((c) => c.parentId).filter(Boolean))
  return schema.filter((c) => !parentIds.has(c.requirementId))
})
const unassessedCount = computed(
  () => assessableClauses.value.filter((c) => !respondedIds.value.has(c.requirementId)).length,
)

function openReport() {
  // Open the report in a new tab (matches NC/CAPA/CR/I&L) so the auditor keeps
  // the audit open behind it and the print page auto-fires window.print().
  const params = new URLSearchParams({ module: 'AuditInstance', id: props.id })
  window.open(getCompanyPath(`/print?${params.toString()}`), '_blank', 'noopener,noreferrer')
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

  { models: ['SharedWithUser'], initial: [] },
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
      auditeeUserId: a.auditeeUserId || null,
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

  { models: ['AuditTeamMember'], initial: [] },
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

  { models: ['AuditRequirementResponse'], initial: 0 },
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

  { models: ['AuditFinding'], initial: { open: 0, total: 0 } },
)

// #3/#4 — supplier-audit release. The supplier (non-auditor viewer) only sees
// Requirements/Findings/OFI once the auditor releases; the auditor sees all.
const isReleased = computed(() => !!auditInstance.value?.releasedAt)
const supplierTabsLocked = computed(
  () => auditInstance.value?.programTypeId === 'SUPPLIER' && !isEditable.value && !isReleased.value,
)
const canRelease = computed(
  () => auditInstance.value?.programTypeId === 'SUPPLIER' && isEditable.value,
)
const releasing = ref(false)
async function releaseAudit() {
  if (!canRelease.value || releasing.value) return
  releasing.value = true
  try {
    const res = await post(`/v1/services/auditInstances/${props.id}/release`)
    const n = res?.notified ?? 0
    toast.success(
      n > 0 ? `Released — ${n} supplier contact${n === 1 ? '' : 's'} notified.` : 'Audit released.',
    )
  } catch (e) {
    toast.error(e.message || 'Failed to release audit')
  } finally {
    releasing.value = false
  }
}

// ─── BaseDetailLayout config ──────────────────────────────────────────────────
const auditInstanceTabs = computed(() =>
  buildAuditInstanceTabs({
    clauseCount: clauseCount.value,
    findingsTotal: findingsByStatus.value.total,
    ofiCount: scoring.value.counts.OFI,
    supplierTabsLocked: supplierTabsLocked.value,
  }),
)
// If the active tab becomes unavailable (supplier pre-release), fall back to Information.
watch(auditInstanceTabs, (tabs) => {
  if (!tabs.some((t) => t.value === tab.value)) tab.value = 'info'
})
const breadcrumbs = computed(() => [
  { label: 'Audits', to: getCompanyPath('/audits?tab=instances') },
  { label: auditInstance.value?.auditNumber || 'Audit' },
])
const auditInstanceBanners = computed(() => buildAuditInstanceBanners(auditInstance.value))
const auditInstanceActions = computed(() =>
  buildAuditInstanceActions(
    {
      canStart: canStart.value,
      canSubmitForCloseOut: canSubmitForCloseOut.value,
      canCancel: canCancel.value,
      canDelete: canDelete.value,
      canRelease: canRelease.value,
      isReleased: isReleased.value,
      statusId: auditInstance.value?.statusId,
      transitioning: transitioning.value,
      releasing: releasing.value,
      unassessedCount: unassessedCount.value,
      findingsOpen: findingsByStatus.value.open,
    },
    {
      release: releaseAudit,
      start: startAudit,
      openSubmit() {
        showSubmitDialog.value = true
      },
      report: openReport,
      openCancel() {
        showCancelDialog.value = true
      },
      openAuditLog() {
        showAuditLog.value = true
      },
      openDelete() {
        showDeleteDialog.value = true
      },
    },
  ),
)
const auditInstanceDetailConfig = computed(() =>
  defineDetailConfig({
    variant: 'standard',
    width: 'standard',
    breadcrumbs: breadcrumbs.value,
    banners: () => auditInstanceBanners.value,
    actions: auditInstanceActions.value,
    tabs: auditInstanceTabs.value,
  }),
)
</script>

<template>
  <BaseDetailLayout
    v-model:tab="tab"
    :config="auditInstanceDetailConfig"
    :record="auditInstance"
    :loading="loading"
    :notFound="!loading && !auditInstance"
    notFoundTitle="Audit not found"
    notFoundDescription="This audit could not be found."
  >
    <template #title>{{ auditInstance?.auditNumber || 'Audit' }}</template>

    <template #status>
      <AuditInstanceStatusBadgeById v-if="auditInstance" :statusId="auditInstance.statusId" />
    </template>

    <template v-if="auditInstance" #meta>
      <span>{{ auditInstance.programTypeId }}</span>
      <template v-if="auditInstance.scheduledDate">
        · Scheduled {{ auditInstance.scheduledDate.formatDate('date') }}
      </template>
    </template>

    <template #actions>
      <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
        <!-- #3 — released-to-supplier chip (bespoke; the Release action lives in DetailActionBar) -->
        <span
          v-if="isReleased && canRelease"
          class="tw:inline-flex tw:items-center tw:text-xs tw:font-medium tw:text-emerald-700 tw:bg-emerald-50 tw:rounded tw:px-2 tw:py-1"
          :title="`Released to supplier on ${auditInstance.releasedAt?.formatDate?.('datetime') ?? ''}`"
        >
          Released {{ auditInstance.releasedAt?.formatDate?.('date') }}
        </span>
        <DetailActionBar :actions="auditInstanceActions" :maxVisible="4" />
      </div>
    </template>

    <template v-if="auditInstance" #tab-info>
      <div class="tw:flex tw:flex-col tw:gap-4">
        <!-- Details card -->
        <FormSection title="Audit Details">
          <div class="tw:grid tw:grid-cols-2 tw:gap-3 tw:mb-4">
            <div class="tw:flex tw:flex-col tw:gap-1">
              <div class="tw:text-xs tw:text-secondary">Standard</div>
              <AuditStandardBadgeById
                v-if="isEditable && auditInstance.auditStandardId"
                :standardId="auditInstance.auditStandardId"
              />
              <span v-else-if="auditInstance.displayMeta?.standardName" class="tw:text-sm">
                {{ auditInstance.displayMeta.standardName }}
              </span>
              <span v-else class="tw:text-sm tw:text-secondary">—</span>
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <div class="tw:text-xs tw:text-secondary">Scheduled</div>
              <BaseTextInput v-if="isEditable" v-model="scheduledDateStr" type="date" size="sm" />
              <span v-else class="tw:text-sm">
                {{
                  auditInstance.scheduledDate ? auditInstance.scheduledDate.formatDate('date') : '—'
                }}
              </span>
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <div class="tw:text-xs tw:text-secondary">Lead Auditor</div>
              <UserSelectMenu v-if="isEditable" v-model="auditInstance.leadAuditorUserId" />
              <span v-else-if="auditInstance.displayMeta?.leadAuditorName" class="tw:text-sm">
                {{ auditInstance.displayMeta.leadAuditorName }}
              </span>
              <span v-else class="tw:text-sm tw:text-secondary">—</span>
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <div class="tw:text-xs tw:text-secondary">Auditee</div>
              <UserSelectMenu
                v-if="isEditable"
                v-model="auditInstance.auditeeUserId"
                nullLabel="-- Select --"
                :kind="
                  auditInstance.programTypeId === 'SUPPLIER' ? 'EXTERNAL_SUPPLIER' : 'INTERNAL'
                "
                :supplierId="
                  auditInstance.programTypeId === 'SUPPLIER' ? auditInstance.supplierId : null
                "
                :departmentId="
                  auditInstance.programTypeId === 'SUPPLIER' ? null : auditInstance.departmentId
                "
              />
              <span v-else-if="auditInstance.displayMeta?.auditeeName" class="tw:text-sm">
                {{ auditInstance.displayMeta.auditeeName }}
              </span>
              <span v-else class="tw:text-sm tw:text-secondary">—</span>
            </div>
            <div
              v-if="auditInstance.programTypeId !== 'SUPPLIER'"
              class="tw:flex tw:flex-col tw:gap-1"
            >
              <div class="tw:text-xs tw:text-secondary">Department</div>
              <DepartmentSelectMenu v-if="isEditable" v-model="auditInstance.departmentId" />
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
                v-if="isEditable && auditInstance.supplierId"
                :supplierId="auditInstance.supplierId"
              />
              <span v-else-if="auditInstance.displayMeta?.supplierName" class="tw:text-sm">
                {{ auditInstance.displayMeta.supplierName }}
              </span>
              <span v-else class="tw:text-sm tw:text-secondary">—</span>
            </div>
          </div>

          <!-- Scope / Objectives — click-to-edit, long form -->
          <div class="tw:flex tw:flex-col tw:gap-3">
            <div>
              <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Scope</p>
              <BaseTextarea
                v-if="editingScope && isEditable"
                v-model="auditInstance.scope"
                :rows="3"
                placeholder="What's in scope for this audit?"
                @blur="editingScope = false"
              />
              <BaseClickableRow
                v-else
                class="tw:text-sm tw:whitespace-pre-line tw:text-on-main"
                :class="isEditable ? 'tw:cursor-pointer tw:hover:text-primary' : ''"
                :disabled="!isEditable"
                aria-label="Edit audit scope"
                @click="isEditable && (editingScope = true)"
              >
                {{ auditInstance.scope || (isEditable ? 'Add scope…' : '—') }}
              </BaseClickableRow>
            </div>
            <div>
              <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
                Objectives
              </p>
              <BaseTextarea
                v-if="editingObjectives && isEditable"
                v-model="auditInstance.objectives"
                :rows="3"
                placeholder="What outcomes does this audit need to produce?"
                @blur="editingObjectives = false"
              />
              <BaseClickableRow
                v-else
                class="tw:text-sm tw:whitespace-pre-line tw:text-on-main"
                :class="isEditable ? 'tw:cursor-pointer tw:hover:text-primary' : ''"
                :disabled="!isEditable"
                aria-label="Edit audit objectives"
                @click="isEditable && (editingObjectives = true)"
              >
                {{ auditInstance.objectives || (isEditable ? 'Add objectives…' : '—') }}
              </BaseClickableRow>
            </div>
          </div>
        </FormSection>

        <!-- Admin-defined custom fields. Self-hides when none configured. -->
        <CustomFieldsCard entityType="AuditInstance" :entityId="id" :editable="isEditable" />

        <!-- Agenda + embedded Document Request: select clauses + requested docs. -->
        <AuditAgendaPanel
          :auditInstance="auditInstance"
          :readonly="!isEditable"
          :docRequestReadonly="docRequestReadonly"
          :canManageRequests="isEditable"
        />

        <!-- Close-Out Workflow — appears once Submitted-for-Close-Out. Reviewers
             see Approve / Reject inside each step card. -->
        <FormSection
          v-if="auditInstance.workflowInstanceId"
          title="Close-Out Workflow"
          :icon="IconSend"
        >
          <AuditInstanceWorkflowDetail
            :auditInstanceId="auditInstance.id"
            :workflowInstanceId="auditInstance.workflowInstanceId"
            :isOwner="auditInstance.createdBy === currentSession?.userId"
          />
        </FormSection>
      </div>
    </template>

    <template v-if="auditInstance" #tab-requirements>
      <FormSection title="Requirements" :icon="IconClipboardList">
        <AuditWalkthroughPanel :auditInstance="auditInstance" :readonly="!isEditable" />
      </FormSection>
    </template>

    <template v-if="auditInstance" #tab-findings>
      <FormSection title="Findings" :icon="IconBolt">
        <AuditFindingsPanel
          :auditInstance="auditInstance"
          :readonly="!isEditable"
          :canRespond="auditInstance.programTypeId === 'SUPPLIER' && (isEditable || isAuditee)"
        />
      </FormSection>
    </template>

    <template v-if="auditInstance" #tab-ofi>
      <FormSection title="Opportunities for Improvement" :icon="IconBulb">
        <AuditOfiPanel :auditInstance="auditInstance" />
      </FormSection>
    </template>

    <template v-if="auditInstance" #rail>
      <!-- Conformance score (#1). Hidden on mobile/iPad to save space —
           the auditor still sees it in the printable report; shown on lg+. -->
      <BaseRailCard title="Conformance" :icon="IconClipboardCheck" class="tw:hidden tw:lg:block">
        <div class="tw:flex tw:items-center tw:gap-3 tw:mb-3">
          <div
            class="tw:text-3xl tw:font-extrabold"
            :class="scoring.pass ? 'tw:text-emerald-600' : 'tw:text-red-600'"
          >
            {{ scoring.conformancePct == null ? '—' : `${scoring.conformancePct}%` }}
          </div>
          <span
            class="tw:text-micro tw:font-bold tw:uppercase tw:tracking-wide tw:rounded tw:px-2 tw:py-0.5"
            :class="
              scoring.pass
                ? 'tw:bg-emerald-100 tw:text-emerald-700'
                : 'tw:bg-red-100 tw:text-red-700'
            "
          >
            {{ scoring.pass ? 'Pass' : 'Fail' }}
          </span>
        </div>
        <div class="tw:grid tw:grid-cols-2 tw:gap-x-3 tw:gap-y-1 tw:text-xs">
          <div class="tw:flex tw:justify-between">
            <span class="tw:text-secondary">Conforming</span
            ><span class="tw:font-medium">{{ scoring.counts.CONFORMING }}</span>
          </div>
          <div class="tw:flex tw:justify-between">
            <span class="tw:text-secondary">Minor NC</span
            ><span class="tw:font-medium">{{ scoring.counts.MINOR_NC }}</span>
          </div>
          <div class="tw:flex tw:justify-between">
            <span class="tw:text-secondary">Major NC</span
            ><span class="tw:font-medium tw:text-red-600">{{ scoring.counts.MAJOR_NC }}</span>
          </div>
          <div class="tw:flex tw:justify-between">
            <span class="tw:text-secondary">OFI</span
            ><span class="tw:font-medium">{{ scoring.counts.OFI }}</span>
          </div>
          <div class="tw:flex tw:justify-between">
            <span class="tw:text-secondary">N/A</span
            ><span class="tw:font-medium">{{ scoring.counts.NA }}</span>
          </div>
          <div class="tw:flex tw:justify-between">
            <span class="tw:text-secondary">Assessed</span
            ><span class="tw:font-medium">{{ scoring.assessed }}</span>
          </div>
        </div>
      </BaseRailCard>

      <!-- Team -->
      <BaseRailCard title="Audit Team" :icon="IconUsers">
        <div class="tw:flex tw:items-center tw:justify-between tw:mb-2">
          <span class="tw:text-xs tw:text-secondary">{{ teamMembers.length }} member(s)</span>
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
          class="tw:py-6 tw:text-center tw:text-sm tw:text-secondary tw:italic"
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
                class="tw:text-micro tw:font-semibold tw:uppercase tw:tracking-wide tw:rounded tw:px-2 tw:py-0.5 tw:cursor-pointer tw:border-0"
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
      </BaseRailCard>

      <!-- Overview -->
      <BaseRailCard title="Overview">
        <div class="tw:flex tw:flex-col tw:gap-2">
          <BaseDetailField label="Audit Number" layout="inline">
            <code class="tw:text-xs tw:font-mono tw:bg-main-hover tw:px-2 tw:py-0.5 tw:rounded">
              {{ auditInstance.auditNumber || '—' }}
            </code>
          </BaseDetailField>
          <BaseDetailField label="Type" layout="inline" :value="auditInstance.programTypeId" />
          <BaseDetailField label="Progress" layout="inline">
            <span class="tw:text-xs tw:font-medium"
              >{{ responseCount }} / {{ clauseCount }} clauses</span
            >
          </BaseDetailField>
          <BaseDetailField label="Findings" layout="inline">
            <span class="tw:text-xs tw:font-medium">
              {{ findingsByStatus.open }} open / {{ findingsByStatus.total }} total
            </span>
          </BaseDetailField>
          <BaseDetailField
            label="Started"
            layout="inline"
            :value="auditInstance.startedAt ? auditInstance.startedAt.formatDate('date') : null"
          />
          <BaseDetailField
            label="Completed"
            layout="inline"
            :value="auditInstance.completedAt ? auditInstance.completedAt.formatDate('date') : null"
          />
          <div v-if="saving" class="tw:text-caption tw:text-secondary tw:italic tw:pt-1">
            Saving…
          </div>
          <div v-else-if="saveError" class="tw:text-caption tw:text-red-600 tw:pt-1">
            {{ saveError }}
          </div>
        </div>
      </BaseRailCard>

      <BaseRailCard v-if="auditInstance.auditProgramId" title="Spawned From" :icon="IconChecklist">
        <p class="tw:text-xs tw:text-secondary tw:italic">
          Minted by the daily generator off an audit program.
        </p>
        <BaseButton
          variant="outline"
          size="sm"
          class="tw:mt-2"
          @click="router.push(getCompanyPath(`/audits/programs/${auditInstance.auditProgramId}`))"
        >
          Open Program
        </BaseButton>
      </BaseRailCard>
    </template>
  </BaseDetailLayout>

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
        <p class="tw:text-caption tw:text-secondary tw:mt-1">
          Promoting to LEAD demotes the current lead (if any).
        </p>
      </div>
    </div>
    <template #footer>
      <BaseDialogFooter
        submitLabel="Add"
        :loading="addingMember"
        :disabled="!addMemberForm.userId"
        @cancel="showAddMemberDialog = false"
        @submit="handleAddMember"
      />
    </template>
  </BaseDialog>

  <BaseDialog v-model="showCancelDialog" title="Cancel Audit" maxWidth="md">
    <p class="tw:text-sm tw:text-on-main tw:mb-3">
      Cancel <strong>{{ auditInstance?.auditNumber }}</strong
      >? Existing requirement responses + team data stay intact — the audit is just marked
      CANCELLED. Use Delete to remove the row entirely.
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
      Archive <strong>{{ auditInstance?.auditNumber }}</strong
      >? Soft-delete; admins can restore via Settings if needed.
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
</template>
