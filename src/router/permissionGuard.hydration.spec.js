import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref, nextTick } from 'vue'

// GUARD-HYDRATION: the guard must re-run the moment a tenant session lands,
// not after the syncEngine bootstrap. A real ref here — the watcher is the
// thing under test, and permissionGuard.spec.js's plain-object mock is not
// reactive.
vi.mock('@/utils/currentSession', async () => {
  const { ref: vueRef, computed } = await import('vue')
  const currentSession = vueRef(undefined)
  function isAllowed(perms) {
    if (!currentSession.value) return false
    if (currentSession.value.isOwner) return true
    const list = currentSession.value.permissions || []
    return perms.every((p) => list.includes(p))
  }
  const isSupplier = computed(() => false)
  const isPlatformAdmin = computed(() => false)
  return { currentSession, isSupplier, isAllowed, isPlatformAdmin }
})

const { installPermissionGuard } = await import('./permissionGuard')
const { currentSession } = await import('@/utils/currentSession')

function fakeRouter(path) {
  return {
    currentRoute: ref({ path, fullPath: path }),
    beforeEach: vi.fn(),
    isReady: vi.fn(() => Promise.resolve()),
    replace: vi.fn(() => Promise.resolve()),
  }
}

async function flush() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}

describe('installPermissionGuard — re-evaluates when the session hydrates', () => {
  beforeEach(() => {
    currentSession.value = undefined
  })

  it('redirects a hard-loaded route the user lacks, as soon as the session lands', async () => {
    const router = fakeRouter('/complaints')
    installPermissionGuard(router)

    currentSession.value = { companyId: 'c1', permissions: ['complaint_management:read'] }
    await flush()

    expect(router.replace).toHaveBeenCalledWith({
      path: '/no-access',
      query: { from: '/complaints' },
    })
  })

  it('leaves a permitted route alone', async () => {
    const router = fakeRouter('/complaints')
    installPermissionGuard(router)

    currentSession.value = { companyId: 'c1', permissions: ['complaints:read'] }
    await flush()

    expect(router.replace).not.toHaveBeenCalled()
  })

  it('ignores a session with no active company (App.vue routes those)', async () => {
    const router = fakeRouter('/complaints')
    installPermissionGuard(router)

    currentSession.value = { permissions: [] }
    await flush()

    expect(router.replace).not.toHaveBeenCalled()
  })

  it('does not re-fire on later session updates (permission refresh)', async () => {
    const router = fakeRouter('/complaints')
    installPermissionGuard(router)

    currentSession.value = { companyId: 'c1', permissions: ['complaints:read'] }
    await flush()
    currentSession.value = { companyId: 'c1', permissions: [] }
    await flush()

    expect(router.replace).not.toHaveBeenCalled()
  })
})
