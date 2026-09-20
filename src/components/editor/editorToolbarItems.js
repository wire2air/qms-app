/**
 * What the rich-text toolbar offers, and which of it survives on a phone.
 *
 * ── WHY NARROW IT ─────────────────────────────────────────────────────────
 * Sixteen tools is a reasonable desktop toolbar and an unusable phone one: on
 * a 390px screen they wrap to three rows and push the actual text box below
 * the fold, so filling a log entry starts with a scroll. The people most
 * likely to be on a phone are the ones filling log entries in the field, and
 * they are not writing sub-sections and tables — they are noting a reading and
 * photographing the instrument.
 *
 * ── HOW THE TIERS WERE CHOSEN ─────────────────────────────────────────────
 * `essential` is not "the smallest set that still looks like an editor". It is
 * what a field entry actually needs:
 *
 *   bold / italic          emphasis inside a sentence
 *   bullet / numbered list observations and steps — the shape most entries take
 *   image / camera         THE mobile-critical pair. A technician on a phone
 *                          photographing a gauge is the main reason the phone
 *                          is in their hand; dropping the camera to save space
 *                          would remove the one tool the small screen is
 *                          BETTER at than a desktop.
 *
 * Everything else is `full`: strikethrough, H3/H4, blockquote, code, table,
 * link, highlight. Structural and document-authoring tools, used when writing
 * a procedure at a desk, not when standing at a machine.
 *
 * ── NOT AN OVERFLOW MENU ──────────────────────────────────────────────────
 * A "…" button keeping everything reachable was the other option. It is worse
 * here: it trades a toolbar nobody can use for a toolbar that hides its
 * contents behind a tap, and the hidden tools are ones a phone user does not
 * want anyway. The content stays fully editable on a larger screen, so nothing
 * is unreachable — only inconvenient, in the case where it should be.
 */
import {
  IconBold,
  IconItalic,
  IconStrikethrough,
  IconList,
  IconListNumbers,
  IconBlockquote,
  IconCode,
  IconLink,
  IconPhoto,
  IconCamera,
  IconTable,
  IconHighlight,
  IconH3,
  IconH4,
} from '@tabler/icons-vue'

/** Tools that survive on a phone. Everything else needs a wider screen. */
const ESSENTIAL = new Set(['bold', 'italic', 'bulletList', 'orderedList', 'image', 'camera'])

export const TOOLBAR_ITEMS = [
  { icon: IconBold, action: 'bold', label: 'Bold' },
  { icon: IconItalic, action: 'italic', label: 'Italic' },
  { icon: IconStrikethrough, action: 'strike', label: 'Strikethrough' },
  { divider: true },
  // Heading 3 / 4 — render as "N.1" / "N.1.1" under the parent section
  // number. Used for QMS sub-sections (the most common structure rule).
  { icon: IconH3, action: 'heading', level: 3, label: 'Sub-section (N.1)', custom: true },
  { icon: IconH4, action: 'heading', level: 4, label: 'Sub-sub-section (N.1.1)', custom: true },
  { divider: true },
  { icon: IconList, action: 'bulletList', label: 'Bullet List' },
  { icon: IconListNumbers, action: 'orderedList', label: 'Numbered List' },
  { divider: true },
  { icon: IconBlockquote, action: 'blockquote', label: 'Blockquote' },
  { icon: IconCode, action: 'code', label: 'Code' },
  { icon: IconLink, action: 'link', label: 'Link', custom: true },
  { divider: true },
  { icon: IconPhoto, action: 'image', label: 'Insert Image', custom: true },
  { icon: IconCamera, action: 'camera', label: 'Take Photo', custom: true },
  { divider: true },
  { icon: IconTable, action: 'table', label: 'Insert Table', custom: true },
  { divider: true },
  { icon: IconHighlight, action: 'highlight', label: 'Highlight' },
]

/**
 * The toolbar for a given width.
 *
 * Dividers are separators, not content, so they are re-derived rather than
 * filtered: dropping tools out of a fixed list leaves leading, trailing and
 * doubled rules where the gaps were, which reads as a broken toolbar rather
 * than a shorter one.
 *
 * @param {boolean} compact  true on a phone-width screen
 * @param {object[]} [items] override, for tests
 */
export function visibleToolbarItems(compact, items = TOOLBAR_ITEMS) {
  if (!compact) return items

  const kept = items.filter((item) => !item.divider && ESSENTIAL.has(item.action))

  // Re-insert a rule wherever the FULL list had one between two surviving
  // tools, so the compact toolbar keeps the original grouping instead of
  // running every tool together.
  const out = []
  for (const item of kept) {
    const isFirst = out.length === 0
    if (!isFirst && hadDividerBetween(items, out[out.length - 1], item)) {
      out.push({ divider: true })
    }
    out.push(item)
  }
  return out
}

/** Was there at least one divider between these two items in the full list? */
function hadDividerBetween(items, a, b) {
  const ia = items.indexOf(a)
  const ib = items.indexOf(b)
  if (ia === -1 || ib === -1) return false
  return items.slice(ia + 1, ib).some((i) => i.divider)
}
