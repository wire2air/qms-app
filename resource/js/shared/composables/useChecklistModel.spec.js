import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useChecklistModel } from './useChecklistModel.js'

const RADIO_COLS = [
  { value: 'yes', label: 'Yes', inputType: 'radio' },
  { value: 'no', label: 'No', inputType: 'radio' },
]
const MIXED_COLS = [
  { value: 'done', label: 'Done', inputType: 'checkbox' },
  { value: 'note', label: 'Note', inputType: 'text' },
]

describe('useChecklistModel — uniform shape (flat array)', () => {
  it('detects a uniform input type', () => {
    const m = useChecklistModel(ref([]), () => RADIO_COLS)
    expect(m.hasUniformInputType.value).toBe(true)
  })

  it('treats columns with no inputType as uniform radios', () => {
    const m = useChecklistModel(ref([]), () => [{ value: 'a' }, { value: 'b' }])
    expect(m.hasUniformInputType.value).toBe(true)
  })

  it('reads/writes a flat array (one value per row)', () => {
    const model = ref([])
    const m = useChecklistModel(model, () => RADIO_COLS)
    m.handleValueChange(1, 'yes', 'yes')
    expect(model.value).toEqual([null, 'yes'])
    expect(m.getValue(1, 'yes')).toBe('yes')
    expect(m.isCellSelected(1, 'yes')).toBe(true)
    expect(m.isCellSelected(1, 'no')).toBe(false)
  })
})

describe('useChecklistModel — mixed shape (array of objects)', () => {
  it('detects a non-uniform input type', () => {
    const m = useChecklistModel(ref([]), () => MIXED_COLS)
    expect(m.hasUniformInputType.value).toBe(false)
  })

  it('reads/writes a per-column object keyed by column value', () => {
    const model = ref([])
    const m = useChecklistModel(model, () => MIXED_COLS)
    m.handleValueChange(0, 'done', true)
    m.handleValueChange(0, 'note', 'hello')
    expect(model.value).toEqual([{ done: true, note: 'hello' }])
    expect(m.getValue(0, 'note')).toBe('hello')
    expect(m.getValue(0, 'done')).toBe(true)
  })

  it('returns the default for an unset cell', () => {
    const m = useChecklistModel(ref([]), () => MIXED_COLS)
    expect(m.getValue(0, 'note', '')).toBe('')
  })
})

describe('useChecklistModel — interactive guard', () => {
  it('blocks writes when interactive() is false', () => {
    const model = ref([])
    const m = useChecklistModel(model, () => RADIO_COLS, { interactive: () => false })
    m.handleValueChange(0, 'yes', 'yes')
    expect(model.value).toEqual([])
  })

  it('reacts to columns changing shape', () => {
    const cols = ref(RADIO_COLS)
    const m = useChecklistModel(ref([]), cols)
    expect(m.hasUniformInputType.value).toBe(true)
    cols.value = MIXED_COLS
    expect(m.hasUniformInputType.value).toBe(false)
  })
})
