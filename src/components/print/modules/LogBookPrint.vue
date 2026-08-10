<script setup>
import { DateTime } from 'luxon'
import {
  flattenScalarFields,
  formatCellValue,
  defaultVisibleColumnKeys,
  fieldRecordStatusLabel,
} from '@/utils/logBookSchemaUtils.js'

/**
 * Log Book (multi-entry) print module.
 *
 * Self-contained: takes ?templateId=<id>&from=<yyyy-MM-dd>&to=<yyyy-MM-dd>&cols=<a,b,c>
 * from the route. Fetches every FieldRecord for that log book in the
 * date range, joins each row to its current revision for the payload,
 * and renders a wide audit-ready table inside PrintLayout.
 *
 * `cols` is the comma-separated list of scalar field names the user
 * selected on the in-app list; if missing, defaults to the first 4
 * scalar fields of the template's schema. This keeps printed output
 * consistent with what the user was looking at when they hit Print.
 *
 * PrintLayout supplies the company-branded header, footer, page
 * numbering, and the "Recent Audit History" appendix. We pass every
 * field_record id to auditEntities so the appendix shows changes that
 * touched any entry in the range.
 *
 * Auto-fires window.print() once records + template + revisions all
 * loaded.
 */

const props = defineProps({
  templateId: { type: String, default: null },
  from: { type: String, default: '' }, // yyyy-MM-dd
  to: { type: String, default: '' },
  // Comma-separated field names. Empty → use defaults.
  cols: { type: String, default: '' },
})

const template = useLiveQueryWithDeps(
  [() => props.templateId],

  async (db, [tid]) => {
    if (!tid) return null
    return db.LogBook.findByPk(tid)
  },
  { models: ['LogBook'] },
)

const records = useLiveQueryWithDeps(
  [() => props.templateId, () => props.from, () => props.to],
  async (db, [tid, from, to]) => {
    if (!tid) return []
    let rows = await db.FieldRecord.where('logBookId', tid).exec()
    if (from) {
      const fromMs = DateTime.fromISO(from).startOf('day').toMillis()
      rows = rows.filter((r) => (r.submittedAt?.toMillis?.() ?? 0) >= fromMs)
    }
    if (to) {
      const toMs = DateTime.fromISO(to).endOf('day').toMillis()
      rows = rows.filter((r) => (r.submittedAt?.toMillis?.() ?? 0) <= toMs)
    }
    return rows.sort(
      (a, b) => (a.submittedAt?.toMillis?.() ?? 0) - (b.submittedAt?.toMillis?.() ?? 0),
    )
  },

  { models: ['FieldRecord'], initial: [] },
)

// Pull only the current revisions for the records in view (one IDB
// scan + filter, not one fetch per row).
const payloadByRecordId = useLiveQueryWithDeps(
  [() => records.value],
  async (db, [recs]) => {
    const out = new Map()
    if (!recs?.length) return out
    const revIds = new Set(recs.map((r) => r.currentRevisionId).filter(Boolean))
    if (revIds.size === 0) return out
    const allRevs = await db.FieldRecordRevision.where().exec()
    const revsById = new Map()
    for (const rev of allRevs) {
      if (revIds.has(rev.id)) revsById.set(rev.id, rev)
    }
    for (const r of recs) {
      const rev = r.currentRevisionId ? revsById.get(r.currentRevisionId) : null
      out.set(r.id, rev?.payload ?? {})
    }
    return out
  },

  { models: ['FieldRecordRevision'], initial: new Map() },
)

function payloadFor(record) {
  return payloadByRecordId.value.get(record.id) ?? {}
}

const scalarFields = computed(() =>
  template.value ? flattenScalarFields(template.value.schema) : [],
)

// Visible columns: parse `?cols=a,b,c` if present, else fall back to
// the default first-N picker.
const visibleColumns = computed(() => {
  let keys
  if (props.cols) {
    const set = new Set(props.cols.split(','))
    // Preserve schema order while restricting to the chosen set.
    keys = scalarFields.value.map((f) => f.name).filter((n) => set.has(n))
  } else {
    keys = defaultVisibleColumnKeys(scalarFields.value)
  }
  return scalarFields.value.filter((f) => keys.includes(f.name))
})

// The table has 4 fixed columns (Entry ID / Submitted / Submitter / Status)
// plus one per chosen field. Once that runs past ~6 total it stops fitting
// portrait A4, so open in landscape by default; the user can flip it back.
const printOrientation = computed(() =>
  4 + visibleColumns.value.length > 6 ? 'landscape' : 'portrait',
)

// Submitter name resolution — one map for everyone in the range.
const submitterIds = computed(() => [
  ...new Set(records.value.map((r) => r.submittedByUserId).filter(Boolean)),
])

const userMap = useLiveQueryWithDeps(
  [() => submitterIds.value.join(',')],
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

function userName(id) {
  return id ? (userMap.value[id] ?? id) : '—'
}

function fmtDateTime(d) {
  if (!d) return '—'
  if (d.toFormat) return d.toFormat('LLL d, yyyy HH:mm')
  return new Date(d).toLocaleString()
}

const identifier = computed(() => {
  if (!template.value) return ''
  const codePart = template.value.code ?? ''
  const range = props.from || props.to ? ` · ${props.from || '…'} → ${props.to || '…'}` : ''
  return `${codePart} Log Book${range}`
})

const auditEntities = computed(() =>
  records.value.map((r) => ({ entityType: 'FieldRecords', entityId: r.id })),
)

const ready = computed(() => !!template.value)

onMounted(() => {
  const tryPrint = (attempts = 0) => {
    if (ready.value) {
      setTimeout(() => window.print(), 200)
      return
    }
    if (attempts < 20) setTimeout(() => tryPrint(attempts + 1), 200)
  }
  tryPrint()
})
</script>

<template>
  <PrintLayout
    :status="template?.recordClassification?.replace('_', ' ') ?? null"
    :identifier="identifier"
    :auditEntities="auditEntities"
    :showAudit="false"
    :defaultOrientation="printOrientation"
  >
    <template #title>
      <div class="lb-print-code">{{ template?.code }}</div>
      <h1 class="lb-print-title">{{ template?.title || 'Log Book' }}</h1>
      <table class="lb-print-meta">
        <tbody>
          <tr>
            <th>Log book</th>
            <td colspan="3">
              <strong>{{ template?.title || '—' }}</strong>
              <span v-if="template?.code" class="lb-print-meta-code"> · {{ template.code }} </span>
            </td>
          </tr>
          <tr>
            <th>Classification</th>
            <td>{{ template?.recordClassification?.replace('_', ' ') || '—' }}</td>
            <th>Entry count</th>
            <td>{{ records.length }}</td>
          </tr>
          <tr>
            <th>Date range</th>
            <td>{{ from || '—' }} → {{ to || '—' }}</td>
            <th>Columns shown</th>
            <td>{{ visibleColumns.length }} of {{ scalarFields.length }} scalar fields</td>
          </tr>
        </tbody>
      </table>
    </template>

    <div v-if="!ready" class="tw:py-10 tw:text-secondary tw:text-center">Loading log book…</div>
    <div v-else-if="records.length === 0" class="lb-print-empty">No entries in this range.</div>
    <div v-else class="lb-print-body">
      <table class="lb-print-entries">
        <thead>
          <tr>
            <th>Entry ID</th>
            <th>Submitted</th>
            <th>Submitter</th>
            <th>Status</th>
            <th v-for="col in visibleColumns" :key="col.name">
              {{ col.label || col.name }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in records" :key="r.id">
            <td class="lb-print-id">{{ r.recordNumber || r.id }}</td>
            <td>{{ fmtDateTime(r.submittedAt) }}</td>
            <td>{{ userName(r.submittedByUserId) }}</td>
            <td>{{ fieldRecordStatusLabel(r.statusId) }}</td>
            <td v-for="col in visibleColumns" :key="col.name">
              {{ formatCellValue(col, payloadFor(r)[col.name], { maxLength: 250 }) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </PrintLayout>
</template>

<style>
.lb-print-code {
  font-size: 11px;
  color: #6b7280;
  font-family: ui-monospace, SFMono-Regular, monospace;
  letter-spacing: 0.5px;
}
.lb-print-title {
  font-size: 22px;
  font-weight: 700;
  margin: 4px 0 14px;
  line-height: 1.25;
  color: var(--print-accent, #111827);
}
.lb-print-meta {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.lb-print-meta th {
  text-align: left;
  background: #f9fafb;
  padding: 6px 10px;
  border: 1px solid #e5e7eb;
  font-weight: 600;
  width: 16%;
}
.lb-print-meta td {
  padding: 6px 10px;
  border: 1px solid #e5e7eb;
  width: 34%;
}
.lb-print-meta-code {
  font-family: ui-monospace, SFMono-Regular, monospace;
  color: #6b7280;
  font-size: 10px;
}
.lb-print-body {
  font-size: 10px;
}
.lb-print-empty {
  padding: 30px 0;
  text-align: center;
  color: #6b7280;
  font-size: 12px;
}
.lb-print-entries {
  width: 100%;
  border-collapse: collapse;
  font-size: 10px;
}
.lb-print-entries th,
.lb-print-entries td {
  border: 1px solid #e5e7eb;
  padding: 4px 6px;
  text-align: left;
  vertical-align: top;
}
.lb-print-entries th {
  background: #f4f4f4;
  font-weight: 600;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: #6b7280;
}
.lb-print-entries tr:nth-child(even) td {
  background: #fafafa;
}
.lb-print-id {
  font-family: ui-monospace, SFMono-Regular, monospace;
  white-space: nowrap;
}
</style>
