<script setup>
import '../recordPrint.css'

/**
 * Quality Event print module (added 2026-08-18).
 *
 * A Quality Event has no workflow — it is intake plus a reviewer's assessment —
 * so this is the shortest of the three record printouts: title block + meta,
 * the description, the review (summary / recommended action / decision), and
 * an escalation appendix naming whatever NC, CAPA or Change Request the event
 * became.
 *
 * That appendix is the reason this exists in the shape it does: an event that
 * escalated is only half the story on its own, and the paper trail has to say
 * where the rest of it went. Escalations are read from record_links
 * (relation = ESCALATED), the same rows the detail page shows.
 *
 * Shares recordPrint.css with CapaPrint / NonconformancePrint so the three read
 * as one document family.
 */

const props = defineProps({
  id: { type: String, default: null },
})

const event = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => (id ? db.QualityEvent.findByPk(id) : null),
  { models: ['QualityEvent'] },
)

const category = useLiveQueryWithDeps(
  [() => event.value?.categoryId],
  async (db, [id]) => (id ? db.EventCategory.findByPk(id) : null),
  { models: ['EventCategory'] },
)
const severity = useLiveQueryWithDeps(
  [() => event.value?.severityId],
  async (db, [id]) => (id ? db.EventSeverity.findByPk(id) : null),
  { models: ['EventSeverity'] },
)
const site = useLiveQueryWithDeps(
  [() => event.value?.siteId],
  async (db, [id]) => (id ? db.Site.findByPk(id) : null),
  { models: ['Site'] },
)
const department = useLiveQueryWithDeps(
  [() => event.value?.departmentId],
  async (db, [id]) => (id ? db.Department.findByPk(id) : null),
  { models: ['Department'] },
)
const supplier = useLiveQueryWithDeps(
  [() => event.value?.supplierId],
  async (db, [id]) => (id ? db.Supplier.findByPk(id) : null),
  { models: ['Supplier'] },
)

// Escalation targets — record_links written by escalateQualityEvent.
const escalations = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return []
    const links = await db.RecordLink.where('[fromType+fromId]', ['QualityEvent', id]).exec()
    return links.filter((l) => l.relation === 'ESCALATED')
  },
  { models: ['RecordLink'], initial: [] },
)

// Resolve each escalation target to its human number (NC-…, CAPA-…, CR-…).
// Keyed by toType because the number lives on a different column per module.
const TARGET_TABLES = {
  Nonconformance: { model: 'Nonconformance', numberField: 'ncNumber', label: 'Nonconformance' },
  Capa: { model: 'Capa', numberField: 'capaNumber', label: 'CAPA' },
  ChangeRequest: { model: 'ChangeRequest', numberField: 'crNumber', label: 'Change Request' },
}

const escalationRows = useLiveQueryWithDeps(
  [() => escalations.value.map((l) => `${l.toType}:${l.toId}`).join(',')],
  async (db, [key]) => {
    if (!key) return []
    const out = []
    for (const pair of key.split(',')) {
      const [toType, toId] = pair.split(':')
      const spec = TARGET_TABLES[toType]
      if (!spec) continue
      const row = await db[spec.model].findByPk(toId)
      out.push({
        id: toId,
        label: spec.label,
        number: row?.[spec.numberField] ?? '—',
        title: row?.title ?? '',
        statusId: row?.statusId ?? '—',
      })
    }
    return out
  },
  { models: ['Nonconformance', 'Capa', 'ChangeRequest'], initial: [] },
)

const userIds = computed(() => {
  const set = new Set()
  for (const k of ['reportedByUserId', 'assignedToUserId', 'createdBy']) {
    if (event.value?.[k]) set.add(event.value[k])
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

// An anonymous report must stay anonymous on paper too — that is the whole
// promise the intake form makes, and a printout is the easiest place to break it.
function reporterName() {
  if (event.value?.anonymousSubmission) return 'Anonymous'
  return userName(event.value?.reportedByUserId)
}

function userName(id) {
  return id ? (userMap.value[id] ?? id) : '—'
}

const identifier = computed(() => event.value?.eventNumber ?? '')

const auditEntities = computed(() =>
  event.value?.id ? [{ entityType: 'QualityEvents', entityId: event.value.id }] : [],
)

function fmtDate(d) {
  if (!d) return '—'
  if (d.toFormat) return d.toFormat('LLL d, yyyy')
  return new Date(d).toLocaleDateString()
}

const hasReview = computed(
  () => !!(event.value?.reviewSummary || event.value?.recommendedAction || event.value?.decision),
)

const ready = computed(() => !!event.value)

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
  <PrintLayout :status="event?.statusId" :identifier="identifier" :auditEntities="auditEntities">
    <template #title>
      <div class="qp-num">{{ event?.eventNumber }}</div>
      <h1 class="qp-title">{{ event?.title }}</h1>
      <table class="qp-meta">
        <tbody>
          <tr>
            <th>Event Number</th>
            <td>{{ event?.eventNumber || '—' }}</td>
            <th>Status</th>
            <td>{{ event?.statusId || '—' }}</td>
          </tr>
          <tr>
            <th>Category</th>
            <td>{{ category?.name || '—' }}</td>
            <th>Severity</th>
            <td>{{ severity?.name || '—' }}</td>
          </tr>
          <tr>
            <th>Site</th>
            <td>{{ site?.name || '—' }}</td>
            <th>Department</th>
            <td>{{ department?.name || '—' }}</td>
          </tr>
          <tr>
            <th>Reported By</th>
            <td>{{ reporterName() }}</td>
            <th>Assigned To</th>
            <td>{{ userName(event?.assignedToUserId) }}</td>
          </tr>
          <tr>
            <th>Occurred</th>
            <td>{{ fmtDate(event?.occurrenceDate) }}</td>
            <th>Reported</th>
            <td>{{ fmtDate(event?.reportedDate) }}</td>
          </tr>
          <tr v-if="event?.reviewDueDate || supplier">
            <th>Review Due</th>
            <td>{{ fmtDate(event?.reviewDueDate) }}</td>
            <th>Supplier</th>
            <td>{{ supplier?.name || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </template>

    <div v-if="!ready" class="tw:py-10 tw:text-secondary tw:text-center">Loading event…</div>
    <div v-else class="qp-body">
      <section v-if="event?.description" class="qp-section">
        <h2>1. What Happened</h2>
        <div class="qp-paragraph" v-html="event.description" />
      </section>

      <section v-if="hasReview" class="qp-section">
        <h2>2. Review</h2>
        <template v-if="event?.reviewSummary">
          <div class="qp-step-label">Review Summary</div>
          <div class="qp-paragraph" v-html="event.reviewSummary" />
        </template>
        <template v-if="event?.recommendedAction">
          <div class="qp-step-label">Recommended Action</div>
          <div class="qp-paragraph" v-html="event.recommendedAction" />
        </template>
        <template v-if="event?.decision">
          <div class="qp-step-label">Decision</div>
          <div class="qp-paragraph" v-html="event.decision" />
        </template>
      </section>

      <!-- Where the event went next. Without this the printout stops at the
           decision and gives no way to follow the thread. -->
      <section v-if="escalationRows.length" class="qp-section">
        <h2>3. Escalated To</h2>
        <table class="qp-effectiveness">
          <thead>
            <tr>
              <th>Record</th>
              <th>Number</th>
              <th>Title</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in escalationRows" :key="row.id">
              <td>{{ row.label }}</td>
              <td>{{ row.number }}</td>
              <td>{{ row.title || '—' }}</td>
              <td>{{ row.statusId }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </PrintLayout>
</template>
