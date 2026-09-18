/**
 * Axios instance with interceptors.
 *
 * ── Design decisions ───────────────────────────────────────────────────────
 * • Single shared instance — every `request()` call goes through the same
 *   instance so interceptors, base config, and headers are consistent.
 *
 * • Cookie-based auth — This app uses httpOnly session cookies (not JWTs
 *   in localStorage), so `withCredentials: true` ensures cookies are sent.
 *   The "token refresh" flow maps to session hydration via
 *   `/api/v1/auth/hydrateSession`.
 *
 * • Response interceptor normalises the backend envelope.  The backend
 *   responds with `{ ...data, meta }` on success and
 *   `{ error: { message, ...extra }, meta }` on error.
 *   The interceptor strips `meta` and passes the useful payload through.
 *
 * • Request interceptor injects multi-tenant header (`X-Company-Id`) when
 *   a company is selected.
 *
 * • A transparent 401 retry prevents the user from being logged out when
 *   their session was stale but can be hydrated.  Only ONE hydration call
 *   runs at a time (mutex via promise caching).
 * ───────────────────────────────────────────────────────────────────────────
 */

import axios from 'axios'
import { ApiError } from './errors.js'
import { eventBus } from './eventBus.js'
import { DateTime } from 'luxon'

// ── Instance ──────────────────────────────────────────────────────────────────

function transformResponse(data) {
  try {
    data = typeof data === 'string' ? data : JSON.stringify(data)

    return JSON.parse(data, (_, value) => {
      if (isNaN(value)) {
        // Attempt to parse ISO date strings into DateTime objects
        const dt = DateTime.fromISO(value)
        if (dt.isValid) {
          return dt
        }
      }

      return value
    })
  } catch {
    // If response is not JSON, return as-is (e.g. for file downloads)
    return data
  }
}

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30_000,
  withCredentials: true, // send session cookie
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  transformResponse: [transformResponse, ...(axios.defaults.transformResponse || [])],
})

// ── Session refresh mutex ─────────────────────────────────────────────────────

let refreshPromise = null

/**
 * Attempt to hydrate the session.
 * Returns `true` if the session was successfully refreshed, `false` otherwise.
 * Multiple concurrent callers share the same in-flight promise.
 */
async function refreshSession() {
  if (refreshPromise) return refreshPromise

  refreshPromise = axios
    .get('/api/v1/auth/hydrateSession', { withCredentials: true })
    .then((res) => res.status === 200 || res.status === 304)
    .catch(() => false)
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

// ── Response interceptor ──────────────────────────────────────────────────────

apiClient.interceptors.response.use(
  // ── Success path ──────────────────────────────────────────────────────────
  (response) => {
    // Strip the `meta` envelope from successful responses so consumers
    // receive only the meaningful payload.
    const data = response.data
    if (data && typeof data === 'object' && 'meta' in data) {
      const { meta, ...rest } = data
      response.data = rest
      response._meta = meta
    }
    return response
  },

  // ── Error path ────────────────────────────────────────────────────────────
  async (error) => {
    // ── Cancelled ───────────────────────────────────────────────────────────
    if (axios.isCancel(error)) {
      throw new ApiError({
        message: 'Request cancelled',
        code: 'CANCELLED',
        raw: error,
      })
    }

    // ── Network / timeout ───────────────────────────────────────────────────
    if (!error.response) {
      const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout')

      throw new ApiError({
        message: isTimeout
          ? 'Request timed out. Please try again.'
          : 'Network error. Please check your connection.',
        code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        raw: error,
      })
    }

    const { status, data } = error.response
    const config = error.config

    // ── 401 — attempt transparent session refresh ─────────────────────────
    if (status === 401 && !config._retried) {
      config._retried = true
      const refreshed = await refreshSession()

      if (refreshed) {
        // Retry the original request with the now-valid session
        return apiClient(config)
      }

      // Session refresh failed — redirect to login
      eventBus.emit('auth:session-expired')
      throw new ApiError({
        message: 'Session expired. Please sign in again.',
        status: 401,
        code: 'UNAUTHORIZED',
        raw: error,
      })
    }

    // ── 403 ───────────────────────────────────────────────────────────────
    if (status === 403) {
      const message = data?.error?.message || 'You do not have permission to perform this action.'
      eventBus.emit('auth:forbidden', { message })
      throw new ApiError({ message, status: 403, code: 'FORBIDDEN', raw: error })
    }

    // ── 400 / 422 — validation ────────────────────────────────────────────
    if (status === 400 || status === 422) {
      const errorBody = data?.error || data || {}
      const isValidationError = errorBody.code === 'VALIDATION_ERROR' || status === 422

      if (isValidationError) {
        throw new ApiError({
          message: errorBody.message || 'Validation failed.',
          status,
          errors: errorBody.fields || errorBody.errors || {},
          code: 'VALIDATION_ERROR',
          raw: error,
        })
      }
    }

    // ── Other server errors (4xx / 5xx) ──────────────────────────────────
    const errorBody = data?.error || data || {}
    throw new ApiError({
      message: errorBody.message || `Request failed (${status}).`,
      status,
      errors: errorBody.fields || errorBody.errors || {},
      details: errorBody.details || null,
      code: errorBody.code || 'SERVER_ERROR',
      raw: error,
    })
  },
)

export { apiClient }
