import { describe, it, expect, vi } from 'vitest'
import {
  trainingStatusHelp,
  buildTrainingSections,
  buildTrainingActions,
} from './trainingDetailConfig.js'

describe('trainingStatusHelp', () => {
  it('returns "" when training is null', () => {
    expect(trainingStatusHelp(null)).toBe('')
  })

  it('explains read-only when ARCHIVED', () => {
    expect(trainingStatusHelp({ status: 'ARCHIVED' })).toMatch(/archived/i)
  })

  it('explains published + locked when ACTIVE', () => {
    expect(trainingStatusHelp({ status: 'ACTIVE' })).toMatch(/published and locked/i)
  })

  it('no help text when DRAFT', () => {
    expect(trainingStatusHelp({ status: 'DRAFT' })).toBe('')
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

  it('ACTIVE (canManage) shows launch + addToCurriculum + archive (no unpublish unless allowed)', () => {
    expect(ids({ canManage: true, status: 'ACTIVE' }).sort()).toEqual([
      'addToCurriculum',
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
      addToCurriculum: vi.fn(),
      unpublish: vi.fn(),
      archive: vi.fn(),
      openDelete: vi.fn(),
    }
    const a = buildTrainingActions({}, handlers)
    a.find((x) => x.id === 'publish').onSelect()
    a.find((x) => x.id === 'launch').onSelect()
    a.find((x) => x.id === 'addToCurriculum').onSelect()
    a.find((x) => x.id === 'unpublish').onSelect()
    a.find((x) => x.id === 'archive').onSelect()
    a.find((x) => x.id === 'delete').onSelect()
    Object.values(handlers).forEach((fn) => expect(fn).toHaveBeenCalled())
  })
})
