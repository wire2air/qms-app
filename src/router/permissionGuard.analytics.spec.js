import { describe, it, expect, vi } from 'vitest'

// Analytics — the per-surface route gates introduced by the 2026-09-21
// permission split.
//
// Until that split the WHOLE /analytics subtree sat behind one key,
// `reports_dashboards:read`, so "may see Reports but not Metrics" could not be
// expressed at all: holding the key opened every surface, and lacking it closed
// all six. The five surfaces are now separate authz modules, and the guard
// resolves the SECOND path segment to pick between them.
//
// What is pinned here is the thing a refactor would most plausibly undo:
//   • each sub-path maps to its OWN module, and
//   • holding one surface does NOT open the others.
//
// These are UX gates — the server re-checks every read through RLS (measured on
// app-db: a role with analytics_metrics create-but-not-delete could INSERT a
// custom metric and its DELETE matched 0 rows). What a bypass of this file
// costs is a blank page, not data.
//
// Mock mirrors permissionGuard.spec.js exactly.
vi.mock('@/utils/currentSession', () => {
  const currentSession = { value: null }
  const isSupplier = {
    get value() {
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

describe('analytics route gates', () => {
  it('maps each analytics surface to its own module', () => {
    expect(requiredPermissionFor(route('/analytics/dashboards'))).toBe('analytics_dashboards:read')
    expect(requiredPermissionFor(route('/analytics/reports'))).toBe('analytics_reports:read')
    expect(requiredPermissionFor(route('/analytics/alerts'))).toBe('analytics_alerts:read')
    expect(requiredPermissionFor(route('/analytics/metrics'))).toBe('analytics_metrics:read')
    expect(requiredPermissionFor(route('/analytics/explore'))).toBe('analytics_explore:read')
  })

  /**
   * The metric builder is a page now (/analytics/metrics/new and /:id). The
   * analytics branch returns before CREATE_SEGMENTS is consulted, so `new` does
   * NOT become `analytics_metrics:create` here — the page itself checks create /
   * update. Pinned so the deeper paths keep resolving to the Metrics gate rather
   * than falling through to the dashboards default.
   */
  it('gates the metric builder pages as Metrics', () => {
    expect(requiredPermissionFor(route('/analytics/metrics/new'))).toBe('analytics_metrics:read')
    expect(
      requiredPermissionFor(route('/analytics/metrics/3f2b8c1e-8d4a-4b6f-9e2a-1c5d7e9f0a12')),
    ).toBe('analytics_metrics:read')
  })

  /**
   * /analytics/browse is the metric browser that USED to be /analytics, moved
   * there on 2026-09-21 when Overview left the nav.
   *
   * It must gate on Metrics. The trap it is pinned against: `browse` is not a
   * module of its own, so leaving it out of ANALYTICS_SUBTREE is silent — the
   * path falls through to the bare-/analytics default (dashboards:read) and a
   * Dashboards-only role reads the whole metric catalog through a page nothing
   * in the nav points at.
   */
  it('gates the metric browser as Metrics, not as the subtree default', () => {
    expect(requiredPermissionFor(route('/analytics/browse'))).toBe('analytics_metrics:read')

    as({ permissions: ['analytics_metrics:read'] })
    expect(evaluateRoute(route('/analytics/browse'))).toBe(true)

    // The fall-through case, stated explicitly.
    as({ permissions: ['analytics_dashboards:read'] })
    expect(evaluateRoute(route('/analytics/browse'))).toEqual(blocked('/analytics/browse'))
  })

  // The bare route and anything unmapped fall back to the subtree default.
  // Deliberately dashboards' read and NOT an every-of list of all five: a guard
  // demanding all five would bounce a Reports-only role off the whole area.
  it('falls back to the dashboards read for the bare route', () => {
    expect(requiredPermissionFor(route('/analytics'))).toBe('analytics_dashboards:read')
  })

  // The case the split exists for. A role with Reports alone reaches Reports
  // and is bounced off every other surface — impossible to express before.
  it('a reports-only role reaches Reports and nothing else', () => {
    as({ permissions: ['analytics_reports:read'] })
    expect(evaluateRoute(route('/analytics/reports'))).toBe(true)
    expect(evaluateRoute(route('/analytics/metrics'))).toEqual(blocked('/analytics/metrics'))
    expect(evaluateRoute(route('/analytics/dashboards'))).toEqual(blocked('/analytics/dashboards'))
    expect(evaluateRoute(route('/analytics/alerts'))).toEqual(blocked('/analytics/alerts'))
    expect(evaluateRoute(route('/analytics/explore'))).toEqual(blocked('/analytics/explore'))
  })

  // The mirror image: the metric author. Also the persona the ask named
  // ("system engineer/developer may have access to Metrics").
  it('a metrics-only role reaches Metrics and nothing else', () => {
    as({ permissions: ['analytics_metrics:read'] })
    expect(evaluateRoute(route('/analytics/metrics'))).toBe(true)
    expect(evaluateRoute(route('/analytics/reports'))).toEqual(blocked('/analytics/reports'))
    expect(evaluateRoute(route('/analytics/dashboards'))).toEqual(blocked('/analytics/dashboards'))
  })

  // A write verb is not a read. RA-1 (2026-09-07) stopped synthesising `read`
  // from other grants, so this holds server-side too — a role given only
  // analytics_metrics:create reaches nothing.
  it('does not treat a write verb as a read', () => {
    as({ permissions: ['analytics_metrics:create', 'analytics_metrics:delete'] })
    expect(evaluateRoute(route('/analytics/metrics'))).toEqual(blocked('/analytics/metrics'))
  })

  it('the old module key no longer opens anything', () => {
    as({ permissions: ['reports_dashboards:read', 'reports_dashboards:manage'] })
    expect(evaluateRoute(route('/analytics'))).toEqual(blocked('/analytics'))
    expect(evaluateRoute(route('/analytics/metrics'))).toEqual(blocked('/analytics/metrics'))
  })

  it('a no-grant user reaches no analytics surface', () => {
    as({ permissions: ['ncr:read'] })
    for (const p of [
      '/analytics',
      '/analytics/dashboards',
      '/analytics/reports',
      '/analytics/alerts',
      '/analytics/metrics',
      '/analytics/explore',
    ]) {
      expect(evaluateRoute(route(p))).toEqual(blocked(p))
    }
  })

  // The company owner holds no role_module_permissions rows at all — isAllowed
  // short-circuits for them. Worth pinning: the components were reading the
  // permissions array directly before this change, which drew a read-only page
  // for the owner of the tenant.
  it('the company owner reaches every surface', () => {
    as({ isOwner: true, permissions: [] })
    for (const p of [
      '/analytics/dashboards',
      '/analytics/reports',
      '/analytics/alerts',
      '/analytics/metrics',
      '/analytics/explore',
    ]) {
      expect(evaluateRoute(route(p))).toBe(true)
    }
  })

  // Suppliers are blocked from the whole area by the ADMIN branch, regardless
  // of what they somehow hold.
  it('blocks an external supplier even with an analytics grant', () => {
    as({ kind: 'EXTERNAL_SUPPLIER', permissions: ['analytics_reports:read'] })
    expect(evaluateRoute(route('/analytics/reports'))).not.toBe(true)
  })
})
