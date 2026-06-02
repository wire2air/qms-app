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
})

const toast = useToast()

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
    { id: 'CANCELLED', name: 'Cancel' },
  ],
  IN_REVIEW: [
    { id: 'OPEN', name: 'Re-open' },
    { id: 'IN_REMEDIATION', name: 'In Remediation' },
    { id: 'CANCELLED', name: 'Cancel' },
  ],
  IN_REMEDIATION: [
    { id: 'IN_REVIEW', name: 'Back to Review' },
    { id: 'VERIFIED', name: 'Verified' },
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
// link into the spawned record's detail page.
const SPAWN_KINDS = [
  { id: 'NC', label: 'NC', column: 'spawnedNcId', routeStem: 'nonconformances' },
  { id: 'CAPA', label: 'CAPA', column: 'spawnedCapaId', routeStem: 'capas' },
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
  },
]
const KIND_BY_ID = Object.fromEntries(SPAWN_KINDS.map((k) => [k.id, k]))

const linkDialogState = ref({ open: false, finding: null, kind: null })

function openLinkDialog(finding, kind) {
  if (props.readonly) return
  linkDialogState.value = { open: true, finding, kind }
}

function openSpawned(finding, kind) {
  const cfg = KIND_BY_ID[kind]
  if (!cfg) return
  const targetId = finding[cfg.column]
  if (!targetId) return
  router.push(getCompanyPath(`/${cfg.routeStem}/${targetId}`))
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
            </div>
            <p
              class="tw:text-sm tw:text-on-main"
              :class="!expanded[finding.id] ? 'tw:line-clamp-2' : ''"
            >
              {{ finding.description }}
            </p>
          </div>
          <div class="tw:flex tw:items-center tw:gap-1 tw:shrink-0">
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
              <span class="tw:text-secondary">Assignee:</span>
              <UserBadgeById
                v-if="finding.assignedToUserId"
                :userId="finding.assignedToUserId"
                class="tw:ml-1"
              />
              <span v-else class="tw:ml-1 tw:text-secondary">—</span>
            </div>
            <div>
              <span class="tw:text-secondary">Due:</span>
              <span class="tw:ml-1">
                {{ finding.dueDate ? finding.dueDate.formatDate('date') : '—' }}
              </span>
            </div>
            <div>
              <span class="tw:text-secondary">Severity:</span>
              <span class="tw:ml-1 tw:font-medium">{{ finding.severityScore }}</span>
            </div>
            <div>
              <span class="tw:text-secondary">Risk:</span>
              <span class="tw:ml-1 tw:font-medium">{{ finding.riskScore }}</span>
            </div>
          </div>

          <!-- Cross-module spawn pointer chips. Linked records show as
               clickable chips with an inline unlink; unlinked kinds
               surface as "+ Link" pills that open the picker. -->
          <div class="tw:flex tw:flex-wrap tw:gap-1.5 tw:items-center">
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
            <button
              v-for="cfg in unlinkedKinds(finding)"
              :key="cfg.id"
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

          <!-- Inline status transitions. Only legal next states show. -->
          <div v-if="!readonly" class="tw:flex tw:flex-wrap tw:gap-1.5 tw:pt-1">
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
      v-if="linkDialogState.finding"
      v-model="linkDialogState.open"
      :finding="linkDialogState.finding"
      :kind="linkDialogState.kind"
    />
  </div>
</template>
