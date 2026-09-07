/**
 * SCHEDULED is only offered where a scheduled rule can actually fire.
 *
 * One job serves the SCHEDULED trigger — `evaluate_scheduled_automation.js` —
 * and it enumerates the `records` table only. The first statement inside its
 * loop is `if (!isModuleObjectType(objectType)) continue`, where
 * isModuleObjectType is `/^[a-z][a-z0-9_]*$/`. Every built-in object type is
 * PascalCase, so all seven fail it.
 *
 * The builder offered SCHEDULED for every object with no filter. A rule built
 * that way saves without complaint, lists as Active, and is evaluated by
 * nothing. That is worse than an error message: the person who built the
 * escalation has every reason to believe it is running, and the only evidence
 * otherwise is an absence.
 *
 * The backend half of this is pinned in
 * qms/backend/worker/tasks/evaluate_scheduled_automation.test.js, which asserts
 * that a built-in objectType enqueues nothing. This is the UI half: it asserts
 * the option is not offered in the first place.
 */
import { describe, it, expect } from 'vitest'
import { AUTOMATION_OBJECTS, AUTOMATION_TRIGGERS, triggersForObject } from './automationObjects.js'

const values = (objectType, opts) => triggersForObject(objectType, opts).map((t) => t.value)

describe('trigger options per object', () => {
  it('never offers SCHEDULED for any of the seven built-in objects', () => {
    expect(AUTOMATION_OBJECTS).toHaveLength(7)
    for (const { value } of AUTOMATION_OBJECTS) {
      expect(values(value), `${value} still offers SCHEDULED`).not.toContain('SCHEDULED')
    }
  })

  it('offers SCHEDULED for an admin-defined module record', () => {
    // The only object type the sweep serves — and the one time-based rules were
    // built for (re-qualification reminders, next_review_date follow-ups).
    expect(values('deviation')).toContain('SCHEDULED')
    expect(values('supplier_audit')).toContain('SCHEDULED')
  })

  it('offers SCHEDULED in module MODE, where the type is fixed by the caller', () => {
    // The per-template Automation tab passes fixedObjectType and knows it is a
    // module without needing to re-derive it from the string shape.
    expect(values('QualityEvent', { isModule: true })).toContain('SCHEDULED')
  })

  it('always offers the three event-driven triggers', () => {
    // Those come from the audit side effect, which watches every object's
    // table. Narrowing SCHEDULED must not narrow anything else.
    for (const objectType of [...AUTOMATION_OBJECTS.map((o) => o.value), 'deviation']) {
      expect(values(objectType)).toEqual(
        expect.arrayContaining(['CREATED', 'UPDATED', 'STATUS_CHANGED']),
      )
    }
  })

  it('preserves the order and labels of the full list', () => {
    // The picker renders these directly; filtering must not reorder or relabel.
    const full = AUTOMATION_TRIGGERS.map((t) => t.value)
    expect(values('deviation')).toEqual(full)
    expect(values('Capa')).toEqual(full.filter((v) => v !== 'SCHEDULED'))
  })

  it('a missing or empty object type is treated as built-in', () => {
    // The safe direction: offering a trigger that cannot fire is the bug; not
    // offering one is a visible gap somebody reports.
    expect(values(null)).not.toContain('SCHEDULED')
    expect(values('')).not.toContain('SCHEDULED')
    expect(values(undefined)).not.toContain('SCHEDULED')
  })

  it('the shape test matches the worker regex exactly', () => {
    // The FE decides by shape and the worker decides by the same shape. If they
    // ever disagree, the picker offers what the sweep skips — which is the
    // whole defect, restored.
    for (const t of ['deviation', 'supplier_audit', 'a', 'a1_b2']) {
      expect(values(t)).toContain('SCHEDULED')
    }
    for (const t of ['Deviation', '_deviation', '1deviation', 'QualityEvent']) {
      expect(values(t)).not.toContain('SCHEDULED')
    }
  })

  it('the full list is still exported for display, not just for the picker', () => {
    // The rules LIST and the per-template tab label existing rules from
    // AUTOMATION_TRIGGERS. Filtering there too would render a saved SCHEDULED
    // rule with a blank trigger column — hiding the very rules an operator
    // needs to find and fix.
    expect(AUTOMATION_TRIGGERS.map((t) => t.value)).toContain('SCHEDULED')
  })
})
