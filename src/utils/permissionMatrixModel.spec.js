import { describe, it, expect } from 'vitest'
import {
  projectGrantsToState,
  buildDesiredPermissions,
  writeScopeOptionsFor,
  supportsRead,
  levelBundle,
  availableLevels,
  levelForState,
  stateForLevel,
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

// ─── Level model ─────────────────────────────────────────────────────────────
const ALL_SCOPES = ['own', 'department', 'site', 'tenant']
const WORKFLOW = {
  id: 'capa',
  actions: ['read', 'create', 'update', 'delete', 'approve', 'reject', 'close', 'reopen', 'export', 'assign'],
  scopes: ALL_SCOPES,
}
const MANAGE_ONLY = READLESS[0] // actions: ['manage'], scopes: ['tenant']
const CRU_EXPORT = { id: 'lookups', actions: ['read', 'create', 'update', 'export'], scopes: ALL_SCOPES }
const NO_REJECT = { id: 'reviews', actions: ['read', 'create', 'update', 'export', 'approve'], scopes: ALL_SCOPES }

describe('availableLevels', () => {
  it('offers the full ladder on a standard workflow module', () => {
    expect(availableLevels(WORKFLOW, READ)).toEqual(['none', 'viewer', 'editor', 'approver', 'full'])
  })

  it('offers only none/full on a manage-only module', () => {
    expect(availableLevels(MANAGE_ONLY, READ)).toEqual(['none', 'full'])
  })

  it('dedupes a level whose bundle equals a lower one (full ≡ editor)', () => {
    expect(availableLevels(CRU_EXPORT, READ)).toEqual(['none', 'viewer', 'editor'])
  })

  it('skips approver on modules without an approve action', () => {
    expect(availableLevels(CRU_EXPORT, READ)).not.toContain('approver')
  })
})

describe('levelBundle', () => {
  it('intersects the approver bundle with module actions (drops missing reject)', () => {
    expect(levelBundle('approver', NO_REJECT, READ)).toEqual(['approve', 'create', 'export', 'update'])
  })

  it('full = every non-read action', () => {
    expect(levelBundle('full', MANAGE_ONLY, READ)).toEqual(['manage'])
    expect(levelBundle('full', WORKFLOW, READ)).toContain('delete')
  })
})

describe('level round-trips (stateForLevel → build → project → levelForState)', () => {
  function roundTrip(m, level, scope) {
    const s1 = stateForLevel(m, level, scope, READ)
    const grants = buildDesiredPermissions([m], { [m.id]: s1 }, READ, SCOPE_RANK)
    const s2 = projectGrantsToState([m], grants, SCOPE_RANK, READ)[m.id]
    return { grants, level: levelForState(m, s2, READ), scope: s2.readScope }
  }

  it.each(['viewer', 'editor', 'approver', 'full'])('%s @ site survives on a workflow module', (level) => {
    const rt = roundTrip(WORKFLOW, level, 'site')
    expect(rt.level).toBe(level)
    expect(rt.scope).toBe('site')
  })

  it('full on a manage-only module emits exactly the manage row and survives', () => {
    const rt = roundTrip(MANAGE_ONLY, 'full', 'tenant')
    expect(rt.grants).toEqual([{ module: 'nc_issue_types', action: 'manage', scope: 'tenant' }])
    expect(rt.level).toBe('full')
  })
})

describe('levelForState', () => {
  it('maps a full-caps state on a deduped module to the lower level (editor)', () => {
    const s = stateForLevel(CRU_EXPORT, 'full', 'site', READ)
    expect(levelForState(CRU_EXPORT, s, READ)).toBe('editor')
  })

  it("detects the old Approver preset shape (approve+reject+export, no create/update) as custom", () => {
    const s = { readScope: 'site', writeScope: 'site', caps: { approve: true, reject: true, export: true } }
    expect(levelForState(WORKFLOW, s, READ)).toBe('custom')
  })

  it('detects a split write scope as custom regardless of bundle match', () => {
    const s = { readScope: 'tenant', writeScope: 'own', caps: { create: true, update: true, export: true } }
    expect(levelForState(WORKFLOW, s, READ)).toBe('custom')
  })

  it('empty caps on a read-supporting module is viewer', () => {
    expect(levelForState(WORKFLOW, { readScope: 'own', writeScope: 'own', caps: {} }, READ)).toBe('viewer')
  })

  it('manage-only with an access level but no caps (unstorable transient) is custom', () => {
    expect(levelForState(MANAGE_ONLY, { readScope: 'tenant', writeScope: 'tenant', caps: {} }, READ)).toBe('custom')
  })

  it('missing or empty state is none', () => {
    expect(levelForState(WORKFLOW, undefined, READ)).toBe('none')
    expect(levelForState(WORKFLOW, { readScope: null, writeScope: null, caps: {} }, READ)).toBe('none')
  })
})

describe('stateForLevel degradation & clamping', () => {
  it('editor on a manage-only module degrades to none', () => {
    expect(stateForLevel(MANAGE_ONLY, 'editor', 'tenant', READ)).toEqual({
      readScope: null,
      writeScope: null,
      caps: {},
    })
  })

  it('editor on a read-only module degrades to viewer', () => {
    const READ_ONLY = { id: 'reports', actions: ['read'], scopes: ALL_SCOPES }
    expect(stateForLevel(READ_ONLY, 'editor', 'site', READ)).toEqual({
      readScope: 'site',
      writeScope: 'site',
      caps: {},
    })
  })

  it('viewer on a manage-only module degrades to none', () => {
    expect(stateForLevel(MANAGE_ONLY, 'viewer', 'tenant', READ).readScope).toBeNull()
  })

  it('clamps an unsupported scope to what the module offers', () => {
    expect(stateForLevel(MANAGE_ONLY, 'full', 'own', READ).readScope).toBe('tenant')
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
