import { describe, it, expect, vi } from 'vitest'
import { buildProductTabs, buildProductActions } from './productDetailConfig.js'

/**
 * productDetailConfig — the item detail page's tab set and header actions.
 *
 * Small, pure, and worth more coverage than its size suggests, because it is
 * the ONLY place the Products module states two things:
 *
 *  • That the item detail page has a Specifications tab at all. That tab is the
 *    module's single cross-module surface (it renders `specifications` rows and
 *    gates authoring on `inspection_spec:write`, a DIFFERENT module's verb), and
 *    it exists solely because this array says so. Drop the entry and the tab
 *    silently disappears — `BaseDetailLayout` renders the tabs it is handed and
 *    the `#tab-specifications` slot simply never mounts. No error, no warning.
 *
 *  • That editing is dialog-based rather than inline. Every other detail page in
 *    this program autosaves inline; Products deliberately does not, which is why
 *    the action list is exactly one descriptor and why `visible` — not
 *    `disabled` — is what `canUpdate` drives.
 *
 * `visible: false` vs `disabled: true` is the distinction that matters and the
 * one that is easy to "improve" by accident: a disabled Edit button tells a
 * read-only user the action exists and they may not have it; a hidden one is the
 * convention this module (and PJ-J7) asserts. Neither is a security control —
 * `product_update_rls` is — but the two are different products and only a test
 * says which one this is.
 */

describe('buildProductTabs', () => {
  it('returns Overview + Specifications panel tabs, in that order', () => {
    const t = buildProductTabs(null)
    expect(t.map((x) => x.value)).toEqual(['overview', 'specifications'])
    t.forEach((x) => expect(x.mode).toBe('panel'))
  })

  it('carries the human labels BaseDetailLayout renders', () => {
    // The values are route-query tokens (?tab=specifications, validated against
    // ProductDetail.vue's VALID_TABS) while the labels are what a user reads;
    // they are not interchangeable and both are asserted.
    expect(buildProductTabs(null).map((x) => x.label)).toEqual(['Overview', 'Specifications'])
  })

  it('is PURE — the same tabs regardless of the item it is handed', () => {
    // The parameter is `_product` and is deliberately unused: there is no
    // per-item tab variation, and a future author adding one has to change this
    // test first. Called with a populated item, a bare one, and null.
    const populated = buildProductTabs({ id: 'p-1', productFamilyId: 'f-1', statusId: 'OBSOLETE' })
    const bare = buildProductTabs({})
    const none = buildProductTabs(null)
    expect(populated).toEqual(none)
    expect(bare).toEqual(none)
  })

  it('returns a fresh array each call, so a caller cannot mutate the next page’s tabs', () => {
    const a = buildProductTabs(null)
    const b = buildProductTabs(null)
    expect(a).not.toBe(b)
    a.push({ value: 'rogue', label: 'Rogue', mode: 'panel' })
    expect(buildProductTabs(null).map((x) => x.value)).toEqual(['overview', 'specifications'])
  })
})

describe('buildProductActions', () => {
  it('returns a single edit descriptor', () => {
    expect(buildProductActions({}, {}).map((a) => a.id)).toEqual(['edit'])
  })

  it('edit is visible only when canUpdate', () => {
    expect(buildProductActions({ canUpdate: true }, {})[0].visible).toBe(true)
    expect(buildProductActions({ canUpdate: false }, {})[0].visible).toBe(false)
  })

  it('defaults to HIDDEN when canUpdate is not supplied at all', () => {
    // The gate is `!!canUpdate`, so an undefined flag — a caller that forgot to
    // resolve the permission, or resolved it asynchronously and rendered first —
    // fails CLOSED. That is the right default and it is one `!!` away from the
    // wrong one.
    expect(buildProductActions({}, {}).at(0).visible).toBe(false)
    expect(buildProductActions(undefined, undefined).at(0).visible).toBe(false)
  })

  it('coerces a truthy non-boolean to a real boolean', () => {
    // `visible` is consumed by useDetailLayout's bucketing, which filters on the
    // value rather than on Boolean(value); a string would be truthy there and
    // falsy in a strict comparison somewhere else.
    const a = buildProductActions({ canUpdate: 'yes' }, {})[0]
    expect(a.visible).toBe(true)
    expect(typeof a.visible).toBe('boolean')
  })

  it('hides rather than disables — the module’s stated convention', () => {
    // PJ-J7 asserts the register and detail page offer a read-only persona NO
    // edit control. A `disabled: true` descriptor would still render a button
    // and that journey would fail; more importantly, the two are different
    // products and this is the only place the choice is written down.
    const denied = buildProductActions({ canUpdate: false }, {})[0]
    expect(denied.visible).toBe(false)
    expect(denied.disabled, 'not a disabled button — an absent one').toBeUndefined()
  })

  it('wires the edit handler to onSelect', () => {
    const edit = vi.fn()
    buildProductActions({}, { edit })[0].onSelect()
    expect(edit).toHaveBeenCalled()
  })

  it('survives a missing handler map without throwing at build time', () => {
    // DetailActionBar calls `a.onSelect && a.onSelect()`, so an undefined
    // handler is inert rather than fatal — but only if BUILDING the descriptor
    // does not blow up first, which is what this asserts.
    expect(() => buildProductActions({ canUpdate: true }, {})).not.toThrow()
    expect(buildProductActions({ canUpdate: true }, {})[0].onSelect).toBeUndefined()
  })

  it('carries the presentation fields DetailActionBar reads', () => {
    const a = buildProductActions({ canUpdate: true }, {})[0]
    expect(a.label).toBe('Edit')
    expect(a.variant).toBe('secondary')
    expect(a.priority).toBe(100)
    expect(a.icon, 'an icon component, not a string name').toBeTruthy()
  })

  it('returns a fresh array each call', () => {
    const a = buildProductActions({ canUpdate: true }, {})
    a.push({ id: 'rogue' })
    expect(buildProductActions({ canUpdate: true }, {}).map((x) => x.id)).toEqual(['edit'])
  })
})
