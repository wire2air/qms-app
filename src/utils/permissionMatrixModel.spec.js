import { describe, it, expect } from 'vitest'
import {
  projectGrantsToState,
  buildDesiredPermissions,
  writeScopeOptionsFor,
  supportsRead,
} from './permissionMatrixModel.js'

const SCOPE_RANK = { own: 1, department: 2, site: 3, tenant: 4 }
const READ = 'read'
const MODULES = [{ id: 'capa', actions: ['read', 'create', 'update', 'approve'], scopes: ['own', 'department', 'site', 'tenant'] }]
// 17 of 62 real modules carry no 'read' action — they gate reads on their own
// verb. '<module>:read' is not grantable there and the engine RAISEs on it.
const READLESS = [{ id: 'nc_issue_types', actions: ['manage'], scopes: ['tenant'] }]

describe('projectGrantsToState', () => {
  it('implies read reach from the widest capability scope', () => {
    const grants = [
      { module: 'capa', action: 'update', scope: 'department' },
      { module: 'capa', action: 'approve', scope: 'site' },
    ]
    const s = projectGrantsToState(MODULES, grants, SCOPE_RANK, READ)
    expect(s.capa.readScope).toBe('site') // widest write ⇒ implied read
    expect(s.capa.writeScope).toBe('site')
    expect(s.capa.caps).toEqual({ update: true, approve: true })
  })

  it('keeps an explicit read wider than the writes', () => {
    const grants = [
      { module: 'capa', action: 'read', scope: 'tenant' },
      { module: 'capa', action: 'approve', scope: 'own' },
    ]
    const s = projectGrantsToState(MODULES, grants, SCOPE_RANK, READ)
    expect(s.capa.readScope).toBe('tenant')
    expect(s.capa.writeScope).toBe('own')
  })

  it('handles a read-only grant', () => {
    const s = projectGrantsToState(MODULES, [{ module: 'capa', action: 'read', scope: 'site' }], SCOPE_RANK, READ)
    expect(s.capa.readScope).toBe('site')
    expect(s.capa.writeScope).toBe('site')
    expect(s.capa.caps).toEqual({})
  })
})

describe('buildDesiredPermissions', () => {
  it('writes capabilities at writeScope and implies read when equal', () => {
    const state = { capa: { readScope: 'site', writeScope: 'site', caps: { approve: true } } }
    const out = buildDesiredPermissions(MODULES, state, READ, SCOPE_RANK)
    expect(out).toEqual([{ module: 'capa', action: 'approve', scope: 'site' }]) // read implied
  })

  it('stores read explicitly when wider than writes (read=Site, approve=Own)', () => {
    const state = { capa: { readScope: 'site', writeScope: 'own', caps: { approve: true } } }
    const out = buildDesiredPermissions(MODULES, state, READ, SCOPE_RANK)
    expect(out).toContainEqual({ module: 'capa', action: 'approve', scope: 'own' })
    expect(out).toContainEqual({ module: 'capa', action: 'read', scope: 'site' })
  })

  it('clamps write that exceeds read', () => {
    const state = { capa: { readScope: 'department', writeScope: 'tenant', caps: { update: true } } }
    const out = buildDesiredPermissions(MODULES, state, READ, SCOPE_RANK)
    expect(out).toEqual([{ module: 'capa', action: 'update', scope: 'department' }])
  })

  it('emits a read-only grant when no capabilities', () => {
    const state = { capa: { readScope: 'own', writeScope: 'own', caps: {} } }
    expect(buildDesiredPermissions(MODULES, state, READ, SCOPE_RANK)).toEqual([
      { module: 'capa', action: 'read', scope: 'own' },
    ])
  })

  it('sends nothing for no access', () => {
    const state = { capa: { readScope: null, writeScope: null, caps: {} } }
    expect(buildDesiredPermissions(MODULES, state, READ, SCOPE_RANK)).toEqual([])
  })

  // Regression: emitting '<module>:read' for a module that has no read action
  // made authz.set_permission RAISE → a bare 500 on save.
  it('never emits read for a module without a read action', () => {
    const state = { nc_issue_types: { readScope: 'tenant', writeScope: 'tenant', caps: {} } }
    expect(buildDesiredPermissions(READLESS, state, READ, SCOPE_RANK)).toEqual([])
  })

  it('emits only the real capability for a module without a read action', () => {
    const state = { nc_issue_types: { readScope: 'tenant', writeScope: 'tenant', caps: { manage: true } } }
    expect(buildDesiredPermissions(READLESS, state, READ, SCOPE_RANK)).toEqual([
      { module: 'nc_issue_types', action: 'manage', scope: 'tenant' },
    ])
  })

  it('never emits an action the module does not subscribe to', () => {
    const state = { capa: { readScope: 'tenant', writeScope: 'tenant', caps: { manage: true, delete: true } } }
    const out = buildDesiredPermissions(MODULES, state, READ, SCOPE_RANK)
    expect(out.every((p) => MODULES[0].actions.includes(p.action))).toBe(true)
  })
})

describe('supportsRead', () => {
  it('is true only where the module subscribes to the read action', () => {
    expect(supportsRead(MODULES[0], READ)).toBe(true)
    expect(supportsRead(READLESS[0], READ)).toBe(false)
  })
})

describe('round-trip stability', () => {
  it('project → build → project is stable for read=Site, approve=Own', () => {
    const grants = [
      { module: 'capa', action: 'read', scope: 'site' },
      { module: 'capa', action: 'approve', scope: 'own' },
    ]
    const s1 = projectGrantsToState(MODULES, grants, SCOPE_RANK, READ)
    const rebuilt = buildDesiredPermissions(MODULES, s1, READ, SCOPE_RANK)
    const s2 = projectGrantsToState(MODULES, rebuilt, SCOPE_RANK, READ)
    expect(s2).toEqual(s1)
  })
})

describe('writeScopeOptionsFor', () => {
  it('never offers a scope wider than read', () => {
    expect(writeScopeOptionsFor(['own', 'department', 'site', 'tenant'], 'department', SCOPE_RANK)).toEqual([
      'own',
      'department',
    ])
  })
  it('returns nothing without a read scope', () => {
    expect(writeScopeOptionsFor(['own', 'site'], null, SCOPE_RANK)).toEqual([])
  })
})
