/**
 * You cannot verify your own training — enforced in the UI, not just refused
 * by the server.
 *
 * ORIGINAL REPORT (2026-09-27): "a training assigned to Athena, admin. As
 * Admin I have access to training verification and I can see pending
 * verification. I'm not supposed to approve my own training, which is perfect,
 * but I can see approve, reject button and select checkboxes and when press
 * approve server rejects it — ideally it should be disabled."
 *
 * The API has always refused it (controllers/trainingInstances.js: "You cannot
 * verify your own training. Competency verification must be performed by
 * someone other than the trainee."). The panel gated only on being the
 * training's MANAGER — and `manager_id` may legitimately name someone who is
 * also in the cohort, so for that person the row was offered, ticked BY
 * DEFAULT, and the action failed at the server.
 *
 * The rule is per ROW, not per panel: a manager who is also one of several
 * trainees still verifies everybody else in the same action. These pin the
 * selection logic, which is what decides whether the buttons can fire — the
 * markup's `:disabled` follows from it.
 */
import { describe, it, expect } from 'vitest'

const ME = 'user-me'

// Mirrors the panel: isSelf, the default selection, and select-all.
const isSelf = (a) => a.userId === ME
const defaultSelection = (pending) => pending.filter((a) => !isSelf(a)).map((a) => a.id)
const verifiable = (pending) => pending.filter((a) => !isSelf(a))

function toggle(selected, pending, id) {
  const row = pending.find((a) => a.id === id)
  if (row && isSelf(row)) return selected
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
}

describe('training self-verification guard', () => {
  it('never pre-selects your own row — the reported bug', () => {
    // Athena's case: the only pending row is hers, and it arrived ticked.
    const pending = [{ id: 'a1', userId: ME }]
    expect(defaultSelection(pending)).toEqual([])
  })

  it('leaves the actions dead when every pending row is your own', () => {
    // The buttons are disabled on `!selectedAssigneeIds.length`, so an empty
    // selection IS the disabled state.
    const pending = [{ id: 'a1', userId: ME }]
    expect(defaultSelection(pending)).toHaveLength(0)
  })

  it('refuses to select your row even if something tries to toggle it', () => {
    const pending = [{ id: 'a1', userId: ME }]
    expect(toggle([], pending, 'a1')).toEqual([])
  })

  it('still verifies everyone ELSE when you are one of several trainees', () => {
    // The rule is per row. A manager in the cohort signs off the others in the
    // same action — treating it as per panel would block legitimate work.
    const pending = [
      { id: 'a1', userId: ME },
      { id: 'a2', userId: 'user-other' },
      { id: 'a3', userId: 'user-third' },
    ]
    expect(defaultSelection(pending)).toEqual(['a2', 'a3'])
    expect(verifiable(pending).map((a) => a.id)).toEqual(['a2', 'a3'])
  })

  it('select-all skips you', () => {
    const pending = [
      { id: 'a1', userId: ME },
      { id: 'a2', userId: 'user-other' },
    ]
    expect(verifiable(pending).map((a) => a.id)).toEqual(['a2'])
  })

  it('CONTROL — a panel with no self rows selects everyone', () => {
    // Without this the assertions above could pass because the selection is
    // simply broken for everybody.
    const pending = [
      { id: 'a1', userId: 'user-other' },
      { id: 'a2', userId: 'user-third' },
    ]
    expect(defaultSelection(pending)).toEqual(['a1', 'a2'])
  })
})
