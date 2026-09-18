/**
 * A rule's condition tree must survive being opened and saved.
 *
 * The builder hydrated `conditionTree.conditions` and rebuilt the tree as
 * `{ logic, conditions }` — no `groups` key. The evaluator supports nested
 * groups, the column is free-form JSONB, and rules carrying groups exist. So
 * opening one of those rules to change its NAME and pressing Save deleted the
 * nested logic permanently.
 *
 * Nothing signalled it. The builder never displayed groups, so the form looked
 * complete; the save succeeded; the rule stayed active. And the damage runs the
 * quiet direction: an ANDed group that disappears WIDENS the rule. A rule that
 * fired on "critical AND (supplier-facing OR safety issue)" starts firing on
 * everything critical — which reads as an over-noisy rule, not as data loss,
 * so nobody traces it back to the edit.
 */
import { describe, it, expect } from 'vitest'
import {
  buildConditionTree,
  hydrateConditionTree,
  normalizeConditionValue,
} from './automationConditionTree.js'

/** A rule with nested logic the builder cannot author but must not destroy. */
const NESTED = {
  logic: 'AND',
  conditions: [{ field: 'severity_id', operator: 'is', value: 'CRITICAL' }],
  groups: [
    {
      logic: 'OR',
      conditions: [
        { field: 'is_supplier_facing', operator: 'is_true' },
        { field: 'safety_issue', operator: 'is_true' },
      ],
    },
  ],
}

describe('nested groups survive the round trip', () => {
  it('open then save reproduces the tree exactly — the data loss this closes', () => {
    const saved = buildConditionTree(hydrateConditionTree(NESTED))
    expect(saved).toEqual(NESTED)
  })

  it('groups survive an edit to everything around them', () => {
    // The realistic case: somebody opens the rule to rename it or add one more
    // top-level condition. The groups are not what they came for and must not
    // be what they lose.
    const draft = hydrateConditionTree(NESTED)
    draft.conditions.push({ field: 'site_id', operator: 'is', value: 'site-1' })
    draft.logic = 'AND'

    const saved = buildConditionTree(draft)
    expect(saved.groups).toEqual(NESTED.groups)
    expect(saved.conditions).toHaveLength(2)
  })

  it('deeply nested groups survive too', () => {
    const deep = {
      logic: 'OR',
      conditions: [],
      groups: [
        {
          logic: 'AND',
          conditions: [{ field: 'a', operator: 'is', value: '1' }],
          groups: [{ logic: 'OR', conditions: [{ field: 'b', operator: 'is', value: '2' }] }],
        },
      ],
    }
    expect(buildConditionTree(hydrateConditionTree(deep))).toEqual(deep)
  })

  it('the hydrated groups are a COPY, so editing the draft cannot mutate the record', () => {
    // conditionTree comes off a live syncEngine instance. Mutating it in place
    // would write through to the cached model and to any other component
    // showing it, before anything was saved.
    const draft = hydrateConditionTree(NESTED)
    draft.groups[0].logic = 'AND'
    expect(NESTED.groups[0].logic).toBe('OR')
  })
})

describe('rules with no groups keep exactly the shape they had', () => {
  it('does not add an empty groups key', () => {
    // A spurious `groups: []` on every rule would be a diff on every save and a
    // meaningless one — worth avoiding so a real group change stands out.
    const flat = { logic: 'AND', conditions: [{ field: 'a', operator: 'is', value: '1' }] }
    const saved = buildConditionTree(hydrateConditionTree(flat))
    expect(saved).toEqual(flat)
    expect('groups' in saved).toBe(false)
  })

  it('an absent tree hydrates to an empty AND', () => {
    expect(hydrateConditionTree(null)).toEqual({ logic: 'AND', conditions: [], groups: [] })
    expect(hydrateConditionTree(undefined).logic).toBe('AND')
    expect(hydrateConditionTree({}).conditions).toEqual([])
  })

  it('a malformed groups value is ignored rather than thrown on', () => {
    // The column is unvalidated JSONB; it can hold anything.
    expect(hydrateConditionTree({ groups: 'nonsense' }).groups).toEqual([])
    expect(hydrateConditionTree({ conditions: null }).conditions).toEqual([])
  })
})

describe('condition serialisation', () => {
  it('drops half-filled condition rows', () => {
    // A row the user added and never completed. Storing it matters because the
    // evaluator treats a malformed condition as MATCHING — so an unfinished row
    // does not narrow the rule, it disables the narrowing.
    const saved = buildConditionTree({
      logic: 'AND',
      conditions: [
        { field: '', operator: 'is', value: 'x' },
        { field: 'a', operator: '', value: 'x' },
        { field: 'a', operator: 'is', value: 'x' },
      ],
    })
    expect(saved.conditions).toEqual([{ field: 'a', operator: 'is', value: 'x' }])
  })

  it('omits the value entirely for operators that take none', () => {
    const saved = buildConditionTree({
      logic: 'AND',
      conditions: [{ field: 'a', operator: 'is_empty', value: 'leftover' }],
    })
    expect(saved.conditions[0]).toEqual({ field: 'a', operator: 'is_empty' })
  })

  it('splits a comma-separated list operator into a trimmed array', () => {
    expect(normalizeConditionValue({ operator: 'in', value: 'A, B ,C' })).toEqual(['A', 'B', 'C'])
    expect(normalizeConditionValue({ operator: 'in', value: ['A', 'B'] })).toEqual(['A', 'B'])
    expect(normalizeConditionValue({ operator: 'in', value: 'A,,B' })).toEqual(['A', 'B'])
  })

  it('leaves a scalar value alone', () => {
    expect(normalizeConditionValue({ operator: 'is', value: 'OPEN' })).toBe('OPEN')
    expect(normalizeConditionValue({ operator: '>', value: 5 })).toBe(5)
  })
})
