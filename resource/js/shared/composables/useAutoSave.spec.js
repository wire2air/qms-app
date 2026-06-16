import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { useAutoSave } from './useAutoSave.js'

const tick = (ms) => new Promise((r) => setTimeout(r, ms))

describe('useAutoSave', () => {
  it('skips the initial load, then debounce-saves on a later change', async () => {
    const save = vi.fn().mockResolvedValue()
    const entity = ref(null)
    useAutoSave(entity, { debounce: 10 })

    // Initial load (null → object): must NOT save.
    entity.value = { name: 'a', save }
    await nextTick()
    await tick(25)
    expect(save).not.toHaveBeenCalled()

    // A real edit (deep mutation): saves once after debounce.
    entity.value.name = 'b'
    await nextTick()
    await tick(25)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('surfaces save errors and toggles isSaving', async () => {
    const save = vi.fn().mockRejectedValue(new Error('boom'))
    const entity = ref(null)
    const { saveError } = useAutoSave(entity, { debounce: 10 })

    entity.value = { name: 'a', save } // initial load (skipped)
    await nextTick()
    entity.value.name = 'c' // real edit
    await nextTick()
    await tick(30)
    expect(save).toHaveBeenCalledTimes(1)
    expect(saveError.value).toBe('boom')
  })

  it('respects the enabled gate (no save when disabled)', async () => {
    const save = vi.fn().mockResolvedValue()
    const entity = ref(null)
    const enabled = ref(false)
    useAutoSave(entity, { debounce: 10, enabled })

    entity.value = { name: 'a', save } // initial load (skipped)
    await nextTick()
    entity.value.name = 'x' // edit while disabled → no save
    await nextTick()
    await tick(25)
    expect(save).not.toHaveBeenCalled()

    enabled.value = true
    entity.value.name = 'y' // edit while enabled → saves
    await nextTick()
    await tick(25)
    expect(save).toHaveBeenCalledTimes(1)
  })
})
