<script setup>
import '../recordPrint.css'
import { consumeListPrintHandoff } from '@/composables/useListPrint.js'

/**
 * Generic register printout — one table of records for any list page.
 *
 * Eight list pages needed "print what I'm looking at", and eight bespoke print
 * modules would have been eight copies of the same table. Instead each entity
 * declares its columns in REGISTERS below, and this renders them.
 *
 * Invoked as /print?module=RecordList&entity=Capa&scope=current&key=…
 *   scope=current — rows come from the id list the list page stashed (see
 *                   useListPrint for why ids travel through localStorage)
 *   scope=all     — every row of the entity, re-queried here
 *
 * A register is evidence, so the header states what it is a list of and how
 * many rows there are. A printout that quietly omitted the filter would be
 * indistinguishable from a complete register.
 */

const props = defineProps({
  entity: { type: String, default: null },
  scope: { type: String, default: 'all' },
  title: { type: String, default: null },
})

const route = useRoute()
// `key` is reserved by Vue and can never be a prop — PrintShell forwards the
// whole query as props, so this one has to be read off the route directly.
const handoffKey = computed(() => route.query?.key ?? null)

/**
 * Column definitions per entity. `value` gets (row, ctx) where ctx carries the
 * resolved lookup maps — keep them cheap and synchronous.
 */
const REGISTERS = {
  Capa: {
    title: 'CAPA Register',
    columns: [
      { label: 'CAPA #', value: (r) => r.capaNumber },
      { label: 'Title', value: (r) => r.title, wide: true },
      { label: 'Type', value: (r) => r.typeId },
      { label: 'Priority', value: (r) => r.priorityId },
      { label: 'Owner', value: (r, c) => c.userName(r.ownerId) },
      { label: 'Initiated', value: (r, c) => c.fmtDate(r.initiatedAt) },
      { label: 'Due', value: (r, c) => c.fmtDate(r.dueDate) },
      { label: 'Status', value: (r) => r.statusId },
    ],
  },
  Nonconformance: {
    title: 'Nonconformance Register',
    columns: [
      { label: 'NC #', value: (r) => r.ncNumber },
      { label: 'Title', value: (r) => r.title, wide: true },
      { label: 'Severity', value: (r) => r.severityId },
      { label: 'Owner', value: (r, c) => c.userName(r.ownerId) },
      { label: 'Detected', value: (r, c) => c.fmtDate(r.detectedAt) },
      { label: 'Due', value: (r, c) => c.fmtDate(r.dueDate) },
      { label: 'Status', value: (r) => r.statusId },
    ],
  },
  ChangeRequest: {
    title: 'Change Control Register',
    columns: [
      { label: 'CR #', value: (r) => r.crNumber },
      { label: 'Title', value: (r) => r.title, wide: true },
      { label: 'Priority', value: (r) => r.priorityId },
      { label: 'Owner', value: (r, c) => c.userName(r.ownerId) },
      { label: 'Initiated', value: (r, c) => c.fmtDate(r.initiatedAt) },
      { label: 'Target', value: (r, c) => c.fmtDate(r.targetImplementationDate) },
      { label: 'Status', value: (r) => r.statusId },
    ],
  },
  QualityEvent: {
    title: 'Quality Event Register',
    columns: [
      { label: 'Event #', value: (r) => r.eventNumber },
      { label: 'Title', value: (r) => r.title, wide: true },
      { label: 'Reported', value: (r, c) => c.fmtDate(r.reportedDate) },
      { label: 'Occurred', value: (r, c) => c.fmtDate(r.occurrenceDate) },
      { label: 'Assigned', value: (r, c) => c.userName(r.assignedToUserId) },
      { label: 'Status', value: (r) => r.statusId },
    ],
  },
  Document: {
    title: 'Document Register',
    columns: [
      { label: 'Doc #', value: (r) => r.docNumber },
      { label: 'Title', value: (r) => r.title, wide: true },
      { label: 'Owner', value: (r, c) => c.userName(r.authorId || r.userId) },
      {
        label: 'Review every',
        value: (r) => (r.periodicReviewMonths ? `${r.periodicReviewMonths} mo` : '—'),
      },
      { label: 'Last reviewed', value: (r, c) => c.fmtDate(r.lastReviewedAt) },
      { label: 'Status', value: (r) => r.statusId },
    ],
  },
  AuditInstance: {
    title: 'Audit Register',
    columns: [
      { label: 'Audit #', value: (r) => r.auditNumber || r.id?.slice(0, 8) },
      { label: 'Type', value: (r) => r.programTypeId },
      { label: 'Lead', value: (r, c) => c.userName(r.leadAuditorUserId) },
      { label: 'Scheduled', value: (r, c) => c.fmtDate(r.scheduledDate) },
      { label: 'Status', value: (r) => r.statusId },
    ],
  },
  InspectionLot: {
    title: 'Inspection Lot Register',
    columns: [
      { label: 'QC #', value: (r) => r.lotNumber },
      { label: 'Point', value: (r) => r.inspectionPoint },
      { label: 'Batch', value: (r) => r.batchNumber },
      { label: 'Sample', value: (r) => r.sampleSize },
      { label: 'Created', value: (r, c) => c.fmtDate(r.createdAt) },
      { label: 'Status', value: (r) => r.statusId },
    ],
  },
  Record: {
    title: 'Submission Register',
    columns: [
      { label: 'Record #', value: (r) => r.recordNumber },
      { label: 'Title', value: (r) => r.title, wide: true },
      { label: 'Submitted by', value: (r, c) => c.userName(r.createdBy || r.userId) },
      { label: 'Created', value: (r, c) => c.fmtDate(r.createdAt) },
      { label: 'Status', value: (r) => r.statusId },
    ],
  },
}

const register = computed(() => REGISTERS[props.entity] ?? null)

// Read the handoff exactly once. A computed would re-run and find it already
// consumed, blanking the list on the next tick.
const handoff = ref(null)
const handoffRead = ref(false)
if (!handoffRead.value) {
  handoff.value = consumeListPrintHandoff(handoffKey.value)
  handoffRead.value = true
}

const wantedIds = computed(() => {
  if (props.scope !== 'current') return null
  const ids = handoff.value?.ids
  return Array.isArray(ids) ? ids : null
})

const rows = useLiveQueryWithDeps(
  [() => props.entity, () => (wantedIds.value ?? []).join(','), () => props.scope],
  async (db, [entity, idsStr, scope]) => {
    if (!entity || !db[entity]) return []
    const all = await db[entity].where().exec()
    if (scope !== 'current') return all
    const ids = idsStr ? idsStr.split(',') : []
    // Preserve the list page's ordering — the printout should match the screen.
    const byId = new Map(all.map((r) => [r.id, r]))
    return ids.map((id) => byId.get(id)).filter(Boolean)
  },
  { models: [], initial: [] },
)

// Owner / assignee columns are ids on the row; resolve them in one pass.
const userIds = computed(() => {
  const set = new Set()
  for (const r of rows.value) {
    for (const k of [
      'ownerId',
      'authorId',
      'userId',
      'createdBy',
      'assignedToUserId',
      'leadAuditorUserId',
    ]) {
      if (r[k]) set.add(r[k])
    }
  }
  return [...set]
})

const userMap = useLiveQueryWithDeps(
  [() => userIds.value.join(',')],
  async (db, [idsStr]) => {
    const ids = idsStr ? idsStr.split(',') : []
    if (!ids.length) return {}
    const users = await Promise.all(ids.map((id) => db.User.findByPk(id)))
    const map = {}
    for (const u of users.filter(Boolean)) {
      map[u.id] = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.id
    }
    return map
  },
  { models: ['User'], initial: {} },
)

function fmtDate(d) {
  if (!d) return '—'
  if (d.toFormat) return d.toFormat('LLL d, yyyy')
  return new Date(d).toLocaleDateString()
}

function userName(id) {
  return id ? (userMap.value[id] ?? '—') : '—'
}

const ctx = computed(() => ({ userName, fmtDate }))

function cell(row, col) {
  const v = col.value(row, ctx.value)
  return v === null || v === undefined || v === '' ? '—' : v
}

const heading = computed(() => props.title || register.value?.title || 'Register')

// Say what this is a list of. "All records" is a claim worth printing
// explicitly — otherwise a filtered register and a complete one look identical.
const scopeLabel = computed(() => {
  if (props.scope !== 'current') return 'All records'
  const label = handoff.value?.filterLabel
  return label ? `Filtered view — ${label}` : 'Filtered view'
})

const identifier = computed(() => `${heading.value} · ${rows.value.length} record(s)`)

const ready = computed(() => !!register.value)

onMounted(() => {
  const tryPrint = (attempts = 0) => {
    // Wait for the rows too: a register that prints before its data arrives is
    // an empty page that looks like an empty register.
    if (ready.value && (rows.value.length > 0 || attempts >= 12)) {
      setTimeout(() => window.print(), 250)
      return
    }
    if (attempts < 20) setTimeout(() => tryPrint(attempts + 1), 200)
  }
  tryPrint()
})
</script>

<template>
  <PrintLayout :identifier="identifier" :showAudit="false" defaultOrientation="landscape">
    <template #title>
      <h1 class="qp-title">{{ heading }}</h1>
      <div class="qp-workflow">
        {{ scopeLabel }} · <strong>{{ rows.length }}</strong> record{{
          rows.length === 1 ? '' : 's'
        }}
      </div>
    </template>

    <div v-if="!register" class="tw:py-10 tw:text-secondary tw:text-center">
      Unknown register “{{ entity }}”.
    </div>
    <div v-else class="qp-body">
      <table class="qp-effectiveness">
        <thead>
          <tr>
            <th v-for="col in register.columns" :key="col.label">{{ col.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td
              v-for="col in register.columns"
              :key="col.label"
              :class="col.wide ? 'qp-col-wide' : null"
            >
              {{ cell(row, col) }}
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td :colspan="register.columns.length" class="qp-empty-row">
              No records match this view.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </PrintLayout>
</template>
