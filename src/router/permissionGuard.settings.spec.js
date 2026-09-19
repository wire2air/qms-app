import { describe, it, expect, vi } from 'vitest'

// Settings & Profile — the route gates in front of the settings surfaces.
//
// Each admin surface is bound to its OWN grant, and the two that people most
// often conflate are deliberately separate: company settings
// (`company_settings:manage` — /settings, /lookups) and organization security
// (`security:manage` — /organization-security, /admin-security). /profile is
// the user's own account and carries no gate at all, suppliers included.
//
// These are UX gates (the server re-checks every call — e2e/settings/st3 and
// st5 prove that side); what is pinned here is that a refactor of the maps
// cannot quietly widen or cross them.
//
// `/notification-rules` is still guarded although nothing in the nav links to
// it any more (settings pack 21 §5 — orphaned page, no backing authz module).
// The assertion keeps the orphan at least closed until it is retired.
//
// Mock mirrors permissionGuard.spec.js exactly.
vi.mock('@/utils/currentSession', () => {
  const currentSession = { value: null }
  const isSupplier = {
    get value() {
      // Per-membership `kind` (companies[activeCompanyId].kind) is the real
      // payload shape; the top-level read was the 2026-09-14 defect. Both
      // accepted so existing fixtures keep working.
      const s = currentSession.value
      if (!s) return false
      return (s.companies?.[s.activeCompanyId]?.kind ?? s.kind) === 'EXTERNAL_SUPPLIER'
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
const blocked = (path) => ({ path: '/no-access', query: { from: path } })

function as(session) {
  currentSession.value = { kind: 'INTERNAL', permissions: [], ...session }
}

describe('settings route gates', () => {
  it('maps each settings surface to its own grant', () => {
    expect(requiredPermissionFor(route('/settings'))).toBe('company_settings:manage')
    expect(requiredPermissionFor(route('/lookups'))).toBe('company_settings:manage')
    expect(requiredPermissionFor(route('/notification-rules'))).toBe('company_settings:manage')
    expect(requiredPermissionFor(route('/organization-security'))).toBe('security:manage')
    expect(requiredPermissionFor(route('/admin-security'))).toBe('security:manage')
    expect(requiredPermissionFor(route('/profile'))).toBeNull()
  })

  it('a settings admin reaches Settings and Lookups but not Organization Security', () => {
    as({ permissions: ['company_settings:manage'] })
    expect(evaluateRoute(route('/settings'))).toBe(true)
    expect(evaluateRoute(route('/lookups'))).toBe(true)
    expect(evaluateRoute(route('/organization-security'))).toEqual(blocked('/organization-security'))
  })

  it('a security admin reaches Organization Security but not company Settings', () => {
    as({ permissions: ['security:manage'] })
    expect(evaluateRoute(route('/organization-security'))).toBe(true)
    expect(evaluateRoute(route('/admin-security'))).toBe(true)
    expect(evaluateRoute(route('/settings'))).toEqual(blocked('/settings'))
    expect(evaluateRoute(route('/lookups'))).toEqual(blocked('/lookups'))
  })

  it('a member with no grants is bounced from every settings surface, but keeps /profile', () => {
    as({})
    for (const p of ['/settings', '/lookups', '/notification-rules', '/organization-security']) {
      expect(evaluateRoute(route(p)), p).toEqual(blocked(p))
    }
    expect(evaluateRoute(route('/profile'))).toBe(true)
  })

  it('a supplier is blocked from Settings even when holding the grant, and keeps /profile', () => {
    as({ kind: 'EXTERNAL_SUPPLIER', permissions: ['company_settings:manage', 'security:manage'] })
    expect(evaluateRoute(route('/settings'))).toEqual(blocked('/settings'))
    expect(evaluateRoute(route('/organization-security'))).toEqual(blocked('/organization-security'))
    expect(evaluateRoute(route('/profile'))).toBe(true)
  })

  it('the owner short-circuits every settings gate', () => {
    as({ isOwner: true })
    for (const p of ['/settings', '/lookups', '/organization-security', '/admin-security']) {
      expect(evaluateRoute(route(p)), p).toBe(true)
    }
  })
})
