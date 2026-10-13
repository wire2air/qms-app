// Global setup: keep every persona's session alive for the whole run.
//
// ── WHY ─────────────────────────────────────────────────────────────────────
// auth.setup.js logs each persona in ONCE, at the start of the run, and every
// spec reuses the saved storageState. But the server ends a session that has
// been idle for org_security_settings.session_idle_minutes — 30 on E2ELAB, 15
// on E2EALT (e2e-seed.sql sets them, deliberately, because the timeout is a
// feature under test). A full run takes 4+ hours, so any persona not touched
// for 30 minutes was revoked ('idle timeout' in user_sessions) and the next
// spec using it failed with 401 "Authentication required" — measured
// 2026-09-28: ~30 idle revocations in one run, and the failures came in bursts
// that matched them one-for-one. Specs that pass alone failed in the full run.
//
// Tests that sign a shared persona out on purpose ("signed out" on owner@ at
// 15:24 in the same run) left the file dead for every later spec as well.
//
// ── HOW ─────────────────────────────────────────────────────────────────────
// This runs in the Playwright RUNNER process, which lives for the whole run,
// so one timer here covers every consumption path at once — test.use(),
// browser.newContext({ storageState }), request.newContext({ storageState }) —
// because all of them read the same files. Every SWEEP_MS it probes each file:
//   • alive   → the probe itself advances lastSeen, so it never idles out;
//   • 401     → log in again and atomically rewrite the file.
// A test already holding the old cookie in memory is unaffected; the NEXT
// context built from the file gets the fresh session.
//
// Tests of the idle timeout itself use their own fresh logins
// (fixtures/authentication.js), never these shared files, so keeping the
// shared personas alive does not mask them.
//
// Set E2E_AUTH_KEEPALIVE=0 to turn it off.
import fs from 'node:fs'
import { PASSWORD } from './fixtures/cast.js'
import { personas, probeStateFile, loginToStateFile } from './fixtures/authSession.js'

// Well inside the shortest idle window (15 min on E2EALT), with room for a
// sweep that lands late behind a busy event loop.
const SWEEP_MS = 4 * 60 * 1000

async function sweep(state) {
  if (state.running) return
  state.running = true
  try {
    for (const p of personas()) {
      // Not written yet (auth.setup.js has not run) — nothing to keep alive.
      if (!fs.existsSync(p.statePath)) continue
      const status = await probeStateFile(p.baseURL, p.statePath)
      if (status !== 'expired') continue
      try {
        await loginToStateFile(p.baseURL, p.user, p.statePath, PASSWORD, p.role)
        console.info(`[auth-keepalive] ${p.role}: session had ended — logged in again`)
        state.failed.delete(p.role)
      } catch (err) {
        // A persona whose password a test changed, or a 429 from the auth
        // limiter: say so once and try again next sweep.
        if (!state.failed.has(p.role)) {
          console.warn(`[auth-keepalive] ${p.role}: re-login failed — ${err.message}`)
          state.failed.add(p.role)
        }
      }
    }
  } finally {
    state.running = false
  }
}

export default async function globalSetup() {
  if (process.env.E2E_AUTH_KEEPALIVE === '0') return
  const state = { running: false, failed: new Set() }
  const timer = setInterval(() => {
    sweep(state).catch(() => {})
  }, SWEEP_MS)
  // Never hold the runner open on its own.
  timer.unref()
  return async function globalTeardown() {
    clearInterval(timer)
  }
}
