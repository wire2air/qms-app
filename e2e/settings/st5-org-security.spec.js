// ST-J5 · Organization security — password policy + guardrails (J-12 / MTC-16).
//
// Everything here changes the E2ELAB tenant's AUTHENTICATION policy, which
// every other suite logs in under. Two rules follow:
//   * The value changed through the UI is deliberately inert for everyone
//     else: the lockout DURATION, which only matters to an account that is
//     already locked.
//   * Restore goes through the same API, not SQL. The server caches both the
//     settings row and the password policy (invalidateSettingsCache /
//     invalidatePolicyCache); an SQL restore would leave the changed values
//     cached for everyone until the TTL ran out.
//
// ST-41 probes the two guardrails whose failure would lock the whole tenant
// out (every login method off) or force MFA with no usable factor. If either
// guardrail were broken the afterAll's API restore still runs, from a session
// that already exists.
import { test, expect } from '@playwright/test'
import { COMPANY_ID } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import { API, SETTINGS_USERS, personaContext } from '../fixtures/settings.js'

function rowJson(table) {
  return JSON.parse(
    sqlValue(`SELECT row_to_json(t)::text FROM ${table} t WHERE company_id = '${COMPANY_ID}'`),
  )
}

let ctx
let before

test.beforeAll(async ({ browser }) => {
  ctx = await personaContext(browser, SETTINGS_USERS.securityAdmin)
  before = { policy: rowJson('password_policies'), org: rowJson('org_security_settings') }
})

test.afterAll(async () => {
  const res = await ctx.request.patch(`${API}/v1/admin/security/settings`, {
    failOnStatusCode: false,
    data: {
      emailLoginEnabled: before.org.email_login_enabled,
      googleLoginEnabled: before.org.google_login_enabled,
      microsoftLoginEnabled: before.org.microsoft_login_enabled,
      mfaMode: before.org.mfa_mode,
      allowedFactors: before.org.allowed_factors,
      sessionIdleMinutes: before.org.session_idle_minutes,
      passwordPolicy: { lockoutDurationMinutes: before.policy.lockout_duration_minutes },
    },
  })
  await ctx.close()
  expect(res.status(), 'restoring organization security through the API').toBe(200)
})

function lockoutInput(page) {
  return page.getByText('Lockout duration (minutes)', { exact: true }).locator('xpath=following::input[1]')
}

test('ST-40 · a security admin changes the password policy in the UI and it persists after reload', async () => {
  const page = await ctx.newPage()
  const next = before.policy.lockout_duration_minutes === 16 ? 17 : 16

  await page.goto('/organization-security')
  await page.getByRole('tab', { name: 'Password policy' }).click({ timeout: 60_000 })
  await lockoutInput(page).fill(String(next))
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Security settings saved')).toBeVisible({ timeout: 15_000 })
  expect(rowJson('password_policies').lockout_duration_minutes, 'password_policies row').toBe(next)

  await page.reload()
  await page.getByRole('tab', { name: 'Password policy' }).click({ timeout: 60_000 })
  await expect(lockoutInput(page)).toHaveValue(String(next))
  await page.close()
})

test('ST-41 · guardrails refuse a configuration that would lock the tenant out, and write nothing', async () => {
  const allOff = await ctx.request.patch(`${API}/v1/admin/security/settings`, {
    failOnStatusCode: false,
    data: { emailLoginEnabled: false, googleLoginEnabled: false, microsoftLoginEnabled: false },
  })
  expect(allOff.status(), 'every login method off').toBe(422)
  expect(JSON.stringify(await allOff.json().catch(() => ({})))).toContain('INVALID_SETTINGS')

  const noFactor = await ctx.request.patch(`${API}/v1/admin/security/settings`, {
    failOnStatusCode: false,
    data: { mfaMode: 'REQUIRED_FOR_ALL', allowedFactors: [] },
  })
  // 422 from the guardrail, or 400 if the schema already refuses an empty list.
  expect([400, 422], `required MFA with no factor → ${noFactor.status()}`).toContain(noFactor.status())

  const org = rowJson('org_security_settings')
  expect(org.email_login_enabled).toBe(before.org.email_login_enabled)
  expect(org.google_login_enabled).toBe(before.org.google_login_enabled)
  expect(org.microsoft_login_enabled).toBe(before.org.microsoft_login_enabled)
  expect(org.mfa_mode).toBe(before.org.mfa_mode)
})

test('ST-42 · company_settings:manage does not confer security settings — 403 on read and write', async ({
  browser,
}) => {
  const settingsCtx = await personaContext(browser, SETTINGS_USERS.settingsAdmin)
  try {
    const read = await settingsCtx.request.get(`${API}/v1/admin/security/settings`, { failOnStatusCode: false })
    expect(read.status()).toBe(403)
    const write = await settingsCtx.request.patch(`${API}/v1/admin/security/settings`, {
      failOnStatusCode: false,
      data: { sessionIdleMinutes: 5 },
    })
    expect(write.status()).toBe(403)
    expect(rowJson('org_security_settings').session_idle_minutes).toBe(before.org.session_idle_minutes)
  } finally {
    await settingsCtx.close()
  }
})
