import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useSelectKeyboard } from './useSelectKeyboard.js'

// header (not focusable), two options, a disabled option (not focusable)
function makeRows() {
  return ref([
    { kind: 'header', focusable: false },
    { kind: 'option', focusable: true, key: 'o1' },
    { kind: 'option', focusable: true, key: 'o2' },
    { kind: 'option', focusable: false, key: 'o3' }, // disabled
  ])
}

function key(name, target = {}) {
  return { key: name, preventDefault: vi.fn(), target }
}

describe('useSelectKeyboard', () => {
  it('ArrowDown lands on the first focusable row, skipping headers', () => {
    const rows = makeRows()
    const activeIndex = ref(-1)
    const { onKeydown } = useSelectKeyboard({ rows, activeIndex, onSelect: vi.fn(), onClose: vi.fn() })
    onKeydown(key('ArrowDown'))
    expect(activeIndex.value).toBe(1)
  })

  it('ArrowDown/Up skip non-focusable (disabled) rows', () => {
    const rows = makeRows()
    const activeIndex = ref(1)
    const { onKeydown } = useSelectKeyboard({ rows, activeIndex, onSelect: vi.fn(), onClose: vi.fn() })
    onKeydown(key('ArrowDown'))
    expect(activeIndex.value).toBe(2) // stops at last focusable, skips index 3
    onKeydown(key('ArrowDown'))
    expect(activeIndex.value).toBe(2)
    onKeydown(key('ArrowUp'))
    expect(activeIndex.value).toBe(1)
  })

  it('Home/End jump to first/last focusable', () => {
    const rows = makeRows()
    const activeIndex = ref(2)
    const { onKeydown } = useSelectKeyboard({ rows, activeIndex, onSelect: vi.fn(), onClose: vi.fn() })
    onKeydown(key('Home'))
    expect(activeIndex.value).toBe(1)
    onKeydown(key('End'))
    expect(activeIndex.value).toBe(2)
  })

  it('Enter selects the active row', () => {
    const rows = makeRows()
    const activeIndex = ref(2)
    const onSelect = vi.fn()
    const { onKeydown } = useSelectKeyboard({ rows, activeIndex, onSelect, onClose: vi.fn() })
    onKeydown(key('Enter'))
    expect(onSelect).toHaveBeenCalledWith(rows.value[2])
  })

  it('Escape closes', () => {
    const rows = makeRows()
    const onClose = vi.fn()
    const { onKeydown } = useSelectKeyboard({ rows, activeIndex: ref(1), onSelect: vi.fn(), onClose })
    onKeydown(key('Escape'))
    expect(onClose).toHaveBeenCalled()
  })

  it('Backspace on empty query fires onBackspace', () => {
    const onBackspace = vi.fn()
    const { onKeydown } = useSelectKeyboard({
      rows: makeRows(),
      activeIndex: ref(1),
      onSelect: vi.fn(),
      onClose: vi.fn(),
      onBackspace,
    })
    onKeydown(key('Backspace', { value: '' }))
    expect(onBackspace).toHaveBeenCalled()
    onKeydown(key('Backspace', { value: 'abc' }))
    expect(onBackspace).toHaveBeenCalledTimes(1) // not fired when query non-empty
  })
})
