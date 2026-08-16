/**
 * Section ordering for document templates.
 *
 * `order` is a STORED field on each section, not the array index — it drives
 * the badge in the editor and the sequence a document renders in. Every
 * reordering path (arrows, insert, delete) has to rewrite it, or the saved
 * order silently diverges from what the author sees.
 *
 * Extracted so the arithmetic is testable: the component imports a rich-text
 * editor, which does not mount under vitest.
 */

/** Renumber 1..n in array order. The single place `order` is assigned. */
export function renumber(sections) {
  return (sections ?? []).map((s, i) => ({ ...s, order: i + 1 }))
}

/** Move one section, returning a renumbered copy. Out-of-range is a no-op. */
export function moveSection(sections, from, to) {
  const arr = [...(sections ?? [])]
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) {
    return renumber(arr)
  }
  const [moved] = arr.splice(from, 1)
  arr.splice(to, 0, moved)
  return renumber(arr)
}

/**
 * Insert a section at `index`, returning a renumbered copy (user request
 * 2026-08-16). Replaces drag-and-drop as the way to get a section into the
 * middle of a template: authors were dragging to place a NEW section, which is
 * two operations (append, then drag it up eight positions) to express one.
 *
 * The index is clamped rather than rejected — callers derive it from a gap in
 * the rendered list, and an out-of-range gap should still land somewhere
 * sensible instead of silently dropping the author's click. 0 prepends,
 * length appends.
 */
export function insertSectionAt(sections, index, section) {
  const arr = [...(sections ?? [])]
  const at = Math.max(0, Math.min(Number.isFinite(index) ? index : arr.length, arr.length))
  arr.splice(at, 0, section)
  return renumber(arr)
}
