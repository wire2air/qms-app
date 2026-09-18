import { describe, it, expect } from 'vitest'
import { serializeSchemaForAi } from './aiFormSerialize'

describe('serializeSchemaForAi', () => {
  it('flattens sections into a section label per child', () => {
    const schema = [
      {
        name: 'section_1',
        type: 'section',
        label: 'Setup',
        children: [{ name: 'input_1', type: 'input', label: 'Line' }],
      },
      { name: 'number_1', type: 'number', label: 'Count' },
    ]
    const out = serializeSchemaForAi(schema)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ name: 'input_1', section: 'Setup' })
    expect(out[1].section).toBeUndefined()
  })

  it('surfaces min/max, placeholder, hint, and non-default width', () => {
    const out = serializeSchemaForAi([
      {
        name: 'number_1',
        type: 'number',
        label: 'Temp',
        min: 2,
        max: 8,
        placeholder: '2-8',
        hint: 'Cold chain',
        width: 'half',
      },
    ])
    expect(out[0]).toMatchObject({ min: 2, max: 8, placeholder: '2-8', hint: 'Cold chain', width: 'half' })
    // Default width is noise — omitted.
    const plain = serializeSchemaForAi([{ name: 'i1', type: 'input', label: 'X', width: 'full' }])
    expect(plain[0].width).toBeUndefined()
  })

  it('surfaces checklist rows and columns in the AI column shape', () => {
    const out = serializeSchemaForAi([
      {
        name: 'checklist_1',
        type: 'checklist',
        label: 'Clearance',
        rows: ['Area clean', 'Tools removed'],
        columns: [
          { label: 'Yes', value: 'yes', inputType: 'radio' },
          { label: 'Comments', value: 'comments', inputType: 'text' },
        ],
      },
    ])
    expect(out[0].rows).toEqual(['Area clean', 'Tools removed'])
    expect(out[0].columns).toEqual([
      { label: 'Yes', inputType: 'radio' },
      { label: 'Comments', inputType: 'text' },
    ])
  })
})
