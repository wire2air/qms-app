import { describe, it, expect } from 'vitest'
import { normalizeDetailConfig, defineDetailConfig } from './defineDetailConfig.js'

describe('normalizeDetailConfig', () => {
  it('returns valid defaults for an empty input', () => {
    const { config, warnings } = normalizeDetailConfig({})
    expect(warnings).toEqual([])
    expect(config.variant).toBe('standard')
    expect(config.width).toBe('standard')
    expect(config.headerVariant).toBe('full')
    expect(config.rail).toBeUndefined()
    expect(config.actions).toEqual([])
    expect(config.tabs).toEqual([])
    expect(config.sections).toEqual([])
    expect(config.railCards).toEqual([])
    expect(config.commands).toEqual([])
    expect(config.hotkeys).toEqual({})
    expect(config.peek).toEqual({ enabled: false })
    expect(config.version).toEqual({ enabled: false })
    expect(config.ai).toEqual({ enabled: false })
  })

  it('coerces header/breadcrumbs/banners into functions of the record', () => {
    const { config } = normalizeDetailConfig({
      header: { title: 'X' },
      breadcrumbs: [{ label: 'A' }],
      banners: [{ id: 'b', tone: 'info', title: 'Hi' }],
    })
    expect(typeof config.header).toBe('function')
    expect(config.header()).toEqual({ title: 'X' })
    expect(config.breadcrumbs()).toEqual([{ label: 'A' }])
    expect(config.banners()).toEqual([{ id: 'b', tone: 'info', title: 'Hi' }])
  })

  it('passes through header/breadcrumbs/banners that are already functions', () => {
    const { config } = normalizeDetailConfig({ banners: (r) => [{ id: r }] })
    expect(config.banners('x')).toEqual([{ id: 'x' }])
  })

  it('defaults banners to an empty array function', () => {
    const { config } = normalizeDetailConfig({})
    expect(config.banners()).toEqual([])
  })

  it('defaults each tab mode to panel and preserves anchor', () => {
    const { config } = normalizeDetailConfig({
      tabs: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B', mode: 'anchor' }],
    })
    expect(config.tabs.map((t) => t.mode)).toEqual(['panel', 'anchor'])
  })

  it('warns and falls back on an unknown variant', () => {
    const { config, warnings } = normalizeDetailConfig({ variant: 'bogus' })
    expect(config.variant).toBe('standard')
    expect(warnings[0]).toContain('Unknown variant "bogus"')
  })

  it('warns on a tab descriptor missing value', () => {
    const { warnings } = normalizeDetailConfig({ tabs: [{ label: 'No value' }] })
    expect(warnings.some((w) => w.includes('missing "value"'))).toBe(true)
  })

  it('merges enabled flags into peek/version/ai', () => {
    const { config } = normalizeDetailConfig({ ai: { enabled: true, model: 'x' } })
    expect(config.ai).toEqual({ enabled: true, model: 'x' })
  })
})

describe('defineDetailConfig', () => {
  it('returns just the config object', () => {
    const config = defineDetailConfig({ variant: 'readonly' })
    expect(config.variant).toBe('readonly')
    expect(config.peek).toEqual({ enabled: false })
  })
})
