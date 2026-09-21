import { describe, it, expect } from 'vitest'
import { hydrateAiFields, hydrateAiField, generateFieldName } from './aiFormHydrate'

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

describe('AI lookup fields', () => {
  // `lookup` was not in the AI's emittable set, so the model could not propose
  // one and invented a select with a hand-typed option list for things the
  // system already holds — items, equipment, shifts. Those lists go stale, and
  // the answer stores a typed string nobody can group by.
  it('binds the field to the entity the AI asked for', () => {
    const f = hydrateAiField({ type: 'lookup', label: 'Shift', lookupEntity: 'shift' }, [])
    expect(f.type).toBe('lookup')
    expect(f.lookupEntity).toBe('shift')
  })

  it('ignores an entity that does not exist rather than writing it through', () => {
    // The select menu is resolved from LOOKUP_ENTITIES by name, so a bogus
    // value renders an empty control. Falling back to the builder default is a
    // visible wrong answer the author can correct; a blank one is a puzzle.
    const f = hydrateAiField({ type: 'lookup', label: 'Widget', lookupEntity: 'nonsense' }, [])
    expect(f.type).toBe('lookup')
    expect(f.lookupEntity).toBe('product') // the builder's default, untouched
  })

  it('leaves the default alone when the AI omits the entity', () => {
    const f = hydrateAiField({ type: 'lookup', label: 'Thing' }, [])
    expect(f.lookupEntity).toBe('product')
  })

  it('supports every entity the builder offers', () => {
    for (const entity of ['product', 'equipment', 'shift', 'productionLine', 'uom', 'user']) {
      expect(
        hydrateAiField({ type: 'lookup', label: 'x', lookupEntity: entity }, []).lookupEntity,
      ).toBe(entity)
    }
  })
})
