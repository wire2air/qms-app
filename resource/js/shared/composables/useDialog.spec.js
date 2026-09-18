import { describe, it, expect, vi } from 'vitest'
import { useDialog } from './useDialog.js'

describe('useDialog', () => {
  it('defaults to closed and opens/closes', () => {
    const d = useDialog()
    expect(d.isOpen.value).toBe(false)
    d.open()
    expect(d.isOpen.value).toBe(true)
    d.close()
    expect(d.isOpen.value).toBe(false)
  })

  it('honours the initial state', () => {
    expect(useDialog({ initial: true }).isOpen.value).toBe(true)
  })

  it('toggles', () => {
    const d = useDialog()
    d.toggle()
    expect(d.isOpen.value).toBe(true)
    d.toggle()
    expect(d.isOpen.value).toBe(false)
  })

  it('runs onOpen/onClose only on actual transitions', () => {
    const onOpen = vi.fn()
    const onClose = vi.fn()
    const d = useDialog({ onOpen, onClose })
    d.open()
    d.open() // no-op (already open)
    expect(onOpen).toHaveBeenCalledTimes(1)
    d.close()
    d.close() // no-op
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
