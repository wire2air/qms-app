// CFL L-5 — the frontend half of the custom-fields entity-type registry.
// (docs/modules/custom-fields-lookups/11-security-review.md §L-5)
//
// The module's `entity_type` vocabulary is 8 values, and it is restated in
// several places kept in step by comments alone. That convention had already
// failed once: `bootstrapCompanyDefaults.js` in the backend listed 7 of the 8,
// silently omitting `Complaint`, and nothing in either repo failed.
//
// The backend copies are now held together automatically — bootstrap imports the
// registry, and backend/api/tests/services/customFieldsEntityRegistry.test.js
// parses the migration that carries the database CHECK constraint AND the
// entity_field_values block of database/rls.sql, failing on any drift.
//
// THIS list cannot be checked that way: it lives in a different git repo, so
// there is no import that could reach services/customFields/entityRegistry.js.
// What is possible, and what this file does, is pin the expected contents so a
// one-sided edit here fails loudly instead of shipping a picker that offers an
// entity type the database rejects (the CHECK constraint added in migration
// 20260902300000) or the RLS gate cannot resolve to a host module.
//
// If you are adding a 9th entity type, all five of these change together:
//   1. backend/api/services/customFields/entityRegistry.js   (+ its authzModule)
//   2. backend/api/migrations/…-custom-fields-entity-type-allowlist.js
//      — a NEW migration widening the CHECK; do not edit the applied one
//   3. database/rls.sql, the entity_field_values block (the VALUES map)
//   4. this file and the list it guards
//   5. a <CustomFieldsCard> on the new entity's detail page
import { describe, it, expect } from 'vitest'
import { CUSTOM_FIELD_ENTITIES, customFieldEntityLabel } from './customFieldEntities.js'

/** Pinned copy of backend/api/services/customFields/entityRegistry.js. */
const EXPECTED = [
  'Nonconformance',
  'Capa',
  'ChangeRequest',
  'AuditInstance',
  'Document',
  'Training',
  'CustomerComplaint',
  'Complaint',
]

describe('customFieldEntities', () => {
  it('matches the backend registry exactly, in order', () => {
    expect(CUSTOM_FIELD_ENTITIES.map((e) => e.value)).toEqual(EXPECTED)
  })

  it('includes Complaint — the value the backend bootstrap seed used to omit', () => {
    // Named on its own so the failure message points at the actual L-5 drift
    // rather than showing an 8-element array diff.
    expect(CUSTOM_FIELD_ENTITIES.map((e) => e.value)).toContain('Complaint')
  })

  it('keeps Complaint and CustomerComplaint as two distinct entity types', () => {
    // They are two different products on two different tables, gated by two
    // independently-granted authz modules (`complaints` = internal Quality
    // Complaints, `complaint_management` = Customer Complaints). Collapsing them
    // would put one audience's custom fields on the other's records.
    const values = CUSTOM_FIELD_ENTITIES.map((e) => e.value)
    expect(values).toContain('Complaint')
    expect(values).toContain('CustomerComplaint')
  })

  it('gives every entity type a non-empty, distinct label', () => {
    const labels = CUSTOM_FIELD_ENTITIES.map((e) => e.label)
    for (const l of labels) expect(l).toBeTruthy()
    // The Settings → Custom Fields page lists these; two identical labels would
    // make two rows indistinguishable.
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('has no duplicate values', () => {
    const values = CUSTOM_FIELD_ENTITIES.map((e) => e.value)
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('customFieldEntityLabel', () => {
  it('resolves each registered entity type to its label', () => {
    expect(customFieldEntityLabel('Capa')).toBe('CAPA')
    expect(customFieldEntityLabel('AuditInstance')).toBe('Audit')
    expect(customFieldEntityLabel('CustomerComplaint')).toBe('Customer Complaint')
    expect(customFieldEntityLabel('Complaint')).toBe('Complaint')
  })

  it('falls back to the raw entity type rather than rendering blank', () => {
    // A row filed under a retired type must still be identifiable in the UI. The
    // database CHECK now makes new ones impossible, but historical rows and any
    // future widening still have to render.
    expect(customFieldEntityLabel('SomethingRetired')).toBe('SomethingRetired')
    expect(customFieldEntityLabel(undefined)).toBe(undefined)
  })
})
