import { describe, it, expect } from 'vitest'
import { hydrateAiFields, generateFieldName } from './aiFormHydrate'

// The name-reservation contract: a nameless NEW field hydrated early in a
// proposal must never mint a name an echoed field needs later — that would
// silently defeat edit-mode preservation-by-name (the echoed field would be
// rebuilt as a fresh default and answers bound to it would orphan).
describe('AI hydrate name reservation', () => {
  it('generateFieldName skips reserved names', () => {
    expect(generateFieldName('input', [], new Set(['input_1', 'input_2']))).toBe('input_3')
    expect(generateFieldName('input', [])).toBe('input_1')
  })

  it('a new nameless field cannot steal a name echoed later in the proposal', () => {
    const proposal = [
      { type: 'input', label: 'New field at the top' }, // nameless — minted
      { name: 'input_1', type: 'input', label: 'Existing kept field' }, // echoed
    ]
    const schema = hydrateAiFields(proposal)
    expect(schema[0].name).toBe('input_2')
    expect(schema[1].name).toBe('input_1')
  })

  it('section containers avoid echoed names too', () => {
    const proposal = [
      { name: 'section_1', type: 'input', label: 'Oddly named existing field' },
      { type: 'input', label: 'Grouped', section: 'Details' },
    ]
    const schema = hydrateAiFields(proposal)
    const container = schema.find((f) => f.type === 'section')
    expect(container.name).not.toBe('section_1')
  })
})
