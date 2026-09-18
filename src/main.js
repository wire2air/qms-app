import '@/extensions/datetime' // Extend Luxon's DateTime with custom formatting method
import '@models/index.js' // Initialize IndexedDB database and live query system
import '@/components/form/tools/index.js' // Register custom form tool components

import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import { useToast } from '@shared/composables/useToast.js'

import App from './App.vue'
import router from './router'
import messages from './i18n'
import { initFaro, installVueErrorHandler } from './observability'

// API layer — centralised Axios setup
import { registerNotifyHandler, eventBus } from './api'
import { ApiError } from './api/errors.js'
import { isPublicRoute } from './constants/authRoutes.js'
import { connectSocket, disconnectSocket } from './api/socket.js'

// Import app CSS (TailwindCSS + custom theme)
import './css/base.css'
// Import app-specific styles
import './css/app.scss'

if (!import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.log = () => {} // Disable console.log in production for cleaner output
  console.debug = () => {} // Disable console.debug in production
}

// Initialize Faro RUM before creating the app so any error during boot is captured.
initFaro()

// Create i18n instance
const i18n = createI18n({
  locale: 'en-US',
  legacy: false,
  globalInjection: true,
  messages,
})

// Create Vue app
const app = createApp(App)

// Faro captures Vue component errors via app.config.errorHandler.
installVueErrorHandler(app)

// Use i18n
app.use(i18n)

// Use router
app.use(router)

// Mount app
app.mount('#app')

// ── API layer wiring ──────────────────────────────────────────────────────────

// 1. Notification adapter — bridge API layer events to the Base toast system
const toast = useToast()

registerNotifyHandler(({ type, message, fields }) => {
  // If there are validation field errors, format them nicely
  let displayMessage = message

  if (fields && Object.keys(fields).length > 0) {
    const fieldErrors = []
    for (const [field, errors] of Object.entries(fields)) {
      const errorList = Array.isArray(errors) ? errors.join(', ') : errors
      fieldErrors.push(`${field}: ${errorList}`)
    }

    // Show first few errors in the notification
    const maxErrors = 3
    const errorMessages = fieldErrors.slice(0, maxErrors)
    const remaining = fieldErrors.length - maxErrors

    displayMessage = `${message}\n${errorMessages.join('\n')}`
    if (remaining > 0) {
      displayMessage += `\n...and ${remaining} more error${remaining > 1 ? 's' : ''}`
    }
  }

  toast.notify({
    type,
    message: displayMessage,
    position: 'top',
    timeout: fields ? 5000 : 3000, // Longer timeout for validation errors
    html: true, // Allow line breaks
    multiLine: true,
  })
})

// 2. Multi-tenant — active company is stored in the Redis session, no header needed

// 3. Auth events — redirect on session expiry (but not if already on an auth page)
function handleSessionExpired() {
  disconnectSocket()
  const path = window.location.pathname
  if (isPublicRoute(path)) return
  window.location.href = '/signin'
}

eventBus.on('auth:session-expired', handleSessionExpired)

// syncEngine GraphQL client uses raw fetch (bypasses the axios interceptor),
// so it dispatches this window event on 401s
window.addEventListener('qms:auth-unauthorized', handleSessionExpired)

// 5. Socket.io — connect after app mounts (session must be hydrated first)
//    The socket auto-authenticates via the same httpOnly session cookie.
connectSocket()

// 4. Global unhandled rejection handler — silently catch ApiError rejections
//    that bubble up from calls without try/catch (notification was already
//    shown by request.js).
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason instanceof ApiError) {
    event.preventDefault()
  }
})
