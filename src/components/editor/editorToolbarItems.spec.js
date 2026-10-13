/**
 * The compact toolbar is a phone affordance, so the things worth pinning are
 * the ones a phone user would notice: that the camera survived, that the
 * structural tools did not, and that the result does not look broken.
 */
import { describe, it, expect } from 'vitest'
import { TOOLBAR_ITEMS, visibleToolbarItems } from './editorToolbarItems.js'

const actions = (items) => items.filter((i) => !i.divider).map((i) => i.action)

describe('visibleToolbarItems', () => {
  it('returns the full toolbar untouched on a wide screen', () => {
    expect(visibleToolbarItems(false)).toBe(TOOLBAR_ITEMS)
  })

  it('keeps the camera and image tools on a phone', () => {
    // The point of the whole exercise. A technician photographing a gauge is
    // the main reason the phone is in their hand — dropping the camera to save
    // toolbar space would remove the one tool the small screen is better at.
    expect(actions(visibleToolbarItems(true))).toContain('camera')
    expect(actions(visibleToolbarItems(true))).toContain('image')
  })

  it('keeps emphasis and lists — the shape a field entry actually takes', () => {
    const kept = actions(visibleToolbarItems(true))
    expect(kept).toEqual(expect.arrayContaining(['bold', 'italic', 'bulletList', 'orderedList']))
  })

  it('drops the document-authoring tools on a phone', () => {
    const kept = actions(visibleToolbarItems(true))
    for (const gone of ['strike', 'heading', 'blockquote', 'code', 'table', 'link', 'highlight']) {
      expect(kept).not.toContain(gone)
    }
  })

  it('roughly halves the button count', () => {
    // Guards the direction rather than an exact number: a future tool added to
    // `full` should not quietly land in the phone set.
    const full = actions(TOOLBAR_ITEMS).length
    const compact = actions(visibleToolbarItems(true)).length
    expect(compact).toBeLessThan(full / 2)
    expect(compact).toBeGreaterThan(0)
  })
})

describe('dividers in the compact toolbar', () => {
  // Filtering a fixed list leaves rules where the gaps were. That reads as a
  // broken toolbar rather than a shorter one, so they are re-derived.
  const compact = visibleToolbarItems(true)

  it('never starts or ends with a rule', () => {
    expect(compact[0].divider).toBeFalsy()
    expect(compact[compact.length - 1].divider).toBeFalsy()
  })

  it('never renders two rules in a row', () => {
    const doubled = compact.some((item, i) => item.divider && compact[i + 1]?.divider)
    expect(doubled).toBe(false)
  })

  it('keeps a rule where the full toolbar grouped tools apart', () => {
    // bold/italic and the lists are in different groups upstream, so the
    // compact toolbar should still separate them.
    const i = compact.findIndex((x) => x.action === 'italic')
    const j = compact.findIndex((x) => x.action === 'bulletList')
    expect(compact.slice(i + 1, j).some((x) => x.divider)).toBe(true)
  })

  it('does not invent a rule between tools that were adjacent', () => {
    const i = compact.findIndex((x) => x.action === 'bold')
    const j = compact.findIndex((x) => x.action === 'italic')
    expect(j).toBe(i + 1)
  })
})
