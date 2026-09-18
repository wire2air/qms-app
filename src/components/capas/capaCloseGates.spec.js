/**
 * The header Close button must not be gated on the close dialog's contents.
 *
 * Reported 2026-08-18: a CAPA whose three workflow steps were all APPROVED
 * showed a permanently disabled "Close CAPA" button. One gate served both the
 * header button and the dialog's "Sign & Close", and it required non-empty
 * closure comments — which are typed inside the dialog the header button opens.
 * Unsatisfiable by construction.
 *
 * The first test below is the regression itself; the rest pin the boundary
 * between the two gates so they cannot quietly merge again.
 */
import { describe, it, expect } from 'vitest'
import {
  canOpenClose,
  canSubmitClose,
  closeBlockedReason,
  closeSubmitBlockedReason,
} from './capaCloseGates.js'

/** A CAPA with every step finished and an untouched close dialog. */
const readyToClose = { incompleteStepCount: 0, comments: '' }

describe('canOpenClose', () => {
  it('opens the dialog on a fully-approved CAPA even though the dialog is empty', () => {
    // THE regression. The header button exists to collect these fields; it
    // cannot require them.
    expect(canOpenClose(readyToClose)).toBe(true)
  })

  it('stays shut while any step is still open', () => {
    expect(canOpenClose({ incompleteStepCount: 1 })).toBe(false)
    expect(canOpenClose({ incompleteStepCount: 3 })).toBe(false)
  })

  it('ignores the dialog fields entirely', () => {
    const withFields = { incompleteStepCount: 0, comments: 'done' }
    expect(canOpenClose(withFields)).toBe(canOpenClose(readyToClose))
  })

  it('defaults to open when handed nothing (live query still resolving)', () => {
    // incompleteStepCount's live query starts at 0, so this is the real
    // first-paint state — not a hypothetical.
    expect(canOpenClose()).toBe(true)
  })
})

describe('canSubmitClose', () => {
  it('refuses an empty dialog', () => {
    expect(canSubmitClose(readyToClose)).toBe(false)
  })

  it('refuses comments that are only whitespace', () => {
    expect(canSubmitClose({ incompleteStepCount: 0, comments: '   \n\t ' })).toBe(false)
  })

  // The effectiveness-check date left this dialog on 2026-08-18 — the workflow's
  // DELAY step owns it — so comments are now the only field it gates on.
  it('accepts a complete dialog on a finished workflow', () => {
    expect(canSubmitClose({ incompleteStepCount: 0, comments: 'Verified.' })).toBe(true)
  })

  it('still refuses when a step is open, however complete the dialog', () => {
    expect(canSubmitClose({ incompleteStepCount: 2, comments: 'Verified.' })).toBe(false)
  })
})

describe('the reasons stay on their own side', () => {
  it('the header reason never mentions the dialog fields', () => {
    // If this ever fails, the gates have merged again: the header button is
    // reporting a blocker the user cannot act on from where they are standing.
    expect(closeBlockedReason(readyToClose)).toBe('')
  })

  it('the header reason names the outstanding steps, pluralised', () => {
    expect(closeBlockedReason({ incompleteStepCount: 1 })).toMatch(/^1 workflow step still open/)
    expect(closeBlockedReason({ incompleteStepCount: 4 })).toMatch(/^4 workflow steps still open/)
  })

  it('the submit reason asks for the comments', () => {
    expect(closeSubmitBlockedReason(readyToClose)).toBe('Add closure comments.')
  })

  it('the submit reason leads with the workflow when steps are open', () => {
    expect(closeSubmitBlockedReason({ incompleteStepCount: 2, comments: '' })).toMatch(
      /2 workflow steps still open/,
    )
  })

  it('is empty exactly when the matching gate is open', () => {
    const complete = { incompleteStepCount: 0, comments: 'Verified.' }
    expect(closeSubmitBlockedReason(complete)).toBe('')
    expect(canSubmitClose(complete)).toBe(true)
  })
})
