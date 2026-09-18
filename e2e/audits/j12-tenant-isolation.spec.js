// PW-J12 · Cross-tenant isolation (MTC-20).
//
// Two independent layers, because the module relies on both:
//   - REST/Sequelize, where every audit controller hand-writes the company
//     filter (findOrFail on { id, companyId }) and RLS is off by default;
//   - RLS itself, exercised as `app_user` with the OTHER tenant's session GUCs —
//     the layer PostGraphile runs every GraphQL request at.
//
// A leak in either direction is a tenant breach, so the assertions are "404 /
// not visible / unchanged", never "403": a 403 would already confirm the row
// exists.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { ALT_BASE_URL, ALT_COMPANY_ID, ALT_USERS, AUTH, AUDIT_STANDARD } from '../fixtures/cast.js'
import {
  createAdHocAudit,
  findingsOf,
  openAuditTab,
  scoreClause,
  startAudit,
  uniqueScope,
} from '../fixtures/audits.js'
import { sqlValue, sqlAsAppUser } from '../fixtures/db.js'

test.use({ storageState: AUTH.author })

test.describe('PW-J12 · an E2EALT user cannot see or touch E2ELAB audits', () => {
  test('REST 404s, RLS hides the rows, and nothing is mutated', async ({ page, browser }) => {
    test.setTimeout(240_000)

    const scope = uniqueScope('J12')
    const audit = await createAdHocAudit(page, scope)
    await startAudit(page)
    await openAuditTab(page, 'Requirements')
    await scoreClause(page, audit.id, AUDIT_STANDARD.clauses.training, 'Major NC')
    const [finding] = findingsOf(audit.id)
    expect(finding).toBeTruthy()

    const altCtx = await browser.newContext({ storageState: AUTH.altOwner, baseURL: ALT_BASE_URL })

    // ── REST: the other tenant's owner is an owner, and still gets nothing.
    const patchAudit = await altCtx.request.patch(
      `${ALT_BASE_URL}/api/v1/services/auditInstances/${audit.id}`,
      { data: { scope: 'PW-J12 TAMPERED' } },
    )
    expect(patchAudit.status(), 'a different tenant must 404, not leak the row').toBe(404)

    const patchFinding = await altCtx.request.patch(
      `${ALT_BASE_URL}/api/v1/services/auditFindings/${finding.id}`,
      { data: { description: 'PW-J12 TAMPERED' } },
    )
    expect(patchFinding.status()).toBe(404)

    const patchStandard = await altCtx.request.patch(
      `${ALT_BASE_URL}/api/v1/services/auditStandards/${AUDIT_STANDARD.id}`,
      { data: { description: 'PW-J12 TAMPERED' } },
    )
    expect(patchStandard.status()).toBe(404)

    // ── UI: the audit's detail route is open by design (RECORD tier), so the
    // guard lets the page load — RLS is what must keep it empty.
    const altPage = await altCtx.newPage()
    await altPage.goto(`${ALT_BASE_URL}/audits/instances/${audit.id}`, {
      waitUntil: 'domcontentloaded',
    })
    await expect(altPage.getByText(audit.auditNumber)).toHaveCount(0)
    await altCtx.close()

    // ── RLS: the same reads/writes as app_user with E2EALT's GUCs.
    const actor = { userId: ALT_USERS.owner.id, companyId: ALT_COMPANY_ID }
    const visible = sqlAsAppUser(
      `SELECT count(*) FROM audit_instances WHERE id = '${audit.id}';`,
      actor,
    )
    expect(
      visible.output.trim().split('\n').pop(),
      'the row must be invisible to the other tenant',
    ).toBe('0')
    sqlAsAppUser(`UPDATE audit_findings SET severity_score = 10 WHERE id = '${finding.id}';`, actor)

    // ── Nothing moved.
    expect(sqlValue(`SELECT scope FROM audit_instances WHERE id = '${audit.id}'`)).toContain(scope)
    expect(
      sqlValue(`SELECT severity_score FROM audit_findings WHERE id = '${finding.id}'`),
      'cross-tenant UPDATE must change nothing even where the same-tenant gate is weak (PW-J10)',
    ).toBe('1')
    expect(
      sqlValue(
        `SELECT coalesce(description,'') FROM audit_standards WHERE id = '${AUDIT_STANDARD.id}'`,
      ),
    ).not.toContain('TAMPERED')
  })
})
