/**
 * How the RCA / Risk Assessment widgets decide which template to use.
 *
 * Reported 2026-08-16: adding either field said "no template linked to this
 * field" even though the tenant had exactly one template configured. The
 * widgets only ever read the id the form AUTHOR bound to the field, and the
 * builder creates those fields with a null id — so a field added from the
 * dropdown could never resolve anything.
 *
 * Pure resolver, extracted here so the rule is testable without mounting
 * (both components reach the SyncEngine models, which don't load under
 * vitest).
 */
import { describe, it, expect } from 'vitest'

/** Mirrors effectiveTemplateId in RcaField / RiskAssessmentField. */
function resolveTemplateId({ answerId, fieldId, available }) {
  if (answerId) return answerId
  if (fieldId) return fieldId
  return (available ?? []).length === 1 ? available[0].id : null
}

const T = (id) => ({ id })

describe('template resolution', () => {
  it('uses the only template when the field binds none', () => {
    // The reported case.
    expect(resolveTemplateId({ available: [T('only')] })).toBe('only')
  })

  it("prefers the author's binding over the sole template", () => {
    expect(resolveTemplateId({ fieldId: 'bound', available: [T('only')] })).toBe('bound')
  })

  it("prefers the responder's own pick over everything", () => {
    // Once someone chooses, that choice sticks for this answer.
    expect(
      resolveTemplateId({ answerId: 'picked', fieldId: 'bound', available: [T('only')] }),
    ).toBe('picked')
  })

  it('resolves nothing when several exist and none is bound', () => {
    // Guessing would score the risk on the wrong matrix, or offer RCA methods
    // the chosen template doesn't enable. The UI shows a picker instead.
    expect(resolveTemplateId({ available: [T('a'), T('b')] })).toBeNull()
  })

  it('resolves nothing when the tenant has no templates at all', () => {
    expect(resolveTemplateId({ available: [] })).toBeNull()
    expect(resolveTemplateId({})).toBeNull()
  })
})
