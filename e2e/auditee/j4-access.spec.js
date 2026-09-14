// AE-J4 · Who can reach a certification audit, and what they can do there
// (PW-AE-J9 as fixed, PW-AE-J10; MTC-15/18; auditee pack 22 §3, §5, §7).
//
// /auditee has NO permission gate for internal users — deliberately. The
// audit's SELECT policy admits a row on permission OR team membership OR a
// share, and the page exists for the invited participant who holds no audit
// permission (permissionGuard.js, the F-15 note). So the route is only half
// the story; every persona here is also checked against what RLS releases.
//
// Suppliers are the exception: `auditee` is in SUPPLIER_BLOCKED_SEGMENTS since
// 2026-09-08.
import { test, expect } from '../../video/fixtures/videoTest.js'
import {
  ALT_BASE_URL,
  ALT_COMPANY_ID,
  ALT_USERS,
  AUTH,
  COMPANY_ID,
  SUPPLIER_USER,
  USERS,
} from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import { freshContext } from '../fixtures/sites.js'
import {
  AUDITEE,
  asAppUser,
  openAuditee,
  openTab,
  visibleOnTab,
  visibleText,
  visibleWithResync,
} from '../fixtures/auditee.js'

const OPEN = AUDITEE.open
const CLOSED = AUDITEE.closed

test.describe('AE-J4 · access to certification audits', () => {
  test('an EXTERNAL_SUPPLIER is sent to /no-access from the list and the detail route', async ({
    browser,
  }) => {
    const ctx = await freshContext(browser, SUPPLIER_USER)
    const page = await ctx.newPage()
    await page.goto('/auditee', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/no-access/, { timeout: 30_000 })
    await page.goto(`/auditee/${OPEN.id}`, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/no-access/, { timeout: 30_000 })
    await ctx.close()
  })

  test('a read-only auditor sees the audit and every control is withheld', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.auditor })
    const page = await ctx.newPage()
    await page.goto('/auditee', { waitUntil: 'domcontentloaded' })
    await visibleWithResync(page, page.getByRole('cell', { name: OPEN.number, exact: true }))
    await expect(page.getByRole('cell', { name: CLOSED.number, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'New External Audit' })).toHaveCount(0)

    await openAuditee(page, OPEN.id, OPEN.number)
    for (const action of ['Start Audit', 'Mark Completed']) {
      await expect(page.getByRole('button', { name: action })).toHaveCount(0)
    }
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0)
    // Auditing body as text, not inputs; agenda notes as text, no uploader.
    await expect(page.getByPlaceholder('e.g. BSI, TÜV SÜD')).toHaveCount(0)
    await expect(visibleText(page, OPEN.auditorName)).not.toHaveCount(0)
    await expect(visibleText(page, OPEN.agendaNotes)).toHaveCount(1)
    await expect(page.getByPlaceholder(/Preparation notes/)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Upload agenda/ })).toHaveCount(0)

    // Reports: the seeded interim report is readable (tenant audit read), with
    // no uploader and a static kind badge instead of the picker.
    await visibleOnTab(page, 'Reports', () => visibleText(page, OPEN.reportTitle, { exact: true }))
    await expect(page.getByRole('button', { name: 'Upload report PDF' })).toHaveCount(0)
    await openTab(page, 'Findings')
    await expect(page.getByRole('button', { name: 'New Finding' })).toHaveCount(0)

    // The API agrees with the UI.
    const before = sqlValue(`SELECT scope FROM audit_instances WHERE id = '${OPEN.id}'`)
    const res = await ctx.request.patch(`/api/v1/services/auditInstances/${OPEN.id}`, {
      data: { scope: '<p>AE-J4 TAMPERED</p>' },
    })
    expect(res.status(), 'audit_management:update is enforced in the controller').toBe(403)
    expect(sqlValue(`SELECT scope FROM audit_instances WHERE id = '${OPEN.id}'`)).toBe(before)
    await ctx.close()
  })

  test('an invited participant with NO audit permission reaches the one audit they are on', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.auditeePeer })
    const page = await ctx.newPage()
    await page.goto('/auditee', { waitUntil: 'domcontentloaded' })
    await expect(page).not.toHaveURL(/\/no-access/)
    await visibleWithResync(page, page.getByRole('cell', { name: OPEN.number, exact: true }))
    // Not on the closed audit's team → RLS withholds it.
    await expect(page.getByRole('cell', { name: CLOSED.number, exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'New External Audit' })).toHaveCount(0)

    await openAuditee(page, OPEN.id, OPEN.number)
    await expect(visibleText(page, OPEN.agendaNotes)).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Start Audit' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Mark Completed' })).toHaveCount(0)
    await expect(visibleText(page, USERS.auditeePeer.name)).not.toHaveCount(0)

    // ── Pins CURRENT behaviour (handed to the backend owner — see AE-J4 RLS
    // matrix below). The participant's view of their own audit is thinner than
    // the pack describes: audit_team_members / audit_findings / audit_reports
    // carry no team-membership branch, so the Lead POC, the findings and the
    // registrar's report are all withheld from the person invited to the audit.
    test.info().annotations.push({
      type: 'known-gap',
      description:
        'participant sees the audit but not its Lead POC, findings or reports (child-table RLS has no team branch)',
    })
    await expect(visibleText(page, 'Lead POC', { exact: true })).toHaveCount(0)
    await openTab(page, 'Findings')
    await expect(visibleText(page, AUDITEE.findings.openNc.number)).toHaveCount(0)
    await openTab(page, 'Reports')
    await expect(visibleText(page, OPEN.reportTitle, { exact: true })).toHaveCount(0)
    await ctx.close()
  })

  test('a user with no grant and no invitation: /auditee loads empty and the record stays hidden', async ({
    browser,
  }) => {
    // MTC-15 as it now stands: internal users are NOT redirected (by design —
    // the pack's proposed permission gate would bounce invited participants),
    // and RLS releases nothing to them.
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const page = await ctx.newPage()
    await page.goto('/auditee', { waitUntil: 'domcontentloaded' })
    await expect(page).not.toHaveURL(/\/no-access/)
    await expect(page.getByText(/No external audits yet/)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'New External Audit' })).toHaveCount(0)

    await page.goto(`/auditee/${OPEN.id}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Audit not found')).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(3_000) // give a late bootstrap every chance to leak it
    await expect(page.getByText(OPEN.number)).toHaveCount(0)
    await ctx.close()
  })

  test('the company owner, holding no audit role, reads the registrar’s report (09-08 §5a fix)', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const page = await ctx.newPage()
    await openAuditee(page, CLOSED.id, CLOSED.number)
    await visibleOnTab(page, 'Reports', () => visibleText(page, CLOSED.reportTitle, { exact: true }))
    await expect(visibleText(page, 'FINAL', { exact: true })).toHaveCount(1)
    // The report's finding count is drawn from audit_findings by audit_report_id.
    await expect(visibleText(page, '1 finding')).toHaveCount(1)
    await ctx.close()
  })

  test('another tenant cannot open, or write to, an E2ELAB certification audit', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.altOwner, baseURL: ALT_BASE_URL })
    const page = await ctx.newPage()
    await page.goto(`/auditee/${OPEN.id}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Audit not found')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(OPEN.number)).toHaveCount(0)

    const before = sqlValue(`SELECT updated_at::text FROM audit_instances WHERE id = '${OPEN.id}'`)
    const patch = await ctx.request.patch(`${ALT_BASE_URL}/api/v1/services/auditInstances/${OPEN.id}`, {
      data: { scope: '<p>AE-J4 CROSS-TENANT</p>' },
    })
    expect(patch.status(), 'a foreign tenant gets 404, never a 403 that confirms the row').toBe(404)
    const report = await ctx.request.post(
      `${ALT_BASE_URL}/api/v1/services/auditInstances/${OPEN.id}/reports`,
      { data: { assetId: OPEN.reportId, title: 'AE-J4 CROSS-TENANT' } },
    )
    expect(report.status()).toBe(404)
    expect(sqlValue(`SELECT updated_at::text FROM audit_instances WHERE id = '${OPEN.id}'`)).toBe(
      before,
    )
    await ctx.close()
  })

  test('RLS matrix on the seeded audits — what each persona’s GraphQL session is released', async () => {
    // What the syncEngine will receive for each persona, measured as app_user.
    // Columns: visible audits | findings | reports | team rows, over the two
    // seeded EXTERNAL audits (4 findings, 2 reports, 3 team rows in total).
    const q = `SELECT concat_ws('|',
        (SELECT coalesce(string_agg(audit_number, ',' ORDER BY audit_number), '')
           FROM audit_instances WHERE id IN ('${OPEN.id}','${CLOSED.id}')),
        (SELECT count(*) FROM audit_findings WHERE audit_instance_id IN ('${OPEN.id}','${CLOSED.id}')),
        (SELECT count(*) FROM audit_reports WHERE audit_instance_id IN ('${OPEN.id}','${CLOSED.id}')),
        (SELECT count(*) FROM audit_team_members WHERE audit_instance_id IN ('${OPEN.id}','${CLOSED.id}')))`
    const both = `${OPEN.number},${CLOSED.number}`
    const as = (user, extra = {}) => asAppUser(q, { userId: user.id, ...extra })

    expect(as(USERS.author), 'lead auditor: everything').toBe(`${both}|4|2|3`)
    expect(as(USERS.owner, { isOwner: true }), 'owner branch on every table').toBe(`${both}|4|2|3`)
    expect(as(USERS.noAccess), 'no grant, no invitation: nothing').toBe('|0|0|0')
    expect(
      asAppUser(q, { userId: ALT_USERS.owner.id, companyId: ALT_COMPANY_ID, isOwner: true }),
      'another tenant’s OWNER: nothing',
    ).toBe('|0|0|0')

    // audit_management:read alone: audits, reports and team — but findings
    // gate on the separate `audit_findings:read` module grant.
    test.info().annotations.push({
      type: 'current-behaviour',
      description: 'auditor (audit_management:read only) reads 0 findings: audit_findings_select_rls checks audit_findings:read',
    })
    expect(as(USERS.auditor)).toBe(`${both}|0|2|3`)

    // The invited participant: the parent row via team membership, and from
    // the children only their OWN team row. See the known-gap annotation in
    // the participant test above — this is the measured premise for it.
    expect(as(USERS.auditeePeer)).toBe(`${OPEN.number}|0|0|1`)
    expect(COMPANY_ID).toBeTruthy()
  })
})
