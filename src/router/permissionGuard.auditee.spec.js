import { describe, it, expect, vi } from 'vitest'

// /auditee — the one route segment whose guard is NOT a permission check.
//
// `audit_instances_sel` admits a row on permission OR audit-team membership OR
// a share, and the auditee surface exists for the invited participant who holds
// no audit permission at all. So the route stays open to internal users (RLS
// decides what they see) and is closed to EXTERNAL_SUPPLIER accounts outright
// via SUPPLIER_BLOCKED_SEGMENTS (auditee pack 22 §3, 2026-09-08). Both halves
// are pinned here, because the obvious "fix" — adding `auditee:
// 'audit_management:read'` to RECORD_LIST_PERMISSIONS — would silently bounce
// the people the page is for.
//
// Mock mirrors permissionGuard.spec.js exactly; kept in its own file so the
// auditee rules have one obvious home.
vi.mock('@/utils/currentSession', () => {
  const currentSession = { value: null }
  // Mirrors the REAL computed: `kind` is per membership on the session payload
  // (companies[activeCompanyId].kind), never top-level. The old mock read
  // `currentSession.value?.kind`, which is the 2026-09-14 defect itself — so
  // these supplier assertions passed against a fake that could not fail while
  // /auditee was open to portal users in the browser (AE-J4). Both shapes are
  // accepted so fixtures may set either.
  const isSupplier = {
    get value() {
      const s = currentSession.value
      if (!s) return false
      const membership = s.companies?.[s.activeCompanyId]
      return (membership?.kind ?? s.kind) === 'EXTERNAL_SUPPLIER'
    },
  }
  function isAllowed(perms) {
    if (!currentSession.value) return false
    if (currentSession.value.isOwner) return true
    const list = currentSession.value.permissions || []
    return perms.every((p) => list.includes(p))
  }
  const isPlatformAdmin = {
    get value() {
      return !!currentSession.value?.platformAdmin?.role
    },
  }
  return { currentSession, isSupplier, isAllowed, isPlatformAdmin }
})

const { requiredPermissionFor, evaluateRoute } = await import('./permissionGuard')
const { currentSession } = await import('@/utils/currentSession')

const route = (path) => ({ path, fullPath: path })
const DETAIL = '/auditee/e2eae000-0000-4000-8000-000000000900'

describe('permissionGuard — /auditee', () => {
  it('requires no module permission for the list or the detail route', () => {
    expect(requiredPermissionFor(route('/auditee'))).toBeNull()
    expect(requiredPermissionFor(route('/auditee/'))).toBeNull()
    expect(requiredPermissionFor(route(DETAIL))).toBeNull()
  })

  it('admits an internal user holding NO audit permission — RLS decides what they see', () => {
    currentSession.value = { kind: 'INTERNAL', permissions: [] }
    expect(evaluateRoute(route('/auditee'))).toBe(true)
    expect(evaluateRoute(route(DETAIL))).toBe(true)
  })

  it('admits a read-only auditor and an owner', () => {
    currentSession.value = { kind: 'INTERNAL', permissions: ['audit_management:read'] }
    expect(evaluateRoute(route('/auditee'))).toBe(true)
    currentSession.value = { kind: 'INTERNAL', isOwner: true, permissions: [] }
    expect(evaluateRoute(route('/auditee'))).toBe(true)
  })

  // The shape /v1/auth/session actually returns: `kind` inside the active
  // company's membership, nothing at the top level. This is the case the old
  // mock could not express, and the one AE-J4 caught in the browser.
  it('sends an EXTERNAL_SUPPLIER to /no-access with the REAL per-membership payload', () => {
    currentSession.value = {
      id: 'u9',
      email: 'supplier@e2e.test',
      isOwner: false,
      permissions: [],
      activeCompanyId: 'c1',
      companies: { c1: { userId: 'u9', code: 'E2ELAB', kind: 'EXTERNAL_SUPPLIER' } },
    }
    expect(evaluateRoute(route('/auditee'))).toMatchObject({ path: '/no-access' })
    expect(evaluateRoute(route('/auditee/abc-123'))).toMatchObject({ path: '/no-access' })
  })

  it('sends an EXTERNAL_SUPPLIER to /no-access from the list AND the detail route', () => {
    currentSession.value = { kind: 'EXTERNAL_SUPPLIER', permissions: [] }
    expect(evaluateRoute(route('/auditee'))).toEqual({
      path: '/no-access',
      query: { from: '/auditee' },
    })
    expect(evaluateRoute(route(DETAIL))).toEqual({ path: '/no-access', query: { from: DETAIL } })
  })

  it('blocks the supplier even when the session carries audit permissions', () => {
    // The block is by account kind, not by grant: a supplier is never the
    // company being audited.
    currentSession.value = {
      kind: 'EXTERNAL_SUPPLIER',
      permissions: ['audit_management:read', 'audit_management:update'],
    }
    expect(evaluateRoute(route('/auditee'))).toMatchObject({ path: '/no-access' })
  })

  it('CONTROL — the same supplier still reaches /audits, which is supplier-exempt', () => {
    currentSession.value = { kind: 'EXTERNAL_SUPPLIER', permissions: [] }
    expect(evaluateRoute(route('/audits'))).toBe(true)
  })
})
