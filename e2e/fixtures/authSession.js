// Persona login → storageState file. Shared by auth.setup.js (the initial
// login of every cast member) and authKeepAlive.global.js (re-login of a
// persona whose session the server ended mid-run).
import { request } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { BASE_URL, ALT_BASE_URL, USERS, ALT_USERS, AUTH } from './cast.js'

/**
 * Every persona that has a storageState file, with the origin it logs in on.
 * @returns {{ role: string, baseURL: string, user: { email: string }, statePath: string }[]}
 */
export function personas() {
  const list = Object.entries(USERS).map(([role, user]) => ({
    role,
    baseURL: BASE_URL,
    user,
    statePath: AUTH[role],
  }))
  list.push({ role: 'altOwner', baseURL: ALT_BASE_URL, user: ALT_USERS.owner, statePath: AUTH.altOwner })
  return list.filter((p) => p.statePath)
}

/**
 * Log `user` in through the real /v1/auth/login → handoff flow and write the
 * resulting storageState to `statePath`. Throws with a descriptive message on
 * any step that does not answer as expected.
 *
 * The file is written to a temp path and renamed into place, so a test that
 * reads it concurrently (the keep-alive sweep runs alongside the suite) never
 * sees a half-written JSON document.
 */
export async function loginToStateFile(baseURL, user, statePath, password, label = user.email) {
  const ctx = await request.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
  try {
    // Login answers with a 302 to APP_URL's handoff endpoint. APP_URL's port can
    // differ from the server under test (VITE_DEV_PORT moves vite off 5173 while
    // the backend env still says 5173, where another app may live). Don't follow
    // the redirect — take the one-time token and complete the handoff against
    // OUR baseURL; the session cookie is port-agnostic (domain-scoped).
    const login = await ctx.post('/api/v1/auth/login', {
      data: { email: user.email, password },
      maxRedirects: 0,
    })
    if (login.status() !== 302) {
      throw new Error(`login ${label} (${user.email}) → ${login.status()}`)
    }
    const token = new URL(login.headers()['location']).searchParams.get('token')
    if (!token) throw new Error(`no handoff token for ${label}`)
    const handoff = await ctx.get(`/api/v1/auth/handoff?token=${token}`, { maxRedirects: 0 })
    if (![200, 302].includes(handoff.status())) {
      throw new Error(`handoff ${label} → ${handoff.status()}`)
    }

    const session = await ctx.get('/api/v1/auth/session')
    if (!session.ok()) throw new Error(`session ${label} → ${session.status()}`)
    const body = await session.json()
    if (body?.session?.email !== user.email) {
      throw new Error(`session ${label} belongs to ${body?.session?.email}, expected ${user.email}`)
    }

    const state = await ctx.storageState()
    fs.mkdirSync(path.dirname(statePath), { recursive: true })
    const tmp = `${statePath}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2))
    fs.renameSync(tmp, statePath)
  } finally {
    await ctx.dispose().catch(() => {})
  }
}

/**
 * Is the session in `statePath` still accepted? GET /v1/auth/session runs
 * through requireAuth, so a successful probe also advances the session's
 * lastSeen — the probe itself is what keeps an unused persona from idling out.
 * @returns {Promise<'ok'|'expired'|'error'>}
 */
export async function probeStateFile(baseURL, statePath) {
  const ctx = await request.newContext({ baseURL, storageState: statePath })
  try {
    const res = await ctx.get('/api/v1/auth/session')
    if (res.ok()) return 'ok'
    return res.status() === 401 ? 'expired' : 'error'
  } catch {
    return 'error'
  } finally {
    await ctx.dispose().catch(() => {})
  }
}
