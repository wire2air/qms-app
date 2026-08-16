/**
 * Whether the reviewer picker lets a document be submitted.
 *
 * The bug this pins (reported 2026-08-15): a step whose role no active user
 * held was treated as "nothing to pick, carry on", so submit succeeded and the
 * document stalled later — activateInstanceStep throws when the step BEFORE it
 * is approved, by which point the approver, not the submitter, is looking at
 * the error and has no way to assign anyone.
 */
import { describe, it, expect } from 'vitest'
import { submitReadiness } from '../components/documents/workflowSubmitReadiness.js'

const step = (id, name, candidates, roleNames = []) => ({
  id,
  name,
  candidates: candidates.map((c) => ({ id: c })),
  roleNames,
})

describe('submitReadiness', () => {
  it('blocks when a step has a role but nobody holds it', () => {
    const steps = [
      step('s1', 'Technical Review', ['u1']),
      step('s2', 'Approval', [], ['Quality Manager']),
    ]
    const r = submitReadiness(steps, { s1: ['u1'] })
    expect(r.ok).toBe(false)
    expect(r.unstaffed).toEqual(['Approval'])
    expect(r.reason).toContain('Approval')
  })

  it('blocks a role-less step when the company has no active users either', () => {
    const r = submitReadiness([step('s1', 'Review', [])], {})
    expect(r.ok).toBe(false)
    expect(r.unstaffed).toEqual(['Review'])
  })

  it('blocks when an eligible step has no pick yet', () => {
    const steps = [step('s1', 'Technical Review', ['u1', 'u2'])]
    expect(submitReadiness(steps, {}).ok).toBe(false)
    expect(submitReadiness(steps, { s1: [] }).ok).toBe(false)
    expect(submitReadiness(steps, {}).unpicked).toEqual(['Technical Review'])
  })

  it('allows submit once every step has an eligible, picked reviewer', () => {
    const steps = [step('s1', 'Technical Review', ['u1']), step('s2', 'Approval', ['u2'])]
    const r = submitReadiness(steps, { s1: ['u1'], s2: ['u2'] })
    expect(r).toMatchObject({ ok: true, unstaffed: [], unpicked: [], reason: null })
  })

  it('reports the unstaffed step first — it needs an admin, not a click', () => {
    const steps = [
      step('s1', 'Technical Review', ['u1']),
      step('s2', 'Approval', [], ['Quality Manager']),
    ]
    // s1 is also unpicked, but the harder blocker is the one to name.
    const r = submitReadiness(steps, {})
    expect(r.reason).toContain('No eligible reviewer')
    expect(r.reason).not.toContain('Pick at least one')
  })

  it('names every unstaffed step, not just the first', () => {
    const steps = [step('a', 'Review', []), step('b', 'Approval', [])]
    expect(submitReadiness(steps, {}).unstaffed).toEqual(['Review', 'Approval'])
  })

  it('handles an empty or missing step list', () => {
    expect(submitReadiness([], {}).ok).toBe(true)
    expect(submitReadiness(undefined).ok).toBe(true)
  })
})
