<script setup>
/**
 * OFI list — requirement responses marked "OFI" (Opportunities For
 * Improvement). OFIs are not nonconformities and don't become findings
 * (decision #6); they're surfaced here as the auditor's improvement notes.
 * Read-only list: clause (italic) + the auditor's comment beneath.
 */
const props = defineProps({
  auditInstance: { type: Object, required: true },
})

const ofis = useLiveQueryWithDeps(
  [() => props.auditInstance.id],
  async (db, [id]) => {
    if (!id) return []
    const rows = await db.AuditRequirementResponse.where('auditInstanceId', id).exec()
    return rows
      .filter((r) => r.resultId === 'OFI')
      .sort((a, b) =>
        String(a.requirementSnapshot?.clauseNumber ?? '').localeCompare(
          String(b.requirementSnapshot?.clauseNumber ?? ''),
          undefined,
          { numeric: true },
        ),
      )
  },

  { models: ['AuditRequirementResponse'], initial: [] },
)

// Requirement comments are rich text (HTML) — flatten to plain text for display.
function stripHtml(html) {
  if (!html) return ''
  return String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}
function clauseText(snap) {
  if (!snap) return ''
  return `${snap.clauseNumber ? `${snap.clauseNumber} ` : ''}${snap.title ?? ''}${snap.question ? `: ${snap.question}` : ''}`
}
</script>

<template>
  <div>
    <div v-if="!ofis.length" class="tw:py-8 tw:text-center tw:text-sm tw:text-secondary tw:italic">
      No opportunities for improvement recorded. Mark a requirement result as OFI to add one.
    </div>
    <div v-else class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
      <div v-for="o in ofis" :key="o.id" class="tw:py-3 tw:flex tw:flex-col tw:gap-1">
        <div class="tw:italic tw:text-sm tw:text-secondary">
          {{ clauseText(o.requirementSnapshot) }}
        </div>
        <div v-if="stripHtml(o.comments)" class="tw:text-sm tw:text-on-main">
          {{ stripHtml(o.comments) }}
        </div>
      </div>
    </div>
  </div>
</template>
