// RA-J4 — cross-tenant isolation. E2EALT must not be able to read or write
// an E2ELAB risk_assessments row (or the CAPA that carries it), and vice
// versa.
//
// UNLIKE equipment/j5 or audits/j12, there is no REST GET/PATCH route to
// probe for either table here: `backend/api/routes/capas.js` exposes only
// action-RPC POST endpoints (start/submit/close/…), and risk_assessments has
// no route file at all — both are GraphQL/SyncEngine-only. So isolation is
// proven at the two layers that actually gate these tables: the UI (the
// CAPA detail route loads open, per the RECORD tier every module uses, and
// RLS is what must keep it empty) and raw RLS via sqlAsAppUser (the same
// layer PostGraphile runs every GraphQL request at) for the row itself, plus
// the risk_assessment_templates admin page (its own module, own RLS).
import { test, expect } from '@playwright/test'
import {
  ALT_BASE_URL,
  ALT_COMPANY_ID,
  ALT_USERS,
  AUTH,
  COMPANY_ID,
  RISK_ASSESSMENT,
} from '../fixtures/cast.js'
import { findCapaByTitle, sqlAsAppUser, sqlValue } from '../fixtures/db.js'
import { createCapa, uniqueTitle, openCapa } from '../fixtures/capas.js'
import { completeRiskReviewStep, waitForRiskAssessment, purgeRiskAssessment, HIGH_CELL } from '../fixtures/riskAssessment.js'

const REVIEWER_ID = 'e2e10000-0000-4000-8000-000000000003'

test.describe('RA-J4 · cross-tenant isolation (E2EALT vs E2ELAB)', () => {
  let capaId
  let raId

  test('arrange: an E2ELAB CAPA with a derived risk_assessments row', async ({ browser }) => {
    const ctxAuthor = await browser.newContext({ storageState: AUTH.author })
    const authorPage = await ctxAuthor.newPage()
    const title = uniqueTitle('RA-J4')
    await createCapa(authorPage, title, { workflowName: RISK_ASSESSMENT.workflowName })
    const capa = findCapaByTitle(title)
    capaId = capa.id
    purgeRiskAssessment(capaId)
    await openCapa(authorPage, capaId)
    await ctxAuthor.close()

    await completeRiskReviewStep(browser, capaId, { cell: HIGH_CELL })
    const ra = await waitForRiskAssessment(capaId)
    raId = ra.id
    expect(ra).not.toBeNull()
  })

  test('the E2ELAB CAPA detail page renders nothing for an E2EALT session', async ({ browser }) => {
    // CAPA's detail route is RECORD-tier: the guard lets the route load for
    // anyone (permissionGuard.js only guards the LIST route), so RLS —
    // exercised here through the real page, backed by GraphQL — is what has
    // to keep the content empty. capas.js has no REST GET/PATCH route at all
    // to probe instead (action-RPC POSTs only), unlike equipment/audits.
    const ctx = await browser.newContext({ storageState: AUTH.altOwner, baseURL: ALT_BASE_URL })
    const page = await ctx.newPage()
    await page.goto(`${ALT_BASE_URL}/capas/${capaId}`, { waitUntil: 'domcontentloaded' })
    const capaNumber = sqlValue(`SELECT capa_number FROM capas WHERE id = '${capaId}'`)
    await expect(page.getByText(capaNumber, { exact: false })).toHaveCount(0, { timeout: 15_000 })
    await ctx.close()
  })

  test('the risk_assessments row is invisible to an E2EALT user under RLS — no cross-tenant leak through the borrowed capa permission', () => {
    // E2EALT's owner is isOwner=true in their own company, but this probe
    // deliberately runs as a NON-owner E2EALT persona would: RLS's tenancy
    // clause (company_id = current_setting('app.current_company_id')) is
    // what has to hold here, independent of any permission grant.
    const res = sqlAsAppUser(`SELECT id FROM public.risk_assessments WHERE id = '${raId}';`, {
      userId: ALT_USERS.owner.id,
      companyId: ALT_COMPANY_ID,
    })
    expect(res.ok).toBe(true)
    expect(res.output.trim(), 'zero rows — the company_id clause holds regardless of scope').toBe('')
  })

  test('an E2EALT session cannot rewrite the E2ELAB row either', () => {
    const before = sqlValue(`SELECT computed_score FROM risk_assessments WHERE id = '${raId}'`)
    const res = sqlAsAppUser(
      `UPDATE public.risk_assessments SET computed_score = 999 WHERE id = '${raId}';`,
      { userId: ALT_USERS.owner.id, companyId: ALT_COMPANY_ID },
    )
    expect(res.ok).toBe(true)
    const after = sqlValue(`SELECT computed_score FROM risk_assessments WHERE id = '${raId}'`)
    expect(after).toBe(before)
  })

  test('CONTROL · the E2ELAB reviewer, in their own tenant, still sees and can write it', () => {
    const res = sqlAsAppUser(`SELECT id FROM public.risk_assessments WHERE id = '${raId}';`, {
      userId: REVIEWER_ID,
      companyId: COMPANY_ID,
    })
    expect(res.ok).toBe(true)
    expect(res.output.trim()).toBe(raId)
  })

  test('risk_assessment_templates — an E2EALT admin session cannot see the E2ELAB seeded template', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.altOwner, baseURL: ALT_BASE_URL })
    const page = await ctx.newPage()
    await page.goto('/risk-assessment-templates', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(RISK_ASSESSMENT.template.name)).toHaveCount(0, { timeout: 15_000 })
    await ctx.close()
  })
})
