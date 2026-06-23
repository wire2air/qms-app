import { describe, it, expect, vi } from 'vitest'
import {
  buildDocumentTemplateBanners,
  buildDocumentTemplateSections,
  buildDocumentTemplateActions,
} from './documentTemplateDetailConfig.js'

describe('buildDocumentTemplateBanners', () => {
  it('returns [] when template is null', () => {
    expect(buildDocumentTemplateBanners(null)).toEqual([])
  })

  it('info banner when PUBLISHED', () => {
    expect(buildDocumentTemplateBanners({ statusId: 'PUBLISHED' })[0].tone).toBe('info')
  })

  it('neutral read-only banner when ARCHIVED', () => {
    const b = buildDocumentTemplateBanners({ statusId: 'ARCHIVED' })[0]
    expect(b.tone).toBe('neutral')
    expect(b.message.toLowerCase()).toContain('archived')
  })

  it('no banner when DRAFT', () => {
    expect(buildDocumentTemplateBanners({ statusId: 'DRAFT' })).toEqual([])
  })
})

describe('buildDocumentTemplateSections', () => {
  it('returns a single details section', () => {
    const s = buildDocumentTemplateSections(null)
    expect(s).toHaveLength(1)
    expect(s[0].id).toBe('details')
  })
})

describe('buildDocumentTemplateActions', () => {
  const visibleIds = (gates) =>
    buildDocumentTemplateActions(gates, {})
      .filter((a) => a.visible)
      .map((a) => a.id)

  it('DRAFT (canUpdate, canArchive) → publish + archive', () => {
    expect(visibleIds({ canUpdate: true, canArchive: true, statusId: 'DRAFT' }).sort()).toEqual([
      'archive',
      'publish',
    ])
  })

  it('PUBLISHED → archive only (no publish, no unarchive)', () => {
    expect(visibleIds({ canUpdate: true, canArchive: true, statusId: 'PUBLISHED' })).toEqual([
      'archive',
    ])
  })

  it('ARCHIVED → unarchive only', () => {
    expect(visibleIds({ canArchive: true, statusId: 'ARCHIVED' })).toEqual(['unarchive'])
  })

  it('publish hidden without canUpdate; archive/unarchive hidden without canArchive', () => {
    expect(visibleIds({ statusId: 'DRAFT' })).toEqual([])
    expect(visibleIds({ statusId: 'ARCHIVED' })).toEqual([])
  })

  it('publish is the primary action', () => {
    expect(buildDocumentTemplateActions({}, {}).find((a) => a.id === 'publish').variant).toBe(
      'primary',
    )
  })

  it('wires handlers to onSelect', () => {
    const handlers = { publish: vi.fn(), archive: vi.fn(), unarchive: vi.fn() }
    const a = buildDocumentTemplateActions({}, handlers)
    a.forEach((d) => d.onSelect())
    Object.values(handlers).forEach((fn) => expect(fn).toHaveBeenCalled())
  })
})
