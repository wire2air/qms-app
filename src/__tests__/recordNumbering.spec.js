import { describe, it, expect } from 'vitest'
import { buildKeyInput } from '@syncEngine/network/MutationRunner.js'

// QA #12 — record numbering stalled because record_counters was re-keyed to a
// COMPOSITE primary key (company_id, template_id) but the client model declared
// a single primaryKey ('templateId'), so the counter UPDATE only sent templateId
// and PostGraphile rejected it: "Field 'companyId' of required type 'UUID!' was
// not provided". The fix: MutationRunner honours an optional `static keyFields`
// on the model, defaulting to [primaryKey] (byte-identical for every other model).

// Build a fake instance whose class optionally carries a static keyFields.
function instanceOf(fields, keyFields) {
  class Model {}
  if (keyFields) Model.keyFields = keyFields
  return Object.assign(new Model(), fields)
}

describe('buildKeyInput (MutationRunner composite-key support)', () => {
  it('defaults to the single primary key (unchanged for normal models)', () => {
    const inst = instanceOf({ id: 'abc', name: 'x' })
    expect(buildKeyInput({ pk: 'id' }, inst)).toEqual({ id: 'abc' })
  })

  it('sends every declared key field for a composite-key model (the RecordCounter fix)', () => {
    const inst = instanceOf(
      { companyId: 'co-1', templateId: 'tpl-1', currentValue: 2 },
      ['companyId', 'templateId'],
    )
    expect(buildKeyInput({ pk: 'templateId' }, inst)).toEqual({
      companyId: 'co-1',
      templateId: 'tpl-1',
    })
    // currentValue is not a key field — it belongs in the patch, not the input key.
    expect(buildKeyInput({ pk: 'templateId' }, inst)).not.toHaveProperty('currentValue')
  })

  it('ignores an empty keyFields array and falls back to the primary key', () => {
    const inst = instanceOf({ id: 'z' }, [])
    expect(buildKeyInput({ pk: 'id' }, inst)).toEqual({ id: 'z' })
  })
})
