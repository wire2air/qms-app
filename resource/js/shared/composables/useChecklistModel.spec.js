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

// Same inputType on every column is NOT uniform unless that type is radio.
// Four text columns (1st Hr … 4th Hr) used to collapse to one value per row,
// so typing in any hour filled every hour (2026-10-12, Hourly Torque Values).
describe('useChecklistModel — same non-radio type on every column is per-cell', () => {
  const HOURS = ['1stHr', '2ndHr', '3rdHr', '4thHr'].map((value) => ({
    value,
    label: value,
    inputType: 'text',
  }))

  it('all-text columns are not uniform', () => {
    expect(useChecklistModel(ref([]), () => HOURS).hasUniformInputType.value).toBe(false)
  })

  it('each column keeps its own value within a row', () => {
    const model = ref([])
    const m = useChecklistModel(model, () => HOURS)
    m.handleValueChange(0, '1stHr', '12.1')
    m.handleValueChange(0, '2ndHr', '12.4')
    expect(m.getValue(0, '1stHr', '')).toBe('12.1')
    expect(m.getValue(0, '2ndHr', '')).toBe('12.4')
    expect(m.getValue(0, '3rdHr', '')).toBe('')
    expect(model.value).toEqual([{ '1stHr': '12.1', '2ndHr': '12.4' }])
  })

  it('all-checkbox columns are per-cell too', () => {
    const cols = [{ value: 'a', inputType: 'checkbox' }, { value: 'b', inputType: 'checkbox' }]
    const model = ref([])
    const m = useChecklistModel(model, () => cols)
    m.handleValueChange(0, 'a', true)
    expect(m.getValue(0, 'a', false)).toBe(true)
    expect(m.getValue(0, 'b', false)).toBe(false)
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
