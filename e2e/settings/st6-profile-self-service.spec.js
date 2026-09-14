// ST-J6 · /profile — the signed-in user's own profile and password
// (J-07 / J-10 / PW-J4 / MTC-09 / MTC-10 / MTC-13).
//
// Runs as `selfService` (e2e-seed.sql §41) and NOBODY else: a password change
// revokes every other session of the account, which for a shared persona means
// the storageState every other suite loads. The persona is reset by the seed
// and again in beforeAll/afterAll — its seeded password fails the tenant policy,
// so nothing but an SQL reset can ever put it back.
//
// Raw-GraphQL self-escalation on `users` (MTC-14, finding #3) is NOT repeated
// here: users/j1-self-escalation-guard.spec.js owns it, including the
// /profile control that proves the guard did not lock self-service out.
import { test, expect, request } from '@playwright/test'
import { BASE_URL, PASSWORD } from '../fixtures/cast.js'
import { sqlValue, waitForSqlValue } from '../fixtures/db.js'
import {
  SETTINGS_USERS,
  dbNow,
  loginState,
  passwordHash,
  restoreSelfService,
  sessionStatus,
} from '../fixtures/settings.js'

test.describe.configure({ mode: 'serial' })

const ME = SETTINGS_USERS.selfService
// Policy: upper + lower + number, zxcvbn ≥ 3, HIBP-checked. Not dictionary words.
const STRONG = 'Kestrel!Pylon-4719-Quartz'

let state

test.beforeAll(async () => {
  restoreSelfService()
  state = await loginState(ME)
})

test.afterAll(() => {
  restoreSelfService()
})

async function apiChange(currentPassword, newPassword) {
  const ctx = await request.newContext({ baseURL: BASE_URL, storageState: state })
  try {
    const res = await ctx.post('/api/v1/auth/password/change', {
      failOnStatusCode: false,
      data: { currentPassword, newPassword },
    })
    return { status: res.status(), body: await res.json().catch(() => ({})) }
  } finally {
    await ctx.dispose()
  }
}

async function fillPasswordForm(page, current, next) {
  await page.goto('/profile?tab=security')
  await page.getByLabel('Current password', { exact: true }).fill(current, { timeout: 60_000 })
  await page.getByLabel('New password', { exact: true }).fill(next)
  await page.getByLabel('Confirm new password', { exact: true }).fill(next)
  const button = page.getByRole('button', { name: 'Update password' })
  // Enabled only once the strength meter has validated the candidate server-side.
  await expect(button).toBeEnabled({ timeout: 20_000 })
  return button
}

test('ST-50 · first name and timezone autosave through the syncEngine and survive a reload; email is read-only', async ({
  browser,
}) => {
  const ctx = await browser.newContext({ storageState: state })
  const page = await ctx.newPage()
  try {
    await page.goto('/profile')
    const first = page.getByLabel('First name', { exact: true })
    await expect(first).toHaveValue('Pat', { timeout: 60_000 })
    await first.fill('Patricia')
    await waitForSqlValue(`SELECT 1 FROM users WHERE id = '${ME.id}' AND first_name = 'Patricia'`, {
      timeoutMs: 20_000,
      label: 'first name saved',
    })

    const tz = page.getByText('Timezone', { exact: true }).locator('xpath=following::*[@role="combobox"][1]')
    await tz.click()
    await page.getByPlaceholder('Search…').fill('Berlin')
    await page.getByRole('option', { name: /^Europe\/Berlin/ }).click()
    await waitForSqlValue(`SELECT 1 FROM users WHERE id = '${ME.id}' AND time_zone = 'Europe/Berlin'`, {
      timeoutMs: 20_000,
      label: 'timezone saved',
    })

    // The login identifier is displayed, never offered as a field.
    await expect(page.getByText(ME.email, { exact: true })).toBeVisible()
    await expect(page.locator(`input[value="${ME.email}"]`)).toHaveCount(0)

    await page.reload()
    await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Patricia', { timeout: 60_000 })
    await expect(tz).toContainText('Europe/Berlin')
  } finally {
    await ctx.close()
  }
})

test('ST-51 · a wrong current password is refused in the UI (CURRENT_PASSWORD_INVALID) and the hash is untouched', async ({
  browser,
}) => {
  const hash = passwordHash(ME.id)
  const ctx = await browser.newContext({ storageState: state })
  const page = await ctx.newPage()
  try {
    const button = await fillPasswordForm(page, 'not-my-password', STRONG)
    const response = page.waitForResponse((r) => r.url().includes('/v1/auth/password/change'))
    await button.click()
    expect((await response).status()).toBe(400)
    await expect(page.getByText('Your current password is incorrect')).toBeVisible()
  } finally {
    await ctx.close()
  }
  expect(passwordHash(ME.id)).toBe(hash)
})

test('ST-52 · a policy-violating new password is refused (422 PASSWORD_POLICY) and nothing changes', async () => {
  const hash = passwordHash(ME.id)
  const { status, body } = await apiChange(PASSWORD, 'password')
  expect(status).toBe(422)
  expect(JSON.stringify(body)).toContain('PASSWORD_POLICY')
  expect(passwordHash(ME.id)).toBe(hash)
})

test('ST-53 · a strong password is accepted: hash rotated, PASSWORD_CHANGED recorded, every OTHER session revoked', async ({
  browser,
}) => {
  const since = dbNow()
  const hash = passwordHash(ME.id)
  const otherDevice = await loginState(ME)
  expect(await sessionStatus(otherDevice), 'precondition: the second device is signed in').toBe(200)

  const ctx = await browser.newContext({ storageState: state })
  const page = await ctx.newPage()
  try {
    const button = await fillPasswordForm(page, PASSWORD, STRONG)
    await button.click()
    await expect(page.getByText('Password updated')).toBeVisible({ timeout: 15_000 })
  } finally {
    await ctx.close()
  }

  expect(passwordHash(ME.id), 'argon2 hash rotated').not.toBe(hash)
  expect(await sessionStatus(state), 'the session that made the change is kept').toBe(200)
  expect(await sessionStatus(otherDevice), 'the other device is signed out').toBe(401)
  await waitForSqlValue(
    `SELECT count(*) FROM login_events WHERE lower(email) = lower('${ME.email}')
       AND event_type = 'PASSWORD_CHANGED' AND created_at >= '${since}'::timestamptz`,
    { timeoutMs: 15_000, label: 'PASSWORD_CHANGED security event' },
  )
  expect(Number(sqlValue(`SELECT count(*) FROM password_history WHERE user_id = '${ME.id}'`))).toBeGreaterThan(0)
})

test('ST-54 · re-using the current password is refused by the history rule, and the hash is unchanged', async () => {
  const hash = passwordHash(ME.id)
  const { status, body } = await apiChange(STRONG, STRONG)
  expect(status, JSON.stringify(body)).toBe(422)
  expect(JSON.stringify(body)).toContain('PASSWORD_POLICY')
  expect(passwordHash(ME.id)).toBe(hash)
})
