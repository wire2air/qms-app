import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

// Docs/modules/dashboard 2026-09-07 addendum, finding 1: `/` used to redirect
// unconditionally to /dashboard, with no isSupplier check, so an
// EXTERNAL_SUPPLIER session's first screen after every login was the generic
// internal dashboard rather than the purpose-built /supplier portal.
const isSupplier = { value: false }
// Support Desk population (2026-10-19): a support-only session (every role a
// support role) lands in the inbox, as does anyone on the support host family.
const currentSession = { value: { isSupportUser: false, isOwner: false, permissions: [] } }
const isAllowed = (perms) => perms.every((p) => currentSession.value.permissions.includes(p))
vi.mock('@/utils/currentSession', () => ({ isSupplier, currentSession, isAllowed }))
const supportHost = { value: false }
vi.mock('@/utils/tenant', () => ({ isSupportHost: () => supportHost.value }))

const replace = vi.fn()
const currentRoute = { query: {} }
vi.mock('vue-router', () => ({
  useRouter: () => ({ replace }),
  useRoute: () => currentRoute,
}))

const IndexPage = (await import('./index.vue')).default

describe('/ — universal post-login landing route (finding 1)', () => {
  beforeEach(() => {
    replace.mockClear()
    isSupplier.value = false
    supportHost.value = false
    currentSession.value = { isSupportUser: false, isOwner: false, permissions: [] }
    currentRoute.query = {}
  })

  it('sends a support-only session (Support Admin / Agent) to /desk', () => {
    currentSession.value = { isSupportUser: true, isOwner: false, permissions: [] }
    mount(IndexPage)
    expect(replace).toHaveBeenCalledWith({ path: '/desk', query: {} })
  })

  it('sends anyone on the support host family to /desk', () => {
    supportHost.value = true
    mount(IndexPage)
    expect(replace).toHaveBeenCalledWith({ path: '/desk', query: {} })
  })

  it('sends a user whose only readable module is the desk to /desk', () => {
    currentSession.value = {
      isSupportUser: false,
      isOwner: false,
      permissions: ['complaint_management:read', 'sites:read', 'users:read'],
    }
    mount(IndexPage)
    expect(replace).toHaveBeenCalledWith({ path: '/desk', query: {} })
  })

  it('sends an ordinary session to /dashboard', () => {
    mount(IndexPage)
    expect(replace).toHaveBeenCalledWith({ path: '/dashboard', query: {} })
  })

  it('sends an EXTERNAL_SUPPLIER session to /supplier, not /dashboard', () => {
    isSupplier.value = true
    mount(IndexPage)
    expect(replace).toHaveBeenCalledWith({ path: '/supplier', query: {} })
  })

  it('preserves the onboarding query param for a non-supplier session', () => {
    currentRoute.query = { onboarding: 'true' }
    mount(IndexPage)
    expect(replace).toHaveBeenCalledWith({
      path: '/dashboard',
      query: { onboarding: 'true' },
    })
  })

  it('does not carry the onboarding param into the supplier portal redirect', () => {
    isSupplier.value = true
    currentRoute.query = { onboarding: 'true' }
    mount(IndexPage)
    // OnboardingDialog is a dashboard-only affordance; the supplier portal has
    // no such dialog, but the redirect still faithfully forwards whatever
    // query the caller sent — this pins that /supplier is the path chosen,
    // not that the query is stripped.
    expect(replace).toHaveBeenCalledWith({
      path: '/supplier',
      query: { onboarding: 'true' },
    })
  })
})
