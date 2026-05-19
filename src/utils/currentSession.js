import { ref, computed } from 'vue'
import { apiClient } from '@/api/client.js'
import { isPublicRoute } from '@/constants/authRoutes.js'
import { deleteAllSyncDatabases } from '@/utils/initSyncEngine.js'

// Unique identifier for the current tab
export const TAB_ID = `tab-${crypto.randomUUID()}`

// Local storage key for inter-tab communication
export const tabMessage = useLocalStorage('tabMessage', null)

// Watch for changes in the tabMessage to handle incoming messages
watch(tabMessage, (newMessageJSON) => {
  const messageObj = JSON.parse(newMessageJSON)
  const { origin, message } = messageObj

  // Ignore messages originating from the same tab
  if (origin === TAB_ID) return

  // Handle logout message
  if (message === 'logout') {
    window.location.href = '/signin'
  }
})

// Function to send a message to other tabs
function sendTabMessage(message) {
  tabMessage.value = JSON.stringify({ origin: TAB_ID, message })
}

// Create a mutable ref to store the current user data
export const companyCode = ref(null)
export const currentSession = ref(undefined) // undefined  = unknown, null = logged out
export const permissions = computed(() => currentSession.value?.permissions || [])
export const isSuperUser = computed(() => {
  const email = currentSession.value?.email
  if (!email) return false
  return email.endsWith('@qms.com') || email.endsWith('@qms.com')
})

export const isAdmin = computed(() => {
  const email = currentSession.value?.email
  if (!email) return false
  const adminEmails = (import.meta.env.VITE_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return adminEmails.includes(email.toLowerCase())
})

// Add computed properties for impersonation
export const isImpersonating = computed(() => {
  return !!currentSession.value?.impersonator
})

export const originalUserName = computed(() => {
  if (!currentSession.value?.impersonator) return 'Admin'

  const firstName = currentSession.value.impersonator.originalFirstName || ''
  const lastName = currentSession.value.impersonator.originalLastName || ''

  if (firstName || lastName) {
    return `${firstName} ${lastName}`.trim()
  }

  return 'Admin'
})

// Function to return to the original admin user
export function returnToOriginalUser() {
  if (!isImpersonating.value) return
  window.location.href = '/api/v1/auth/return-from-impersonation'
}

export const logoutCurrentSession = async () => {
  // Use apiClient directly with _retried flag to bypass the 401 interceptor
  // retry logic — the signout endpoint is expected to invalidate the session.
  try {
    await apiClient.put('/v1/auth/signout', undefined, { _retried: true })
  } catch {
    // Ignore errors — we're logging out regardless
  }

  // Wipe all company-scoped IndexedDB databases
  await deleteAllSyncDatabases()

  sessionStorage.removeItem('isLogin')
  sendTabMessage('logout')
  window.location = '/signin'
}

export async function hydrateSession() {
  return await fetchUserSession({ hydrate: true })
}

async function fetchUserSession(options = {}) {
  const url = options.hydrate
    ? '/v1/auth/hydrateSession'
    : '/v1/auth/session' + (companyCode.value ? `?companyCode=${companyCode.value}` : '')

  try {
    // Use raw axios with _retried flag to bypass the 401 interceptor
    // retry logic — fetchUserSession handles auth failures itself.
    const response = await apiClient.get(url, { _retried: true })

    // Handle 304 Not Modified
    if (response.status === 304 && options.hydrate) {
      return null // No changes, all good
    }

    const data = response.data

    // Session may not have a company yet
    const session = data.session

    // Use activeCompanyId from session (set by backend when companyCode is passed)
    if (!session.activeCompanyId) {
      currentSession.value = session
      return
    }

    const activeCompanyId = session.activeCompanyId
    const activeCompany = session.companies?.[activeCompanyId]

    if (!activeCompany) {
      currentSession.value = null
      return
    }

    const newCurrentSession = {
      id: activeCompany.userId,
      ...session,
      ...activeCompany,
      companyId: activeCompanyId,
    }

    currentSession.value = newCurrentSession
  } catch (err) {
    const status = err?.status ?? err?.raw?.response?.status

    // 403 = authenticated, but no access to the requested company. Don't
    // bounce to /signin — the user is logged in. Leave currentSession null
    // and let App.vue redirect into a company they actually belong to.
    if (status === 403) {
      currentSession.value = null
      return null
    }

    // 401 / network / unknown → fall back to the login page.
    const path = window.location.pathname
    if (!isPublicRoute(path) && path !== '/app') {
      window.location.href = '/signin'
    }
    return null
  }
}

export async function initSession(initCompanyCode) {
  if (initCompanyCode) {
    companyCode.value = initCompanyCode
  }
  return await fetchUserSession()
}

export function isAllowed(neededPermissions) {
  if (!currentSession.value) {
    return false
  }

  // Owners bypass per-permission checks.
  if (currentSession.value.isOwner) return true

  const userPermissions = permissions.value

  return neededPermissions.every((perm) => userPermissions.includes(perm))
}
