// Service accounts must vanish from LIST queries and survive LOOKUPS BY ID.
//
// A service account is a machine identity stored as a `users` row
// (backend migration 20260913100000). SyncEngine replicates it into every
// user's IndexedDB like any other user, so without a filter it turns up in
// assignee pickers, reviewer menus, recipient lists and team rosters — none of
// which a machine identity can honour.
//
// The obvious fix — hide the row in Postgres RLS — is WRONG, and this file
// exists mostly to record why. To the database, "list the people I can assign"
// and "who performed this action?" are the same SELECT; RLS cannot tell them
// apart. Hiding the row outright blanks the actor on every audit-log line and
// printed record an integration ever touched, silently (`UserBadgeById`
// renders `v-if="user"`, so it emits nothing at all). For a QMS sold on
// ISO 13485 / 21 CFR Part 11 audit trails that is a false record, which is
// worse than the leak it fixes.
//
// The split is only visible in the client query layer, so that is where it
// lives: `BaseModel.hiddenFromLists` filters `where()` and leaves `findByPk()`
// alone. These assertions pin that asymmetry — the failure mode if it ever
// regresses is silent in both directions.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

vi.mock('../../syncEngine/persistence/IndexedDB.js', () => ({
  IndexedDB: {
    scan: vi.fn(),
    getByIndex: vi.fn(),
    getByIndexMulti: vi.fn(),
  },
}))

vi.mock('../../syncEngine/core/ModelRegistry.js', () => ({
  default: {
    getTableName: () => 'users',
    getSchema: () => ({ primaryKey: 'id' }),
    hasIndex: (_model, field) => field === 'departmentId',
  },
}))

// Hydration is irrelevant here — hand back the raw row so assertions read
// against the same shape the filters saw.
vi.mock('../../syncEngine/persistence/hydration.js', () => ({
  hydrate: (_modelName, _id, _opts, record) => Promise.resolve(record),
}))

const { QueryBuilder } = await import('../../syncEngine/query/QueryBuilder.js')
const { IndexedDB } = await import('../../syncEngine/persistence/IndexedDB.js')

const ALICE = { id: 'u1', firstName: 'Alice', departmentId: 'd1', isServiceAccount: false }
const SAP = { id: 'u2', firstName: 'SAP Integration', departmentId: 'd1', isServiceAccount: true }
// A soft-deleted human: proves the two filters are independent, not one
// mechanism doing double duty.
const BOB = {
  id: 'u3',
  firstName: 'Bob',
  departmentId: 'd1',
  isServiceAccount: false,
  deletedAt: '2026-01-01',
}
const ROWS = [ALICE, SAP, BOB]

/** Mirrors BaseModel.where()'s construction of a QueryBuilder. */
function listQuery({ indexField, indexValue, force = false } = {}) {
  return new QueryBuilder(
    'User',
    indexField,
    indexValue,
    force ? false : 'deletedAt',
    force ? null : 'isServiceAccount',
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  // Cursor scan applies the predicate itself, exactly as IndexedDB.scan does.
  IndexedDB.scan.mockImplementation((_table, predicate) =>
    Promise.resolve(ROWS.filter(predicate)),
  )
  // The indexed path returns rows unfiltered and lets #applyPostFilters work.
  IndexedDB.getByIndex.mockResolvedValue([...ROWS])
})

describe('service accounts are hidden from list queries', () => {
  it('drops them from a full cursor scan', async () => {
    const names = (await listQuery().exec()).map((u) => u.firstName)
    expect(names).toEqual(['Alice'])
  })

  it('drops them from an indexed lookup too', async () => {
    // Two code paths filter separately (#matches for scans, #applyPostFilters
    // for index hits). Covering only one leaves the other open.
    const names = (
      await listQuery({ indexField: 'departmentId', indexValue: 'd1' }).exec()
    ).map((u) => u.firstName)
    expect(names).toEqual(['Alice'])
  })

  it('still applies the paranoid filter alongside it', async () => {
    const ids = (await listQuery().exec()).map((u) => u.id)
    expect(ids).not.toContain(BOB.id)
    expect(ids).not.toContain(SAP.id)
  })

  it('returns them when the caller explicitly forces an unfiltered query', async () => {
    const names = (await listQuery({ force: true }).exec()).map((u) => u.firstName)
    expect(names).toEqual(['Alice', 'SAP Integration', 'Bob'])
  })

  it('hides them by the flag, not by name or missing email', async () => {
    // Guards against a future "filter rows with a null email" shortcut, which
    // would also swallow legitimately email-less users.
    IndexedDB.scan.mockImplementation((_table, predicate) =>
      Promise.resolve([{ id: 'u9', firstName: 'No Email', email: null }].filter(predicate)),
    )
    const names = (await listQuery().exec()).map((u) => u.firstName)
    expect(names).toEqual(['No Email'])
  })
})

describe('the declarations that switch the behaviour on', () => {
  // Source-scanned rather than imported: models/*.js use legacy decorators
  // needing vite-plugin-babel, which the lighter vitest config does not load
  // (same technique as equipmentSyncModel.spec.js).
  const USER_MODEL = readFileSync(path.resolve(HERE, '../../models/user.js'), 'utf8')

  it('User declares isServiceAccount as hiddenFromLists', () => {
    expect(USER_MODEL).toMatch(/static\s+hiddenFromLists\s*=\s*'isServiceAccount'/)
  })

  it('User still declares isServiceAccount as a synced @Property', () => {
    // Without the @Property the column is absent from the generated GraphQL
    // query, the flag arrives undefined, and every service account silently
    // becomes visible again.
    expect(USER_MODEL).toMatch(/@Property\(\{\s*type:\s*Boolean\s*\}\)\s*isServiceAccount/)
  })

  it('BaseModel.where forwards hiddenFromLists and honours force', () => {
    const BASE_MODEL = readFileSync(
      path.resolve(HERE, '../../syncEngine/core/BaseModel.js'),
      'utf8',
    )
    expect(BASE_MODEL).toMatch(/force \? null : this\.hiddenFromLists/)
  })

  it('findByPk does NOT apply the hidden filter', () => {
    // The asymmetry IS the feature: audit trails and printed records resolve
    // users by id and must keep rendering the actor.
    const BASE_MODEL = readFileSync(
      path.resolve(HERE, '../../syncEngine/core/BaseModel.js'),
      'utf8',
    )
    const findByPk = BASE_MODEL.slice(
      BASE_MODEL.indexOf('static async findByPk'),
      BASE_MODEL.indexOf('async reload()'),
    )
    expect(findByPk).not.toContain('hiddenFromLists')
  })
})
