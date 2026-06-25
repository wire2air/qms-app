import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { createUnsavedGuard } from './useUnsavedChangesGuard.js'

// createUnsavedGuard is the pure decision core (no router). useUnsavedChangesGuard
// wraps it with onBeforeRouteLeave; the wrapper is a 2-line composition verified
// at runtime. Here we pin down the leave/discard decision logic.

describe('createUnsavedGuard', () => {
  it('allows leaving without prompting when not dirty', () => {
    const confirm = vi.fn(() => true)
    const { confirmLeave } = createUnsavedGuard(ref(false), { confirm })
    expect(confirmLeave()).toBe(true)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('prompts when dirty and returns the user’s choice', () => {
    const confirm = vi.fn(() => true)
    const { confirmLeave } = createUnsavedGuard(ref(true), { confirm, message: 'Discard?' })
    expect(confirmLeave()).toBe(true)
    expect(confirm).toHaveBeenCalledWith('Discard?')
  })

  it('blocks leaving when dirty and the user cancels the prompt', () => {
    const confirm = vi.fn(() => false)
    const { confirmLeave } = createUnsavedGuard(ref(true), { confirm })
    expect(confirmLeave()).toBe(false)
  })

  it('stops prompting after allowLeave() (e.g. a successful save)', () => {
    const confirm = vi.fn(() => false)
    const { confirmLeave, allowLeave } = createUnsavedGuard(ref(true), { confirm })
    allowLeave()
    expect(confirmLeave()).toBe(true)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('accepts a getter for the dirty state', () => {
    let dirty = false
    const confirm = vi.fn(() => true)
    const { confirmLeave } = createUnsavedGuard(() => dirty, { confirm })
    expect(confirmLeave()).toBe(true) // clean → no prompt
    expect(confirm).not.toHaveBeenCalled()
    dirty = true
    expect(confirmLeave()).toBe(true) // now prompts, confirm returns true
    expect(confirm).toHaveBeenCalledOnce()
  })
})
