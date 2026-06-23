import { describe, it, expect, vi } from 'vitest'
import {
  buildTrainingBanners,
  buildTrainingSections,
  buildTrainingActions,
} from './trainingDetailConfig.js'

describe('buildTrainingBanners', () => {
  it('returns [] when training is null', () => {
    expect(buildTrainingBanners(null)).toEqual([])
  })

  it('adds an archived read-only banner when ARCHIVED', () => {
    const b = buildTrainingBanners({ status: 'ARCHIVED' })
    expect(b.find((x) => x.id === 'archived')?.tone).toBe('neutral')
  })

  it('adds a published info banner when ACTIVE', () => {
    const b = buildTrainingBanners({ status: 'ACTIVE' })
    expect(b.find((x) => x.id === 'published')?.tone).toBe('info')
  })

  it('no banner when DRAFT', () => {
    expect(buildTrainingBanners({ status: 'DRAFT' })).toEqual([])
  })
})

describe('buildTrainingSections', () => {
  it('always returns a single details section', () => {
    const s = buildTrainingSections(null)
    expect(s).toHaveLength(1)
    expect(s[0].id).toBe('details')
  })
})

describe('buildTrainingActions', () => {
  const ids = (gates) => buildTrainingActions(gates, {}).filter((a) => a.visible).map((a) => a.id)

  it('DRAFT (canManage) shows publish + delete', () => {
    expect(ids({ canManage: true, status: 'DRAFT' }).sort()).toEqual(['delete', 'publish'])
  })

  it('ACTIVE (canManage) shows launch + addMatrix + archive (no unpublish unless allowed)', () => {
    expect(ids({ canManage: true, status: 'ACTIVE' }).sort()).toEqual([
      'addMatrix',
      'archive',
      'launch',
    ])
  })

  it('ACTIVE shows unpublish only when canUnpublish', () => {
    expect(ids({ canManage: true, status: 'ACTIVE', canUnpublish: true })).toContain('unpublish')
  })

  it('nothing visible without canManage', () => {
    expect(ids({ canManage: false, status: 'DRAFT' })).toEqual([])
    expect(ids({ canManage: false, status: 'ACTIVE' })).toEqual([])
  })

  it('publish is disabled (with tooltip) when no manager', () => {
    const p = buildTrainingActions({ canManage: true, status: 'DRAFT', hasManager: false }, {}).find(
      (a) => a.id === 'publish',
    )
    expect(p.disabled).toBe(true)
    expect(p.title).toBeTruthy()
  })

  it('publish is enabled when a manager is set', () => {
    const p = buildTrainingActions({ canManage: true, status: 'DRAFT', hasManager: true }, {}).find(
      (a) => a.id === 'publish',
    )
    expect(p.disabled).toBe(false)
    expect(p.title).toBeUndefined()
  })

  it('launch is the primary ACTIVE action', () => {
    const l = buildTrainingActions({}, {}).find((a) => a.id === 'launch')
    expect(l.variant).toBe('primary')
  })

  it('wires handlers to onSelect', () => {
    const handlers = {
      openPublish: vi.fn(),
      launch: vi.fn(),
      addMatrix: vi.fn(),
      unpublish: vi.fn(),
      archive: vi.fn(),
      openDelete: vi.fn(),
    }
    const a = buildTrainingActions({}, handlers)
    a.find((x) => x.id === 'publish').onSelect()
    a.find((x) => x.id === 'launch').onSelect()
    a.find((x) => x.id === 'addMatrix').onSelect()
    a.find((x) => x.id === 'unpublish').onSelect()
    a.find((x) => x.id === 'archive').onSelect()
    a.find((x) => x.id === 'delete').onSelect()
    Object.values(handlers).forEach((fn) => expect(fn).toHaveBeenCalled())
  })
})
