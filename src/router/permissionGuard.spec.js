import { describe, it, expect, beforeEach, vi } from 'vitest'

// Isolate the guard from the real currentSession module (which pulls in the
// whole syncEngine/decorator graph). This mock mirrors isAllowed/isSupplier
// semantics exactly; the guard's routing/decision logic is what's under test.
vi.mock('@/utils/currentSession', () => {
  const currentSession = { value: null }
  const isSupplier = {
    get value() {
      return currentSession.value?.kind === 'EXTERNAL_SUPPLIER'
    },
  }
  function isAllowed(perms) {
    if (!currentSession.value) return false
    if (currentSession.value.isOwner) return true
    const list = currentSession.value.permissions || []
    return perms.every((p) => list.includes(p))
  }
  return { currentSession, isSupplier, isAllowed }
})

const { requiredPermissionFor, evaluateRoute } = await import('./permissionGuard')
const { currentSession } = await import('@/utils/currentSession')

const route = (path) => ({ path, fullPath: path })
const setSession = (session) => {
  currentSession.value = session
}

describe('requiredPermissionFor', () => {
  it('gates admin modules on their read permission (list AND detail)', () => {
    expect(requiredPermissionFor(route('/users'))).toBe('user_management:read')
    expect(requiredPermissionFor(route('/users/abc-123'))).toBe('user_management:read')
    expect(requiredPermissionFor(route('/roles'))).toBe('role_permission_management:read')
    expect(requiredPermissionFor(route('/roles/abc-123'))).toBe('role_permission_management:read')
    expect(requiredPermissionFor(route('/suppliers'))).toBe('supplier_management:read')
  })

  it('gates record-module LIST routes only, leaving detail to RLS', () => {
    expect(requiredPermissionFor(route('/documents'))).toBe('document_control:read')
    expect(requiredPermissionFor(route('/documents/abc-123'))).toBeNull()
    expect(requiredPermissionFor(route('/capas'))).toBe('capa:read')
    expect(requiredPermissionFor(route('/capas/abc-123'))).toBeNull()
  })

  it('gates the standalone Complaints module list (QA #6 — was ungated by direct URL)', () => {
    // /complaints (the `complaints` table) is a distinct module from the support
    // Customer Complaints entry; the sidebar gated it on complaints:read but the
    // route guard had no entry, so it was reachable by typing the URL.
    expect(requiredPermissionFor(route('/complaints'))).toBe('complaints:read')
    // Detail defers to RLS like every other record module.
    expect(requiredPermissionFor(route('/complaints/abc-123'))).toBeNull()
    // The separate Customer Complaints module keeps its own permission.
    expect(requiredPermissionFor(route('/customer-complaints'))).toBe('complaint_management:read')
  })

  it('gates create/new pages on the module create permission', () => {
    expect(requiredPermissionFor(route('/documents/create'))).toBe('document_control:create')
    expect(requiredPermissionFor(route('/documents/new'))).toBe('document_control:create')
    expect(requiredPermissionFor(route('/suppliers/create'))).toBe('supplier_management:create')
    expect(requiredPermissionFor(route('/users/create'))).toBe('user_management:create')
    // :manage / :create gates already cover creation — used as-is.
    expect(requiredPermissionFor(route('/inspections-logs/create'))).toBe('field_records:create')
    // /m/:internalName is an admin-defined custom module — internalName is a
    // dynamic slug, NOT a native authz module. Use a fictional name so this
    // stays distinct from any real module in the catalog.
    expect(requiredPermissionFor(route('/m/gemba_walks/create'))).toBe('gemba_walks:create')
  })

  it('resolves admin-defined module routes to <internalName>:read', () => {
    expect(requiredPermissionFor(route('/m/gemba_walks'))).toBe('gemba_walks:read')
    expect(requiredPermissionFor(route('/m'))).toBeNull()
  })

  it('leaves ungated routes open', () => {
    expect(requiredPermissionFor(route('/dashboard'))).toBeNull()
    expect(requiredPermissionFor(route('/equipment'))).toBeNull()
    expect(requiredPermissionFor(route('/'))).toBeNull()
  })
})

describe('evaluateRoute — internal users', () => {
  beforeEach(() => setSession(null))

  it('allows navigation while the session is unresolved', () => {
    setSession(undefined)
    expect(evaluateRoute(route('/users'))).toBe(true)
  })

  it('lets owners through every gated route', () => {
    setSession({ isOwner: true, permissions: [] })
    expect(evaluateRoute(route('/users'))).toBe(true)
    expect(evaluateRoute(route('/roles/abc'))).toBe(true)
  })

  it('allows a user who holds the required permission', () => {
    setSession({ isOwner: false, permissions: ['user_management:read'] })
    expect(evaluateRoute(route('/users'))).toBe(true)
  })

  it('redirects a user who lacks the required permission to /no-access', () => {
    setSession({ isOwner: false, permissions: [] })
    expect(evaluateRoute(route('/users'))).toMatchObject({
      path: '/no-access',
      query: { from: '/users' },
    })
  })

  it('allows record-module DETAIL routes even without the module read permission', () => {
    setSession({ isOwner: false, permissions: [] })
    expect(evaluateRoute(route('/documents/abc-123'))).toBe(true)
  })

  it('blocks the create page without the module create permission', () => {
    setSession({ isOwner: false, permissions: ['document_control:read'] })
    expect(evaluateRoute(route('/documents/create'))).toMatchObject({ path: '/no-access' })
  })

  it('allows the create page when the user holds the create permission', () => {
    setSession({ isOwner: false, permissions: ['document_control:read', 'document_control:create'] })
    expect(evaluateRoute(route('/documents/create'))).toBe(true)
  })

  it('blocks the record-module LIST route without permission', () => {
    setSession({ isOwner: false, permissions: [] })
    expect(evaluateRoute(route('/documents'))).toMatchObject({ path: '/no-access' })
  })

  it('blocks /complaints without complaints:read and allows it with (QA #6)', () => {
    setSession({ isOwner: false, permissions: [] })
    expect(evaluateRoute(route('/complaints'))).toMatchObject({
      path: '/no-access',
      query: { from: '/complaints' },
    })
    setSession({ isOwner: false, permissions: ['complaints:read'] })
    expect(evaluateRoute(route('/complaints'))).toBe(true)
    // Detail stays reachable (RLS decides row access).
    setSession({ isOwner: false, permissions: [] })
    expect(evaluateRoute(route('/complaints/abc-123'))).toBe(true)
  })

  it('never guards the no-access page itself', () => {
    setSession({ isOwner: false, permissions: [] })
    expect(evaluateRoute(route('/no-access'))).toBe(true)
  })
})

describe('evaluateRoute — external supplier users', () => {
  it('allows RLS-shared record modules but blocks admin routes', () => {
    setSession({ isOwner: false, permissions: [], kind: 'EXTERNAL_SUPPLIER' })
    expect(evaluateRoute(route('/documents'))).toBe(true)
    expect(evaluateRoute(route('/capas'))).toBe(true)
    expect(evaluateRoute(route('/m/inspections'))).toBe(true)
    expect(evaluateRoute(route('/users'))).toMatchObject({ path: '/no-access' })
    expect(evaluateRoute(route('/suppliers'))).toMatchObject({ path: '/no-access' })
  })
})
