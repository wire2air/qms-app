<script setup>
/**
 * Audit-instance print module — the formal audit report (#1).
 *
 * Self-contained (mirrors CapaPrint): loads the audit + standard/version +
 * team + requirement responses + findings via SyncEngine, computes the
 * conformance scoring rollup (shared useAuditScoring composable), renders
 * PrintLayout title block + meta + score summary + results table + findings
 * + sign-off, then auto-fires window.print().
 */
import { useAuditScoring } from '@/composables/useAuditScoring'

const props = defineProps({
  id: { type: String, default: null },
})

const audit = useLiveQueryWithDeps([() => props.id], async (db, [id]) =>
  id ? db.AuditInstance.findByPk(id) : null,
)
const standard = useLiveQueryWithDeps([() => audit.value?.auditStandardId], async (db, [id]) =>
  id ? db.AuditStandard.findByPk(id) : null,
)
const version = useLiveQueryWithDeps(
  [() => audit.value?.auditStandardVersionId],
  async (db, [id]) => (id ? db.AuditStandardVersion.findByPk(id) : null),
)
const site = useLiveQueryWithDeps([() => audit.value?.siteId], async (db, [id]) =>
  id ? db.Site.findByPk(id) : null,
)
const department = useLiveQueryWithDeps([() => audit.value?.departmentId], async (db, [id]) =>
  id ? db.Department.findByPk(id) : null,
)

// Requirement-level results are intentionally NOT printed — the report shared
// with the auditee/supplier carries the conformance summary + findings only.
const { scoring } = useAuditScoring(() => props.id)

const findings = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return []
    const rows = await db.AuditFinding.where('auditInstanceId', id).exec()
    return rows.sort((a, b) => (a.findingNumber || '').localeCompare(b.findingNumber || ''))
  },
  { initial: [] },
)

const team = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return []
    return db.AuditTeamMember.where('auditInstanceId', id).exec()
  },
  { initial: [] },
)

// Resolve user display names — lead auditor + team members.
const userIds = computed(() => {
  const set = new Set()
  if (audit.value?.leadAuditorUserId) set.add(audit.value.leadAuditorUserId)
  for (const m of team.value) if (m.userId) set.add(m.userId)
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
  { initial: {} },
)
function userName(id) {
  return id ? (userMap.value[id] ?? id) : '—'
}

const RESULT_LABEL = {
  CONFORMING: 'Conforming',
  MINOR_NC: 'Minor NC',
  MAJOR_NC: 'Major NC',
  OFI: 'OFI',
  NA: 'N/A',
}
function resultClass(id) {
  if (id === 'MAJOR_NC') return 'aud-r-major'
  if (id === 'MINOR_NC') return 'aud-r-minor'
  if (id === 'OFI') return 'aud-r-ofi'
  if (id === 'CONFORMING') return 'aud-r-conf'
  return 'aud-r-na'
}

const identifier = computed(() => audit.value?.auditNumber ?? '')

function fmtDate(d) {
  if (!d) return '—'
  if (d.toFormat) return d.toFormat('LLL d, yyyy')
  return new Date(d).toLocaleDateString()
}

const ready = computed(() => !!audit.value)

onMounted(() => {
  const tryPrint = (attempts = 0) => {
    if (ready.value) {
      setTimeout(() => window.print(), 250)
      return
    }
    if (attempts < 20) setTimeout(() => tryPrint(attempts + 1), 200)
  }
  tryPrint()
})
</script>

<template>
  <PrintLayout :status="audit?.statusId" :identifier="identifier">
    <template #title>
      <div class="aud-print-num">{{ audit?.auditNumber }}</div>
      <h1 class="aud-print-title">
        Audit Report<template v-if="standard"> — {{ standard.name }}</template>
        <template v-if="version"> (v{{ version.versionLabel }})</template>
      </h1>
      <table class="aud-print-meta">
        <tbody>
          <tr>
            <th>Audit Number</th>
            <td>{{ audit?.auditNumber || '—' }}</td>
            <th>Status</th>
            <td>{{ audit?.statusId || '—' }}</td>
          </tr>
          <tr>
            <th>Standard</th>
            <td>{{ standard?.name || '—' }}</td>
            <th>Program Type</th>
            <td>{{ audit?.programTypeId || '—' }}</td>
          </tr>
          <tr>
            <th>Site</th>
            <td>{{ site?.name || '—' }}</td>
            <th>Department</th>
            <td>{{ department?.name || '—' }}</td>
          </tr>
          <tr>
            <th>Lead Auditor</th>
            <td>{{ userName(audit?.leadAuditorUserId) }}</td>
            <th>Scheduled</th>
            <td>{{ fmtDate(audit?.scheduledDate) }}</td>
          </tr>
          <tr>
            <th>Started</th>
            <td>{{ fmtDate(audit?.startedAt) }}</td>
            <th>Completed</th>
            <td>{{ fmtDate(audit?.completedAt) }}</td>
          </tr>
        </tbody>
      </table>
    </template>

    <div v-if="!ready" class="tw:py-10 tw:text-secondary tw:text-center">Loading audit…</div>
    <div v-else class="aud-print-body">
      <!-- Scope / objectives -->
      <section v-if="audit?.scope || audit?.objectives" class="aud-print-section">
        <h2>1. Scope &amp; Objectives</h2>
        <p v-if="audit?.scope" class="aud-print-paragraph"><strong>Scope:</strong> {{ audit.scope }}</p>
        <p v-if="audit?.objectives" class="aud-print-paragraph"><strong>Objectives:</strong> {{ audit.objectives }}</p>
      </section>

      <!-- Conformance score summary -->
      <section class="aud-print-section">
        <h2>2. Conformance Summary</h2>
        <div class="aud-print-score">
          <div class="aud-print-score-pct" :class="scoring.pass ? 'aud-pass' : 'aud-fail'">
            <div class="aud-print-score-num">
              {{ scoring.conformancePct == null ? '—' : `${scoring.conformancePct}%` }}
            </div>
            <div class="aud-print-score-label">Conformance · {{ scoring.pass ? 'PASS' : 'FAIL' }}</div>
          </div>
          <table class="aud-print-counts">
            <tbody>
              <tr><th>Conforming</th><td>{{ scoring.counts.CONFORMING }}</td>
                  <th>Minor NC</th><td>{{ scoring.counts.MINOR_NC }}</td></tr>
              <tr><th>Major NC</th><td>{{ scoring.counts.MAJOR_NC }}</td>
                  <th>OFI</th><td>{{ scoring.counts.OFI }}</td></tr>
              <tr><th>N/A</th><td>{{ scoring.counts.NA }}</td>
                  <th>Assessed</th><td>{{ scoring.assessed }}</td></tr>
            </tbody>
          </table>
        </div>
        <p class="aud-print-note">
          Conformance % = (Conforming + OFI) ÷ (all assessed clauses except N/A). A Major NC fails the audit.
        </p>
      </section>

      <!-- Findings — the report shared with the auditee/supplier carries the
           findings, not the per-clause requirement results. -->
      <section v-if="findings.length" class="aud-print-section">
        <h2>3. Findings ({{ findings.length }})</h2>
        <table class="aud-print-results">
          <thead>
            <tr><th>#</th><th>Type</th><th>Status</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr v-for="f in findings" :key="f.id">
              <td class="aud-clause">{{ f.findingNumber || '—' }}</td>
              <td><span class="aud-result" :class="resultClass(f.findingTypeId)">{{ RESULT_LABEL[f.findingTypeId] || f.findingTypeId }}</span></td>
              <td>{{ f.statusId }}</td>
              <td>
                <div v-if="f.detailsHtml" class="aud-finding-rich" v-html="f.detailsHtml" />
                <template v-else>{{ f.description }}</template>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Audit team + sign-off -->
      <section class="aud-print-section">
        <h2>4. Audit Team &amp; Sign-off</h2>
        <table class="aud-print-results">
          <thead>
            <tr><th>Auditor</th><th>Role</th><th>Signature</th><th>Date</th></tr>
          </thead>
          <tbody>
            <tr v-if="audit?.leadAuditorUserId">
              <td>{{ userName(audit.leadAuditorUserId) }}</td><td>Lead Auditor</td><td></td><td></td>
            </tr>
            <tr v-for="m in team" :key="m.id">
              <td>{{ userName(m.userId) }}</td><td>{{ m.roleOnAudit || 'Team' }}</td><td></td><td></td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </PrintLayout>
</template>

<style>
.aud-print-num { font-size: 11px; color: #6b7280; font-family: ui-monospace, monospace; letter-spacing: 0.5px; }
.aud-print-title { font-size: 20px; font-weight: 700; margin: 4px 0 14px; line-height: 1.25; color: var(--print-accent, #111827); }
.aud-print-meta { width: 100%; border-collapse: collapse; font-size: 11px; }
.aud-print-meta th { text-align: left; background: #f9fafb; padding: 6px 10px; border: 1px solid #e5e7eb; font-weight: 600; width: 16%; }
.aud-print-meta td { padding: 6px 10px; border: 1px solid #e5e7eb; width: 34%; }

.aud-print-body { font-size: 11px; }
.aud-print-section { margin: 18px 0; break-inside: avoid-page; }
.aud-print-section > h2 { font-size: 14px; font-weight: 700; margin: 0 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb; color: var(--print-accent, #111827); }
.aud-print-paragraph { line-height: 1.5; margin: 4px 0; }
.aud-print-note { color: #6b7280; font-size: 10px; margin-top: 6px; }

.aud-print-score { display: flex; gap: 16px; align-items: stretch; }
.aud-print-score-pct { min-width: 150px; border-radius: 6px; padding: 12px 16px; display: flex; flex-direction: column; justify-content: center; align-items: center; }
.aud-print-score-pct.aud-pass { background: #ecfdf5; border: 1px solid #a7f3d0; }
.aud-print-score-pct.aud-fail { background: #fef2f2; border: 1px solid #fecaca; }
.aud-print-score-num { font-size: 30px; font-weight: 800; color: #111827; }
.aud-print-score-label { font-size: 10px; font-weight: 700; letter-spacing: 0.5px; color: #4b5563; }
.aud-print-counts { border-collapse: collapse; font-size: 11px; flex: 1; }
.aud-print-counts th { text-align: left; background: #f9fafb; padding: 5px 10px; border: 1px solid #e5e7eb; font-weight: 600; width: 25%; }
.aud-print-counts td { padding: 5px 10px; border: 1px solid #e5e7eb; width: 25%; }

.aud-print-results { width: 100%; border-collapse: collapse; font-size: 10px; }
.aud-print-results th { text-align: left; background: #f9fafb; padding: 5px 8px; border: 1px solid #e5e7eb; font-weight: 600; font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; color: #6b7280; }
.aud-print-results td { border: 1px solid #e5e7eb; padding: 5px 8px; vertical-align: top; }
.aud-clause { font-family: ui-monospace, monospace; white-space: nowrap; }
.aud-result { font-weight: 700; font-size: 9px; padding: 1px 5px; border-radius: 3px; white-space: nowrap; }
.aud-r-conf { background: #ecfdf5; color: #047857; }
.aud-r-minor { background: #fffbeb; color: #b45309; }
.aud-r-major { background: #fef2f2; color: #b91c1c; }
.aud-r-ofi { background: #eff6ff; color: #1d4ed8; }
.aud-r-na { background: #f3f4f6; color: #6b7280; }

/* Rich finding body (#29) rendered via v-html in the report. */
.aud-finding-rich p { margin: 0 0 4px; }
.aud-finding-rich ul { list-style: disc; padding-left: 16px; margin: 3px 0; }
.aud-finding-rich ol { list-style: decimal; padding-left: 16px; margin: 3px 0; }
.aud-finding-rich li { margin: 1px 0; }
.aud-finding-rich mark { background: #fef08a; padding: 0 1px; }
.aud-finding-rich img { max-width: 220px; height: auto; border-radius: 3px; }
.aud-finding-rich strong { font-weight: 700; }
</style>
