/**
 * Section ordering for document templates.
 *
 * `order` is a STORED field on each section, not the array index — it drives
 * the badge in the editor and the sequence a document renders in. Every
 * reordering path (arrows, drag-and-drop, delete) has to rewrite it, or the
 * saved order silently diverges from what the author sees.
 *
 * Extracted so the arithmetic is testable: the component imports
 * useSortable and a rich-text editor, neither of which mounts under vitest.
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
