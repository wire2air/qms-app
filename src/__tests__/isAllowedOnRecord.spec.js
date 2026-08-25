/**
 * The client-side mirror of authz.scope_allowed.
 *
 * These cases are written against the SQL, not against the JS — each one names
 * the clause of scope_allowed it pins:
 *
 *   RETURN (v_rank >= 4)
 *       OR (v_rank >= 3 AND p_site  IS NOT NULL AND p_site = ANY (v_usites))
 *       OR (v_rank >= 2 AND p_dept  IS NOT NULL AND p_dept  = v_udept)
 *       OR (v_rank >= 1 AND p_owner IS NOT NULL AND p_owner = v_user);
 *
 * The IS NOT NULL guards are the subtle part and get the most coverage: a
 * record with no site must NOT match a user with no site. In SQL that falls out
 * of NULL semantics; in JS `undefined === undefined` is true, so it has to be
 * written explicitly and it has to stay written.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { scopeAllows } from '../utils/recordScope.js'

const ME = 'user-1'
const MY_SITE = 'site-1'
const MY_DEPT = 'dept-1'

/** A session holding `capa:update` at the given rank. */
function sessionAt(rank, extra = {}) {
  session = {
    id: ME,
    isOwner: false,
    permissions: ['capa:update'],
    permissionScopes: { 'capa:update': rank },
    siteIds: [MY_SITE],
    departmentId: MY_DEPT,
    ...extra,
  }
}

const OTHERS = { ownerId: 'user-9', departmentId: 'dept-9', siteId: 'site-9' }
const can = (record, opts) => scopeAllows(session, 'capa:update', record, opts)

let session = null
beforeEach(() => {
  session = null
})

describe('rank 4 — tenant', () => {
  it('reaches a record owned by someone else in another site and department', () => {
    sessionAt(4)
    expect(can(OTHERS)).toBe(true)
  })

  it('reaches a record with no site, department or owner at all', () => {
    sessionAt(4)
    expect(can({})).toBe(true)
  })
})

describe('rank 3 — site', () => {
  it('reaches another user’s record inside one of my sites', () => {
    sessionAt(3)
    expect(can({ ...OTHERS, siteId: MY_SITE })).toBe(true)
  })

  it('does not reach a record in a site I do not hold', () => {
    sessionAt(3)
    expect(can(OTHERS)).toBe(false)
  })

  it('matches ANY of my sites, not just the first', () => {
    sessionAt(3, { siteIds: ['site-a', 'site-b', 'site-c'] })
    expect(can({ ...OTHERS, siteId: 'site-c' })).toBe(true)
  })

  it('denies when the record has no site — a null site is not a wildcard', () => {
    sessionAt(3)
    expect(can({ ...OTHERS, siteId: null })).toBe(false)
  })

  it('denies when I hold no sites, even against a record that has one', () => {
    // '= ANY(ARRAY[]::uuid[])' is false in the SQL; [].includes(x) is false here.
    sessionAt(3, { siteIds: [] })
    expect(can({ ...OTHERS, siteId: MY_SITE })).toBe(false)
  })

  it('still reaches down to the narrower tiers it subsumes', () => {
    sessionAt(3)
    expect(can({ ...OTHERS, departmentId: MY_DEPT })).toBe(true)
    expect(can({ ...OTHERS, ownerId: ME })).toBe(true)
  })
})

describe('rank 2 — department', () => {
  it('reaches another user’s record in my department', () => {
    sessionAt(2)
    expect(can({ ...OTHERS, departmentId: MY_DEPT })).toBe(true)
  })

  it('does not reach another department', () => {
    sessionAt(2)
    expect(can(OTHERS)).toBe(false)
  })

  it('does not reach across sites — that tier is above it', () => {
    sessionAt(2)
    expect(can({ ...OTHERS, siteId: MY_SITE })).toBe(false)
  })

  it('denies when the record has no department and neither do I', () => {
    // The null-equals-null trap: true in JS, false in SQL. SQL wins.
    sessionAt(2, { departmentId: null })
    expect(can({ ...OTHERS, departmentId: null })).toBe(false)
  })
})

describe('rank 1 — own', () => {
  it('reaches only my own record', () => {
    sessionAt(1)
    expect(can({ ...OTHERS, ownerId: ME })).toBe(true)
    expect(can(OTHERS)).toBe(false)
  })

  it('does not reach my own department or site', () => {
    sessionAt(1)
    expect(can({ ...OTHERS, departmentId: MY_DEPT })).toBe(false)
    expect(can({ ...OTHERS, siteId: MY_SITE })).toBe(false)
  })

  it('denies an unowned record to a session with no id', () => {
    // Same trap as the department tier, on the field that matters most.
    sessionAt(1, { id: undefined })
    expect(can({ ...OTHERS, ownerId: null })).toBe(false)
  })

  it('honours a custom custodian field', () => {
    sessionAt(1)
    expect(can({ assignedToUserId: ME }, { ownerField: 'assignedToUserId' })).toBe(true)
    expect(can({ assignedToUserId: 'user-9' }, { ownerField: 'assignedToUserId' })).toBe(false)
  })
})

describe('no grant', () => {
  it('denies when the permission is absent from the rank map', () => {
    sessionAt(4)
    // Held at tenant for update, not held at all for close.
    expect(scopeAllows(session, 'capa:close', OTHERS)).toBe(false)
  })

  it('denies when the rank map is missing entirely', () => {
    // A session cached before permissionScopes shipped. Fails CLOSED: the user
    // sees read-only rather than an edit control the server would refuse.
    sessionAt(4, { permissionScopes: undefined })
    expect(can({ ...OTHERS, ownerId: ME })).toBe(false)
  })
})

describe('short circuits', () => {
  it('lets a company owner act on anything', () => {
    sessionAt(0, { isOwner: true })
    expect(can(OTHERS)).toBe(true)
  })

  it('denies with no session or no record', () => {
    session = null
    expect(can(OTHERS)).toBe(false)
    sessionAt(4)
    expect(can(null)).toBe(false)
  })
})
