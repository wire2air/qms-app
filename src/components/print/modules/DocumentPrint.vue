<script setup>
/**
 * Document print module.
 *
 * Self-contained: fetches the document + version + sections via SyncEngine,
 * passes audit entities to PrintLayout, renders title block + section list.
 *
 * Auto-fires window.print() ~600ms after the layout has the data it needs.
 */

import { buildCombinedDocumentPdf } from '@/composables/useDocumentCombinedPdf.js'

const props = defineProps({
  id: { type: String, default: null },
  versionId: { type: String, default: null },
  // '1' → skip browser print dialog, generate a single combined PDF
  // that includes the main body plus every attachment from the
  // document version's sections (PDFs + images merged inline; other
  // formats listed in a reference appendix). Anything falsy → existing
  // window.print() behaviour.
  attachments: { type: String, default: null },
})

const document = useLiveQueryWithDeps([() => props.id], async (db, [id]) => {
  if (!id) return null
  return db.Document.findByPk(id)
})

const versions = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return []
    return db.DocumentVersion.where('documentId', id).orderBy('createdAt', 'desc').exec()
  },
  { initial: [] },
)

// Revision history appendix — last 5 versions (newest first) shown at the
// end of the printout. Common requirement in regulated SOPs so auditors
// can trace the recent change chain without leaving the printed copy.
const revisionHistory = computed(() => {
  const all = [...(versions.value ?? [])]
  all.sort((a, b) => {
    if (a.versionMajor !== b.versionMajor) return b.versionMajor - a.versionMajor
    return (b.versionMinor ?? 0) - (a.versionMinor ?? 0)
  })
  return all.slice(0, 5)
})

const revisionVersionIds = computed(() => revisionHistory.value.map((v) => v.id))

// Pull APPROVE / SET_EFFECTIVE audit rows for the revisions shown — gives
// us approver + approval date columns without joining TaskInstance.
const APPROVAL_ACTIONS = ['APPROVE', 'SET_EFFECTIVE']
const revisionApprovals = useLiveQueryWithDeps(
  [() => revisionVersionIds.value.join(',')],
  async (db, [key]) => {
    const ids = key.split(',').filter(Boolean)
    if (!ids.length) return []
    // Uses the compound [entityType+entityId] index on auditLogs — there
    // is no solo `entityId` index. Both 'DocumentVersions' (current
    // PascalCase from the audit trigger) and 'DocumentVersion' (legacy)
    // are tried so older rows still surface.
    const rows = []
    for (const id of ids) {
      for (const type of ['DocumentVersions', 'DocumentVersion']) {
        const r = await db.AuditLog.where('[entityType+entityId]', [type, id]).exec()
        rows.push(...r)
      }
    }
    return rows.filter((l) => APPROVAL_ACTIONS.includes(l.action))
  },
  { initial: [] },
)

// Resolve approver user → display name for the appendix.
const approverIds = computed(() => [
  ...new Set((revisionApprovals.value ?? []).map((l) => l.performedBy).filter(Boolean)),
])
const approverNames = useLiveQueryWithDeps(
  [() => approverIds.value.join(',')],
  async (db) => {
    if (!approverIds.value.length) return {}
    const users = await Promise.all(approverIds.value.map((id) => db.User.findByPk(id)))
    const map = {}
    for (const u of users.filter(Boolean)) {
      map[u.id] = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || u.id
    }
    return map
  },
  { initial: {} },
)

const approvalByVersion = computed(() => {
  const map = {}
  for (const log of revisionApprovals.value ?? []) {
    const existing = map[log.entityId]
    if (!existing) {
      map[log.entityId] = log
      continue
    }
    // Prefer APPROVE over SET_EFFECTIVE; otherwise the most recent wins.
    const isPref =
      (log.action === 'APPROVE' && existing.action !== 'APPROVE') ||
      (log.action === existing.action &&
        (log.performedAt?.toMillis?.() ?? 0) > (existing.performedAt?.toMillis?.() ?? 0))
    if (isPref) map[log.entityId] = log
  }
  return map
})

function revLabel(v) {
  if (v?.versionLabel) return v.versionLabel
  return `v${v?.versionMajor ?? '?'}.${v?.versionMinor ?? 0}`
}
function revDate(value) {
  if (!value) return '—'
  if (value.toFormat) return value.toFormat('LLL d, yyyy')
  return new Date(value).toLocaleDateString()
}
function revApprover(versionId) {
  const log = approvalByVersion.value[versionId]
  if (!log) return null
  return {
    name: approverNames.value[log.performedBy] ?? log.performedBy,
    date: log.performedAt,
  }
}

const version = computed(() => {
  if (!versions.value?.length) return null
  if (props.versionId) {
    return versions.value.find((v) => v.id === props.versionId) ?? versions.value[0]
  }
  return versions.value.find((v) => v.statusId === 'EFFECTIVE') ?? versions.value[0]
})

const sections = useLiveQueryWithDeps(
  [() => version.value?.id],
  async (db, [vid]) => {
    if (!vid) return []
    const rows = await db.DocumentSection.where('documentVersionId', vid).exec()
    return rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  },
  { initial: [] },
)

const versionLabel = computed(() => {
  const v = version.value
  if (!v) return ''
  return v.versionLabel || `${v.versionMajor ?? '?'}.${v.versionMinor ?? '?'}`
})

const identifier = computed(() => {
  if (!document.value?.docNumber) return ''
  return `${document.value.docNumber} v${versionLabel.value}`
})

const effectiveDateLabel = computed(() => {
  const d = version.value?.effectiveDate
  if (!d) return null
  if (d?.toFormat) return d.toFormat('LLL d, yyyy')
  return new Date(d).toLocaleDateString()
})

// What audit history rows PrintLayout should pull
const auditEntities = computed(() => {
  const out = []
  if (document.value?.id) out.push({ entityType: 'Documents', entityId: document.value.id })
  if (version.value?.id) out.push({ entityType: 'DocumentVersions', entityId: version.value.id })
  return out
})

const ready = computed(
  () => !!document.value && !!version.value && Array.isArray(sections.value),
)

// Combined-PDF state. Only used when ?attachments=1 is in the URL.
const wantCombined = computed(() => props.attachments === '1')
const combining = ref(false)
const combineMessage = ref('')
const combineError = ref(null)
const combinedUrl = ref(null)

// Flat list of every attachment across every section, in section order.
// Used by the combined-PDF generator and surfaced in the on-screen
// "preparing your download" panel so the user can see what's queued.
const allAttachments = computed(() => {
  const out = []
  for (const s of sections.value ?? []) {
    const list = Array.isArray(s.attachments) ? s.attachments : []
    for (const a of list) {
      if (a?.url) out.push(a)
    }
  }
  return out
})

async function generateCombinedPdf() {
  if (combining.value) return
  combining.value = true
  combineMessage.value = 'Preparing main document…'
  combineError.value = null
  try {
    // Wait one tick after `ready` flips so v-html section bodies have
    // actually been mounted before we snapshot the DOM.
    await nextTick()
    const root = window.document.querySelector('.doc-print-body')
    if (!root) throw new Error('Print body not mounted yet')
    const bytes = await buildCombinedDocumentPdf(root, allAttachments.value, (stage) => {
      combineMessage.value = stage.message
    })
    const blob = new Blob([bytes], { type: 'application/pdf' })
    combinedUrl.value = URL.createObjectURL(blob)
    // Auto-open in the same tab so it replaces the loading screen with
    // the rendered PDF. The user can then save it or trigger their own
    // browser print on the combined output.
    window.location.replace(combinedUrl.value)
  } catch (err) {
    combineError.value = err?.message ?? 'Failed to build combined PDF'
  } finally {
    combining.value = false
  }
}

onMounted(() => {
  // Give the layout one render with data, then either auto-print
  // (browser dialog, existing behaviour) or build the combined PDF.
  const tryStart = (attempts = 0) => {
    if (ready.value) {
      if (wantCombined.value) {
        setTimeout(() => generateCombinedPdf(), 400)
      } else {
        setTimeout(() => window.print(), 200)
      }
      return
    }
    if (attempts < 20) setTimeout(() => tryStart(attempts + 1), 200)
  }
  tryStart()
})
</script>

<template>
  <div class="tw:contents">
    <!-- Combined-PDF overlay: shown only when ?attachments=1 is set. The
         PrintLayout itself still renders behind it so buildCombinedDocumentPdf
         has a real DOM to snapshot via jsPDF.html(). On success we redirect
         the tab to the generated PDF blob URL — this overlay is the "we're
         working on it" experience while jsPDF + pdf-lib churn. -->
    <div
      v-if="wantCombined && (combining || combineError)"
      class="tw:fixed tw:inset-0 tw:z-50 tw:bg-main/95 tw:flex tw:items-center tw:justify-center tw:p-8 tw:print:hidden"
    >
      <div class="tw:max-w-md tw:w-full tw:rounded-lg tw:border tw:border-divider tw:bg-sidebar tw:p-6 tw:flex tw:flex-col tw:gap-3">
        <div class="tw:text-base tw:font-semibold tw:text-on-main">
          Combining document + attachments
        </div>
        <div v-if="combining" class="tw:text-sm tw:text-secondary">
          {{ combineMessage || 'Working…' }}
        </div>
        <div v-if="combineError" class="tw:text-sm tw:text-red-700">
          {{ combineError }}
        </div>
        <div v-if="!combining && !combineError" class="tw:text-sm tw:text-secondary">
          Done. Opening combined PDF…
        </div>
      </div>
    </div>

    <PrintLayout
    :status="version?.statusId"
    :identifier="identifier"
    :effectiveDate="version?.effectiveDate"
    :auditEntities="auditEntities"
  >
    <template #title>
      <div class="doc-print-doc-number">{{ document?.docNumber }}</div>
      <h1 class="doc-print-title">{{ document?.title }}</h1>
      <table class="doc-print-meta-table">
        <tbody>
          <tr>
            <th>Document Number</th>
            <td>{{ document?.docNumber }}</td>
            <th>Version</th>
            <td>{{ versionLabel }}</td>
          </tr>
          <tr>
            <th>Status</th>
            <td>{{ version?.statusId }}</td>
            <th>Effective Date</th>
            <td>{{ effectiveDateLabel ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
    </template>

    <!-- Default slot: the document body -->
    <div v-if="!ready" class="tw:py-10 tw:text-secondary tw:text-center">Loading document…</div>
    <div v-else class="doc-print-body">
      <!-- CSS counters auto-prefix headings:
           h2 ("section title")   → "1. Section title"
           h3 ("subsection title") → "1.1 Subsection title"
           h4 ("sub-sub title")    → "1.1.1 Sub-sub title"
           — so re-ordering sections re-numbers automatically. -->
      <section v-for="s in sections" :key="s.id" class="doc-print-section">
        <h2>{{ s.title }}</h2>
        <div class="doc-print-section-body" v-html="s.content" />
      </section>

      <!-- Revision history appendix — last 5 revisions. Common ask in
           regulated SOPs so auditors can trace the recent change chain
           without leaving the printed copy. Hidden when only the current
           revision exists. -->
      <section v-if="revisionHistory.length > 1" class="doc-print-revisions">
        <h2>Revision History</h2>
        <p class="doc-print-revisions-note">
          Showing the {{ revisionHistory.length }} most recent revision{{
            revisionHistory.length === 1 ? '' : 's'
          }}. Full history is in the QMS Revision History view.
        </p>
        <table class="doc-print-revisions-table">
          <thead>
            <tr>
              <th>Version</th>
              <th>Status</th>
              <th>Type</th>
              <th>Effective</th>
              <th>Reason for Change</th>
              <th>Approved By</th>
              <th>Approved Date</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="v in revisionHistory" :key="v.id">
              <td class="doc-print-rev-version">{{ revLabel(v) }}</td>
              <td>{{ v.statusId }}</td>
              <td>
                {{ v.changeType || '—' }}
                <span v-if="v.regulatoryImpact" class="doc-print-rev-reg" title="Regulatory impact">
                  · REG
                </span>
              </td>
              <td>{{ revDate(v.effectiveDate) }}</td>
              <td class="doc-print-rev-reason">{{ v.changeReason || '—' }}</td>
              <td>{{ revApprover(v.id)?.name || '—' }}</td>
              <td>{{ revApprover(v.id) ? revDate(revApprover(v.id).date) : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
    </PrintLayout>
  </div>
</template>

<style>
/* Document-specific print styles. Kept global (not scoped) so v-html inside
   section bodies inherits the prose styling. Scoped to .doc-print-* prefixes. */
.doc-print-doc-number {
  font-size: 11px;
  color: #6b7280;
  font-family: ui-monospace, SFMono-Regular, monospace;
  letter-spacing: 0.5px;
}
.doc-print-title {
  font-size: 22px;
  font-weight: 700;
  margin: 4px 0 14px;
  line-height: 1.25;
  color: var(--print-accent, #111827);
}
.doc-print-meta-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.doc-print-meta-table th {
  text-align: left;
  background: #f9fafb;
  padding: 6px 10px;
  border: 1px solid #e5e7eb;
  font-weight: 600;
  width: 16%;
}
.doc-print-meta-table td {
  padding: 6px 10px;
  border: 1px solid #e5e7eb;
  width: 34%;
}

/* ─── QMS hierarchical section numbering ──────────────────────────────
   Auto-prefixes section headings with 1., sub-sections with 1.1,
   sub-sub-sections with 1.1.1. Counters reset per parent so renumbering
   is automatic when sections are re-ordered.

   Counter scopes (one place each — duplicating `counter-reset` across
   nested ancestors creates ambiguous scopes; keep this list flat):
     section     — reset on .doc-print-body
     subsection  — reset on .doc-print-section
     subsubsection — reset on h3 (so it restarts under each subsection)
*/
.doc-print-body { counter-reset: section; }

.doc-print-section {
  counter-increment: section;
  counter-reset: subsection;
  margin: 18px 0;
  break-inside: avoid-page;
}
/* Direct-child h2 only — we don't want a stray h2 inside section content
   (if the AI ever emits ##) to bump the section counter. */
.doc-print-section > h2 {
  font-size: 14px;
  font-weight: 700;
  margin: 0 0 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid #e5e7eb;
  color: var(--print-accent, #111827);
}
.doc-print-section > h2::before {
  content: counter(section) ". ";
}

.doc-print-section-body {
  font-size: 11px;
  line-height: 1.6;
}
.doc-print-section-body h3 {
  counter-increment: subsection;
  counter-reset: subsubsection;
  font-size: 12px;
  font-weight: 700;
  margin: 1.1em 0 0.4em;
  color: var(--print-accent, #111827);
}
.doc-print-section-body h3::before {
  content: counter(section) "." counter(subsection) " ";
}
.doc-print-section-body h4 {
  counter-increment: subsubsection;
  font-size: 11.5px;
  font-weight: 600;
  margin: 0.9em 0 0.3em;
}
.doc-print-section-body h4::before {
  content: counter(section) "." counter(subsection) "." counter(subsubsection) " ";
}
.doc-print-section-body p { margin: 0.5em 0; }
/* h3/h4 styles handled above (with hierarchical CSS counters). h1/h2 inside
   a section body shouldn't really happen (we tell the AI to use ###/####) —
   but if they do, render them as faint sub-headings without auto-numbers. */
.doc-print-section-body h1,
.doc-print-section-body h2 {
  font-size: 12px;
  font-weight: 700;
  margin: 1em 0 0.4em;
}
.doc-print-section-body ul, .doc-print-section-body ol {
  margin: 0.5em 0;
  padding-left: 1.5em;
}
.doc-print-section-body li { margin: 0.2em 0; }
.doc-print-section-body code {
  background: #f3f4f6;
  padding: 1px 4px;
  border-radius: 3px;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 10px;
}
.doc-print-section-body pre {
  background: #f3f4f6;
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 10px;
}
.doc-print-section-body table {
  border-collapse: collapse;
  margin: 0.75em 0;
  width: 100%;
  font-size: 10px;
}
.doc-print-section-body th, .doc-print-section-body td {
  border: 1px solid #d1d5db;
  padding: 5px 8px;
  text-align: left;
}
.doc-print-section-body th { background: #f9fafb; font-weight: 600; }
.doc-print-section-body strong { font-weight: 600; }
.doc-print-section-body em { font-style: italic; }
.doc-print-section-body blockquote {
  border-left: 3px solid #d1d5db;
  padding-left: 10px;
  color: #6b7280;
  margin: 0.5em 0;
}

/* Revision history appendix — sits below the section body, before the
   shared audit + signatures sections rendered by PrintLayout. Marked
   as page-break-before:auto so it lands cleanly on its own page when
   the body is long. */
.doc-print-revisions {
  margin-top: 24px;
  padding-top: 14px;
  border-top: 1px dashed #d1d5db;
  break-inside: avoid-page;
}
.doc-print-revisions h2 {
  font-size: 12px;
  font-weight: 700;
  margin: 0 0 4px;
  color: var(--print-accent, #111827);
}
/* Hide the section counter on the appendix heading — this isn't numbered
   like a procedure section. */
.doc-print-revisions h2::before { content: none; }
.doc-print-revisions-note {
  font-size: 9.5px;
  color: #6b7280;
  margin: 0 0 8px;
}
.doc-print-revisions-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9.5px;
}
.doc-print-revisions-table th,
.doc-print-revisions-table td {
  border: 1px solid #e5e7eb;
  padding: 4px 6px;
  text-align: left;
  vertical-align: top;
}
.doc-print-revisions-table th {
  background: #f9fafb;
  font-weight: 600;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: #6b7280;
}
.doc-print-rev-version {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-weight: 600;
  white-space: nowrap;
}
.doc-print-rev-reason {
  /* Cap to keep the row from blowing out the page — full text is in the
     in-app Revision History view. */
  max-width: 240px;
}
.doc-print-rev-reg {
  font-weight: 600;
  color: #b45309;
}
</style>
