<script setup>
/**
 * QC Inspection report (one inspection lot).
 *
 * Self-contained: reads its `id` query param, fetches the lot + item/supplier +
 * captured results + production lots via SyncEngine, and renders the shared
 * PrintLayout (company header/logo/footer + audit + signatures) with an
 * inspection title block, sampling summary, production-lot / line-clearance
 * table, per-characteristic results, and the disposition. Auto-fires
 * window.print() once the data is loaded (mirrors CapaPrint / DocumentPrint).
 */
const props = defineProps({
  id: { type: String, default: null },
})

const POINT_LABELS = {
  INCOMING: 'Incoming (IQC)',
  IN_PROCESS: 'In-process (IPQC)',
  FINAL: 'Final (FQC)',
  OUTGOING: 'Outgoing (OQC)',
}

const lot = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => (id ? db.InspectionLot.findByPk(id) : null),
  { models: ['InspectionLot'] },
)
const product = useLiveQueryWithDeps(
  [() => lot.value?.productId],
  async (db, [id]) => (id ? db.Product.findByPk(id) : null),
  { models: ['Product'] },
)
const supplier = useLiveQueryWithDeps(
  [() => lot.value?.supplierId],
  async (db, [id]) => (id ? db.Supplier.findByPk(id) : null),
  { models: ['Supplier'] },
)
const disposition = useLiveQueryWithDeps(
  [() => lot.value?.dispositionTypeId],
  async (db, [id]) => (id ? db.NcDispositionType.findByPk(id) : null),
  { models: ['NcDispositionType'] },
)
const results = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => (id ? db.InspectionResult.where('inspectionLotId', id).exec() : []),
  { models: ['InspectionResult'], initial: [] },
)
const batches = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) =>
    id ? (await db.InspectionBatch.where('inspectionLotId', id).exec()).sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0)) : [],
  { models: ['InspectionBatch'], initial: [] },
)
const samples = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => (id ? db.InspectionSample.where('inspectionLotId', id).orderBy('sampleNo', 'asc').exec() : []),
  { models: ['InspectionSample'], initial: [] },
)
const users = useLiveQuery(async (db) => db.User.where().exec(), { models: ['User'], initial: [] })
const userName = (id) => {
  const u = users.value.find((x) => x.id === id)
  return u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email : '—'
}

const isInProcess = computed(() => lot.value?.inspectionPoint === 'IN_PROCESS')
const sampling = computed(() => lot.value?.samplingSnapshot || null)
const characteristics = computed(() => lot.value?.specSnapshot?.characteristics ?? [])

function humanize(v) {
  return v ? String(v).toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '—'
}
function fmtDate(d) {
  return d?.formatDate ? d.formatDate('date') : '—'
}
function fmtDateTime(d) {
  return d?.formatDate ? d.formatDate('datetime') : '—'
}

// Per-characteristic roll-up of the captured results.
const charRows = computed(() => {
  const byChar = {}
  for (const r of results.value) (byChar[r.characteristicId] ??= []).push(r)
  return characteristics.value.map((c) => {
    const rs = byChar[c.id] ?? []
    const pass = rs.filter((r) => r.outcome === 'PASS').length
    const fail = rs.filter((r) => r.outcome === 'FAIL').length
    const single = rs.find((r) => (r.sampleIndex ?? 1) === 1) ?? rs[0]
    const value =
      single == null
        ? ''
        : single.valueNumeric != null
          ? single.valueNumeric
          : single.valueText != null && single.valueText !== ''
            ? single.valueText
            : single.valueBool != null
              ? single.valueBool
                ? 'Pass'
                : 'Fail'
              : ''
    const outcome = fail > 0 ? 'FAIL' : rs.length ? 'PASS' : '—'
    return { c, count: rs.length, pass, fail, value, outcome }
  })
})
function specText(c) {
  const parts = []
  if (c.targetValue != null) parts.push(`Target ${c.targetValue}`)
  if (c.lsl != null || c.usl != null) parts.push(`${c.lsl ?? '−∞'} … ${c.usl ?? '+∞'}`)
  return [parts.join(', '), c.uom].filter(Boolean).join(' ') || '—'
}

// In-process: one row per collected sample (time + lot#), a cell per test.
const batchLotById = computed(() => {
  const m = {}
  for (const b of batches.value) m[b.id] = b.lotNumber || ''
  return m
})
function resultCell(sampleNo, charId) {
  const r = results.value.find((x) => (x.sampleIndex ?? 1) === sampleNo && x.characteristicId === charId)
  if (!r) return { text: '—', fail: false }
  const v =
    r.valueNumeric != null
      ? r.valueNumeric
      : r.valueText != null && r.valueText !== ''
        ? r.valueText
        : r.valueBool != null
          ? r.valueBool
            ? 'Pass'
            : 'Fail'
          : ''
  return { text: v === '' ? '—' : v, fail: r.outcome === 'FAIL' }
}
// Group collected samples into collections (a "Collect" action stamps its
// samples with the same time). Columns = collections (time + lot#); rows = tests.
const collections = computed(() => {
  const map = new Map()
  for (const s of samples.value) {
    const key = s.collectedAt?.toMillis?.() ?? String(s.collectedAt)
    if (!map.has(key)) {
      map.set(key, { at: s.collectedAt, lotNo: batchLotById.value[s.batchId] || '', samples: [] })
    }
    map.get(key).samples.push(s)
  }
  return [...map.values()].sort((a, b) => (a.at?.toMillis?.() ?? 0) - (b.at?.toMillis?.() ?? 0))
})
// A cell = the result(s) of the collection's sample(s) for one test.
function cellFor(charId, collection) {
  const parts = []
  let fail = false
  for (const s of collection.samples) {
    const r = resultCell(s.sampleNo, charId)
    if (r.text !== '—') parts.push(r.text)
    if (r.fail) fail = true
  }
  return { text: parts.length ? parts.join(', ') : '—', fail }
}
function fmtTime(d) {
  return d?.formatDate ? d.formatDate('time') : '—'
}

const identifier = computed(() => lot.value?.lotNumber ?? '')
const auditEntities = computed(() => (props.id ? [{ entityType: 'InspectionLot', entityId: props.id }] : []))

const ready = computed(() => !!lot.value)
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
  <PrintLayout :status="lot?.statusId" :identifier="identifier" :auditEntities="auditEntities">
    <template #title>
      <div class="qc-print-num">{{ lot?.lotNumber }}</div>
      <h1 class="qc-print-title">Inspection Report</h1>
      <table class="qc-print-meta">
        <tbody>
          <tr>
            <th>Inspection #</th>
            <td>{{ lot?.lotNumber || '—' }}</td>
            <th>Status</th>
            <td>{{ humanize(lot?.statusId) }}</td>
          </tr>
          <tr>
            <th>Inspection point</th>
            <td>{{ POINT_LABELS[lot?.inspectionPoint] || lot?.inspectionPoint || '—' }}</td>
            <th>Disposition</th>
            <td>{{ disposition?.name || '—' }}</td>
          </tr>
          <tr>
            <th>Item</th>
            <td>{{ product?.name || '—' }}<span v-if="product?.sku"> · {{ product.sku }}</span></td>
            <th>Supplier</th>
            <td>{{ supplier?.name || '—' }}</td>
          </tr>
          <tr>
            <th>Quantity</th>
            <td>{{ lot?.quantity ?? '—' }}</td>
            <th>Sample size</th>
            <td>{{ lot?.sampleSize ?? '—' }}</td>
          </tr>
          <tr>
            <th>Batch / Lot ref</th>
            <td>{{ lot?.batchNumber || '—' }}</td>
            <th>Inspector</th>
            <td>{{ lot?.assignedTo ? userName(lot.assignedTo) : '—' }}</td>
          </tr>
          <tr>
            <th>Manufactured</th>
            <td>{{ fmtDate(lot?.manufacturingDate) }}</td>
            <th>Expiry</th>
            <td>{{ fmtDate(lot?.expiryDate) }}</td>
          </tr>
          <tr>
            <th>Created</th>
            <td>{{ fmtDate(lot?.createdAt) }}</td>
            <th>Created by</th>
            <td>{{ lot?.createdBy ? userName(lot.createdBy) : '—' }}</td>
          </tr>
        </tbody>
      </table>
    </template>

    <!-- Sampling / AQL -->
    <section v-if="sampling" class="qc-print-section">
      <h2>Sampling</h2>
      <table class="qc-print-table">
        <tbody>
          <tr>
            <th>Plan</th>
            <td>{{ sampling.name || '—' }}</td>
            <th>Standard · Level</th>
            <td>{{ sampling.standardCode || '—' }}<span v-if="sampling.inspectionLevel"> · {{ String(sampling.inspectionLevel).replace(/^S_/, 'S-') }}</span></td>
          </tr>
          <tr>
            <th>Code letter</th>
            <td>{{ sampling.codeLetter || '—' }}</td>
            <th>Sample size</th>
            <td>{{ lot?.sampleSize ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
      <table v-if="sampling.perSeverity?.length" class="qc-print-table qc-print-table--grid">
        <thead>
          <tr><th>Severity</th><th>AQL %</th><th>Accept ≤</th><th>Reject ≥</th></tr>
        </thead>
        <tbody>
          <tr v-for="p in sampling.perSeverity" :key="p.severity">
            <td>{{ p.severity }}</td><td>{{ p.aql }}</td><td>{{ p.accept }}</td><td>{{ p.reject }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Production lots + line clearance (in-process) -->
    <section v-if="isInProcess && batches.length" class="qc-print-section">
      <h2>Production Lots &amp; Line Clearance</h2>
      <table class="qc-print-table qc-print-table--grid">
        <thead>
          <tr><th>Lot #</th><th>Line clearance</th><th>Cleared by</th><th>At</th></tr>
        </thead>
        <tbody>
          <tr v-for="b in batches" :key="b.id">
            <td>{{ b.lotNumber || '—' }}<span v-if="b.closedAt"> (closed)</span></td>
            <td>{{ b.lineClearanceStatus === 'PASSED' ? 'Released' : b.lineClearanceStatus === 'FAILED' ? 'Held' : '—' }}</td>
            <td>{{ b.lineClearanceBy ? userName(b.lineClearanceBy) : '—' }}</td>
            <td>{{ fmtDateTime(b.lineClearanceAt) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Results -->
    <section class="qc-print-section">
      <h2>Results</h2>
      <table v-if="charRows.length" class="qc-print-table qc-print-table--grid">
        <thead>
          <tr><th>Characteristic</th><th>Specification</th><th>Result</th><th>Outcome</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in charRows" :key="row.c.id">
            <td>{{ row.c.name }}<span v-if="row.c.code" class="qc-print-muted"> · {{ row.c.code }}</span></td>
            <td>{{ specText(row.c) }}</td>
            <td>
              <template v-if="row.count > 1">{{ row.pass }} pass / {{ row.fail }} fail of {{ row.count }}</template>
              <template v-else>{{ row.value === '' ? '—' : row.value }}</template>
            </td>
            <td :class="row.outcome === 'FAIL' ? 'qc-print-bad' : row.outcome === 'PASS' ? 'qc-print-good' : ''">{{ row.outcome }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="qc-print-muted">No specification / results recorded.</p>
    </section>

    <!-- In-process: tests down the side, each collection (time + lot#) a column. -->
    <section v-if="isInProcess && collections.length" class="qc-print-section">
      <h2>Sample Collections</h2>
      <table class="qc-print-table qc-print-table--grid qc-print-table--compact">
        <thead>
          <tr>
            <th class="qc-print-rowhead">Test</th>
            <th v-for="(col, i) in collections" :key="i">
              {{ fmtTime(col.at) }}
              <div class="qc-print-muted qc-print-colsub">
                <span v-if="col.lotNo">Lot {{ col.lotNo }}</span>
                <span> · {{ col.samples.length }} pc</span>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in characteristics" :key="c.id">
            <td class="qc-print-rowhead">
              {{ c.name }}<span v-if="c.uom" class="qc-print-muted"> ({{ c.uom }})</span>
            </td>
            <td
              v-for="(col, i) in collections"
              :key="i"
              :class="cellFor(c.id, col).fail ? 'qc-print-bad' : ''"
            >
              {{ cellFor(c.id, col).text }}
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Disposition notes -->
    <section v-if="lot?.dispositionNotes || lot?.notes" class="qc-print-section">
      <h2>Notes</h2>
      <p v-if="lot?.dispositionNotes"><strong>Disposition:</strong> {{ lot.dispositionNotes }}</p>
      <p v-if="lot?.notes">{{ lot.notes }}</p>
    </section>
  </PrintLayout>
</template>

<style>
.qc-print-num { font-size: 11pt; font-weight: 700; color: #444; letter-spacing: 0.02em; }
.qc-print-title { font-size: 18pt; font-weight: 700; margin: 2px 0 10px; }
.qc-print-meta { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 6px; }
.qc-print-meta th { text-align: left; font-weight: 600; color: #555; width: 16%; padding: 3px 8px 3px 0; vertical-align: top; white-space: nowrap; }
.qc-print-meta td { padding: 3px 16px 3px 0; vertical-align: top; }
.qc-print-section { margin-top: 16px; break-inside: avoid; }
.qc-print-section > h2 { font-size: 12pt; font-weight: 700; border-bottom: 1px solid #ccc; padding-bottom: 3px; margin-bottom: 8px; }
.qc-print-table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 8px; }
.qc-print-table th { text-align: left; font-weight: 600; color: #555; padding: 3px 8px 3px 0; vertical-align: top; }
.qc-print-table td { padding: 3px 8px 3px 0; vertical-align: top; }
.qc-print-table--grid th, .qc-print-table--grid td { border: 1px solid #ddd; padding: 4px 8px; }
.qc-print-table--grid thead th { background: #f3f4f6; }
.qc-print-table--compact { font-size: 8.5pt; }
.qc-print-table--compact th, .qc-print-table--compact td { padding: 2px 5px; }
.qc-print-rowhead { text-align: left; white-space: nowrap; background: #f9fafb; font-weight: 600; }
.qc-print-colsub { font-weight: 400; font-size: 7.5pt; }
.qc-print-muted { color: #888; }
.qc-print-good { color: #067647; font-weight: 600; }
.qc-print-bad { color: #b42318; font-weight: 600; }
</style>
