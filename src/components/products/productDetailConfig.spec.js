import { describe, it, expect, vi } from 'vitest'
import { buildProductTabs, buildProductActions } from './productDetailConfig.js'

describe('buildProductTabs', () => {
  it('returns Overview + Specifications panel tabs', () => {
    const t = buildProductTabs(null)
    expect(t.map((x) => x.value)).toEqual(['overview', 'specifications'])
    t.forEach((x) => expect(x.mode).toBe('panel'))
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

  it('wires the edit handler to onSelect', () => {
    const edit = vi.fn()
    buildProductActions({}, { edit })[0].onSelect()
    expect(edit).toHaveBeenCalled()
  })
})
