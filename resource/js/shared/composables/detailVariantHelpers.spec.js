import { describe, it, expect } from 'vitest'
import { resolveVariant, morphHeaderVariant } from './detailVariantHelpers.js'

describe('resolveVariant', () => {
  it('standard is the full two-column editable shell', () => {
    expect(resolveVariant('standard')).toEqual({
      variant: 'standard', showBreadcrumbs: true, stickyHeader: true, showNav: true,
      showRail: true, columns: 2, editable: true, linearized: false, stub: false,
    })
  })
  it('readonly differs from standard only by editable=false', () => {
    expect(resolveVariant('readonly').editable).toBe(false)
    expect(resolveVariant('readonly').columns).toBe(2)
  })
  it('embedded drops chrome and rail, single column', () => {
    const v = resolveVariant('embedded')
    expect(v.showBreadcrumbs).toBe(false)
    expect(v.stickyHeader).toBe(false)
    expect(v.showNav).toBe(false)
    expect(v.showRail).toBe(false)
    expect(v.columns).toBe(1)
  })
  it('print is linearized, single column, not editable', () => {
    const v = resolveVariant('print')
    expect(v.linearized).toBe(true)
    expect(v.columns).toBe(1)
    expect(v.editable).toBe(false)
    expect(v.showRail).toBe(true)
  })
  it('stub variants render standard plus stub=true', () => {
    for (const name of ['approval', 'workflow-review', 'split']) {
      const v = resolveVariant(name)
      expect(v.stub).toBe(true)
      expect(v.variant).toBe(name)
      expect(v.columns).toBe(2)
    }
  })
  it('unknown variant falls back to standard', () => {
    expect(resolveVariant('bogus').variant).toBe('standard')
    expect(resolveVariant().variant).toBe('standard')
  })
})

describe('morphHeaderVariant', () => {
  it('collapses full to compact once scrolled', () => {
    expect(morphHeaderVariant('full', true)).toBe('compact')
  })
  it('stays full when not scrolled', () => {
    expect(morphHeaderVariant('full', false)).toBe('full')
  })
  it('leaves an explicitly compact header compact', () => {
    expect(morphHeaderVariant('compact', false)).toBe('compact')
    expect(morphHeaderVariant('compact', true)).toBe('compact')
  })
})
