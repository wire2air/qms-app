<script setup>
/**
 * Findings panel rendered on the audit-instance detail page.
 *
 * Lists every AuditFinding for this audit. Owners can add new
 * findings (free-standing) via the "+ New Finding" CTA; per-clause
 * escalation is wired via the requirement-execution panel (which
 * raises a `escalate-to-finding` event with the response and the
 * parent page opens this dialog accordingly).
 *
 * Each row exposes:
 *   - Type + status chips
 *   - Description (truncated; click to expand inline)
 *   - Quick actions: edit, status flip (open dropdown), delete
 *   - Spawn-to-{NC,CAPA,Training,CR} buttons land in Phase D-2 and
 *     hang off this same row.
 */
import {
  IconBolt,
  IconChevronDown,
  IconChevronRight,
  IconCircleCheck,
  IconEdit,
  IconExternalLink,
  IconLink,
  IconPlus,
  IconTrash,
  IconX,
} from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'
// Action RPCs (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { patch, post, del } from '@/api'

const props = defineProps({
  auditInstance: { type: Object, required: true },
  readonly: { type: Boolean, default: false },
  // #7 — can the current user record a supplier CAPA/response + mark complete
  // (the supplier/auditee on a supplier audit, or the auditor).
  canRespond: { type: Boolean, default: false },
})

const toast = useToast()

// #7 — supplier audits replace the NC/CAPA/link actions with a CAPA/Response
// + expected completion + complete/overdue workflow. Close stays auditor-only.
const supplierMode = computed(() => props.auditInstance?.programTypeId === 'SUPPLIER')

const responseBuffers = reactive({})
const expectedBuffers = reactive({})
const savingResponse = reactive({})

function responseValue(f) {
  return responseBuffers[f.id] !== undefined ? responseBuffers[f.id] : (f.responseText ?? '')
}
function expectedValue(f) {
  if (expectedBuffers[f.id] !== undefined) return expectedBuffers[f.id]
  const d = f.expectedCompletionDate
  return d?.toFormat ? d.toFormat('yyyy-MM-dd') : d ? String(d).slice(0, 10) : ''
}
async function saveResponse(f) {
  if (!props.canRespond) return
  savingResponse[f.id] = true
  try {
    await patch(`/v1/services/auditFindings/${f.id}/response`, {
      responseText: (responseValue(f) || '').trim() || null,
      expectedCompletionDate: expectedValue(f) || null,
    })
  } catch (e) {
    toast.error(e.message || 'Failed to save response')
  } finally {
    savingResponse[f.id] = false
  }
}
const saveResponseDebounced = useDebounceFn((f) => saveResponse(f), 700)
function onResponseInput(f, v) {
  responseBuffers[f.id] = v
  saveResponseDebounced(f)
}
function onExpectedInput(f, v) {
  expectedBuffers[f.id] = v
  saveResponse(f)
}
async function markComplete(f, completed = true) {
  if (!props.canRespond) return
  try {
    await post(`/v1/services/auditFindings/${f.id}/complete`, { completed })
    toast.success(completed ? 'Marked complete' : 'Reopened')
  } catch (e) {
    toast.error(e.message || 'Failed to update')
  }
}
function isOverdue(f) {
  if (f.completedAt || ['CLOSED', 'CANCELLED'].includes(f.statusId)) return false
  const d = f.expectedCompletionDate
  if (!d) return false
  const due = d?.toMillis ? d.toMillis() : new Date(d).getTime()
  return due < Date.now()
}

const findings = useLiveQueryWithDeps(
  [() => props.auditInstance.id],
  async (db, [instanceId]) => {
    if (!instanceId) return []
    const rows = await db.AuditFinding.where('auditInstanceId', instanceId).exec()
    return rows.sort(
      (a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0),
    )
  },
  { initial: [] },
)

const showDialog = ref(false)
const editingFinding = ref(null)

function openCreate() {
  editingFinding.value = null
  showDialog.value = true
}
function openEdit(finding) {
  editingFinding.value = finding
  showDialog.value = true
}

const expanded = reactive({})
function toggle(id) {
  expanded[id] = !expanded[id]
}

// Status-flip menu — we surface only the transitions the BE will
// accept from the current status so the user doesn't get a
// surprise 400 from clicking an option.
const TRANSITIONS = {
  OPEN: [
    { id: 'IN_REVIEW', name: 'In Review' },
    { id: 'IN_REMEDIATION', name: 'In Remediation' },
    { id: 'CLOSED', name: 'Close' },
    { id: 'CANCELLED', name: 'Cancel' },
  ],
  IN_REVIEW: [
    { id: 'OPEN', name: 'Re-open' },
    { id: 'IN_REMEDIATION', name: 'In Remediation' },
    { id: 'CLOSED', name: 'Close' },
    { id: 'CANCELLED', name: 'Cancel' },
  ],
  IN_REMEDIATION: [
    { id: 'IN_REVIEW', name: 'Back to Review' },
    { id: 'VERIFIED', name: 'Verified' },
    { id: 'CLOSED', name: 'Close' },
    { id: 'CANCELLED', name: 'Cancel' },
  ],
  VERIFIED: [
    { id: 'IN_REMEDIATION', name: 'Back to Remediation' },
    { id: 'CLOSED', name: 'Close' },
    { id: 'CANCELLED', name: 'Cancel' },
  ],
  CLOSED: [{ id: 'IN_REMEDIATION', name: 'Re-open' }],
  CANCELLED: [{ id: 'OPEN', name: 'Re-instate' }],
}
// Auto-findings store "<clause>: <question>\n<comment>". Split so the clause
// renders italic on its own line and the comment sits below it. Manual
// findings (no newline) show as-is.
function findingClause(f) {
  const d = f.description ?? ''
  const i = d.indexOf('\n')
  return i === -1 ? d : d.slice(0, i)
}
function findingComment(f) {
  const d = f.description ?? ''
  const i = d.indexOf('\n')
  return i === -1 ? '' : d.slice(i + 1).trim()
}

function allowedTransitions(statusId) {
  return TRANSITIONS[statusId] || []
}

async function setStatus(finding, statusId) {
  if (props.readonly) return
  try {
    await patch(`/v1/services/auditFindings/${finding.id}`, { statusId })
  } catch (e) {
    toast.error(e.message || 'Failed to update finding status')
  }
}

async function removeFinding(finding) {
  if (props.readonly) return
  if (!confirm(`Delete finding ${finding.findingNumber}?`)) return
  try {
    await del(`/v1/services/auditFindings/${finding.id}`)
    toast.success('Finding deleted')
  } catch (e) {
    toast.error(e.message || 'Failed to delete finding')
  }
}

// ── Spawn link / open / unlink ─────────────────────────────────────
//
// One canonical link per kind on each finding. The Link dialog
// handles attaching an existing record; we expose open + unlink
// inline on each populated chip.

const router = useRouter()

// kind → spawned_*_id column + the FE route stem so chips can deep-
// link into the spawned record's detail page. `createPath` optional —
// when set, surfaces a "+ New" option that deep-links to that
// module's create page with `?findingId=<id>` so the create page
// pre-fills + links back on save. Training omitted because the
// launch flow needs a template+assignees pick (not a deep-link
// prefill); the user attaches an existing TrainingInstance instead.
const SPAWN_KINDS = [
  {
    id: 'NC',
    label: 'NC',
    column: 'spawnedNcId',
    routeStem: 'nonconformances',
    createPath: '/nonconformances/create',
  },
  {
    id: 'CAPA',
    label: 'CAPA',
    column: 'spawnedCapaId',
    routeStem: 'capas',
    createPath: '/capas/create',
  },
  {
    id: 'TRAINING',
    label: 'Training',
    column: 'spawnedTrainingInstanceId',
    routeStem: 'training-instances',
  },
  {
    id: 'CR',
    label: 'CR',
    column: 'spawnedChangeRequestId',
    routeStem: 'change-requests',
    createPath: '/change-requests/create',
  },
]
const KIND_BY_ID = Object.fromEntries(SPAWN_KINDS.map((k) => [k.id, k]))

const linkDialogState = ref({ open: false, finding: null, findings: null, kind: null })

function openLinkDialog(finding, kind) {
  if (props.readonly) return
  linkDialogState.value = { open: true, finding, findings: null, kind }
}

// ── Multi-select → one CAPA (create or attach) ─────────────────────
// Select several failed-requirement findings, then raise ONE CAPA that
// covers them all (N findings → 1 CAPA via spawned_capa_id). Create routes
// to the CAPA create page with ?findingIds=…; Attach reuses the link dialog
// in multi mode.
const selected = reactive({})
const selectedFindings = computed(() => findings.value.filter((f) => selected[f.id]))
const selectedCount = computed(() => selectedFindings.value.length)

function toggleSelect(id) {
  selected[id] = !selected[id]
}
function clearSelection() {
  for (const k of Object.keys(selected)) delete selected[k]
}
function createCapaFromSelected() {
  if (props.readonly || !selectedCount.value) return
  const ids = selectedFindings.value.map((f) => f.id).join(',')
  router.push(getCompanyPath(`/capas/create?findingIds=${ids}`))
}
function attachSelectedToCapa() {
  if (props.readonly || !selectedCount.value) return
  linkDialogState.value = {
    open: true,
    finding: null,
    findings: selectedFindings.value,
    kind: 'CAPA',
  }
}

function openSpawned(finding, kind) {
  const cfg = KIND_BY_ID[kind]
  if (!cfg) return
  const targetId = finding[cfg.column]
  if (!targetId) return
  router.push(getCompanyPath(`/${cfg.routeStem}/${targetId}`))
}

// Deep-link to the target module's create page with ?findingId so
// the create page can pre-fill from the finding + link back on save.
// See utils/auditFindingLink.js + the watcher in each create page.
function newSpawned(finding, kind) {
  if (props.readonly) return
  const cfg = KIND_BY_ID[kind]
  if (!cfg?.createPath) return
  router.push(getCompanyPath(`${cfg.createPath}?findingId=${finding.id}`))
}

async function unlinkSpawn(finding, kind) {
  if (props.readonly) return
  const cfg = KIND_BY_ID[kind]
  if (!cfg) return
  if (!confirm(`Unlink the ${cfg.label} from finding ${finding.findingNumber}?`)) return
  try {
    await post(`/v1/services/auditFindings/${finding.id}/unlink`, { kind })
    toast.success(`${cfg.label} unlinked`)
  } catch (e) {
    toast.error(e.message || 'Failed to unlink record')
  }
}

// Per-finding spawn-state helpers used by the template.
function isLinked(finding, kind) {
  const cfg = KIND_BY_ID[kind]
  return !!(cfg && finding[cfg.column])
}
function unlinkedKinds(finding) {
  return SPAWN_KINDS.filter((k) => !finding[k.column])
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <div
      class="tw:flex tw:items-center tw:justify-between tw:pb-3 tw:border-b tw:border-divider"
    >
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-sm">
        <IconBolt :size="14" class="tw:text-amber-600" />
        <span class="tw:font-medium">
          {{ findings.length }} finding{{ findings.length === 1 ? '' : 's' }}
        </span>
      </div>
      <BaseButton v-if="!readonly" variant="outline" size="sm" @click="openCreate">
        <template #icon><IconPlus :size="14" /></template>
        New Finding
      </BaseButton>
    </div>

    <!-- Bulk bar: raise ONE CAPA from several selected findings (create or
         attach an existing one). Shows once at least one finding is ticked. -->
    <div
      v-if="!readonly && !supplierMode && selectedCount"
      class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap tw:bg-primary/5 tw:border tw:border-primary/20 tw:rounded-md tw:px-3 tw:py-2"
    >
      <span class="tw:text-xs tw:font-medium tw:text-primary">
        {{ selectedCount }} finding{{ selectedCount === 1 ? '' : 's' }} selected
      </span>
      <div class="tw:flex-1" />
      <button
        type="button"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:font-medium tw:bg-primary tw:text-white tw:rounded tw:px-2.5 tw:py-1 tw:cursor-pointer tw:hover:opacity-90 tw:border-0"
        @click="createCapaFromSelected"
      >
        <IconPlus :size="13" /> Create CAPA
      </button>
      <button
        type="button"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:font-medium tw:bg-white tw:text-primary tw:border tw:border-primary/40 tw:rounded tw:px-2.5 tw:py-1 tw:cursor-pointer tw:hover:bg-primary/10"
        @click="attachSelectedToCapa"
      >
        <IconLink :size="13" /> Attach to CAPA
      </button>
      <button
        type="button"
        class="tw:text-xs tw:text-secondary tw:hover:text-primary tw:cursor-pointer tw:bg-transparent tw:border-0"
        @click="clearSelection"
      >
        Clear
      </button>
    </div>

    <div
      v-if="!findings.length"
      class="tw:py-8 tw:text-center tw:text-sm tw:text-secondary tw:italic"
    >
      No findings yet. Escalate from a non-conforming clause in the requirements panel,
      or add one directly.
    </div>

    <div v-else class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
      <div
        v-for="finding in findings"
        :key="finding.id"
        class="tw:py-3 tw:flex tw:flex-col tw:gap-2"
      >
        <!-- Row header -->
        <div class="tw:flex tw:items-start tw:gap-2">
          <input
            v-if="!readonly && !supplierMode"
            type="checkbox"
            class="tw:mt-1 tw:cursor-pointer"
            :checked="!!selected[finding.id]"
            title="Select for CAPA"
            @change="toggleSelect(finding.id)"
          />
          <button
            type="button"
            class="tw:mt-0.5 tw:text-secondary tw:hover:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer"
            @click="toggle(finding.id)"
          >
            <IconChevronDown v-if="expanded[finding.id]" :size="16" />
            <IconChevronRight v-else :size="16" />
          </button>
          <code class="tw:text-xs tw:font-mono tw:text-secondary tw:mt-0.5">
            {{ finding.findingNumber }}
          </code>
          <div class="tw:flex-1 tw:min-w-0 tw:flex tw:flex-col tw:gap-1">
            <div class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
              <AuditFindingTypeBadgeById :typeId="finding.findingTypeId" />
              <AuditFindingStatusBadgeById :statusId="finding.statusId" />
              <AuditFindingCategoryBadgeById
                v-if="finding.categoryId"
                :categoryId="finding.categoryId"
              />
              <span
                v-if="finding.processArea"
                class="tw:text-[11px] tw:text-secondary tw:italic"
              >
                {{ finding.processArea }}
              </span>
              <!-- Linked-record chips, surfaced in the collapsed row so users
                   see at a glance that a CAPA / NC / CR / Training was raised
                   from this finding (clickable to open it). Full link/unlink
                   controls remain in the expanded section. -->
              <template v-if="!supplierMode">
                <template v-for="cfg in SPAWN_KINDS">
                  <AuditFindingLinkedChip
                    v-if="isLinked(finding, cfg.id)"
                    :key="`hdr-${cfg.id}`"
                    :kind="cfg.id"
                    :targetId="finding[cfg.column]"
                  />
                </template>
              </template>
              <!-- #7 — supplier-mode status chips: overdue / completed -->
              <span
                v-if="supplierMode && isOverdue(finding)"
                class="tw:text-[10px] tw:font-bold tw:uppercase tw:rounded tw:px-1.5 tw:py-0.5 tw:bg-red-100 tw:text-red-700"
              >
                Overdue
              </span>
              <span
                v-else-if="supplierMode && finding.completedAt"
                class="tw:text-[10px] tw:font-bold tw:uppercase tw:rounded tw:px-1.5 tw:py-0.5 tw:bg-emerald-100 tw:text-emerald-700"
              >
                Completed
              </span>
            </div>
            <div
              class="tw:text-sm tw:text-on-main"
              :class="!expanded[finding.id] ? 'tw:line-clamp-3' : ''"
            >
              <span :class="finding.autoGenerated ? 'tw:italic tw:text-secondary' : ''">
                {{ findingClause(finding) }}
              </span>
              <!-- Rich Finding Notes (#29) when present — preserves the
                   auditor's formatting + images; else the plain comment. -->
              <div
                v-if="finding.detailsHtml"
                class="tw:block tw:mt-1 tw:text-on-main finding-rich"
                v-html="finding.detailsHtml"
              />
              <span v-else-if="findingComment(finding)" class="tw:block tw:mt-1 tw:text-on-main">
                {{ findingComment(finding) }}
              </span>
            </div>
          </div>
          <div class="tw:flex tw:items-center tw:gap-1 tw:shrink-0">
            <button
              v-if="!readonly && !['CLOSED', 'CANCELLED'].includes(finding.statusId)"
              type="button"
              class="tw:inline-flex tw:items-center tw:gap-1 tw:text-emerald-700 tw:hover:bg-emerald-50 tw:rounded tw:px-2 tw:py-1 tw:cursor-pointer tw:bg-transparent tw:border tw:border-emerald-200 tw:text-[11px] tw:font-medium"
              title="Close this finding"
              @click="setStatus(finding, 'CLOSED')"
            >
              <IconCircleCheck :size="14" /> Close
            </button>
            <button
              v-if="!readonly"
              type="button"
              class="tw:text-secondary tw:hover:text-primary tw:hover:bg-main-hover tw:rounded tw:p-1 tw:cursor-pointer tw:bg-transparent tw:border-0"
              title="Edit"
              @click="openEdit(finding)"
            >
              <IconEdit :size="14" />
            </button>
            <button
              v-if="!readonly"
              type="button"
              class="tw:text-red-600 tw:hover:bg-red-50 tw:rounded tw:p-1 tw:cursor-pointer tw:bg-transparent tw:border-0"
              title="Delete"
              @click="removeFinding(finding)"
            >
              <IconTrash :size="14" />
            </button>
          </div>
        </div>

        <!-- Expanded: assignee, due date, scores, status transitions -->
        <div
          v-if="expanded[finding.id]"
          class="tw:ml-7 tw:flex tw:flex-col tw:gap-2 tw:text-xs"
        >
          <div class="tw:grid tw:grid-cols-2 tw:gap-2">
            <div>
              <span class="tw:text-secondary">Severity:</span>
              <span class="tw:ml-1 tw:font-medium">{{ finding.severityScore }}</span>
            </div>
            <div>
              <span class="tw:text-secondary">Risk:</span>
              <span class="tw:ml-1 tw:font-medium">{{ finding.riskScore }}</span>
            </div>
          </div>

          <!-- #7 — supplier remediation: CAPA/Response + expected completion +
               mark complete. Replaces the internal NC/CAPA/link actions. -->
          <div
            v-if="supplierMode"
            class="tw:flex tw:flex-col tw:gap-2 tw:rounded tw:border tw:border-divider tw:bg-main-hover/20 tw:p-2"
          >
            <div class="tw:flex tw:items-center tw:justify-between">
              <span class="tw:text-[10px] tw:uppercase tw:font-semibold tw:tracking-wide tw:text-secondary">
                CAPA / Response
              </span>
              <span v-if="finding.completedAt" class="tw:text-[10px] tw:text-emerald-700 tw:font-medium">
                Completed {{ finding.completedAt.formatDate?.('date') }}
              </span>
              <span v-else-if="isOverdue(finding)" class="tw:text-[10px] tw:text-red-700 tw:font-bold tw:uppercase">
                Overdue
              </span>
            </div>
            <BaseRichTextEditor
              :modelValue="responseValue(finding)"
              :editable="canRespond && !finding.completedAt"
              placeholder="Describe the corrective action / response…"
              @update:modelValue="(v) => onResponseInput(finding, v)"
            />
            <div class="tw:flex tw:items-center tw:gap-3 tw:flex-wrap">
              <div class="tw:flex tw:items-center tw:gap-1">
                <span class="tw:text-secondary">Expected completion:</span>
                <BaseTextInput
                  v-if="canRespond && !finding.completedAt"
                  :modelValue="expectedValue(finding)"
                  type="date"
                  size="sm"
                  @update:modelValue="(v) => onExpectedInput(finding, v)"
                />
                <span v-else class="tw:font-medium">{{ expectedValue(finding) || '—' }}</span>
              </div>
              <div class="tw:flex-1" />
              <BaseButton
                v-if="canRespond && !finding.completedAt"
                variant="primary"
                size="sm"
                :disabled="savingResponse[finding.id]"
                @click="markComplete(finding, true)"
              >
                Mark Complete
              </BaseButton>
              <BaseButton
                v-else-if="canRespond && finding.completedAt"
                variant="outline"
                size="sm"
                @click="markComplete(finding, false)"
              >
                Reopen
              </BaseButton>
            </div>
          </div>

          <!-- Cross-module spawn pointer chips (internal audits only). Linked
               records show as clickable chips with an inline unlink; unlinked
               kinds surface as "+ Link" pills that open the picker. -->
          <div v-if="!supplierMode" class="tw:flex tw:flex-wrap tw:gap-1.5 tw:items-center">
            <p class="tw:text-[10px] tw:text-secondary tw:uppercase tw:font-semibold tw:tracking-wide tw:mr-1">
              Linked:
            </p>
            <template v-for="cfg in SPAWN_KINDS">
              <span
                v-if="isLinked(finding, cfg.id)"
                :key="cfg.id"
                class="tw:inline-flex tw:items-center tw:gap-1 tw:text-[10px] tw:bg-emerald-100 tw:text-emerald-700 tw:rounded tw:pl-2 tw:pr-1 tw:py-0.5"
              >
                <button
                  type="button"
                  class="tw:flex tw:items-center tw:gap-1 tw:cursor-pointer tw:bg-transparent tw:border-0 tw:text-emerald-700 tw:hover:underline"
                  :title="`Open spawned ${cfg.label}`"
                  @click="openSpawned(finding, cfg.id)"
                >
                  {{ cfg.label }} <IconExternalLink :size="10" />
                </button>
                <button
                  v-if="!readonly"
                  type="button"
                  class="tw:text-emerald-700 tw:hover:bg-emerald-200 tw:rounded tw:p-0.5 tw:cursor-pointer tw:bg-transparent tw:border-0"
                  title="Unlink"
                  @click="unlinkSpawn(finding, cfg.id)"
                >
                  <IconX :size="10" />
                </button>
              </span>
            </template>
            <!-- '+ New' rendered only for kinds whose create page
                 supports the ?findingId pre-fill (NC / CAPA / CR).
                 Training is omitted — its launch flow needs a
                 template + assignees pick that doesn't map to a
                 deep-link prefill. -->
            <button
              v-for="cfg in unlinkedKinds(finding).filter((c) => c.createPath)"
              :key="`new-${cfg.id}`"
              type="button"
              :disabled="readonly"
              class="tw:inline-flex tw:items-center tw:gap-1 tw:text-[10px] tw:font-medium tw:bg-white tw:text-secondary tw:border tw:border-divider tw:rounded tw:px-2 tw:py-0.5 tw:cursor-pointer tw:hover:border-primary tw:hover:text-primary"
              @click="newSpawned(finding, cfg.id)"
            >
              <IconPlus :size="10" /> New {{ cfg.label }}
            </button>
            <button
              v-for="cfg in unlinkedKinds(finding)"
              :key="`link-${cfg.id}`"
              type="button"
              :disabled="readonly"
              class="tw:inline-flex tw:items-center tw:gap-1 tw:text-[10px] tw:font-medium tw:bg-white tw:text-secondary tw:border tw:border-divider tw:rounded tw:px-2 tw:py-0.5 tw:cursor-pointer tw:hover:border-primary tw:hover:text-primary"
              @click="openLinkDialog(finding, cfg.id)"
            >
              <IconLink :size="10" /> Link {{ cfg.label }}
            </button>
          </div>

          <!-- Per-finding evidence — bound by auditFindingId so uploads
               and polymorphic links from here land scoped to this
               finding. Reuses the same panel the audit-overall card
               shows. -->
          <div class="tw:rounded tw:border tw:border-divider tw:bg-main-hover/30 tw:p-2 tw:mt-1">
            <AuditEvidencePanel
              :auditInstance="auditInstance"
              scope="finding"
              :scopeId="finding.id"
              :readonly="readonly"
            />
          </div>

          <!-- Inline status transitions (internal audits). Supplier audits use
               the response/complete flow + the auditor's header Close action. -->
          <div v-if="!readonly && !supplierMode" class="tw:flex tw:flex-wrap tw:gap-1.5 tw:pt-1">
            <button
              v-for="t in allowedTransitions(finding.statusId)"
              :key="t.id"
              type="button"
              class="tw:text-[10px] tw:font-semibold tw:rounded tw:px-2 tw:py-1 tw:cursor-pointer tw:border tw:border-divider tw:bg-white tw:text-on-main tw:hover:border-primary tw:hover:text-primary"
              @click="setStatus(finding, t.id)"
            >
              {{ t.name }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <AuditFindingDialog
      v-model="showDialog"
      :auditInstance="auditInstance"
      :finding="editingFinding"
    />

    <AuditFindingLinkSpawnedDialog
      v-if="linkDialogState.finding || linkDialogState.findings"
      v-model="linkDialogState.open"
      :finding="linkDialogState.finding"
      :findings="linkDialogState.findings"
      :kind="linkDialogState.kind"
      @linked="clearSelection"
    />
  </div>
</template>

<style scoped>
/* Rich Finding Notes (#29) rendered via v-html — Tailwind preflight strips
   list bullets + margins, so restore the basics for the finding body. */
.finding-rich :deep(p) {
  margin: 0 0 0.4em;
}
.finding-rich :deep(ul) {
  list-style: disc;
  padding-left: 1.25rem;
  margin: 0.25em 0;
}
.finding-rich :deep(ol) {
  list-style: decimal;
  padding-left: 1.25rem;
  margin: 0.25em 0;
}
.finding-rich :deep(li) {
  margin: 0.1em 0;
}
.finding-rich :deep(mark) {
  background: #fef08a;
  padding: 0 1px;
}
.finding-rich :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}
.finding-rich :deep(strong) {
  font-weight: 700;
}
</style>
