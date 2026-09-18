// AE-J1 · The certification-audit register: list, create, start (PW-AE-J1).
//
// Covers manual cases MTC-01 (create with no standard), MTC-04 (start + contact
// autosave) and MTC-20 (creation notifies nobody), in the browser and in the
// database.
//
// Statuses: the pack (07, 12) still describes SCHEDULED → IN_PROGRESS →
// COMPLETED. That machine was replaced on 2026-08-28 (auditee pack 22 §2): the
// record lives in OPEN and the execution detail moves on `execution_phase`
// (SCHEDULED → IN_PROGRESS → COMPLETE). These journeys assert the live one.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import { dateInDays, fillRichText, findAuditByScope, selectInDialog } from '../fixtures/audits.js'
import {
  AUDITEE,
  auditeeRow,
  cleanupAudits,
  teamOf,
  uniqueTag,
  visibleWithResync,
} from '../fixtures/auditee.js'

test.use({ storageState: AUTH.author })

const created = []
test.afterAll(() => cleanupAudits(created))

test.describe('AE-J1 · the certification-audit register', () => {
  test('/auditee lists EXTERNAL audits and nothing else', async ({ page }) => {
    await page.goto('/auditee', { waitUntil: 'domcontentloaded' })
    await visibleWithResync(
      page,
      page.getByRole('cell', { name: AUDITEE.open.number, exact: true }),
    )
    await expect(page.getByRole('cell', { name: AUDITEE.closed.number, exact: true })).toBeVisible()

    // The Auditing Body column renders firm · auditor.
    await expect(page.getByRole('row', { name: new RegExp(AUDITEE.open.number) })).toContainText(
      `${AUDITEE.open.firm} · ${AUDITEE.open.auditorName}`,
    )

    // Every audit number the table renders must be an EXTERNAL row. The author
    // reads INTERNAL and SUPPLIER audits too (tenant-wide audit_management:read),
    // so they ARE in this context's IndexedDB — the filter is the only thing
    // keeping them out of the list.
    const rowsText = (await page.locator('tbody tr').allInnerTexts()).join('\n')
    const numbers = [...new Set(rowsText.match(/\bAUD-(?:[A-Z]+-)?\d{4}\b/g) || [])]
    expect(numbers.length, 'the table rendered audit numbers').toBeGreaterThanOrEqual(2)
    const types = sql(
      `SELECT DISTINCT program_type_id FROM audit_instances
        WHERE company_id = '${COMPANY_ID}' AND deleted_at IS NULL
          AND audit_number IN (${numbers.map((n) => `'${n}'`).join(',')})`,
    )
    expect(types.split('\n'), 'only EXTERNAL audits are listed').toEqual(['EXTERNAL'])

    const internal = sqlValue(
      `SELECT audit_number FROM audit_instances
        WHERE company_id = '${COMPANY_ID}' AND program_type_id = 'INTERNAL'
          AND deleted_at IS NULL AND audit_number IS NOT NULL
        ORDER BY created_at DESC LIMIT 1`,
    )
    expect(internal, 'the tenant has INTERNAL audits to exclude').toBeTruthy()
    expect(numbers).not.toContain(internal)
  })

  test('create a certification audit with no standard, then start it', async ({ page }) => {
    test.setTimeout(180_000)
    const scope = uniqueTag('J1 create')
    const firm = `E2E BSI ${Date.now()}`

    await page.goto('/auditee', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'New External Audit' }).click()
    const heading = page.getByRole('heading', { name: 'New External Audit' })
    await expect(heading).toBeVisible({ timeout: 20_000 })

    await page.getByLabel('Scheduled Date').fill(dateInDays(14))
    // Standard deliberately left empty — optional for EXTERNAL only.
    await selectInDialog(page, 'Lead POC', USERS.author.name)
    await selectInDialog(page, 'Involved people', USERS.auditeePeer.name)
    await heading.click() // close the multi-select listbox
    await page.getByPlaceholder('e.g. BSI, TÜV SÜD, NSF').fill(firm)
    await page.getByPlaceholder("Lead auditor's name").fill('Jo Journey')
    await page.getByPlaceholder('name@registrar.com').fill('jo@journey.e2e.test')
    await page.getByPlaceholder('+1 …').fill('+1 555 0142')
    await fillRichText(page, "What's in scope?", scope)
    await page.getByRole('button', { name: 'Create & open' }).click()

    await expect(page).toHaveURL(/\/auditee\/[0-9a-f-]{36}/, { timeout: 45_000 })
    const audit = findAuditByScope(scope)
    expect(audit, 'the audit row exists').toBeTruthy()
    created.push(audit.id)
    expect(page.url()).toContain(audit.id)

    // ── DB: an EXTERNAL audit with no standard and nothing frozen onto it.
    expect(auditeeRow(audit.id)).toMatchObject({
      programTypeId: 'EXTERNAL',
      statusId: 'OPEN',
      executionPhase: 'SCHEDULED',
      auditStandardId: null,
      auditStandardVersionId: null,
      requirementSchema: '[]',
      firm,
      auditorName: 'Jo Journey',
      email: 'jo@journey.e2e.test',
      phone: '+1 555 0142',
    })
    expect(teamOf(audit.id), 'Lead POC as LEAD, the involved person as TEAM').toEqual({
      [USERS.author.id]: 'LEAD',
      [USERS.auditeePeer.id]: 'TEAM',
    })

    // ── UI: Our People carries the Lead POC chip; the auditing body is in the
    // rail; the auditee page has a Share tab and no requirements walkthrough.
    await visibleWithResync(page, page.getByText('Lead POC', { exact: true }))
    await expect(page.getByPlaceholder('e.g. BSI, TÜV SÜD').first()).toHaveValue(firm)
    await expect(page.getByRole('tab', { name: 'Share', exact: true })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Requirements/i })).toHaveCount(0)

    // ── MTC-20 (pins current behaviour): creation notifies nobody — not the
    // Lead POC, not the involved person. Polled for a few seconds because
    // notifications are written by the worker, not in the request.
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(2_000)
      expect(
        Number(sqlValue(`SELECT count(*) FROM notifications WHERE resource_id = '${audit.id}'`)),
        'no notification is written for a new certification audit',
      ).toBe(0)
    }

    // ── Start: status stays OPEN, the phase moves to fieldwork.
    await page.getByRole('button', { name: 'Start Audit' }).click()
    await waitForSqlValue(
      `SELECT count(*) FROM audit_instances WHERE id = '${audit.id}'
          AND status_id = 'OPEN' AND execution_phase = 'IN_PROGRESS' AND started_at IS NOT NULL`,
      { timeoutMs: 30_000, label: 'audit started' },
    )
    await visibleWithResync(page, page.getByRole('button', { name: 'Mark Completed' }))
    await expect(page.getByRole('button', { name: 'Start Audit' })).toHaveCount(0)

    // ── MTC-04: scope, objectives and all four auditing-body fields autosave.
    const firm2 = `${firm} (renamed)`
    await page.getByPlaceholder('e.g. BSI, TÜV SÜD').first().fill(firm2)
    await page.getByPlaceholder("Lead auditor's name").fill('Jo Journey II')
    await page.getByPlaceholder('name@registrar.com').fill('jo2@journey.e2e.test')
    await page.getByPlaceholder('+1 …').fill('+1 555 0177')
    await waitForSqlValue(
      `SELECT count(*) FROM audit_instances WHERE id = '${audit.id}'
          AND external_audit_firm = '${firm2}' AND external_auditor_name = 'Jo Journey II'
          AND external_auditor_email = 'jo2@journey.e2e.test' AND external_auditor_phone = '+1 555 0177'`,
      { timeoutMs: 20_000, label: 'all four auditing-body fields autosaved' },
    )
    const objectives = uniqueTag('J1 objectives')
    await fillRichText(page, 'What should this audit achieve?', objectives)
    await waitForSqlValue(
      `SELECT count(*) FROM audit_instances WHERE id = '${audit.id}' AND objectives LIKE '%${objectives}%'`,
      { timeoutMs: 20_000, label: 'objectives autosaved' },
    )
    const scopeAdd = uniqueTag('J1 scope edit')
    const scopeEditor = page.locator('[contenteditable="true"]').first()
    await scopeEditor.click()
    await page.keyboard.press('End')
    await page.keyboard.type(` ${scopeAdd}`)
    await waitForSqlValue(
      `SELECT count(*) FROM audit_instances WHERE id = '${audit.id}' AND scope LIKE '%${scopeAdd}%'`,
      { timeoutMs: 20_000, label: 'scope autosaved' },
    )
    expect(auditeeRow(audit.id).scope, 'the scope edit appended, it did not replace').toContain(scope)
  })
})
