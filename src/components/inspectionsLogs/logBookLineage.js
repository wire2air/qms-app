/**
 * Log book lineage — resolving a printed label to the book that is live today.
 *
 * ── WHY A LABEL CANNOT CARRY A BOOK ID ────────────────────────────────────
 * Log books use the supersede model: changing a frozen field does not edit the
 * book, it creates a replacement (`CAL-LOG-QA` → `CAL-LOG-QA-V2`), and
 * approving the replacement marks the original OBSOLETE. An obsolete book
 * accepts no entries.
 *
 * A QR sticker on a balance or a door outlives all of that. Encode the book's
 * id and every label in the plant silently points at a dead book the first time
 * someone revises it — the technician scans, gets refused, and nobody finds out
 * until a walk-round. So the label carries the LINEAGE ROOT CODE, and the scan
 * resolves it to whichever generation is ACTIVE at that moment. Print once,
 * revise the book as often as you like.
 *
 * `lineageRootCode` mirrors the server's function of the same name in
 * backend/api/services/logBookService.js — the two must agree, because the
 * server mints `<root>-V<gen>` and this reads it back.
 */

/**
 * Strip ONLY the suffix this book's own generation minted.
 *
 * Generation 3 coded "ROOT-V3" roots at "ROOT". A generation-1 code is
 * user-authored and used verbatim, so a book legitimately called "PUMP-V2"
 * roots at "PUMP-V2" and is never mis-stripped — its replacement is
 * "PUMP-V2-V2".
 */
export function lineageRootCode(code, generation) {
  const raw = String(code ?? '')
  if (!generation || generation <= 1) return raw
  const suffix = `-V${generation}`
  return raw.toUpperCase().endsWith(suffix.toUpperCase()) ? raw.slice(0, -suffix.length) : raw
}

/** The stable label value for a book — what its printed QR should carry. */
export function labelCodeFor(book) {
  if (!book) return ''
  return lineageRootCode(book.code, book.generation)
}

/**
 * Which book in this lineage should a scan open?
 *
 * ACTIVE only. A lineage can legitimately hold several non-active books at
 * once (an OBSOLETE predecessor plus a DRAFT replacement under review), and
 * neither accepts entries — landing someone on one would be worse than saying
 * plainly that nothing is live. Ties break on the highest generation, which is
 * the newest.
 *
 * Case-insensitive: the code is printed, and people retype printed codes.
 *
 * @param {object[]} books   every log book visible to this user
 * @param {string} rootCode  the lineage root from the label
 * @returns {object|null}
 */
export function resolveActiveInLineage(books, rootCode) {
  const wanted = String(rootCode ?? '')
    .trim()
    .toUpperCase()
  if (!wanted) return null

  const inLineage = (books ?? []).filter(
    (b) => lineageRootCode(b?.code, b?.generation).toUpperCase() === wanted,
  )
  if (!inLineage.length) return null

  const active = inLineage.filter((b) => b.statusId === 'ACTIVE')
  if (!active.length) return null

  return active.sort((a, b) => (b.generation ?? 1) - (a.generation ?? 1))[0]
}

/**
 * Why a scan could not be honoured — so the message names the actual problem
 * rather than a generic "not found".
 *
 * @returns {'UNKNOWN_CODE'|'NONE_ACTIVE'|null} null when a book resolved
 */
export function lineageFailureReason(books, rootCode) {
  const wanted = String(rootCode ?? '')
    .trim()
    .toUpperCase()
  if (!wanted) return 'UNKNOWN_CODE'
  const inLineage = (books ?? []).filter(
    (b) => lineageRootCode(b?.code, b?.generation).toUpperCase() === wanted,
  )
  if (!inLineage.length) return 'UNKNOWN_CODE'
  return inLineage.some((b) => b.statusId === 'ACTIVE') ? null : 'NONE_ACTIVE'
}
