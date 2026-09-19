// CMP-J5 — internal Quality Complaints do not cross tenants.
//
// `complaints` RLS is company_id + (has_permission AND scope_allowed) OR
// owner_id OR task-assignment OR shared_with_user — no arm of that OR chain
// mentions a foreign tenant, so a leak here would mean the company_id
// predicate itself failed. Both directions, both layers (REST controller —
// company id from the session, never the body — and `app_user` under RLS,
// the layer a raw GraphQL mutation reaches), each paired with the same
// tenant's own row succeeding — the equipment/EQ-J5 discipline: a policy that
// quietly stopped matching ANYTHING would hide E2ELAB's complaints from the
// ALT owner and look like a perfect guard while breaking the module for
// everyone.
import { test, expect } from '@playwright/test'
import { ALT_BASE_URL, ALT_COMPANY_ID, ALT_USERS, AUTH, COMPANY_ID, COMPLAINTS, USERS } from '../fixtures/cast.js'
import { sqlAsAppUser, sqlValue } from '../fixtures/db.js'

const lastLine = (out) => out.trim().split('\n').pop().trim()
const countVisible = (userId, companyId, complaintId) =>
  Number(
    lastLine(
      sqlAsAppUser(`SELECT count(*) FROM complaints WHERE id = '${complaintId}';`, {
        userId,
        companyId,
      }).output,
    ),
  )

test.describe('CMP-J5 · tenant isolation', () => {
  test('the fixture really is on both sides of the boundary', async () => {
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM complaints WHERE company_id = '${COMPANY_ID}' AND deleted_at IS NULL`,
        ),
      ),
      'E2ELAB holds seeded complaints',
    ).toBeGreaterThanOrEqual(2)
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM complaints WHERE company_id = '${ALT_COMPANY_ID}' AND deleted_at IS NULL`,
        ),
      ),
      'E2EALT holds its own',
    ).toBeGreaterThanOrEqual(1)
  })

  test('the E2EALT owner’s complaints list shows their own complaint and none of E2ELAB’s', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.altOwner, baseURL: ALT_BASE_URL })
    const page = await ctx.newPage()
    try {
      await page.goto('/complaints')
      await expect(page.getByText(COMPLAINTS.altTenant.complaintNumber, { exact: false })).toBeVisible({
        timeout: 30_000,
      })
      for (const seeded of [COMPLAINTS.siteScoped, COMPLAINTS.secondarySite]) {
        await expect(
          page.getByText(seeded.complaintNumber, { exact: false }),
          `E2ELAB's "${seeded.complaintNumber}" must not reach the other tenant's list`,
        ).toHaveCount(0)
      }
    } finally {
      await ctx.close()
    }
  })

  test('REST: the similar-complaints route is company-scoped, not id-scoped', async ({
    browser,
  }) => {
    // findSimilar has no findOrFail lookup — it runs one bind-parameterized
    // query scoped by companyId ($2) with no existence check on complaintId
    // ($1), so an E2ELAB id from the E2EALT session answers 200 with EMPTY
    // results rather than 404/403. That absence of a 404 is not a leak by
    // itself (the query WHERE clause still requires se.company_id = $2 on
    // every row it could return) — this pins that the empty-results shape
    // holds, so a future rewrite that dropped the company_id predicate would
    // show up here as non-empty results instead of silently passing.
    const ctx = await browser.newContext({ storageState: AUTH.altOwner, baseURL: ALT_BASE_URL })
    const page = await ctx.newPage()
    try {
      const foreignSimilar = await page.request.get(
        `${ALT_BASE_URL}/api/v1/services/complaints/${COMPLAINTS.siteScoped.id}/similar`,
      )
      expect(foreignSimilar.status()).toBe(200)
      const body = await foreignSimilar.json()
      expect(
        body.results,
        'no E2ELAB complaint content is reachable through the ALT session',
      ).toEqual([])
    } finally {
      await ctx.close()
    }
  })

  test('RLS holds the same line for a raw app_user session, both directions', () => {
    expect(
      countVisible(ALT_USERS.owner.id, ALT_COMPANY_ID, COMPLAINTS.siteScoped.id),
      'E2EALT cannot see an E2ELAB complaint',
    ).toBe(0)
    expect(
      countVisible(ALT_USERS.owner.id, ALT_COMPANY_ID, COMPLAINTS.altTenant.id),
      'but does see its own — the policy is matching, not merely empty',
    ).toBe(1)

    expect(
      countVisible(USERS.complaintOwner.id, COMPANY_ID, COMPLAINTS.altTenant.id),
      'and E2ELAB cannot see E2EALT’s',
    ).toBe(0)
    expect(
      countVisible(USERS.complaintOwner.id, COMPANY_ID, COMPLAINTS.siteScoped.id),
      'while seeing their own',
    ).toBe(1)
  })

  test('a write aimed across the boundary reaches nothing', () => {
    // The ALT owner, with their OWN (correct) company GUC, attempting to
    // touch an E2ELAB row. `authz.current_is_owner()` would short-circuit
    // every permission arm for them WITHIN their own tenant — this proves the
    // company_id predicate still refuses the write before ownership is ever
    // consulted, because the row plainly does not belong to their company.
    const res = sqlAsAppUser(
      `UPDATE complaints SET subject = subject WHERE id = '${COMPLAINTS.siteScoped.id}' RETURNING id;`,
      { userId: ALT_USERS.owner.id, companyId: ALT_COMPANY_ID },
    )
    expect(res.ok).toBeTruthy()
    const affected = (res.output.match(/UPDATE (\d+)/) || [])[1]
    expect(affected, 'zero rows touched — the E2ELAB complaint is unreachable from E2EALT').toBe(
      '0',
    )

    // The pair: the same owner CAN touch their own tenant's row.
    const own = sqlAsAppUser(
      `UPDATE complaints SET subject = subject WHERE id = '${COMPLAINTS.altTenant.id}' RETURNING id;`,
      { userId: ALT_USERS.owner.id, companyId: ALT_COMPANY_ID },
    )
    expect(own.ok).toBeTruthy()
    expect((own.output.match(/UPDATE (\d+)/) || [])[1], 'their own row IS reachable').toBe('1')
  })
})
