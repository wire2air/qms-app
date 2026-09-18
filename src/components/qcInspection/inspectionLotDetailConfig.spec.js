import { describe, it, expect, vi } from 'vitest'
import { buildInspectionLotSections, buildInspectionLotActions } from './inspectionLotDetailConfig.js'

describe('buildInspectionLotSections', () => {
  it('returns a single details section', () => {
    const s = buildInspectionLotSections(null)
    expect(s).toHaveLength(1)
    expect(s[0].id).toBe('details')
  })
})

// Unified statuses (2026-08-28): the parent status is OPEN throughout
// execution; gates key off inspectionPhase. Check-in doubles as Start.
describe('buildInspectionLotActions', () => {
  // `print` is always visible — the probes assert the STATUS-driven set.
  const visibleIds = (gates) =>
    buildInspectionLotActions(gates, {})
      .filter((a) => a.visible && a.id !== 'print')
      .map((a) => a.id)

  it('OPEN/PENDING (canExecute, not checked in) → Check in', () => {
    expect(
      visibleIds({ canExecute: true, statusId: 'OPEN', inspectionPhase: 'PENDING' }),
    ).toEqual(['check-in'])
  })

  it('OPEN/IN_PROGRESS as the active inspector → Check out + Complete + Edit', () => {
    expect(
      visibleIds({
        canExecute: true,
        statusId: 'OPEN',
        inspectionPhase: 'IN_PROGRESS',
        isActiveInspector: true,
      }).sort(),
    ).toEqual(['check-out', 'complete', 'edit'])
  })

  it('OPEN/COMPLETED (canDispose) → Submit only', () => {
    expect(
      visibleIds({ canDispose: true, statusId: 'OPEN', inspectionPhase: 'COMPLETED' }),
    ).toEqual(['submit'])
  })

  it('Reopen offers on UNDER_REVIEW / HOLD phases, and on CLOSED only when the disposition was adverse', () => {
    expect(
      visibleIds({ canDispose: true, statusId: 'OPEN', inspectionPhase: 'UNDER_REVIEW' }),
    ).toContain('reopen')
    expect(
      visibleIds({ canDispose: true, statusId: 'OPEN', inspectionPhase: 'HOLD' }),
    ).toContain('reopen')
    expect(
      visibleIds({ canDispose: true, statusId: 'CLOSED', dispositionAdverse: true }),
    ).toContain('reopen')
    expect(
      visibleIds({ canDispose: true, statusId: 'CLOSED', dispositionAdverse: false }),
    ).not.toContain('reopen')
  })

  it('Submit hidden without canDispose; execution actions hidden without canExecute', () => {
    expect(visibleIds({ statusId: 'OPEN', inspectionPhase: 'COMPLETED' })).toEqual([])
    expect(visibleIds({ statusId: 'OPEN', inspectionPhase: 'PENDING' })).toEqual([])
  })

  it('Submit is the primary action', () => {
    expect(buildInspectionLotActions({}, {}).find((a) => a.id === 'submit').variant).toBe('primary')
  })

  it('wires handlers to onSelect', () => {
    const handlers = {
      print: vi.fn(),
      submit: vi.fn(),
      checkIn: vi.fn(),
      checkOut: vi.fn(),
      complete: vi.fn(),
      edit: vi.fn(),
      reopen: vi.fn(),
      createEvent: vi.fn(),
    }
    const a = buildInspectionLotActions({}, handlers)
    a.forEach((d) => d.onSelect?.())
    ;['submit', 'checkIn', 'checkOut', 'complete', 'edit', 'reopen', 'createEvent'].forEach((k) =>
      expect(handlers[k]).toHaveBeenCalled(),
    )
  })
})
