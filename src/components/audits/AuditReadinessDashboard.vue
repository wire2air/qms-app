<script setup>
/**
 * Audit Readiness — the gaps an auditor would find, before the auditor does.
 *
 * One company-wide view of the QMS's open loops: quality records that have
 * been open too long, documents stuck in review or overdue for their periodic
 * review, trainings not completed, calibration past due, log-book entries
 * missed. Every row links to the record, and every row with a responsible
 * person can be NUDGED — an in-app + email notification asking them to close
 * it out before the audit.
 *
 * Entirely client-side over the synced models; the nudge is the one server
 * call (POST /v1/services/auditReadiness/nudge).
 */
import { DateTime } from 'luxon'
import {
  IconAlertTriangle,
  IconBell,
  IconCheck,
  IconClipboardX,
  IconFileAlert,
  IconNotebook,
  IconRuler2,
  IconSchool,
  IconShieldCheck,
} from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { isAllowed } from '@/utils/currentSession.js'

const toast = useToast()
const canNudge = computed(() => isAllowed(['audit_management:update']))

const now = DateTime.now()
const STALE_DAYS = 30
const staleCutoff = now.minus({ days: STALE_DAYS })
const soonCutoff = now.plus({ days: 30 })
const LIST_CAP = 8

// ── Source data (full scans — tenant-scale tables, filtered in memory) ──────
const ncs = useLiveQuery((db) => db.Nonconformance.where().exec(), {
  models: ['Nonconformance'],
  initial: [],
})
const capas = useLiveQuery((db) => db.Capa.where().exec(), { models: ['Capa'], initial: [] })
const qes = useLiveQuery((db) => db.QualityEvent.where().exec(), {
  models: ['QualityEvent'],
  initial: [],
})
const documents = useLiveQuery((db) => db.Document.where().exec(), {
  models: ['Document'],
  initial: [],
})
const versions = useLiveQuery((db) => db.DocumentVersion.where().exec(), {
  models: ['DocumentVersion'],
  initial: [],
})
const trainingInstances = useLiveQuery((db) => db.TrainingInstance.where().exec(), {
  models: ['TrainingInstance'],
  initial: [],
})
const trainingAssignees = useLiveQuery((db) => db.TrainingAssignee.where().exec(), {
  models: ['TrainingAssignee'],
  initial: [],
})
const equipments = useLiveQuery((db) => db.Equipment.where().exec(), {
  models: ['Equipment'],
  initial: [],
})
const assignmentInstances = useLiveQuery((db) => db.AssignmentInstance.where().exec(), {
  models: ['AssignmentInstance'],
  initial: [],
})
const formAssignments = useLiveQuery((db) => db.FormAssignment.where().exec(), {
  models: ['FormAssignment'],
  initial: [],
})
const logBooks = useLiveQuery((db) => db.LogBook.where().exec(), {
  models: ['LogBook'],
  initial: [],
})

function ageDays(dt) {
  if (!dt) return null
  return Math.max(0, Math.floor(now.diff(dt, 'days').days))
}

// ── 1. Quality records: open NC / CAPA / QE, stale past 30 days ─────────────
function recordRow(r, kind) {
  const cfg = {
    NC: { num: r.ncNumber, path: `/nonconformances/${r.id}`, type: 'Nonconformance', owner: r.ownerId },
    CAPA: { num: r.capaNumber, path: `/capas/${r.id}`, type: 'Capa', owner: r.ownerId },
    QE: {
      num: r.eventNumber,
      path: `/qualityEvents/${r.id}`,
      type: 'QualityEvent',
      owner: r.assignedToUserId || r.reportedByUserId,
    },
  }[kind]
  return {
    key: `${kind}-${r.id}`,
    kind,
    label: `${cfg.num || kind}: ${r.title}`,
    sub: `open ${ageDays(r.createdAt)} days`,
    ownerId: cfg.owner || null,
    to: getCompanyPath(cfg.path),
    resourceType: cfg.type,
    resourceId: r.id,
    stale: r.createdAt && r.createdAt < staleCutoff,
  }
}

const qualityRecords = computed(() => {
  const open = [
    ...ncs.value.filter((r) => r.statusId === 'OPEN').map((r) => recordRow(r, 'NC')),
    ...capas.value.filter((r) => r.statusId === 'OPEN').map((r) => recordRow(r, 'CAPA')),
    ...qes.value.filter((r) => r.statusId === 'OPEN').map((r) => recordRow(r, 'QE')),
  ]
  const stale = open.filter((r) => r.stale)
  // Oldest first — the worst offender is the first thing on the list.
  stale.sort((a, b) => b.sub.localeCompare(a.sub, undefined, { numeric: true }))
  return {
    openCount: open.length,
    byKind: {
      NC: open.filter((r) => r.kind === 'NC').length,
      CAPA: open.filter((r) => r.kind === 'CAPA').length,
      QE: open.filter((r) => r.kind === 'QE').length,
    },
    gapCount: stale.length,
    rows: stale,
  }
})

// ── 2. Documents: versions stuck in review + overdue periodic reviews ───────
const PENDING_VERSION_STATUSES = new Set(['IN_REVIEW', 'CHANGES_REQUESTED'])
const APPROVED_LIKE = new Set(['APPROVED', 'EFFECTIVE', 'SUPERSEDED'])

const documentGaps = computed(() => {
  const docById = new Map(documents.value.map((d) => [d.id, d]))

  const pending = []
  const everApproved = new Set()
  for (const v of versions.value) {
    if (APPROVED_LIKE.has(v.statusId)) everApproved.add(v.documentId)
    if (!PENDING_VERSION_STATUSES.has(v.statusId)) continue
    const doc = docById.get(v.documentId)
    if (!doc || doc.statusId === 'ARCHIVED') continue
    pending.push({
      key: `docv-${v.id}`,
      label: `${doc.docNumber || 'Doc'}: ${doc.title} — v${v.versionMajor}.${v.versionMinor}`,
      sub: v.statusId === 'IN_REVIEW' ? 'awaiting approval' : 'changes requested',
      ownerId: doc.userId || null,
      to: getCompanyPath(`/documents/${doc.id}`),
      resourceType: 'Document',
      resourceId: doc.id,
    })
  }

  // Periodic review is only meaningful once a document has ever been approved
  // — a doc still fully in draft has nothing to re-confirm.
  const reviewOverdue = []
  for (const doc of documents.value) {
    if (doc.statusId === 'ARCHIVED' || !everApproved.has(doc.id)) continue
    const baseline = doc.lastReviewedAt || doc.createdAt
    if (!baseline) continue
    const due = baseline.plus({ months: doc.periodicReviewMonths || 12 })
    if (due >= now) continue
    reviewOverdue.push({
      key: `docr-${doc.id}`,
      label: `${doc.docNumber || 'Doc'}: ${doc.title}`,
      sub: `review overdue by ${ageDays(due)} days`,
      ownerId: doc.userId || null,
      to: getCompanyPath(`/documents/${doc.id}`),
      resourceType: 'Document',
      resourceId: doc.id,
    })
  }
  reviewOverdue.sort((a, b) => b.sub.localeCompare(a.sub, undefined, { numeric: true }))

  return { pending, reviewOverdue, gapCount: pending.length + reviewOverdue.length }
})

// ── 3. Training: people who have not completed assigned training ────────────
const trainingGaps = computed(() => {
  const pendingByInstance = new Map()
  for (const a of trainingAssignees.value) {
    if (a.removedAt || a.status === 'COMPLETED') continue
    pendingByInstance.set(a.trainingInstanceId, (pendingByInstance.get(a.trainingInstanceId) || 0) + 1)
  }
  const rows = []
  let pendingPeople = 0
  for (const ti of trainingInstances.value) {
    if (ti.status !== 'ACTIVE') continue
    const pending = pendingByInstance.get(ti.id) || 0
    if (!pending) continue
    pendingPeople += pending
    const overdue = ti.dueDate && ti.dueDate < now
    rows.push({
      key: `tr-${ti.id}`,
      label: ti.snapshot?.title || 'Training',
      sub: `${pending} pending${overdue ? ` · overdue since ${ti.dueDate.formatDate('date')}` : ti.dueDate ? ` · due ${ti.dueDate.formatDate('date')}` : ''}`,
      ownerId: ti.managerId || ti.createdBy || null,
      to: getCompanyPath(`/training-instances/${ti.id}`),
      resourceType: 'TrainingInstance',
      resourceId: ti.id,
      overdue: !!overdue,
    })
  }
  rows.sort((a, b) => Number(b.overdue) - Number(a.overdue))
  return { rows, pendingPeople, gapCount: rows.filter((r) => r.overdue).length }
})

// ── 4. Equipment: calibration overdue / due within 30 days ──────────────────
const equipmentGaps = computed(() => {
  const overdue = []
  const dueSoon = []
  for (const e of equipments.value) {
    if (!e.requiresCalibration || e.statusId !== 'IN_SERVICE' || !e.nextCalibrationDue) continue
    const row = {
      key: `eq-${e.id}`,
      label: `${e.name}${e.code ? ` (${e.code})` : ''}`,
      sub:
        e.nextCalibrationDue < now
          ? `calibration overdue since ${e.nextCalibrationDue.formatDate('date')}`
          : `calibration due ${e.nextCalibrationDue.formatDate('date')}`,
      ownerId: e.ownerUserId || null,
      to: getCompanyPath('/equipment'),
      resourceType: 'Equipment',
      resourceId: e.id,
    }
    if (e.nextCalibrationDue < now) overdue.push(row)
    else if (e.nextCalibrationDue <= soonCutoff) dueSoon.push(row)
  }
  return { overdue, dueSoon, gapCount: overdue.length }
})

// ── 5. Log books: due-now, overdue and recently missed entries ──────────────
const logBookGaps = computed(() => {
  const bookByAssignment = new Map()
  const bookById = new Map(logBooks.value.map((b) => [b.id, b]))
  for (const fa of formAssignments.value) bookByAssignment.set(fa.id, fa.logBookId)

  const rows = []
  let missedRecently = 0
  for (const ai of assignmentInstances.value) {
    const late = ai.statusId === 'OVERDUE' || (ai.statusId === 'DUE' && ai.dueAt && ai.dueAt < now)
    const missed = ai.statusId === 'MISSED' && ai.missedAt && ai.missedAt > staleCutoff
    if (missed) missedRecently += 1
    if (!late && !missed) continue
    const book = bookById.get(bookByAssignment.get(ai.formAssignmentId))
    rows.push({
      key: `lb-${ai.id}`,
      label: book?.title || 'Log book entry',
      sub: missed
        ? `missed ${ai.missedAt.formatDate('date')}`
        : `due ${ai.dueAt ? ai.dueAt.formatDate('date') : '—'}`,
      ownerId: ai.assignedToUserId || null,
      to: book
        ? getCompanyPath(`/inspections-logs/log-books/${book.id}`)
        : getCompanyPath('/inspections-logs/log-books'),
      resourceType: 'LogBook',
      resourceId: book?.id || null,
      missed,
    })
  }
  rows.sort((a, b) => Number(b.missed) - Number(a.missed))
  return { rows, missedRecently, gapCount: rows.length }
})

// ── Overall posture ─────────────────────────────────────────────────────────
const totalGaps = computed(
  () =>
    qualityRecords.value.gapCount +
    documentGaps.value.gapCount +
    trainingGaps.value.gapCount +
    equipmentGaps.value.gapCount +
    logBookGaps.value.gapCount,
)

// ── Nudge ───────────────────────────────────────────────────────────────────
const nudged = ref({}) // row.key -> true
const nudging = ref(null)

async function nudge(row) {
  if (!row.ownerId) return
  nudging.value = row.key
  try {
    await post(
      '/v1/services/auditReadiness/nudge',
      {
        userId: row.ownerId,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        recordLabel: row.label.slice(0, 300),
      },
      { showError: true },
    )
    nudged.value[row.key] = true
    toast.success('Responsible party notified.')
  } catch {
    /* toast shown by showError */
  } finally {
    nudging.value = null
  }
}

const SECTIONS = computed(() => [
  {
    id: 'records',
    title: 'Aging quality records',
    icon: IconClipboardX,
    gapCount: qualityRecords.value.gapCount,
    okText: `No open NC / CAPA / quality event older than ${STALE_DAYS} days.`,
    summary: `${qualityRecords.value.byKind.NC} NC · ${qualityRecords.value.byKind.CAPA} CAPA · ${qualityRecords.value.byKind.QE} QE open — ${qualityRecords.value.gapCount} older than ${STALE_DAYS} days`,
    rows: qualityRecords.value.rows,
    viewAll: [
      { label: 'NCs', to: getCompanyPath('/nonconformances') },
      { label: 'CAPAs', to: getCompanyPath('/capas') },
      { label: 'Quality Events', to: getCompanyPath('/qualityEvents') },
    ],
  },
  {
    id: 'documents',
    title: 'Documents',
    icon: IconFileAlert,
    gapCount: documentGaps.value.gapCount,
    okText: 'Nothing stuck in review; all periodic reviews current.',
    summary: `${documentGaps.value.pending.length} awaiting review/approval · ${documentGaps.value.reviewOverdue.length} periodic reviews overdue`,
    rows: [...documentGaps.value.reviewOverdue, ...documentGaps.value.pending],
    viewAll: [{ label: 'Documents', to: getCompanyPath('/documents') }],
  },
  {
    id: 'training',
    title: 'Training',
    icon: IconSchool,
    gapCount: trainingGaps.value.gapCount,
    okText: 'No overdue training.',
    summary: `${trainingGaps.value.pendingPeople} people with pending training across ${trainingGaps.value.rows.length} trainings`,
    rows: trainingGaps.value.rows,
    viewAll: [{ label: 'Trainings', to: getCompanyPath('/trainings') }],
  },
  {
    id: 'equipment',
    title: 'Equipment calibration',
    icon: IconRuler2,
    gapCount: equipmentGaps.value.gapCount,
    okText: 'No calibration overdue.',
    summary: `${equipmentGaps.value.overdue.length} overdue · ${equipmentGaps.value.dueSoon.length} due within 30 days`,
    rows: [...equipmentGaps.value.overdue, ...equipmentGaps.value.dueSoon],
    viewAll: [{ label: 'Equipment', to: getCompanyPath('/equipment') }],
  },
  {
    id: 'logbooks',
    title: 'Log books',
    icon: IconNotebook,
    gapCount: logBookGaps.value.gapCount,
    okText: 'All log-book entries on schedule.',
    summary: `${logBookGaps.value.rows.length} entries late or missed in the last ${STALE_DAYS} days`,
    rows: logBookGaps.value.rows,
    viewAll: [{ label: 'Log Books', to: getCompanyPath('/inspections-logs/log-books') }],
  },
])

const expanded = ref({}) // section id -> show all rows
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <!-- Posture banner -->
    <BaseCard
      class="tw:flex tw:items-center tw:gap-3"
      :class="totalGaps === 0 ? 'tw:border-emerald-300' : 'tw:border-amber-300'"
    >
      <div
        class="tw:size-10 tw:rounded-lg tw:flex tw:items-center tw:justify-center"
        :class="
          totalGaps === 0
            ? 'tw:bg-emerald-100 tw:text-emerald-700'
            : 'tw:bg-amber-100 tw:text-amber-700'
        "
      >
        <IconShieldCheck v-if="totalGaps === 0" :size="20" />
        <IconAlertTriangle v-else :size="20" />
      </div>
      <div class="tw:flex tw:flex-col">
        <span class="tw:text-lg tw:font-semibold tw:text-on-main">
          {{ totalGaps === 0 ? 'Audit ready' : `${totalGaps} gaps need attention` }}
        </span>
        <BaseText color="secondary" class="tw:text-sm">
          {{
            totalGaps === 0
              ? 'No stale records, overdue reviews, pending trainings, calibration or log-book gaps.'
              : 'These are the open loops an auditor would find. Each row links to the record; Notify pokes the person responsible.'
          }}
        </BaseText>
      </div>
    </BaseCard>

    <!-- Area cards -->
    <div class="tw:grid tw:grid-cols-2 tw:md:grid-cols-5 tw:gap-3">
      <BaseCard
        v-for="s in SECTIONS"
        :key="s.id"
        class="tw:flex tw:items-center tw:gap-3"
      >
        <div
          class="tw:size-10 tw:shrink-0 tw:rounded-lg tw:flex tw:items-center tw:justify-center"
          :class="
            s.gapCount === 0
              ? 'tw:bg-emerald-100 tw:text-emerald-700'
              : 'tw:bg-red-100 tw:text-red-700'
          "
        >
          <component :is="s.icon" :size="20" />
        </div>
        <div class="tw:flex tw:flex-col tw:min-w-0">
          <span class="tw:text-2xl tw:font-bold tw:text-on-main">{{ s.gapCount }}</span>
          <BaseText variant="overline" class="tw:truncate">{{ s.title }}</BaseText>
        </div>
      </BaseCard>
    </div>

    <!-- Sections -->
    <BaseCard v-for="s in SECTIONS" :key="s.id">
      <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:pb-3 tw:border-b tw:border-divider tw:mb-3">
        <component :is="s.icon" :size="18" class="tw:text-secondary" />
        <BaseText weight="semibold">{{ s.title }}</BaseText>
        <BaseBadge
          :class="
            s.gapCount === 0
              ? 'tw:bg-emerald-100 tw:text-emerald-700'
              : 'tw:bg-red-100 tw:text-red-700'
          "
        >
          {{ s.gapCount === 0 ? 'OK' : `${s.gapCount} gaps` }}
        </BaseBadge>
        <span class="tw:flex-1" />
        <RouterLink
          v-for="link in s.viewAll"
          :key="link.label"
          :to="link.to"
          class="tw:text-xs tw:text-primary tw:hover:underline"
        >
          {{ link.label }} →
        </RouterLink>
      </div>

      <BaseText color="secondary" class="tw:block tw:text-sm tw:mb-2">{{ s.summary }}</BaseText>

      <div v-if="!s.rows.length" class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-emerald-700">
        <IconCheck :size="16" /> {{ s.okText }}
      </div>

      <div v-else class="tw:divide-y tw:divide-divider">
        <div
          v-for="row in expanded[s.id] ? s.rows : s.rows.slice(0, LIST_CAP)"
          :key="row.key"
          class="tw:flex tw:items-center tw:gap-3 tw:py-2"
        >
          <div class="tw:min-w-0 tw:flex-1">
            <RouterLink :to="row.to" class="tw:text-sm tw:font-medium tw:text-on-main tw:hover:text-primary tw:hover:underline">
              {{ row.label }}
            </RouterLink>
            <BaseText color="secondary" class="tw:block tw:text-xs">{{ row.sub }}</BaseText>
          </div>
          <UserBadgeById v-if="row.ownerId" :userId="row.ownerId" class="tw:hidden tw:sm:inline-flex" />
          <BaseButton
            v-if="canNudge && row.ownerId"
            variant="outline"
            size="sm"
            :disabled="!!nudged[row.key]"
            :isLoading="nudging === row.key"
            @click="nudge(row)"
          >
            <template #icon><IconBell :size="14" /></template>
            {{ nudged[row.key] ? 'Notified' : 'Notify' }}
          </BaseButton>
        </div>
        <button
          v-if="s.rows.length > LIST_CAP && !expanded[s.id]"
          class="tw:w-full tw:py-2 tw:text-xs tw:text-primary tw:hover:underline tw:bg-transparent tw:border-0 tw:cursor-pointer tw:text-left"
          @click="expanded[s.id] = true"
        >
          Show all {{ s.rows.length }}
        </button>
      </div>
    </BaseCard>
  </div>
</template>
