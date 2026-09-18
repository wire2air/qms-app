import { describe, it, expect } from 'vitest'
import { useConfirm, useConfirmState } from './useConfirm.js'

const { confirm } = useConfirm()
const { state, resolveWith } = useConfirmState()

describe('useConfirm', () => {
  it('opens with mapped options and resolves true on confirm', async () => {
    const p = confirm({ title: 'Delete', message: 'Sure?', okLabel: 'Delete', danger: true })
    expect(state.open).toBe(true)
    expect(state.options.title).toBe('Delete')
    expect(state.options.okLabel).toBe('Delete')
    expect(state.options.okVariant).toBe('danger') // danger → red button
    resolveWith(true)
    await expect(p).resolves.toBe(true)
    expect(state.open).toBe(false)
  })

  it('resolves false on cancel/dismiss', async () => {
    const p = confirm({ message: 'Sure?' })
    expect(state.options.okVariant).toBe('primary') // default, non-destructive
    resolveWith(false)
    await expect(p).resolves.toBe(false)
  })

  it('auto-cancels a prior open prompt when a new one is requested', async () => {
    const first = confirm({ message: 'first' })
    const second = confirm({ message: 'second' })
    await expect(first).resolves.toBe(false) // superseded
    expect(state.options.message).toBe('second')
    resolveWith(true)
    await expect(second).resolves.toBe(true)
  })
})
