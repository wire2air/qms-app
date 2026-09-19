// Settings & Profile E2E helpers — the `settings` project (e2e/settings/).
//
// Three things make this module unlike the record modules:
//
//  1. Its state is ONE shared row. `companies.settings` is a single JSONB blob
//     every other suite reads (the overdue ladder, closure-approval flags,
//     print settings), so nothing here may restore by overwriting the whole
//     column with a snapshot — a concurrent suite's change would be clobbered by
//     the "restore". `restoreSettingsKeys` puts back only the keys a test
//     touched, key by key.
//
//  2. Its personas are logged in ON DEMAND (§41 of e2e-seed.sql), not by the
//     shared `setup` project. A password change revokes every other session of
//     the account, and the settings admins are only useful to this project, so
//     neither belongs in the storageState budget every suite pays for.
//
//  3. The company cards save through the syncEngine (`company.save()` →
//     GraphQL `updateCompany` → RLS `company_update_rls`), NOT through the
//     `PATCH /companies/:id` REST route the module pack documents. Assertions
//     about "who may save" therefore have to be made through the UI or over
//     GraphQL; a REST probe answers a different question.
import zlib from 'node:zlib'
import { request, expect } from '@playwright/test'
import { BASE_URL, PASSWORD, COMPANY_ID } from './cast.js'
import { sql, sqlValue, waitForSqlValue } from './db.js'

export { graphql, expectMutationExists } from './sites.js'

/** Direct API origins (session cookies are host-scoped, not port-scoped). */
export const API = process.env.E2E_API_ORIGIN || 'http://e2elab.localhost:4000'
export const ALT_API = process.env.E2E_ALT_API_ORIGIN || 'http://e2ealt.localhost:4000'

/** e2e-seed.sql §41 — logged in on demand, never by auth.setup.js. */
export const SETTINGS_USERS = {
  settingsAdmin: {
    id: 'e2e10000-0000-4000-8000-000000000960',
    email: 'settingsadmin@e2e.test',
    name: 'Stella SettingsAdmin',
  },
  securityAdmin: {
    id: 'e2e10000-0000-4000-8000-000000000961',
    email: 'securityadmin@e2e.test',
    name: 'Simon SecurityAdmin',
  },
  selfService: {
    id: 'e2e10000-0000-4000-8000-000000000962',
    email: 'selfservice@e2e.test',
    name: 'Pat SelfService',
  },
}

/** The seeded argon2id hash of PASSWORD — the only way selfService is restored. */
export const SEEDED_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$0G1ro9Aqx/gzbRQGaUK0uQ$qd3LbNumQRq0B+fhX8NNny73S4pfNCPcWFS/81KSue4'

/**
 * Mirror of the worker's DEFAULT_OVERDUE_CONFIG
 * (backend/worker/tasks/send_task_overdue_notification.js). The Defaults card
 * must show exactly this when the key has never been written.
 */
export const DEFAULT_OVERDUE_CONFIG = { enabled: true, reminderDays: [3, 6, 9], escalationDay: 12 }

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`

// ── Sessions ────────────────────────────────────────────────────────────────

/**
 * Log `user` in through the real /v1/auth/login → handoff flow and return the
 * resulting storageState. Modelled on auth.setup.js `loginAndSave`, including
 * the two load-bearing details:
 *   - an EMPTY storageState: request.newContext() inside a test inherits the
 *     test's cookie, and the handoff's session.regenerate() would destroy the
 *     session of whichever persona that cookie belonged to;
 *   - the redirect is NOT followed: the handoff is completed against OUR
 *     baseURL, since APP_URL's port can differ from the server under test.
 */
export async function loginState(user, { baseURL = BASE_URL, password = PASSWORD } = {}) {
  const ctx = await request.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
  try {
    const login = await ctx.post('/api/v1/auth/login', {
      data: { email: user.email, password },
      maxRedirects: 0,
      failOnStatusCode: false,
    })
    expect(login.status(), `login ${user.email} → ${login.status()}`).toBe(302)
    const token = new URL(login.headers()['location']).searchParams.get('token')
    expect(token, `handoff token for ${user.email}`).toBeTruthy()
    const handoff = await ctx.get(`/api/v1/auth/handoff?token=${token}`, {
      maxRedirects: 0,
      failOnStatusCode: false,
    })
    expect([200, 302], `handoff ${user.email} → ${handoff.status()}`).toContain(handoff.status())
    const session = await ctx.get('/api/v1/auth/session')
    expect(session.ok(), `session ${user.email} → ${session.status()}`).toBeTruthy()
    return await ctx.storageState()
  } finally {
    await ctx.dispose()
  }
}

// One login per persona per worker process. The settings project runs with
// workers: 1, so this is one login per persona per run in the common case.
const stateCache = new Map()

/** A browser context signed in as a §41 persona (or any { email } user). */
export async function personaContext(browser, user) {
  if (!stateCache.has(user.email)) stateCache.set(user.email, await loginState(user))
  return browser.newContext({ storageState: stateCache.get(user.email) })
}

/** Drop a cached session — after a journey that deliberately ended it. */
export function forgetSession(user) {
  stateCache.delete(user.email)
}

/** Status of GET /v1/auth/session for a storageState — 200 alive, 401 dead. */
export async function sessionStatus(storageState) {
  const ctx = await request.newContext({ baseURL: BASE_URL, storageState })
  try {
    return (await ctx.get('/api/v1/auth/session', { failOnStatusCode: false })).status()
  } finally {
    await ctx.dispose()
  }
}

// ── The company row ─────────────────────────────────────────────────────────

/** `companies.settings` for E2ELAB as a JS object (null when the column is NULL). */
export function companySettings(companyId = COMPANY_ID) {
  const raw = sqlValue(`SELECT coalesce(settings::text, 'null') FROM companies WHERE id = ${quote(companyId)}`)
  return JSON.parse(raw)
}

/** One value inside settings by top-level key, as a JS value (undefined if absent). */
export function settingsKey(key, companyId = COMPANY_ID) {
  const s = companySettings(companyId)
  return s && Object.prototype.hasOwnProperty.call(s, key) ? s[key] : undefined
}

/** The editable scalar columns, as stored. */
export function companyColumns(companyId = COMPANY_ID) {
  const row = sqlValue(
    `SELECT row_to_json(t)::text FROM (
       SELECT name, code, default_time_zone, default_first_day_of_week,
              company_icon_url, company_dark_icon_url, subscription_state
         FROM companies WHERE id = ${quote(companyId)}) t`,
  )
  return JSON.parse(row)
}

/**
 * Put back exactly `keys` of `settings` to their value in `snapshot` (removing
 * a key the snapshot did not have). Never overwrites the whole column: another
 * suite may have changed a DIFFERENT key meanwhile, and a snapshot restore
 * would silently revert it.
 */
export function restoreSettingsKeys(snapshot, keys, companyId = COMPANY_ID) {
  for (const key of keys) {
    const had = snapshot && Object.prototype.hasOwnProperty.call(snapshot, key)
    if (had) {
      sql(
        `UPDATE companies SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), ${quote(`{${key}}`)},
           ${quote(JSON.stringify(snapshot[key]))}::jsonb, true) WHERE id = ${quote(companyId)}`,
      )
    } else {
      sql(`UPDATE companies SET settings = settings - ${quote(key)} WHERE id = ${quote(companyId)} AND settings IS NOT NULL`)
    }
  }
  // A tenant that started with NULL goes back to NULL once nothing is left.
  if (snapshot === null) {
    sql(`UPDATE companies SET settings = NULL WHERE id = ${quote(companyId)} AND settings = '{}'::jsonb`)
  }
}

/** Restore scalar company columns from a `companyColumns()` snapshot. */
export function restoreCompanyColumns(snapshot, cols, companyId = COMPANY_ID) {
  const sets = cols.map((c) => {
    const v = snapshot[c]
    return `${c} = ${v === null || v === undefined ? 'NULL' : quote(v)}`
  })
  sql(`UPDATE companies SET ${sets.join(', ')} WHERE id = ${quote(companyId)}`)
}

/** Write one settings key directly (a "someone else changed it" fixture). */
export function setSettingsKey(key, value, companyId = COMPANY_ID) {
  sql(
    `UPDATE companies SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), ${quote(`{${key}}`)},
       ${quote(JSON.stringify(value))}::jsonb, true) WHERE id = ${quote(companyId)}`,
  )
}

/** Poll until a settings JSON path (e.g. `overdueReminders,reminderDays`) equals `expected`. */
export async function waitForSettingsPath(path, expected, { timeoutMs = 20_000, companyId = COMPANY_ID } = {}) {
  const want = JSON.stringify(expected)
  return waitForSqlValue(
    `SELECT 1 FROM companies WHERE id = ${quote(companyId)}
       AND (settings #> ${quote(`{${path}}`)}) = ${quote(want)}::jsonb`,
    { timeoutMs, intervalMs: 500, label: `settings.${path} = ${want}` },
  )
}

// ── Pages ───────────────────────────────────────────────────────────────────

const TAB_ANCHOR = {
  general: 'General Information',
  defaults: 'Default Settings',
  print: 'Print',
}

/** Open /settings on a tab and wait until its first card has rendered from IDB. */
export async function openSettingsTab(page, tab) {
  await page.goto(`/settings?tab=${tab}`, { waitUntil: 'domcontentloaded' })
  const anchor = TAB_ANCHOR[tab]
  if (anchor) {
    await expect(page.getByRole('heading', { name: anchor, exact: true })).toBeVisible({ timeout: 60_000 })
  }
}

/** The text input with the given visible label (BaseTextInput pairs <label for>). */
export function field(page, label) {
  return page.getByLabel(label, { exact: true })
}

/** The save-status slot in a card header (CompanyCardSaveStatus). */
export function cardByHeading(page, heading) {
  return page
    .getByRole('heading', { name: heading, exact: true })
    .locator('xpath=ancestor::div[contains(@class,"tw:rounded-xl")][1]')
}

// ── Self-service persona restore ────────────────────────────────────────────

/** Same reset §41 performs — used in afterAll so a failed run leaves no trace. */
export function restoreSelfService() {
  const id = SETTINGS_USERS.selfService.id
  sql(`UPDATE users SET password = ${quote(SEEDED_PASSWORD_HASH)}, password_changed_at = NULL,
         must_change_password = false, failed_login_count = 0, locked_until = NULL,
         first_name = 'Pat', last_name = 'SelfService', time_zone = 'America/New_York',
         avatar = NULL, esign_pin_hash = NULL, esign_pin_set_at = NULL,
         esign_pin_failed_count = 0, esign_pin_locked_until = NULL
       WHERE id = ${quote(id)}`)
  sql(`DELETE FROM password_history WHERE user_id = ${quote(id)}`)
}

/** Current password hash for a user (to prove a write did / did not happen). */
export function passwordHash(userId) {
  return sqlValue(`SELECT password FROM users WHERE id = ${quote(userId)}`)
}

/** Newest login_events row of `eventType` for an email since `sinceIso`. */
export function securityEventSince(email, eventType, sinceIso) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM login_events WHERE lower(email) = lower(${quote(email)})
         AND event_type = ${quote(eventType)} AND created_at >= ${quote(sinceIso)}::timestamptz`,
    ),
  )
}

/**
 * A real, decodable PNG of `width`×`height` in one colour — for the logo and
 * avatar uploads. Generated rather than committed so the upload journeys carry
 * no binary fixture, and big enough (unlike a 1×1) for the crop stencil to
 * produce a non-empty canvas.
 */
export function makePng(width = 256, height = 256, [r, g, b] = [13, 148, 136]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  function crc32(buf) {
    let c = 0xffffffff
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour RGB
  const row = Buffer.alloc(1 + width * 3)
  for (let x = 0; x < width; x += 1) row.set([r, g, b], 1 + x * 3)
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** DB clock "now" as ISO — compare against DB timestamps, never the test host's clock. */
export function dbNow() {
  return sqlValue(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)
}
