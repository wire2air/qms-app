// PERM-J7 — the UI gate and the transport agree.
//
// ═════════════════════════════════════════════════════════════════════════════
// THE ONLY JOURNEY IN THIS SUITE THAT NEEDS A BROWSER, AND WHY
//
// Every other file here probes the policy layer directly, because that is where
// the decisions live. This one cannot: the property under test is the
// RELATIONSHIP between what the interface offers and what the server accepts,
// and that has to be observed at both ends in the same run.
//
// Divergence is a defect in EITHER direction, and the two directions are not
// equally bad:
//
//   affordance present + write refused  → a MISLEADING UI. The user clicks a
//     button that cannot work. Annoying, erodes trust, generates support load.
//
//   affordance absent + write accepted  → a SECURITY defect. The button was the
//     only thing standing between the user and the action, and a button is not
//     a gate: anyone can issue the mutation directly. This is exactly the shape
//     of F-27 (delete buttons hidden correctly while the underlying soft-delete
//     went unchecked for months) and of F-04 (detail-page Delete gated on who
//     created the record instead of what the role permits).
//
// So each case asserts BOTH ends and names which direction failed.
//
// ═════════════════════════════════════════════════════════════════════════════
// THE PERSONA, AND WHY IT IS THE RIGHT ONE
//
// `reviewer@e2e.test` holds `capa:read` + `capa:update` and NOT `capa:delete`
// (measured 2026-09-17). That is the "author, not approver" shape — the most
// common non-admin role in live data, and the only one that can tell an update
// gate apart from a delete gate. A pure reader proves nothing: it is refused at
// the UPDATE policy long before the delete guard is reached.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import { attemptSoftDelete, holdsPermission } from '../fixtures/permissions.js'

const uid = (email) => sqlValue(`SELECT id FROM users WHERE email = '${email}'`)

test.use({ storageState: AUTH.reviewer })

let reviewer

test.beforeAll(() => {
  reviewer = uid(USERS.reviewer.email)
  expect(reviewer).toBeTruthy()
})

test.describe('PERM-J7 — what the page offers and what the database accepts', () => {
  test('the persona holds update but not delete — the premise', () => {
    expect(holdsPermission(reviewer, 'capa:read')).toBe(true)
    expect(holdsPermission(reviewer, 'capa:update')).toBe(true)
    expect(holdsPermission(reviewer, 'capa:delete')).toBe(false)
  })

  test('CAPA detail — Delete is absent from the DOM AND refused on the wire', async ({ page }) => {
    const capa = sqlValue(
      `SELECT id FROM capas
        WHERE company_id = '${COMPANY_ID}' AND deleted_at IS NULL AND status_id = 'DRAFT'
        ORDER BY created_at DESC LIMIT 1`,
    )
    test.skip(!capa, 'no DRAFT CAPA seeded to open')

    await page.goto(`/capas/${capa}`)
    // The detail page hydrates from IndexedDB after the syncEngine bootstraps,
    // so wait for the record itself rather than a fixed timeout.
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 60_000 })

    // ── End 1: the interface ────────────────────────────────────────────────
    // `capaDetailConfig.js` builds the action list with
    // `visible: !!canDelete && statusId === 'DRAFT'`, so a holder without
    // `capa:delete` must get no Delete affordance at all. This is the half
    // that F-04 got wrong (it used `isOwner`, i.e. who created the record).
    const deleteControl = page.getByRole('button', { name: /^delete$/i })
    await expect(
      deleteControl,
      'a user without capa:delete must not be offered Delete on the detail page',
    ).toHaveCount(0)

    // ── End 2: the transport ────────────────────────────────────────────────
    // The button being absent proves nothing on its own — the question is what
    // happens when someone issues the write anyway. Probed as the SPA would
    // send it: a paranoid delete is an UPDATE that sets deleted_at.
    const outcome = attemptSoftDelete('capas', capa, reviewer)
    expect(
      outcome.allowed,
      'SECURITY: the affordance is hidden but the write was ACCEPTED — the button was the only gate',
    ).toBe(false)
    expect(outcome.stillLive, 'the record survived the refused delete').toBe(true)
  })

  test('CAPA detail — an affordance that IS offered really works (the misleading-UI direction)', async ({
    page,
  }) => {
    // The mirror image, and the case that stops "hide everything" from passing
    // this suite. The persona HOLDS `capa:update`, so an edit must be both
    // offered and accepted. Without this, a regression that hid every control
    // would look like a security improvement.
    const capa = sqlValue(
      `SELECT id FROM capas
        WHERE company_id = '${COMPANY_ID}' AND deleted_at IS NULL AND status_id = 'DRAFT'
        ORDER BY created_at DESC LIMIT 1`,
    )
    test.skip(!capa, 'no DRAFT CAPA seeded to open')

    await page.goto(`/capas/${capa}`)
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 60_000 })

    // The page is not read-only for this persona: at least one editable control
    // is present. Kept deliberately loose — the assertion is "the UI treats
    // this user as an editor", not the identity of any particular field.
    const editable = page.locator('input:not([disabled]), textarea:not([disabled])')
    await expect(
      editable.first(),
      'an update holder must be offered at least one editable control',
    ).toBeVisible({ timeout: 30_000 })

    // And the transport agrees.
    const title = sqlValue(`SELECT title FROM capas WHERE id = '${capa}'`)
    const probe = `${title} ✓`
    const { sqlAsAppUser } = await import('../fixtures/db.js')
    const r = sqlAsAppUser(`UPDATE capas SET title = '${probe}' WHERE id = '${capa}';`, {
      userId: reviewer,
      companyId: COMPANY_ID,
    })
    expect(r.ok, `MISLEADING UI: edit controls are offered but the write was refused: ${r.error}`).toBe(
      true,
    )

    sql(`UPDATE capas SET title = '${title.replace(/'/g, "''")}' WHERE id = '${capa}'`)
  })

  test('a module the persona cannot read at all is not reachable by URL', async ({ page }) => {
    // The route guard's own job. `reviewer` holds nothing on Suppliers, so the
    // guarded segment must refuse rather than render an empty page — an empty
    // list looks identical to "no records exist" and teaches users the wrong
    // thing about what they can see.
    expect(holdsPermission(reviewer, 'suppliers:read'), 'premise: no suppliers:read').toBe(false)

    await page.goto('/suppliers')

    // NOT `waitForLoadState('networkidle')`: the syncEngine keeps long-lived
    // connections open for the whole session, so the network never goes idle
    // and the wait times out after 30s even though the guard fired instantly.
    // `toHaveURL` polls on its own, which is the right instrument here.
    await expect(
      page,
      'a guarded segment with no grant must redirect to /no-access, not render an empty list',
    ).toHaveURL(/no-access/, { timeout: 30_000 })
  })
})
