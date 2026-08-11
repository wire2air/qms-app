import { describe, it, expect } from 'vitest'
import {
  SITE_DEPENDENCY_SOURCES,
  buildDeleteSiteMessage,
  countSiteDependencies,
  describeSiteDependencies,
} from './siteDependencies.js'

const SITE_ID = 'site-1'

/**
 * Minimal stand-in for a syncEngine model: `Model.where(field, value).exec()`.
 * `rows` is the whole table; the stub filters it the way QueryBuilder does.
 */
function modelStub(rows) {
  return {
    where(field, value) {
      return { exec: async () => rows.filter((r) => r[field] === value) }
    },
  }
}

function throwingModelStub() {
  return {
    where() {
      return {
        exec: async () => {
          throw new Error('IDB store missing')
        },
      }
    },
  }
}

describe('countSiteDependencies', () => {
  it('counts only rows pointing at THIS site', async () => {
    const db = {
      User: modelStub([{ siteId: SITE_ID }, { siteId: SITE_ID }, { siteId: 'other' }]),
      Department: modelStub([{ siteId: SITE_ID }]),
    }
    const result = await countSiteDependencies(db, SITE_ID)

    expect(result.total).toBe(3)
    expect(result.items).toEqual([
      { one: 'user', many: 'users', count: 2 },
      { one: 'department', many: 'departments', count: 1 },
    ])
    expect(result.failed).toEqual([])
  })

  it('omits models with zero matches rather than listing them as 0', async () => {
    const db = { User: modelStub([{ siteId: 'other' }]) }
    const result = await countSiteDependencies(db, SITE_ID)
    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
  })

  // A model set differs by build; a missing model must never be the reason an
  // admin cannot delete a site.
  it('skips models this build does not register', async () => {
    const result = await countSiteDependencies({}, SITE_ID)
    expect(result.total).toBe(0)
    expect(result.failed).toEqual([])
  })

  // The count is a courtesy, not a gate. A broken query degrades to "we could
  // not check", which the copy then states honestly.
  it('records a failing model instead of throwing', async () => {
    const db = {
      User: modelStub([{ siteId: SITE_ID }]),
      Department: throwingModelStub(),
    }
    const result = await countSiteDependencies(db, SITE_ID)
    expect(result.total).toBe(1)
    expect(result.failed).toEqual(['Department'])
  })

  it('returns an empty result for a missing site id', async () => {
    const db = { User: modelStub([{ siteId: SITE_ID }]) }
    expect(await countSiteDependencies(db, null)).toEqual({ items: [], total: 0, failed: [] })
  })

  it('covers the multi-site pivot, not just users.site_id', async () => {
    // users.site_id is only the PRIMARY site since multi-site landed; the extra
    // sites live in user_sites. Counting only User would under-report.
    const modelNames = SITE_DEPENDENCY_SOURCES.map((s) => s.model)
    expect(modelNames).toContain('User')
    expect(modelNames).toContain('UserSite')
  })

  it('every source names a distinct model and a siteId field', () => {
    const names = SITE_DEPENDENCY_SOURCES.map((s) => s.model)
    expect(new Set(names).size).toBe(names.length)
    for (const s of SITE_DEPENDENCY_SOURCES) {
      expect(s.field).toBe('siteId')
      expect(s.one).toBeTruthy()
      expect(s.many).toBeTruthy()
    }
  })
})

describe('describeSiteDependencies', () => {
  it('is empty when nothing depends on the site', () => {
    expect(describeSiteDependencies([])).toBe('')
    expect(describeSiteDependencies(undefined)).toBe('')
  })

  it('singularizes a count of one', () => {
    expect(describeSiteDependencies([{ one: 'user', many: 'users', count: 1 }])).toBe('1 user')
  })

  it('joins with commas and a final "and", largest first', () => {
    const items = [
      { one: 'user', many: 'users', count: 3 },
      { one: 'department', many: 'departments', count: 1 },
      { one: 'document', many: 'documents', count: 12 },
    ]
    expect(describeSiteDependencies(items)).toBe('12 documents, 3 users and 1 department')
  })

  it('caps the list so a busy site does not produce a wall of text', () => {
    const items = [
      { one: 'a', many: 'as', count: 6 },
      { one: 'b', many: 'bs', count: 5 },
      { one: 'c', many: 'cs', count: 4 },
      { one: 'd', many: 'ds', count: 3 },
      { one: 'e', many: 'es', count: 2 },
      { one: 'f', many: 'fs', count: 1 },
    ]
    expect(describeSiteDependencies(items)).toBe(
      '6 as, 5 bs, 4 cs, 3 ds and 2 more types of record',
    )
  })

  it('says "1 more type" rather than "1 more types"', () => {
    const items = [
      { one: 'a', many: 'as', count: 5 },
      { one: 'b', many: 'bs', count: 4 },
      { one: 'c', many: 'cs', count: 3 },
      { one: 'd', many: 'ds', count: 2 },
      { one: 'e', many: 'es', count: 1 },
    ]
    expect(describeSiteDependencies(items)).toMatch(/1 more type of record$/)
  })
})

describe('buildDeleteSiteMessage', () => {
  const SITE = { name: 'London', code: 'LDN' }

  it('names the site and its code', () => {
    const msg = buildDeleteSiteMessage(SITE, { items: [], total: 0, failed: [] })
    expect(msg).toContain("Delete 'London' (LDN)?")
  })

  // The finding: the copy said "This cannot be undone" about a SOFT delete.
  it('never claims the delete is irreversible, because it is a soft delete', () => {
    const msg = buildDeleteSiteMessage(SITE, { items: [], total: 0, failed: [] })
    expect(msg).not.toMatch(/cannot be undone/i)
    expect(msg).toMatch(/soft delete/i)
    expect(msg).toMatch(/restored/i)
  })

  // And the finding's other half: it queried nothing before firing, so a site
  // backing hundreds of records went on one confirm with no warning.
  it('names what depends on the site', () => {
    const msg = buildDeleteSiteMessage(SITE, {
      items: [
        { one: 'user', many: 'users', count: 4 },
        { one: 'document', many: 'documents', count: 2 },
      ],
      total: 6,
      failed: [],
    })
    expect(msg).toContain('4 users and 2 documents')
    expect(msg).toMatch(/still reference this site/i)
  })

  it('says so plainly when nothing depends on the site', () => {
    const msg = buildDeleteSiteMessage(SITE, { items: [], total: 0, failed: [] })
    expect(msg).toMatch(/Nothing currently references this site/i)
  })

  it('admits when the check itself failed rather than implying the site is unused', () => {
    const msg = buildDeleteSiteMessage(SITE, { items: [], total: 0, failed: ['Document'] })
    expect(msg).toMatch(/could not check/i)
    expect(msg).not.toMatch(/Nothing currently references/i)
  })

  it('degrades gracefully with no dependency information at all', () => {
    const msg = buildDeleteSiteMessage(SITE)
    expect(msg).toContain("Delete 'London' (LDN)?")
    expect(msg).not.toMatch(/cannot be undone/i)
  })

  it('omits the parenthesised code when the site has none', () => {
    expect(buildDeleteSiteMessage({ name: 'London' })).toContain("Delete 'London'?")
  })
})
