/**
 * The picker must not contradict the validator.
 *
 * The regression this guards: a fresh tenant's seeded workflows name roles
 * (Quality Manager, Quality Engineer) that bootstrap never assigns to anyone.
 * The server resolves those steps to an empty pool and therefore accepts any
 * pick — but the dropdown kept filtering on the declared role, so it offered
 * nobody and the log book could not be submitted at all.
 */
import { describe, it, expect } from 'vitest'
import { resolvePickerRoleIds, isRoleUnstaffed } from './stepReviewerPool.js'

const QM = 'role-quality-manager'

describe('resolvePickerRoleIds', () => {
  it('does not filter when the server says the step is unrestricted', () => {
    // The whole bug: roles ARE declared, but nobody holds them, so the server
    // reports unrestricted. Filtering by QM here empties the dropdown.
    const pool = { unrestricted: true, userIds: [], roles: [{ id: QM, name: 'Quality Manager' }] }
    expect(resolvePickerRoleIds(pool, [QM], true)).toBeNull()
  })

  it('filters by the declared roles when the pool is restricted', () => {
    const pool = {
      unrestricted: false,
      userIds: ['u1'],
      roles: [{ id: QM, name: 'Quality Manager' }],
    }
    expect(resolvePickerRoleIds(pool, [QM], true)).toEqual([QM])
  })

  it('keeps filtering on the local fallback — an unanswered server is not permission', () => {
    // serverPoolFailed → usingServerPool false. `unrestricted` on a stale pool
    // object must not leak through and open the picker up.
    expect(resolvePickerRoleIds({ unrestricted: true }, [QM], false)).toEqual([QM])
  })

  it('returns null for a step that declares no roles at all', () => {
    expect(resolvePickerRoleIds({ unrestricted: true, roles: [] }, [], true)).toBeNull()
    expect(resolvePickerRoleIds(null, [], false)).toBeNull()
  })

  it('treats a not-yet-answered pool as restricted, not open', () => {
    expect(resolvePickerRoleIds(null, [QM], true)).toEqual([QM])
  })
})

describe('isRoleUnstaffed', () => {
  it('is true only when a role is declared AND the pool came back unrestricted', () => {
    expect(isRoleUnstaffed({ unrestricted: true }, [QM], true)).toBe(true)
  })

  it('is false when the step declares no role (ordinary unrestricted step)', () => {
    expect(isRoleUnstaffed({ unrestricted: true }, [], true)).toBe(false)
  })

  it('is false when the role actually has members', () => {
    expect(isRoleUnstaffed({ unrestricted: false }, [QM], true)).toBe(false)
  })

  it('is false on the local fallback — we have no server answer to report', () => {
    expect(isRoleUnstaffed({ unrestricted: true }, [QM], false)).toBe(false)
  })
})
