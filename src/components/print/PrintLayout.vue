<script setup>
import { IconPrinter, IconX, IconBuilding } from '@tabler/icons-vue'
import { DateTime } from 'luxon'
import { currentSession } from '@/utils/currentSession.js'

/**
 * Shared print chrome. Every printable module wraps its body in this so we
 * have one place for: company header / footer, status badge, audit log,
 * signatures, page-break CSS, page counter.
 *
 * The module supplies:
 *   - title-block (slot)        — module-specific title, doc meta, etc.
 *   - body (slot)               — the main content
 *   - status (prop)             — drives the prominent status badge ("DRAFT" / "EFFECTIVE" / …)
 *   - identifier (prop)         — short string shown in the footer ("SOP-001 v1.2")
 *   - auditEntities (prop)      — list of {entityType, entityId} to pull audit history for
 *
 * Per-company branding is read from company.settings.printSettings with
 * sensible fallbacks to plain company fields. Branding-only customization
 * per AI_PLAN-style "consistency over flexibility" decision.
 */

const props = defineProps({
  status: { type: String, default: null }, // e.g. 'EFFECTIVE'
  identifier: { type: String, default: '' }, // "SOP-001 v1.2"
  // Optional — when present, footer shows "EFFECTIVE since {date}" / similar.
  // Modules pass version.effectiveDate. Either Luxon DateTime, JS Date, or
  // ISO string is fine.
  effectiveDate: { type: [Object, String, Date], default: null },
  // List of { entityType, entityId } pairs to query audit history for
  auditEntities: { type: Array, default: () => [] },
  // If false, hide the audit + signatures sections
  showAudit: { type: Boolean, default: true },
})

const company = useLiveQuery(async (db) => {
  const all = await db.Company.where().exec()
  return all[0] ?? null
})

const branding = computed(() => {
  const settings = company.value?.settings ?? {}
  const ps = settings.printSettings ?? {}
  return {
    logoUrl: ps.logoUrl || company.value?.companyIconUrl || null,
    name: company.value?.name ?? '—',
    address: ps.address || settings.address || settings.companyAddress || null,
    code: company.value?.code,
    footerText:
      ps.footerText ||
      'Verify the current effective version before use.',
    accentColor: ps.accentColor || null,
  }
})

const accentStyle = computed(() =>
  branding.value.accentColor ? { '--print-accent': branding.value.accentColor } : {},
)

const statusClass = computed(() => {
  const s = (props.status ?? '').toUpperCase()
  if (s === 'EFFECTIVE' || s === 'VERIFIED' || s === 'COMPLETED' || s === 'CLOSED') return 'print-status-effective'
  if (s === 'DRAFT' || s === 'REJECTED' || s === 'OPEN') return 'print-status-draft'
  if (s === 'IN_REVIEW' || s === 'APPROVED' || s === 'IN_PROGRESS') return 'print-status-review'
  if (s === 'SUPERSEDED' || s === 'ARCHIVED' || s === 'CANCELLED') return 'print-status-archived'
  return 'print-status-default'
})

// ─── Audit + signatures ──────────────────────────────────────────────────
const SIGNATURE_ACTIONS = ['APPROVE', 'SET_EFFECTIVE']

// auditLogs query — uses the compound [entityType+entityId] index. There is
// no plain `entityId` index on auditLogs (see qms-app/models/auditLog.js
// customIndex declaration) so the lookup MUST be compound.
const auditLogs = useLiveQueryWithDeps(
  [() => JSON.stringify(props.auditEntities ?? [])],
  async (db, [key]) => {
    const entities = JSON.parse(key)
    if (!entities.length) return []
    const all = []
    for (const { entityType, entityId } of entities) {
      if (!entityType || !entityId) continue
      const rows = await db.AuditLog.where('[entityType+entityId]', [entityType, entityId]).exec()
      all.push(...rows)
    }
    return all
      .sort((a, b) => (b.performedAt?.toMillis?.() ?? 0) - (a.performedAt?.toMillis?.() ?? 0))
      .slice(0, 30)
  },
  { initial: [] },
)

const performerIds = computed(() => [
  ...new Set((auditLogs.value ?? []).map((l) => l.performedBy).filter(Boolean)),
])

const performers = useLiveQueryWithDeps(
  [() => performerIds.value.join(',')],
  async (db) => {
    if (!performerIds.value.length) return {}
    const users = await Promise.all(performerIds.value.map((id) => db.User.findByPk(id)))
    const map = {}
    for (const u of users.filter(Boolean)) {
      map[u.id] = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || u.id
    }
    return map
  },
  { initial: {} },
)

const signatures = computed(() =>
  (auditLogs.value ?? [])
    .filter((l) => SIGNATURE_ACTIONS.includes(l.action))
    .map((l) => ({
      action: l.action,
      who: performers.value?.[l.performedBy] ?? l.performedBy,
      when: l.performedAt,
      ip: l.ipAddress,
    })),
)

function fmtAuditTime(dt) {
  if (!dt) return ''
  if (dt.toFormat) return dt.toFormat('LLL d, yyyy HH:mm')
  return new Date(dt).toLocaleString()
}

function fmtDate(value) {
  if (!value) return ''
  if (value.toFormat) return value.toFormat('LLL d, yyyy')
  if (value instanceof Date) return DateTime.fromJSDate(value).toFormat('LLL d, yyyy')
  return DateTime.fromISO(String(value)).toFormat('LLL d, yyyy')
}

const generatedAt = computed(() => DateTime.now().toFormat("LLL d, yyyy 'at' HH:mm 'UTC'"))

// ─── Footer audit lines ──────────────────────────────────────────────────
// Status-aware audit line. Auditors read this first: "is this copy
// effective right now, and since when?"
const statusFooterLine = computed(() => {
  const s = (props.status ?? '').toUpperCase()
  const eff = props.effectiveDate ? fmtDate(props.effectiveDate) : null
  if (s === 'EFFECTIVE') return eff ? `EFFECTIVE since ${eff}` : 'EFFECTIVE'
  if (s === 'DRAFT') return 'DRAFT — not for controlled use'
  if (s === 'IN_REVIEW') return 'IN REVIEW — not for controlled use'
  if (s === 'REJECTED' || s === 'CHANGES_REQUESTED') return `${s.replace('_', ' ')} — not for use`
  if (s === 'APPROVED') return eff ? `APPROVED — effective ${eff}` : 'APPROVED'
  if (s === 'SUPERSEDED') return 'SUPERSEDED — refer to the latest effective version'
  if (s === 'ARCHIVED') return 'ARCHIVED — historical reference only'
  return null
})

// Most recent APPROVE (preferred) or SET_EFFECTIVE for the footer
// "Approved by … on …" line.
const latestApproval = computed(() => {
  if (!signatures.value?.length) return null
  return signatures.value.find((s) => s.action === 'APPROVE') ?? signatures.value[0]
})

// Print provenance — closes the "who printed this controlled copy" audit
// gap. Pulled from the live session.
const printedBy = computed(() => {
  const s = currentSession.value
  const name = `${s?.firstName ?? ''} ${s?.lastName ?? ''}`.trim()
  return name || s?.email || s?.userId || 'Unknown user'
})

function reprint() {
  window.print()
}
function close() {
  window.close()
}

// Browsers use document.title as the default "Save as PDF" filename (and
// as the physical printer job name). Track the original so we can restore
// on unmount — otherwise the title leaks back to the app shell after
// navigating away.
const originalTitle = window.document.title

function sanitizeFilename(s) {
  // Strip path separators and Windows-reserved chars. Browsers tolerate
  // most punctuation but a bare "/" can fool some "Save as" dialogs into
  // treating it as a folder.
  return s.replace(/[\\/:*?"<>|]/g, '_').trim()
}

// Compose: company code + identifier (e.g. "ACME · SOP-001 v1.2"). Falls
// back to identifier alone, then to the original title.
watchEffect(() => {
  const idPart = sanitizeFilename(props.identifier ?? '')
  const codePart = sanitizeFilename(branding.value?.code ?? '')
  if (idPart && codePart) window.document.title = `${codePart} · ${idPart}`
  else if (idPart) window.document.title = idPart
})

onBeforeUnmount(() => {
  window.document.title = originalTitle
})
</script>

<template>
  <!-- Teleport into the pre-provisioned #print-portal in index.html — a
       sibling of #app, NOT a descendant. The app shell wraps everything in
       h-screen + overflow-hidden + a flex chain; left in place, those
       constraints collapse the print-root to one viewport's height when
       printed (and `flex-1` collapses to 0 once h-screen is flattened).
       Teleporting sidesteps the entire chain. #app already has
       `tw:print:hidden`, so it disappears during print. -->
  <Teleport to="#print-portal">
    <div class="print-root" :style="accentStyle">
    <!-- Toolbar — hidden when printing -->
    <div class="print-toolbar tw:no-print">
      <div class="tw:flex tw:items-center tw:gap-2">
        <button
          class="tw:flex tw:items-center tw:gap-1.5 tw:rounded tw:bg-primary tw:text-white tw:px-3 tw:py-1.5 tw:text-sm tw:font-medium tw:hover:bg-primary/90"
          @click="reprint"
        >
          <IconPrinter :size="14" /> Print
        </button>
        <button
          class="tw:flex tw:items-center tw:gap-1.5 tw:rounded tw:border tw:border-divider tw:px-3 tw:py-1.5 tw:text-sm tw:text-secondary tw:hover:bg-main-hover"
          @click="close"
        >
          <IconX :size="14" /> Close
        </button>
      </div>
      <div class="tw:text-xs tw:text-secondary">
        Use your browser's Print dialog → "Save as PDF" for a controlled PDF.
      </div>
    </div>

    <article class="print-page">
      <!-- Company header (every printout looks identical here) -->
      <header class="print-header">
        <div class="print-header-logo">
          <img
            v-if="branding.logoUrl"
            :src="branding.logoUrl"
            :alt="`${branding.name} logo`"
            class="print-logo-img"
          />
          <div v-else class="print-logo-fallback">
            <IconBuilding :size="40" />
            <span>Company Logo</span>
          </div>
        </div>
        <div class="print-header-text">
          <div class="print-company-name">{{ branding.name }}</div>
          <div v-if="branding.address" class="print-company-meta">{{ branding.address }}</div>
          <div v-if="branding.code" class="print-company-meta">{{ branding.code }}</div>
        </div>
        <div v-if="status" class="print-status-block">
          <span class="print-status-badge" :class="statusClass">{{ status }}</span>
        </div>
      </header>

      <!-- Module-specific title / meta -->
      <section v-if="$slots.title" class="print-title-section">
        <slot name="title" />
      </section>

      <!-- Module-specific body -->
      <section class="print-body-section">
        <slot />
      </section>

      <!-- Approvals & Signatures -->
      <section v-if="showAudit && signatures.length > 0" class="print-signatures">
        <h2>Approvals &amp; Signatures</h2>
        <table class="print-sig-table">
          <thead>
            <tr><th>Action</th><th>Signed by</th><th>Date</th><th>IP</th></tr>
          </thead>
          <tbody>
            <tr v-for="(sig, i) in signatures" :key="i">
              <td>{{ sig.action }}</td>
              <td>{{ sig.who }}</td>
              <td>{{ fmtAuditTime(sig.when) }}</td>
              <td>{{ sig.ip ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Audit history -->
      <section v-if="showAudit && auditLogs.length > 0" class="print-audit">
        <h2>Recent Audit History</h2>
        <table class="print-audit-table">
          <thead>
            <tr><th>When</th><th>Who</th><th>What</th><th>Target</th></tr>
          </thead>
          <tbody>
            <tr v-for="(log, i) in auditLogs.slice(0, 10)" :key="i">
              <td>{{ fmtAuditTime(log.performedAt) }}</td>
              <td>{{ performers[log.performedBy] ?? '—' }}</td>
              <td>{{ log.action }}</td>
              <td>{{ log.entityType }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Footer — every printed controlled copy needs: status + approval +
           print provenance. Auditors scan these lines to confirm a copy is
           valid at the time of inspection. -->
      <footer class="print-footer">
        <div v-if="statusFooterLine" class="print-footer-status">
          {{ statusFooterLine }}
        </div>
        <div v-if="latestApproval" class="print-footer-approval">
          Approved by {{ latestApproval.who }} on {{ fmtAuditTime(latestApproval.when) }}
        </div>
        <div class="print-footer-provenance">
          {{ branding.name }}{{ identifier ? ` · ${identifier}` : '' }}
        </div>
        <div class="print-footer-provenance">
          Printed by {{ printedBy }} · {{ generatedAt }}
        </div>
        <div v-if="branding.footerText" class="print-footer-disclaimer">
          {{ branding.footerText }}
        </div>
      </footer>
    </article>
    </div>
  </Teleport>
</template>

<style>
.print-root {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: #f3f4f6;
  overflow: auto;
  padding: 16px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #111827;
  --print-accent: #111827;
}

.print-toolbar {
  max-width: 210mm;
  margin: 0 auto 16px;
  padding: 12px 20px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.print-page {
  max-width: 210mm;
  margin: 0 auto;
  background: white;
  padding: 20mm 18mm;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.print-header {
  display: grid;
  grid-template-columns: 80px 1fr auto;
  gap: 16px;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--print-accent);
  margin-bottom: 18px;
}
.print-header-logo {
  display: flex;
  align-items: center;
  justify-content: center;
}
.print-logo-img {
  max-width: 80px;
  max-height: 60px;
  object-fit: contain;
}
.print-logo-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 60px;
  border: 1px dashed #9ca3af;
  color: #6b7280;
  font-size: 9px;
  text-align: center;
  padding: 4px;
}
.print-company-name {
  font-size: 18px;
  font-weight: 700;
  color: var(--print-accent);
}
.print-company-meta {
  font-size: 11px;
  color: #4b5563;
}
.print-status-block { text-align: right; }
.print-status-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  border: 1.5px solid currentColor;
}
.print-status-effective { color: #047857; background: #d1fae5; }
.print-status-draft     { color: #92400e; background: #fef3c7; }
.print-status-review    { color: #1d4ed8; background: #dbeafe; }
.print-status-archived  { color: #6b7280; background: #f3f4f6; }
.print-status-default   { color: #374151; background: #f3f4f6; }

.print-title-section { margin: 20px 0 24px; }
.print-body-section { margin: 0; }

.print-signatures, .print-audit {
  margin-top: 24px;
  break-inside: avoid-page;
}
.print-signatures h2, .print-audit h2 {
  font-size: 14px;
  font-weight: 700;
  margin: 0 0 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid #e5e7eb;
}
.print-sig-table, .print-audit-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 10px;
}
.print-sig-table th, .print-audit-table th {
  background: #f9fafb;
  text-align: left;
  padding: 5px 8px;
  border: 1px solid #e5e7eb;
  font-weight: 600;
}
.print-sig-table td, .print-audit-table td {
  padding: 5px 8px;
  border: 1px solid #e5e7eb;
}

.print-footer {
  margin-top: 32px;
  padding-top: 10px;
  border-top: 1.5px solid var(--print-accent);
  font-size: 9px;
  color: #6b7280;
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: center;
}
.print-footer-status {
  font-weight: 700;
  font-size: 10px;
  color: var(--print-accent, #111827);
  letter-spacing: 0.3px;
}
.print-footer-approval {
  font-size: 9.5px;
  color: #374151;
}
.print-footer-provenance {
  color: #6b7280;
}
.print-footer-disclaimer {
  font-style: italic;
  color: #9ca3af;
  margin-top: 2px;
}

@media print {
  /* body has `tw:overflow-hidden` from index.html — override so the print
     content can paginate past the viewport. #app is `tw:print:hidden` and
     the print-root is teleported into #print-portal (sibling of #app), so
     no other shell overrides are needed. */
  html, body {
    background: white !important;
    margin: 0;
    padding: 0;
    height: auto !important;
    overflow: visible !important;
  }
  .print-root { position: static; padding: 0; background: white; }
  .print-toolbar, .tw\:no-print { display: none !important; }
  .print-page {
    max-width: none;
    margin: 0;
    padding: 0;
    box-shadow: none;
  }
}

@page {
  size: A4;
  margin: 15mm 15mm 20mm 15mm;
  @bottom-center {
    content: 'Page ' counter(page) ' of ' counter(pages);
    font-size: 9px;
    color: #6b7280;
  }
}
</style>
