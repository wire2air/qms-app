import { describe, it, expect, vi } from 'vitest'
import { buildInspectionLotSections, buildInspectionLotActions } from './inspectionLotDetailConfig.js'

describe('buildInspectionLotSections', () => {
  it('returns a single details section', () => {
    const s = buildInspectionLotSections(null)
    expect(s).toHaveLength(1)
    expect(s[0].id).toBe('details')
  })
})

describe('buildInspectionLotActions', () => {
  const visibleIds = (gates) =>
    buildInspectionLotActions(gates, {})
      .filter((a) => a.visible)
      .map((a) => a.id)

  it('PENDING (canExecute) → Start + Edit', () => {
    expect(visibleIds({ canExecute: true, statusId: 'PENDING' }).sort()).toEqual(['edit', 'start'])
  })

  it('IN_PROGRESS (canExecute) → Complete + Edit', () => {
    expect(visibleIds({ canExecute: true, statusId: 'IN_PROGRESS' }).sort()).toEqual([
      'complete',
      'edit',
    ])
  })

  it('COMPLETED (canDispose) → Submit only', () => {
    expect(visibleIds({ canDispose: true, statusId: 'COMPLETED' })).toEqual(['submit'])
  })

  it('Submit hidden without canDispose; Edit/Start hidden without canExecute', () => {
    expect(visibleIds({ statusId: 'COMPLETED' })).toEqual([])
    expect(visibleIds({ statusId: 'PENDING' })).toEqual([])
  })

  it('Submit is the primary action', () => {
    expect(buildInspectionLotActions({}, {}).find((a) => a.id === 'submit').variant).toBe('primary')
  })

  it('wires handlers to onSelect', () => {
    const handlers = { submit: vi.fn(), start: vi.fn(), complete: vi.fn(), edit: vi.fn() }
    const a = buildInspectionLotActions({}, handlers)
    a.forEach((d) => d.onSelect())
    Object.values(handlers).forEach((fn) => expect(fn).toHaveBeenCalled())
  })
})
