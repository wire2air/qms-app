/**
 * Quick-view ("pill") filtering for the document register.
 *
 * Extracted from DocumentsHome so it can be tested directly — the archived view
 * was silently broken and nothing caught it. Same split as documentDetailConfig.js.
 *
 * `currentStatuses` maps documentId -> 'EFFECTIVE' for documents that have an
 * effective version; `latestStatuses` maps documentId -> the latest version's
 * status. `userId` is the viewer, for the "mine" pill.
 */
// Quick views. A document's meaningful state lives on its VERSIONS, not the
// document row — "effective" means it has an effective current version, "in
// review" means its latest version is mid-approval. So each pill tests the
// version-status maps above rather than d.statusId.
//
// ARCHIVED IS THE EXCEPTION, and getting that wrong is what made the Archived
// view look empty. Obsoletion is a WHOLE-DOCUMENT event: it stamps
// documents.statusId, and deliberately leaves the versions alone (the version
// history is the record of what was effective — see
// controllers/documents/archive.js). This pill tested only the latest VERSION's
// status, so it could not match an archived document at all. The case reported
// was an archived draft: its latest version still read DRAFT, so it fell out of
// the Draft pill as well and showed up nowhere but All.
//
// SUPERSEDED stays a version test — that one really is per-version state (a
// version replaced by a newer one), on a document that is still active.
export function applyActiveFilter(rows, af, currentStatuses, latestStatuses, userId = null) {
  const isArchived = (d) => d.statusId === 'ARCHIVED'
  if (af === 'effective')
    return rows.filter((d) => currentStatuses[d.id] === 'EFFECTIVE' && !isArchived(d))
  if (af === 'in_review')
    return rows.filter(
      (d) => ['IN_REVIEW', 'CHANGES_REQUESTED'].includes(latestStatuses[d.id]) && !isArchived(d),
    )
  if (af === 'draft')
    return rows.filter((d) => latestStatuses[d.id] === 'DRAFT' && !isArchived(d))
  if (af === 'mine') return rows.filter((d) => d.authorId === userId || d.userId === userId)
  if (af === 'archived')
    return rows.filter((d) => isArchived(d) || latestStatuses[d.id] === 'SUPERSEDED')
  return rows // 'all'
}
