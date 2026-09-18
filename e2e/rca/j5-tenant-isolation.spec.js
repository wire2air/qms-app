// PW-J5 — RCA does not cross tenants: rca_templates and root_cause_categories
// (UI + REST), and root_causes (RLS layer, since it has no UI of its own).
//
// rca_templates_sel is TENANCY-ONLY — measured live, per equipment/j5's own
// "OBSERVATION" (rca_templates is one of only nine SELECT policies in the
// schema whose USING clause is nothing but `company_id = current_company_id`,
// no permission/scope/ownership arm at all). That is not a defect: it is the
// same "template/reference routes are tenant-public" design documented in
// permissionGuard.js's ADMIN_PERMISSIONS comment, applied consistently at the
// RLS layer too. What THIS journey has to prove is narrower and still real:
// that the tenant predicate itself holds — E2EALT's owner, even with an
// isOwner bypass on every permission arm, still cannot see E2ELAB's rows.
import { test, expect } from '@playwright/test'
import { ALT_BASE_URL, ALT_COMPANY_ID, ALT_USERS, AUTH, COMPANY_ID, RCA, USERS } from '../fixtures/cast.js'
import { sqlAsAppUser, sqlValue } from '../fixtures/db.js'

const lastLine = (out) => out.trim().split('\n').pop().trim()
const countVisible = (userId, companyId, query) =>
  Number(lastLine(sqlAsAppUser(query, { userId, companyId }).output))

test.describe('PW-J5 · RCA cross-tenant isolation', () => {
  test('the fixtures really are E2ELAB-only', async () => {
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM rca_templates WHERE company_id = '${COMPANY_ID}' AND deleted_at IS NULL`,
        ),
      ),
      'E2ELAB holds the seeded template',
    ).toBeGreaterThanOrEqual(1)
    expect(
      Number(sqlValue(`SELECT count(*) FROM rca_templates WHERE company_id = '${ALT_COMPANY_ID}'`)),
      'E2EALT has none of its own — nothing to leak INTO, only OUT OF E2ELAB to check',
    ).toBe(0)
  })

  test('the E2EALT owner sees no E2ELAB RCA template or category in the UI', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.altOwner, baseURL: ALT_BASE_URL })
    const page = await ctx.newPage()
    try {
      await page.goto('/rca-templates')
      await expect(page.getByRole('heading', { name: 'RCA Templates' })).toBeVisible({
        timeout: 15_000,
      })
      await expect(page.getByText(RCA.template.name)).toHaveCount(0)

      await page.goto('/rca-templates?tab=categories')
      for (const cat of [RCA.categories.people, RCA.categories.machine, RCA.categories.method]) {
        await expect(page.getByText(cat.name, { exact: true })).toHaveCount(0)
      }
    } finally {
      await ctx.close()
    }
  })

  test('REST answers 404 for an E2ELAB category from the E2EALT session', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.altOwner, baseURL: ALT_BASE_URL })
    const page = await ctx.newPage()
    try {
      // PATCH/DELETE both resolve { id, companyId } before touching anything
      // — an E2ELAB category id from the E2EALT session should not exist as
      // far as this session is concerned.
      const patch = await page.request.patch(
        `${ALT_BASE_URL}/api/v1/services/rootCauseCategories/${RCA.categories.people.id}`,
        { data: { name: 'Renamed from the other tenant' } },
      )
      expect(patch.status(), 'the row is not found for this tenant, not merely refused').toBe(404)

      const del = await page.request.delete(
        `${ALT_BASE_URL}/api/v1/services/rootCauseCategories/${RCA.categories.people.id}`,
      )
      expect(del.status()).toBe(404)

      expect(
        sqlValue(`SELECT name FROM root_cause_categories WHERE id = '${RCA.categories.people.id}'`),
        'nothing was renamed',
      ).toBe(RCA.categories.people.name)
      expect(
        sqlValue(
          `SELECT deleted_at IS NULL FROM root_cause_categories WHERE id = '${RCA.categories.people.id}'`,
        ),
      ).toBe('t')
    } finally {
      await ctx.close()
    }
  })

  test('RLS holds the tenant line for rca_templates, root_cause_categories and root_causes', async () => {
    // rca_templates — tenancy-only policy; the E2EALT owner's OWN company GUC
    // sees nothing of E2ELAB's, which is the actual guarantee this table has.
    expect(
      countVisible(
        ALT_USERS.owner.id,
        ALT_COMPANY_ID,
        `SELECT count(*) FROM rca_templates WHERE id = '${RCA.template.id}'`,
      ),
      "E2EALT cannot see E2ELAB's template",
    ).toBe(0)

    // root_cause_categories — SELECT-only policy, same tenancy predicate.
    expect(
      countVisible(
        ALT_USERS.owner.id,
        ALT_COMPANY_ID,
        `SELECT count(*) FROM root_cause_categories WHERE id = '${RCA.categories.people.id}'`,
      ),
      "E2EALT cannot see E2ELAB's category",
    ).toBe(0)

    // root_causes — the borrowed-permission table. Even E2EALT's OWNER
    // (isOwner bypasses every permission arm root_causes_select_rls has)
    // cannot see E2ELAB's row: the company_id predicate is ANDed with the
    // permission OR, not substituted by it.
    expect(
      countVisible(
        ALT_USERS.owner.id,
        ALT_COMPANY_ID,
        `SELECT count(*) FROM root_causes WHERE id = '${RCA.rootCause.id}'`,
      ),
      'an isOwner bypass on the permission arm does not cross the tenant boundary',
    ).toBe(0)

    // And a write aimed across the boundary reaches nothing — the UPDATE
    // policy's USING clause is evaluated with E2EALT's OWN company GUC, so it
    // cannot even locate the E2ELAB row to attempt the (would-be-refused-
    // anyway, per PW-J4) rewrite.
    const before = sqlValue(`SELECT description FROM root_causes WHERE id = '${RCA.rootCause.id}'`)
    const cross = sqlAsAppUser(
      `UPDATE root_causes SET description = 'written from E2EALT' WHERE id = '${RCA.rootCause.id}';`,
      { userId: ALT_USERS.owner.id, companyId: ALT_COMPANY_ID },
    )
    expect(cross.ok, cross.error).toBe(true)
    expect(
      sqlValue(`SELECT description FROM root_causes WHERE id = '${RCA.rootCause.id}'`),
      'unchanged',
    ).toBe(before)

    // Control: the same query, under E2ELAB's OWN company GUC — proves the
    // zero above is a tenant boundary, not a broken policy.
    expect(
      countVisible(
        USERS.author.id,
        COMPANY_ID,
        `SELECT count(*) FROM root_causes WHERE id = '${RCA.rootCause.id}'`,
      ),
      'the E2ELAB reader with a parent grant sees it fine',
    ).toBe(1)
  })
})
