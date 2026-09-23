import { describe, it, expect } from 'vitest'
import { loadLookupOptions, hasLookup, __testing } from '@/utils/analyticsLookupOptions.js'

const { modelNameFor, labelFor } = __testing

/**
 * A stand-in ModelRegistry.schemas: model name → { tableName }.
 *
 * Injected rather than imported. Populating the real registry means importing
 * the models, whose @ClientModel decorators need the TC39 transform that
 * vitest.config.js deliberately omits — so these tests supply the entries they
 * assert on and stay independent of all 233 models.
 *
 * The keys are CLASS names and the tableNames are what @ClientModel declares,
 * copied from the real models.
 */
const SCHEMAS = {
  DocumentStatus: { tableName: 'documentStatuses' },
  DocumentType: { tableName: 'documentTypes' },
  NcStatus: { tableName: 'ncStatuses' },
  NcRootCauseCategory: { tableName: 'ncRootCauseCategories' },
  ComplaintCustomerType: { tableName: 'complaintCustomerTypes' },
  ComplaintSeverity: { tableName: 'complaintSeverities' },
  CapaPriority: { tableName: 'capaPriorities' },
  CapaStatus: { tableName: 'capaStatuses' },
  AuditFindingStatus: { tableName: 'auditFindingStatuses' },
  AuditFindingType: { tableName: 'auditFindingTypes' },
  Site: { tableName: 'sites' },
  User: { tableName: 'users' },
}

/**
 * A stand-in for the SyncEngine handle, keyed the way the real `db` is: by
 * MODEL name (PascalCase, singular), not by @ClientModel's store name.
 *
 * That distinction is the bug this file now guards. The first version of
 * modelNameFor returned the store name ('documentStatuses'), which is never a
 * key on `db` — so every field fell back to a text box and the picker never
 * appeared anywhere.
 */
function fakeDb(models) {
  const db = {}
  for (const [name, rows] of Object.entries(models)) {
    db[name] = { where: () => ({ exec: async () => rows }) }
  }
  return db
}

describe('modelNameFor', () => {
  // ⚠ These must be the keys on `db`, which are CLASS names — singular and
  // PascalCase. Returning @ClientModel's store name ('documentStatuses') type
  // checks fine, resolves to undefined on `db`, and silently removes every
  // picker. That is the regression this describe block exists for.
  it('resolves a lookup table to the model name `db` is keyed by', () => {
    expect(modelNameFor('document_statuses', SCHEMAS)).toBe('DocumentStatus')
    expect(modelNameFor('nc_root_cause_categories', SCHEMAS)).toBe('NcRootCauseCategory')
    expect(modelNameFor('complaint_customer_types', SCHEMAS)).toBe('ComplaintCustomerType')
  })

  it('resolves the irregular plurals a hand-written rule would get wrong', () => {
    // 'statuses' → 'Status' and 'priorities' → 'Priority' are exactly the cases
    // that motivated asking the registry instead of singularising.
    expect(modelNameFor('capa_priorities', SCHEMAS)).toBe('CapaPriority')
    expect(modelNameFor('complaint_severities', SCHEMAS)).toBe('ComplaintSeverity')
    expect(modelNameFor('capa_statuses', SCHEMAS)).toBe('CapaStatus')
  })

  it('resolves the single-word tables', () => {
    expect(modelNameFor('users', SCHEMAS)).toBe('User')
    expect(modelNameFor('sites', SCHEMAS)).toBe('Site')
  })

  it('resolves the two models added for audit findings', () => {
    expect(modelNameFor('audit_finding_statuses', SCHEMAS)).toBe('AuditFindingStatus')
    expect(modelNameFor('audit_finding_types', SCHEMAS)).toBe('AuditFindingType')
  })

  it('returns null for no table, so callers fall back rather than query', () => {
    expect(modelNameFor(null, SCHEMAS)).toBeNull()
    expect(modelNameFor('', SCHEMAS)).toBeNull()
  })

  it('returns null for a table nothing mirrors', () => {
    expect(modelNameFor('some_table_that_does_not_exist', SCHEMAS)).toBeNull()
  })
})

describe('matching is by declared table, not by rewriting the word', () => {
  // The reason the registry is searched rather than the name transformed. Each
  // of these plurals needs a different English rule, and a rule that gets them
  // all right today is one that will be wrong about a table added tomorrow —
  // silently, because a miss just restores the text box.
  it.each([
    ['capa_statuses', 'CapaStatus'],
    ['capa_priorities', 'CapaPriority'],
    ['complaint_severities', 'ComplaintSeverity'],
    ['nc_root_cause_categories', 'NcRootCauseCategory'],
  ])('%s resolves to %s', (table, model) => {
    expect(modelNameFor(table, SCHEMAS)).toBe(model)
  })

  it('falls back to the model name when a model declares no table', () => {
    expect(modelNameFor('widgets', { Widgets: {} })).toBe('Widgets')
  })
})

describe('labelFor', () => {
  it('prefers name, which every lookup table but users has', () => {
    expect(labelFor({ id: 'ACTIVE', name: 'Active' })).toBe('Active')
  })

  it('builds a person from first and last name', () => {
    expect(labelFor({ id: 'u1', firstName: 'Astrid', lastName: 'Lindqvist' })).toBe(
      'Astrid Lindqvist',
    )
  })

  it('copes with a half-named person', () => {
    expect(labelFor({ id: 'u1', firstName: 'Astrid' })).toBe('Astrid')
  })

  it('falls back to the id rather than rendering a blank selectable row', () => {
    expect(labelFor({ id: 'ACTIVE' })).toBe('ACTIVE')
  })
})

describe('loadLookupOptions', () => {
  it('stores the id and shows the name', async () => {
    // The property the whole change rests on: the author reads "Active", the
    // compiler receives 'ACTIVE'. A typo becomes unreachable rather than
    // merely detectable.
    const db = fakeDb({
      DocumentStatus: [
        { id: 'ACTIVE', name: 'Active', displayOrder: 1 },
        { id: 'ARCHIVED', name: 'Archived', displayOrder: 2 },
      ],
    })
    expect(await loadLookupOptions(db, 'document_statuses', SCHEMAS)).toEqual([
      { value: 'ACTIVE', label: 'Active' },
      { value: 'ARCHIVED', label: 'Archived' },
    ])
  })

  it('honours displayOrder over the alphabet', async () => {
    // A status vocabulary reads DRAFT → CLOSED, not alphabetically, and the
    // lookup tables that carry displayOrder seed it deliberately.
    const db = fakeDb({
      NcStatus: [
        { id: 'CLOSED', name: 'Closed', displayOrder: 3 },
        { id: 'DRAFT', name: 'Draft', displayOrder: 1 },
        { id: 'OPEN', name: 'Open', displayOrder: 2 },
      ],
    })
    const labels = (await loadLookupOptions(db, 'nc_statuses', SCHEMAS)).map((o) => o.label)
    expect(labels).toEqual(['Draft', 'Open', 'Closed'])
  })

  it('falls back to alphabetical when no order is defined', async () => {
    const db = fakeDb({
      Site: [
        { id: 's2', name: 'Uppsala' },
        { id: 's1', name: 'Gothenburg' },
      ],
    })
    const labels = (await loadLookupOptions(db, 'sites', SCHEMAS)).map((o) => o.label)
    expect(labels).toEqual(['Gothenburg', 'Uppsala'])
  })

  it('returns nothing for a table the client does not mirror', async () => {
    // Read by the caller as "keep the text box". Must not throw: an unmirrored
    // lookup has to degrade to the old behaviour, not break the dialog.
    expect(await loadLookupOptions(fakeDb({}), 'something_unmirrored', SCHEMAS)).toEqual([])
  })

  it('returns nothing rather than throwing when the query fails', async () => {
    const db = {
      DocumentStatus: {
        where: () => ({
          exec: async () => {
            throw new Error('IndexedDB unavailable')
          },
        }),
      },
    }
    expect(await loadLookupOptions(db, 'document_statuses', SCHEMAS)).toEqual([])
  })

  it('drops rows with no id, which could not be filtered on anyway', async () => {
    const db = fakeDb({ DocumentType: [{ id: '', name: 'Broken' }, { id: 'SOP', name: 'SOP' }] })
    expect(await loadLookupOptions(db, 'document_types', SCHEMAS)).toEqual([
      { value: 'SOP', label: 'SOP' },
    ])
  })
})

describe('hasLookup', () => {
  it('is true only for a mirrored table', () => {
    const db = fakeDb({ DocumentStatus: [] })
    expect(hasLookup(db, 'document_statuses', SCHEMAS)).toBe(true)
    expect(hasLookup(db, 'audit_finding_statuses', SCHEMAS)).toBe(false)
  })

  it('is false for a field with no lookup table at all', () => {
    // `process_area` is plain text — there is nothing to pick from.
    expect(hasLookup(fakeDb({}), null, SCHEMAS)).toBe(false)
  })
})
