// ST-J1 · Company settings cards, driven by the OWNER (PW-J1 / MTC-01 / MTC-04).
//
// Every card on /settings autosaves through the syncEngine: `company.save()` →
// GraphQL `updateCompany` → RLS `company_update_rls`. The module pack
// documented the REST `PATCH /companies/:id` route as "authoritative"; the
// 2026-08-25 addendum corrected that, and ST-02 pins it by waiting for the
// GraphQL mutation itself.
//
// The row under test is SHARED: `companies.settings` is one JSONB blob other
// suites read (overdue ladder, closure-approval flags, print settings), so the
// afterAll puts back only the keys and columns this file touched —
// `restoreSettingsKeys`, never a whole-column snapshot restore.
//
// ST-07 and ST-08 assert behaviour that is not true today, on purpose (see
// each test). They are the release conditions for two backend defects, not
// flaky tests.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID } from '../fixtures/cast.js'
import { sql, waitForSqlValue } from '../fixtures/db.js'
import {
  DEFAULT_OVERDUE_CONFIG,
  cardByHeading,
  companyColumns,
  companySettings,
  dbNow,
  field,
  makePng,
  openSettingsTab,
  restoreCompanyColumns,
  restoreSettingsKeys,
  setSettingsKey,
  waitForSettingsPath,
} from '../fixtures/settings.js'

test.use({ storageState: AUTH.owner })
// Deliberately NOT serial: every test sets up its own precondition, so one
// failure does not hide the verdict on the rest of the cards.

// `printSettings` is in the list because companySettingsHome backfills it as
// `{}` on load, and the first save of any card persists that backfill.
const KEYS = ['overdueReminders', 'defaultSla', 'printSettings', 'e2eSettingsSentinel', 'e2eLateSibling']
const COLS = ['name', 'default_first_day_of_week', 'company_icon_url']
let settingsBefore
let columnsBefore

test.beforeAll(() => {
  settingsBefore = companySettings()
  columnsBefore = companyColumns()
})

test.afterAll(() => {
  restoreSettingsKeys(settingsBefore, KEYS)
  restoreCompanyColumns(columnsBefore, COLS)
})

/** Every updateCompany mutation the page sends, captured from the wire. */
function captureCompanyMutations(page) {
  const seen = []
  page.on('request', (r) => {
    if (r.url().includes('/graphql') && (r.postData() || '').includes('updateCompany')) seen.push(r)
  })
  return seen
}

function nextNumber(current, a, b) {
  return Number(current) === a ? b : a
}

test('ST-01 · an unconfigured tenant sees the ladder that actually runs, and looking writes nothing', async ({
  page,
}) => {
  sql(`UPDATE companies SET settings = settings - 'overdueReminders' WHERE id = '${COMPANY_ID}' AND settings IS NOT NULL`)
  expect(companySettings()?.overdueReminders, 'precondition: the key has never been written').toBeUndefined()

  const mutations = captureCompanyMutations(page)
  await openSettingsTab(page, 'defaults')

  // What the worker's resolveOverdueConfig does with an absent key — shown, not blank.
  await expect(page.getByRole('switch', { name: 'Chase overdue tasks' })).toHaveAttribute(
    'aria-checked',
    String(DEFAULT_OVERDUE_CONFIG.enabled),
  )
  await expect(field(page, 'Reminder days past due')).toHaveValue(DEFAULT_OVERDUE_CONFIG.reminderDays.join(', '))
  await expect(field(page, 'Escalation day')).toHaveValue(String(DEFAULT_OVERDUE_CONFIG.escalationDay))

  // Viewing is not editing. The autosave watchers skip their first trigger;
  // if one ever stops doing so, an admin who merely opens the tab writes the
  // row (and a non-owner would see "Save failed" for doing nothing).
  await page.waitForTimeout(2_000)
  expect(mutations, 'opening the Defaults tab must not send updateCompany').toHaveLength(0)
  expect(companySettings()?.overdueReminders, 'and the key is still absent').toBeUndefined()
})

test('ST-02 · reminder days are normalised on commit (9, 3, 3, 6 → 3, 6, 9), saved over GraphQL, and survive a reload', async ({
  page,
}) => {
  await openSettingsTab(page, 'defaults')
  const mutation = page.waitForRequest(
    (r) => r.url().includes('/graphql') && (r.postData() || '').includes('updateCompany'),
    { timeout: 20_000 },
  )

  const days = field(page, 'Reminder days past due')
  await days.fill('9, 3, 3, 6')
  // Committed on BLUR (Tab), the path an admin who clicks away takes; the
  // Enter path is pinned by companyDefaultsCard.spec.js.
  await days.press('Tab')
  await expect(days, 'the field redisplays what will actually fire').toHaveValue('3, 6, 9')
  await field(page, 'Escalation day').fill('14')

  // MTC-04: the write path is the syncEngine's GraphQL mutation, not REST.
  await mutation
  await waitForSettingsPath('overdueReminders,reminderDays', [3, 6, 9])
  await waitForSettingsPath('overdueReminders,escalationDay', 14)
  await expect(cardByHeading(page, 'Default Settings').getByText(/Save failed/)).toHaveCount(0)

  await page.reload()
  await expect(field(page, 'Reminder days past due')).toHaveValue('3, 6, 9', { timeout: 60_000 })
  await expect(field(page, 'Escalation day')).toHaveValue('14')
})

test('ST-03 · switching the chase off writes enabled:false, hides the rungs, and keeps them', async ({ page }) => {
  setSettingsKey('overdueReminders', { reminderDays: [3, 6, 9], escalationDay: 14 })
  await openSettingsTab(page, 'defaults')
  const chase = page.getByRole('switch', { name: 'Chase overdue tasks' })
  await expect(chase).toHaveAttribute('aria-checked', 'true')
  await chase.click()
  await expect(field(page, 'Reminder days past due')).toHaveCount(0)
  await waitForSettingsPath('overdueReminders,enabled', false)
  // Off is a flag, not a wipe: switching back on must restore the ladder.
  expect(companySettings().overdueReminders.reminderDays).toEqual([3, 6, 9])
  expect(companySettings().overdueReminders.escalationDay).toBe(14)
})

test('ST-04 · General and Regional cards: company name and first day of week persist after reload', async ({
  page,
}) => {
  const name = `E2E Lab ${Date.now().toString(36)}`
  const firstDay = String(nextNumber(columnsBefore.default_first_day_of_week, 0, 1))

  await openSettingsTab(page, 'general')
  await expect(field(page, 'Company Code'), 'the code is system-owned').toBeDisabled()
  await field(page, 'Company Name').fill(name)
  await waitForSqlValue(`SELECT 1 FROM companies WHERE id = '${COMPANY_ID}' AND name = '${name}'`, {
    timeoutMs: 20_000,
    label: 'company name saved',
  })

  await page.getByLabel('First Day of Week').selectOption(firstDay)
  await waitForSqlValue(
    `SELECT 1 FROM companies WHERE id = '${COMPANY_ID}' AND default_first_day_of_week = ${firstDay}`,
    { timeoutMs: 20_000, label: 'first day of week saved' },
  )

  await page.reload()
  await expect(field(page, 'Company Name')).toHaveValue(name, { timeout: 60_000 })
  await expect(page.getByLabel('First Day of Week')).toHaveValue(firstDay)
})

test('ST-05 · Branding: a light-mode logo upload is stored and rendered after reload', async ({ page }) => {
  await openSettingsTab(page, 'general')
  await page.getByRole('button', { name: 'Upload Light Icon' }).click()
  const dialog = page.getByRole('dialog', { name: 'Light Mode Logo' })
  // HeadlessUI's role="dialog" root is a zero-size wrapper, so assert on the
  // title the panel renders rather than on the root's own box.
  await expect(dialog.getByRole('heading', { name: 'Light Mode Logo' })).toBeVisible()
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'e2e-settings-logo.png',
    mimeType: 'image/png',
    buffer: makePng(256, 256, [13, 148, 136]),
  })
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Light mode logo uploaded successfully')).toBeVisible({ timeout: 30_000 })

  const previous = columnsBefore.company_icon_url
  await waitForSqlValue(
    `SELECT 1 FROM companies WHERE id = '${COMPANY_ID}' AND company_icon_url IS NOT NULL
       AND company_icon_url IS DISTINCT FROM ${previous ? `'${previous}'` : 'NULL'}`,
    { timeoutMs: 20_000, label: 'company_icon_url saved' },
  )

  await page.reload()
  await expect(page.getByRole('img', { name: 'Light logo' })).toBeVisible({ timeout: 60_000 })
})

test('ST-06 · a card save keeps every sibling settings key it did not edit', async ({ page }) => {
  setSettingsKey('e2eSettingsSentinel', { writtenBy: 'settings-e2e', n: 1 })
  const before = companySettings()

  await openSettingsTab(page, 'defaults')
  const next = nextNumber(before.defaultSla, 17, 18)
  await field(page, 'Default SLA (days)').fill(String(next))
  await waitForSettingsPath('defaultSla', next)

  const after = companySettings()
  for (const [key, value] of Object.entries(before)) {
    if (key === 'defaultSla') continue
    expect(after[key], `settings.${key} survived the Defaults save`).toEqual(value)
  }
})

test('ST-07 · a card save does not revert a key another writer changed after the page loaded (lost update)', async ({
  page,
}) => {
  // Two admins, two cards, one JSONB column. The card sends the WHOLE settings
  // object its tab loaded; a sibling key written after the load (by another
  // tab, the REST route, a script) is only safe if the server merges rather
  // than replaces — or the tab is refreshed first. The refresh cannot happen
  // today: the company audit row is never written (see ST-08), so the sync
  // service has nothing to broadcast. Release condition for the settings
  // merge on the GraphQL path (handed to the backend owner).
  await openSettingsTab(page, 'defaults')
  await expect(field(page, 'Default SLA (days)')).toBeVisible()

  setSettingsKey('e2eLateSibling', { writtenAfterLoad: true })
  const next = nextNumber(companySettings().defaultSla, 19, 20)
  await field(page, 'Default SLA (days)').fill(String(next))
  await waitForSettingsPath('defaultSla', next)

  expect(
    companySettings().e2eLateSibling,
    'the late sibling key must survive the stale tab’s save',
  ).toEqual({ writtenAfterLoad: true })
})

test('🔴 ST-08 · a company edit leaves an audit_logs row (MTC-01) (FAILS TODAY — worker audit registry drops companies rows)', async ({
  page,
}) => {
  // The MOST generous case: `name` is the one field the worker's audit registry
  // tracks for `companies` (registry/modules/organization.js). Even so,
  // defaultHandler derives companyId from `row.companyId`, which a `companies`
  // row does not have, so the entry is dropped — measured: zero audit_logs
  // rows exist for any company in app-db. Release condition for that fix.
  const since = dbNow()
  const name = `E2E Lab audit ${Date.now().toString(36)}`
  await openSettingsTab(page, 'general')
  await field(page, 'Company Name').fill(name)
  await waitForSqlValue(`SELECT 1 FROM companies WHERE id = '${COMPANY_ID}' AND name = '${name}'`, {
    timeoutMs: 20_000,
    label: 'company name saved',
  })

  let audited = '0'
  try {
    audited = await waitForSqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_id = '${COMPANY_ID}' AND created_at >= '${since}'::timestamptz`,
      { timeoutMs: 30_000, label: 'company audit row' },
    )
  } catch {
    // fall through to the assertion, which carries the message
  }
  expect(Number(audited), 'company_audit_trigger → audit_event must record the change').toBeGreaterThan(0)
})
