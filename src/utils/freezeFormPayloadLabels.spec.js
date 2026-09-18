// CFL — freezeOptionLabels(), the Custom Fields / Option Sets module's most
// sophisticated mechanism, which shipped with ZERO test coverage in either
// direction. (docs/modules/custom-fields-lookups/17-missing-coverage-report.md)
//
// WHAT IT IS FOR. Option-set-backed fields (select / radio / optionGroup /
// lookup) store the option's ID as the form value. The renderer resolves that id
// against the LIVE OptionSet at view time, so an admin renaming an option later
// silently changes what a saved record appears to say. For a sealed / approved
// record that is not acceptable — what the user picked must read the same five
// years from now. This function walks the schema alongside the payload and
// stamps the display label into a sibling `_optionLabels` map AT THE SAME SCOPE
// AS THE VALUE, so FormSchemaReadonlyView can render the frozen reading and only
// fall back to a live lookup when no frozen label exists.
//
// It is the seal on every custom-field answer (CustomFieldsCard, and the two
// create-time paths CustomFieldsCreateSection.persist() and QaComplaintsCreate),
// and on workflow step forms and QC field records besides. If it silently stops
// freezing, nothing fails: records keep saving, and the drift only becomes
// visible the day someone renames an option and a closed record starts reading
// differently — which is precisely the failure the mechanism exists to prevent,
// and precisely the failure no test would have caught.
//
// The scope rules mirror DynamicForm.js's value-path traversal and are the part
// most likely to be broken by a refactor:
//   named section / row / column  → children open a NEW value scope (values[name])
//   UNNAMED row / column          → transparent; children share the parent scope
//   repeater                      → values[name] is an array; each item is its
//                                   own scope with its own _optionLabels map
import { describe, it, expect, vi } from 'vitest'
import { freezeOptionLabels } from './freezeFormPayloadLabels.js'

/**
 * Minimal stand-in for the syncEngine db handle. Records every findByPk call so
 * the batching/dedup behaviour can be asserted, which is the difference between
 * one IDB lookup and one per field.
 */
function fakeDb(sets) {
  const calls = []
  return {
    calls,
    OptionSet: {
      findByPk: vi.fn(async (id) => {
        calls.push(id)
        return sets[id] ?? null
      }),
    },
  }
}

/** Option set shapes the resolver must handle — all three exist in the wild. */
const SETS = {
  // object array, {id,label}
  severity: {
    id: 'severity',
    options: [
      { id: 'sev-1', label: 'Minor' },
      { id: 'sev-2', label: 'Major' },
      { id: 'sev-3', label: 'Critical' },
    ],
  },
  // object array, {value,name} — the other naming the resolver supports
  disposition: {
    id: 'disposition',
    options: [
      { value: 'disp-1', name: 'Scrap' },
      { value: 'disp-2', name: 'Rework' },
    ],
  },
  // plain string array — value IS the label
  shift: { id: 'shift', options: ['Day', 'Night'] },
}

const selectField = (name, optionSetId, type = 'select') => ({ name, type, optionSetId })

describe('freezeOptionLabels — guards', () => {
  it('returns the payload untouched when the schema is not an array', async () => {
    const db = fakeDb(SETS)
    const payload = { severity: 'sev-2' }
    expect(await freezeOptionLabels(db, null, payload)).toBe(payload)
    expect(await freezeOptionLabels(db, undefined, payload)).toBe(payload)
    expect(await freezeOptionLabels(db, 'nope', payload)).toBe(payload)
    expect(db.OptionSet.findByPk).not.toHaveBeenCalled()
  })

  it('returns the payload untouched when there is no payload object', async () => {
    const db = fakeDb(SETS)
    const schema = [selectField('severity', 'severity')]
    expect(await freezeOptionLabels(db, schema, null)).toBe(null)
    expect(await freezeOptionLabels(db, schema, undefined)).toBe(undefined)
    expect(await freezeOptionLabels(db, schema, 'nope')).toBe('nope')
  })

  it('short-circuits — and touches the database not at all — when no field uses an option set', async () => {
    // The common case on a plain text-only custom field set. Fetching here would
    // put an IDB round trip on every save of every record for no reason.
    const db = fakeDb(SETS)
    const payload = { note: 'hello' }
    const out = await freezeOptionLabels(db, [{ name: 'note', type: 'text' }], payload)
    expect(out).toBe(payload)
    expect(db.OptionSet.findByPk).not.toHaveBeenCalled()
  })

  it('ignores option-set-less fields of an option-set-capable type', async () => {
    // type is select but no optionSetId — a hand-authored options list.
    const db = fakeDb(SETS)
    const payload = { pick: 'a' }
    expect(await freezeOptionLabels(db, [{ name: 'pick', type: 'select' }], payload)).toBe(payload)
    expect(db.OptionSet.findByPk).not.toHaveBeenCalled()
  })
})

describe('freezeOptionLabels — the freeze itself', () => {
  it('stamps the label for a top-level select', async () => {
    const db = fakeDb(SETS)
    const out = await freezeOptionLabels(db, [selectField('severity', 'severity')], {
      severity: 'sev-3',
    })
    expect(out).toEqual({ severity: 'sev-3', _optionLabels: { severity: 'Critical' } })
  })

  it('freezes radio, optionGroup and lookup fields too, not just select', async () => {
    // lookup fields can be option-set-sourced (lookupEntity 'optionSet'); leaving
    // them out would seal three field types and silently skip the fourth.
    for (const type of ['select', 'radio', 'optionGroup', 'lookup']) {
      const db = fakeDb(SETS)
      const out = await freezeOptionLabels(db, [selectField('severity', 'severity', type)], {
        severity: 'sev-1',
      })
      expect(out._optionLabels, `type ${type} was not frozen`).toEqual({ severity: 'Minor' })
    }
  })

  it('resolves {id,label}, {value,name} and plain-string option sets', async () => {
    const db = fakeDb(SETS)
    const out = await freezeOptionLabels(
      db,
      [
        selectField('severity', 'severity'),
        selectField('disposition', 'disposition'),
        selectField('shift', 'shift'),
      ],
      { severity: 'sev-2', disposition: 'disp-1', shift: 'Night' },
    )
    expect(out._optionLabels).toEqual({
      severity: 'Major',
      disposition: 'Scrap', // {value,name}
      shift: 'Night', // string array: value IS the label
    })
  })

  it('freezes a multi-select as an array of labels, positionally', async () => {
    const db = fakeDb(SETS)
    const out = await freezeOptionLabels(db, [selectField('severity', 'severity')], {
      severity: ['sev-3', 'sev-1'],
    })
    expect(out._optionLabels.severity).toEqual(['Critical', 'Minor'])
  })

  it('falls back to the raw value when the option no longer exists', async () => {
    // Better a stable stringification than a silent "—" on a sealed record: the
    // id is at least evidence of what was picked. Covers the case where an admin
    // deleted the option between the record being filled in and being saved.
    const db = fakeDb(SETS)
    const out = await freezeOptionLabels(db, [selectField('severity', 'severity')], {
      severity: 'sev-deleted',
    })
    expect(out._optionLabels.severity).toBe('sev-deleted')
  })

  it('writes no label when the OptionSet itself is gone', async () => {
    // findByPk returns null — the set was deleted, or never synced to this
    // client. Must not throw, and must not invent a label.
    const db = fakeDb({})
    const out = await freezeOptionLabels(db, [selectField('severity', 'severity')], {
      severity: 'sev-2',
    })
    expect(out).toEqual({ severity: 'sev-2' })
    expect(out._optionLabels).toBeUndefined()
  })

  it('writes no label for a field the user left empty', async () => {
    const db = fakeDb(SETS)
    const out = await freezeOptionLabels(
      db,
      [selectField('severity', 'severity'), selectField('shift', 'shift')],
      { severity: null, shift: 'Day' },
    )
    expect(out._optionLabels).toEqual({ shift: 'Day' })
    expect(out._optionLabels).not.toHaveProperty('severity')
  })

  it('does not stamp an empty _optionLabels map onto a scope with nothing to record', async () => {
    // Keeps the saved JSONB free of `"_optionLabels": {}` noise on every scope.
    const db = fakeDb(SETS)
    const out = await freezeOptionLabels(db, [selectField('severity', 'severity')], {
      severity: undefined,
    })
    expect(out).not.toHaveProperty('_optionLabels')
  })

  it("does not mutate the caller's payload", async () => {
    // CustomFieldsCard holds `formData` as a reactive ref and passes it straight
    // in; mutating it would write frozen labels into the live edit buffer and
    // they would then be re-sent as user data on the next save.
    const db = fakeDb(SETS)
    const payload = { severity: 'sev-1', nested: { a: 1 } }
    const out = await freezeOptionLabels(db, [selectField('severity', 'severity')], payload)
    expect(payload).toEqual({ severity: 'sev-1', nested: { a: 1 } })
    expect(out).not.toBe(payload)
  })
})

describe('freezeOptionLabels — scope traversal (mirrors DynamicForm value paths)', () => {
  it('recurses into a NAMED section, labelling inside the sub-scope', async () => {
    const db = fakeDb(SETS)
    const schema = [
      { name: 'details', type: 'section', children: [selectField('disposition', 'disposition')] },
    ]
    const out = await freezeOptionLabels(db, schema, { details: { disposition: 'disp-2' } })
    expect(out.details._optionLabels).toEqual({ disposition: 'Rework' })
    // and NOT at the top level — the readonly view passes the scoped sub-payload
    // down via getContainerValues, so a top-level label would never be read.
    expect(out._optionLabels).toBeUndefined()
  })

  it('treats an UNNAMED row/column as transparent, labelling at the parent scope', async () => {
    const db = fakeDb(SETS)
    const schema = [{ type: 'row', children: [selectField('severity', 'severity')] }]
    const out = await freezeOptionLabels(db, schema, { severity: 'sev-2' })
    expect(out._optionLabels).toEqual({ severity: 'Major' })
  })

  it('handles a named section nested inside an unnamed row', async () => {
    // The combination is what a real builder layout produces, and it is where a
    // naive "recurse on every children array" implementation goes wrong.
    const db = fakeDb(SETS)
    const schema = [
      {
        type: 'row',
        children: [
          selectField('severity', 'severity'),
          { name: 'details', type: 'section', children: [selectField('shift', 'shift')] },
        ],
      },
    ]
    const out = await freezeOptionLabels(db, schema, {
      severity: 'sev-1',
      details: { shift: 'Day' },
    })
    expect(out._optionLabels).toEqual({ severity: 'Minor' })
    expect(out.details._optionLabels).toEqual({ shift: 'Day' })
  })

  it('gives every repeater item its own _optionLabels map', async () => {
    const db = fakeDb(SETS)
    const schema = [{ name: 'items', type: 'repeater', template: [selectField('shift', 'shift')] }]
    const out = await freezeOptionLabels(db, schema, {
      items: [{ shift: 'Day' }, { shift: 'Night' }],
    })
    expect(out.items[0]._optionLabels).toEqual({ shift: 'Day' })
    expect(out.items[1]._optionLabels).toEqual({ shift: 'Night' })
    // Per-item, not one shared map at the repeater's scope — the readonly view
    // renders each item from its own sub-payload.
    expect(out._optionLabels).toBeUndefined()
  })

  it('leaves non-object repeater items alone rather than mis-freezing them', async () => {
    const db = fakeDb(SETS)
    const schema = [{ name: 'items', type: 'repeater', template: [selectField('shift', 'shift')] }]
    const out = await freezeOptionLabels(db, schema, { items: ['Day', null, 42] })
    expect(out.items).toEqual(['Day', null, 42])
  })

  it('skips a named container whose value is missing or not an object', async () => {
    const db = fakeDb(SETS)
    const schema = [{ name: 'details', type: 'section', children: [selectField('shift', 'shift')] }]
    expect(await freezeOptionLabels(db, schema, {})).toEqual({})
    expect(await freezeOptionLabels(db, schema, { details: 'oops' })).toEqual({ details: 'oops' })
  })

  it('survives null entries in a schema array', async () => {
    const db = fakeDb(SETS)
    const out = await freezeOptionLabels(db, [null, selectField('shift', 'shift'), null], {
      shift: 'Night',
    })
    expect(out._optionLabels).toEqual({ shift: 'Night' })
  })
})

describe('freezeOptionLabels — batching', () => {
  it('fetches each distinct OptionSet exactly once, however many fields use it', async () => {
    // The pre-scan exists so a form reusing one set across nested fields fires a
    // single IDB lookup. Regressing to per-field fetching would be invisible
    // except as save latency on large forms.
    const db = fakeDb(SETS)
    const schema = [
      selectField('a', 'shift'),
      { type: 'row', children: [selectField('b', 'shift')] },
      { name: 'sec', type: 'section', children: [selectField('c', 'shift')] },
      { name: 'items', type: 'repeater', template: [selectField('d', 'shift')] },
    ]
    await freezeOptionLabels(db, schema, {
      a: 'Day',
      b: 'Night',
      sec: { c: 'Day' },
      items: [{ d: 'Night' }, { d: 'Day' }],
    })
    expect(db.calls).toEqual(['shift'])
  })

  it('collects option sets referenced only inside a section or repeater template', async () => {
    // The pre-scan must descend children AND template, or a set used only deep in
    // the form is never fetched and every value under it silently goes unfrozen.
    const db = fakeDb(SETS)
    const schema = [
      { name: 'sec', type: 'section', children: [selectField('c', 'severity')] },
      { name: 'items', type: 'repeater', template: [selectField('d', 'disposition')] },
    ]
    await freezeOptionLabels(db, schema, { sec: { c: 'sev-1' }, items: [{ d: 'disp-1' }] })
    expect([...db.calls].sort()).toEqual(['disposition', 'severity'])
  })
})

describe('freezeOptionLabels — the guarantee the mechanism exists for', () => {
  it('a frozen payload still reads correctly after the option is renamed', async () => {
    // The whole point, stated end to end. Freeze against today's option set,
    // then rename the option, and assert the SEALED reading is unchanged — this
    // is what keeps a closed NC saying "Critical" after an admin relabels
    // sev-3 to "Sev 3 — Critical (deprecated)".
    const db = fakeDb(SETS)
    const schema = [selectField('severity', 'severity')]
    const sealed = await freezeOptionLabels(db, schema, { severity: 'sev-3' })
    expect(sealed._optionLabels.severity).toBe('Critical')

    const renamed = fakeDb({
      severity: { id: 'severity', options: [{ id: 'sev-3', label: 'Sev 3 (deprecated)' }] },
    })
    // The sealed payload is untouched by the rename — nothing re-resolves it.
    expect(sealed._optionLabels.severity).toBe('Critical')
    // And a live lookup today WOULD read differently, which is the drift being
    // prevented. Two-sided: without this half the assertion above proves nothing.
    const fresh = await freezeOptionLabels(renamed, schema, { severity: 'sev-3' })
    expect(fresh._optionLabels.severity).toBe('Sev 3 (deprecated)')
  })

  it('re-freezing an amended payload refreshes the labels rather than preserving stale ones', async () => {
    // Documented, deliberate behaviour: an amended payload should reflect labels
    // as they read at the moment of amend. The opposite reading — "frozen means
    // frozen forever, even on edit" — is a plausible misunderstanding, so pin it.
    const first = await freezeOptionLabels(fakeDb(SETS), [selectField('severity', 'severity')], {
      severity: 'sev-2',
    })
    expect(first._optionLabels.severity).toBe('Major')

    const renamed = fakeDb({
      severity: { id: 'severity', options: [{ id: 'sev-2', label: 'Major (revised)' }] },
    })
    const second = await freezeOptionLabels(renamed, [selectField('severity', 'severity')], first)
    expect(second._optionLabels.severity).toBe('Major (revised)')
  })

  it('preserves pre-existing labels for fields the re-freeze cannot resolve', async () => {
    // Labels start from whatever was already on the payload, so a re-save after
    // an OptionSet has been deleted must not blank the seal on a closed record.
    const already = { severity: 'sev-2', _optionLabels: { severity: 'Major' } }
    const out = await freezeOptionLabels(fakeDb({}), [selectField('severity', 'severity')], already)
    expect(out._optionLabels.severity).toBe('Major')
  })
})
