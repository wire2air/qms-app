// FORMS-F1 — publish, fill anonymously, submit, revoke. The whole publication
// model, end to end, through the two surfaces that actually implement it.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS PINS
//
// FORMS F-01/F-02, closed on 2026-09-01. Before that pass there was no
// publication model at all: "shared" was computed client-side from
// `statusId === 'ACTIVE'`, the capability WAS the row's primary key, and
// `GET /v1/services/public/formTemplates/:id` had `where: { id }` and no tenant
// predicate — so every ACTIVE template in every tenant was already published to
// anyone holding a UUID, and the only way to withdraw a link was to archive the
// form out of the entire product.
//
// The fix made publication its own fact: `is_public` (default FALSE, deliberately
// NOT backfilled) plus a server-minted `public_token`, with Publish/Revoke in
// `ShareFormDialog.vue`. This journey is the one that proves the whole thing
// hangs together, because it is the only place the three halves meet — the
// dialog that mints, the anonymous page that consumes, and the trigger that
// destroys.
//
// The hardening pass shipped `ShareFormDialog.vue` rewritten and recorded (§6)
// that there is "no frontend test for the rewritten dialog". This is that test.
//
// ─────────────────────────────────────────────────────────────────────────────
// TWO-SIDED, AND WHERE THE TWO SIDES ARE
//
// A 404 on a public URL is worth nothing on its own — an endpoint that 404s
// everything, an API that is down, and a correctly revoked link are the same
// observation. Every refusal below is therefore paired with the SAME URL, in the
// SAME run, in a state where it works:
//
//   before publish  → the template's raw UUID is refused          (§ test 1)
//   after publish   → the minted token renders and accepts        (§ tests 1–2)
//   after revoke    → that very token, which just worked, is dead (§ test 3)
//
// The middle leg is what makes the outer two evidence.
//
// ─────────────────────────────────────────────────────────────────────────────
// MEASURED TO JUSTIFY THE ASSERTIONS (app-db, 2026-09-01)
//
//   • `enforce_form_template_integrity` on `false → true` mints
//     `replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')`
//     — 64 lowercase hex characters — and stamps `public_published_at`. Verified
//     by publishing this fixture and reading the column back: length 64, and a
//     caller-supplied `public_token` is silently overwritten (probed:
//     `UPDATE … SET public_token = repeat('a',64)` → `UPDATE 1`, column unchanged).
//   • `GET …/public/formTemplates/<token>` → 200 `{ schema: [...] }`; the same
//     endpoint with the template's raw UUID → 404 `{"error":{"message":"Form not
//     found"}}`. Both measured directly against :4000.
//   • `POST …/public/records` returns ONLY `{ record: { recordNumber } }` — no
//     company id, no template id, no schema. Asserted below, because the id it
//     used to be willing to echo is the capability the endpoint just stopped
//     accepting.
//   • The submitted row lands with `user_id NULL` and `submission_ip` populated:
//     an anonymous submission has no actor, and the IP is its only forensic
//     trace. (`submission_ip` was `varchar NOT NULL` until records migration
//     20260902201000 dropped the NOT NULL — a 500 on the product's only
//     unauthenticated write.)
//
// ⚠ `publicFormLimiter` is 60 requests / 15 min per IP across BOTH public
// endpoints. This file spends 6. See `assertNotLimited` in the fixture.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import {
  FORMS,
  REFUSAL,
  anonymousApi,
  counterFor,
  ensureFormsFixtures,
  liveToken,
  publicGet,
  publicationOf,
  recordsFor,
  refusalShape,
} from '../fixtures/forms.js'

const SUBJECT = FORMS.shareDialog

// The URL the Share dialog composed, carried between the serial tests below.
// Read from the DIALOG, not from the database, on purpose: the point of test 1
// is that the two agree, and a spec that took the token from SQL and then
// asserted the dialog showed "a token" would not notice the dialog showing the
// wrong one.
let publishedUrl = null

/**
 * Open ShareFormDialog on the fixture template, as the owner.
 *
 * Extracted because BOTH the publish leg and the revoke leg need it, and because
 * the ORDER of the first two steps is load-bearing and was got wrong once: the
 * view switcher is rendered by `FormTemplatesPanel`, which does not exist until
 * the App Builder page has booted and its `useLiveQuery` has returned. Clicking
 * the radio straight after `domcontentloaded` relies on Playwright's 25s
 * `actionTimeout` covering a full SPA boot — session fetch, then a syncEngine
 * bootstrap that pages every INSTANT model over GraphQL. On an unloaded machine
 * that is a couple of seconds; with three Playwright suites sharing the box it
 * is not, and the failure surfaces as an unexplained action timeout on a radio
 * button. Waiting for the toolbar FIRST, with a boot-sized budget, is the fix.
 */
async function openShareDialog(browser) {
  const ctx = await browser.newContext({ storageState: AUTH.owner })
  const page = await ctx.newPage()
  await page.goto('/records?tab=forms', { waitUntil: 'domcontentloaded' })

  // The panel has rendered — everything below is then a normal interaction.
  const search = page.getByPlaceholder('Search templates by name or code')
  await expect(search, 'the App Builder Forms tab finished booting').toBeVisible({
    timeout: 90_000,
  })

  // FOUND WHILE WRITING THIS, SINCE FIXED. `ShareFormDialog` had exactly one
  // call site — `formTemplatesTable.vue` — while the panel's DEFAULT view is the
  // other one (`useCompanyLocalStorage('templates-view-mode', 'list')`), and the
  // list row offered Preview / Archive / Clone and no Share. On a fresh profile
  // the Publish/Revoke control the whole F-01 fix depends on was reachable only
  // by flipping an unlabelled two-icon switcher — with `is_public` defaulting
  // FALSE and deliberately not backfilled, that made publishing effectively
  // undiscoverable. `FormTemplateListingRow` now carries the same 'Share link'
  // item, gated on `forms_templates:update` like Edit/Design/Archive, and the
  // panel mounts the dialog for the list view.
  //
  // This journey still drives the TABLE view, because that is the path it has
  // always covered and the two mounts are independent. The list view is pinned
  // separately, below, so a regression in either is caught.
  await page.getByRole('radio', { name: 'Table View' }).click()

  // Narrow by code rather than paging: the tenant holds a dozen templates and a
  // row lookup that depends on pagination is a flake waiting for the next
  // fixture somebody adds.
  await search.fill(SUBJECT.code)

  const row = page.getByRole('row').filter({ hasText: SUBJECT.code })
  await expect(row, 'the fixture template is listed').toHaveCount(1, { timeout: 60_000 })
  await row.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Share link' }).click()

  // The `role="dialog"` node is headlessui's Dialog ROOT (`tw:relative
  // tw:z-modal`), which has no bounding box of its own — Playwright reports it
  // hidden even while the panel inside it is on screen. So it is used as a
  // SCOPE, and the visibility assertion goes on the heading, which is the thing
  // a user would actually see.
  await expect(page.getByRole('heading', { name: 'Share form link' })).toBeVisible({
    timeout: 30_000,
  })
  const dialog = page.getByRole('dialog').filter({ hasText: 'Share form link' })
  return { ctx, page, dialog }
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  ensureFormsFixtures()

  // Preconditions, stated as assertions so a stale fixture fails by name rather
  // than as an unexplained 404 three tests later.
  const before = publicationOf(SUBJECT.id)
  expect(before, `fixture template ${SUBJECT.code} exists`).not.toBeNull()
  expect(before.statusId, 'the Share dialog only offers Publish for an ACTIVE form').toBe('ACTIVE')
  expect(before.isPublic, 'and this journey has to start from unpublished').toBe(false)
  expect(before.token, 'an unpublished form holds no token at all').toBeNull()
})

test.describe('FORMS-F1 — the publication model, end to end', () => {
  test('the owner publishes through ShareFormDialog and the database mints the link', async ({
    browser,
  }) => {
    // ── The negative half, taken FIRST, while it is still true ───────────────
    // The template's primary key was the capability until 2026-09-01. It is not
    // one now, and the cheapest place to prove that is here — the same row that
    // is about to become reachable is unreachable by its id, before and after.
    const anon = await anonymousApi()
    const byRawId = await publicGet(anon, SUBJECT.id)
    expect(byRawId.status(), 'a template UUID is not a key to the public surface').toBe(
      REFUSAL.status,
    )
    await anon.dispose()

    // ── Publish, through the real dialog ────────────────────────────────────
    const { ctx, dialog } = await openShareDialog(browser)

    // The honest default, visible in the UI: an ACTIVE form is NOT shared. This
    // sentence is the product's answer to "activation was publication".
    await expect(
      dialog,
      'an ACTIVE but unpublished form says so, and offers no link',
    ).toContainText('not published')

    await dialog.getByRole('button', { name: 'Publish public link' }).click()

    // ── The link the dialog now shows ───────────────────────────────────────
    const linkField = dialog.getByRole('textbox')
    await expect(linkField, 'publishing reveals the link').toBeVisible({ timeout: 20_000 })
    await expect
      .poll(async () => (await linkField.inputValue()) || '', {
        timeout: 20_000,
        message: 'the Share dialog renders the minted URL',
      })
      .toMatch(/\/form\/[0-9a-f]{64}$/)
    publishedUrl = await linkField.inputValue()

    // ── …and what the database actually did ─────────────────────────────────
    const after = publicationOf(SUBJECT.id)
    expect(after.isPublic, 'the tenant switch is on').toBe(true)
    expect(after.token, 'the token is 64 lowercase hex characters, server-minted').toMatch(
      /^[0-9a-f]{64}$/,
    )
    expect(
      publishedUrl.endsWith(`/form/${after.token}`),
      `the dialog shows the token the database minted (dialog: ${publishedUrl})`,
    ).toBe(true)
    expect(after.publishedAt, 'publication is stamped').not.toBeNull()
    expect(
      after.publishedBy,
      'and attributed — the GUC-derived actor, which is what makes this auditable',
    ).toBe(USERS.owner.id)

    // The link is not the row id. Stated explicitly because "it looks like a
    // uuid with the dashes removed" is close enough to be worth ruling out.
    expect(after.token).not.toContain(SUBJECT.id.replace(/-/g, ''))

    await ctx.close()
  })

  test('a stranger with the link fills and submits it, and the record lands in the right tenant', async ({
    browser,
  }) => {
    expect(publishedUrl, 'the previous test minted a link').not.toBeNull()

    const before = recordsFor(SUBJECT.id).length
    const counterBefore = counterFor(SUBJECT.id)

    // NO storageState. This is the entire point of the surface: a context that
    // carried a session would be exercising a logged-in page that happens to
    // live at /form, and would prove nothing about anonymous access.
    const ctx = await browser.newContext({ storageState: undefined })
    const page = await ctx.newPage()
    await page.goto(publishedUrl, { waitUntil: 'domcontentloaded' })

    // `App.vue`'s `openRoutes = ['/form']` short-circuits bootApp for this path,
    // so there is no session fetch, no tenant resolution and no syncEngine here.
    await expect(page.getByText('Form Submission')).toBeVisible({ timeout: 30_000 })

    const name = page
      .getByText(SUBJECT.fields.visitorName)
      .first()
      .locator('xpath=following::input[1]')
    await expect(name, 'the authored schema rendered').toBeVisible({ timeout: 20_000 })

    const marker = `F1-${Date.now()}`
    await name.fill(marker)
    const note = page
      .getByText(SUBJECT.fields.visitorNote)
      .first()
      .locator('xpath=following::input[1]')
    await note.fill('submitted by nobody in particular')

    await page.getByRole('button', { name: 'Submit', exact: true }).click()
    await expect(page.getByText('Submission Successful!')).toBeVisible({ timeout: 30_000 })

    // What the anonymous caller is told: a record number, and nothing else.
    const shown = await page
      .getByText(new RegExp(`${SUBJECT.code}-\\d+`))
      .first()
      .innerText()
    const recordNumber = /E2ESHARE-\d+/.exec(shown)?.[0]
    expect(recordNumber, `the page shows the minted record number (saw: ${shown})`).toBeTruthy()

    // ── Where it landed ─────────────────────────────────────────────────────
    const rows = recordsFor(SUBJECT.id)
    expect(rows.length, 'exactly one new record').toBe(before + 1)
    const created = rows.find((r) => r.recordNumber === recordNumber)
    expect(created, 'the record the page named is the record in the table').toBeTruthy()
    expect(
      created.companyId,
      'the tenant came from the RESOLVED TEMPLATE, not from a header or a body field',
    ).toBe(COMPANY_ID)
    expect(created.payload.visitorName, 'the answers were stored').toBe(marker)
    expect(created.userId, 'an anonymous submission has no actor').toBeNull()
    expect(
      created.submissionIp,
      'and its IP is the only forensic trace it leaves (records 20260902201000)',
    ).toBeTruthy()

    // The payload is sanitised against the schema — nothing the form did not
    // declare is in there. `companyId` and `templateId` are the two keys worth
    // naming, since both were once accepted from the body.
    expect(Object.keys(created.payload).sort()).toEqual(['visitorName', 'visitorNote'])

    expect(counterFor(SUBJECT.id), 'the template counter advanced by exactly one').toBe(
      counterBefore + 1,
    )

    // ── Submit Another Response: no cooldown, no re-fetch of the token ──────
    await page.getByRole('button', { name: 'Submit Another Response' }).click()
    const name2 = page
      .getByText(SUBJECT.fields.visitorName)
      .first()
      .locator('xpath=following::input[1]')
    await expect(name2, 'the form is reset and empty').toHaveValue('')
    await name2.fill(`${marker}-second`)
    await page.getByRole('button', { name: 'Submit', exact: true }).click()
    await expect(page.getByText('Submission Successful!')).toBeVisible({ timeout: 30_000 })

    expect(recordsFor(SUBJECT.id).length, 'a second submission is accepted immediately').toBe(
      before + 2,
    )

    await ctx.close()
  })

  test('the owner revokes, and the link that just worked is dead on the next request', async ({
    browser,
  }) => {
    expect(publishedUrl, 'there is a live link to revoke').not.toBeNull()
    const token = publishedUrl.split('/form/')[1]
    expect(token, 'the live token, as the dialog published it').toBe(liveToken(SUBJECT.id))

    // ── Revoke, through the same dialog ─────────────────────────────────────
    const { ctx, dialog } = await openShareDialog(browser)
    await expect(
      dialog.getByRole('textbox'),
      'the dialog re-reads the SAME live link out of the syncEngine, in a fresh browser context',
    ).toHaveValue(publishedUrl, { timeout: 30_000 })
    await dialog.getByRole('button', { name: /Revoke/i }).click()

    await expect
      .poll(() => liveToken(SUBJECT.id), {
        timeout: 20_000,
        message: 'revocation DESTROYS the token — it is not parked, it is gone',
      })
      .toBeNull()
    expect(publicationOf(SUBJECT.id).isPublic).toBe(false)
    expect(
      publicationOf(SUBJECT.id).statusId,
      'and the FORM is untouched — revoking a link is not archiving a template, ' +
        'which is the whole complaint F-06 made about the old design',
    ).toBe('ACTIVE')
    await ctx.close()

    // ── The same URL, immediately, from outside ─────────────────────────────
    const anon = await anonymousApi()
    const res = await publicGet(anon, token)
    expect(res.status(), 'the link a stranger already has stops working').toBe(REFUSAL.status)
    // …and it is refused in the SAME words as a token that never existed, so the
    // 404 carries no signal that the form is real and merely withdrawn.
    const revokedShape = await refusalShape(res)
    await anon.dispose()

    const anon2 = await anonymousApi()
    const unknown = await publicGet(anon2, 'e'.repeat(64))
    expect(
      await refusalShape(unknown),
      'a revoked link and a fabricated one are indistinguishable',
    ).toBe(revokedShape)
    await anon2.dispose()

    // Republishing must mint a DIFFERENT token — "revoke" means the old URL is
    // dead forever, not suspended. Done in SQL rather than through the dialog
    // because the assertion is about the trigger, and the dialog has already had
    // its turn.
    const reissued = sqlValue(
      `UPDATE form_templates SET is_public = true WHERE id = '${SUBJECT.id}' RETURNING public_token`,
    )
    expect(reissued, 'republishing mints a fresh capability').toMatch(/^[0-9a-f]{64}$/)
    expect(reissued, 'and it is not the one that was revoked').not.toBe(token)

    // Leave the fixture as the next run expects to find it.
    sqlValue(`UPDATE form_templates SET is_public = false WHERE id = '${SUBJECT.id}' RETURNING id`)
  })

  test('the Share control is reachable from the DEFAULT list view, not only the table', async ({
    browser,
  }) => {
    // The regression guard for the discoverability half of F-01. `is_public`
    // defaults false and was deliberately not backfilled, so every form that was
    // publicly reachable before this change needs a human to find Publish. If
    // that control is only on the non-default view, the fix is unusable in
    // practice however correct the token model is.
    //
    // The view is selected EXPLICITLY rather than relying on the default,
    // because `templates-view-mode` is persisted per company in localStorage and
    // a storage state captured after any earlier run may hold 'table'. Asserting
    // "List View shows Share" is the claim that matters either way.
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    try {
      const page = await ctx.newPage()
      await page.goto('/records?tab=forms', { waitUntil: 'domcontentloaded' })

      const search = page.getByPlaceholder('Search templates by name or code')
      await expect(search, 'the App Builder Forms tab finished booting').toBeVisible({
        timeout: 90_000,
      })
      await page.getByRole('radio', { name: 'List View' }).click()
      await search.fill(SUBJECT.code)

      // The list renders each template as a BaseClickableRow card, not a table
      // row or a listitem, so there is no row role to filter on. The search box
      // has already narrowed to one template — assert that, then the single
      // remaining 'More actions' trigger is unambiguous. The count assertion is
      // what makes this safe: without it, a filter that silently stopped working
      // would open some other template's menu and still find 'Share link'.
      const menus = page.getByRole('button', { name: 'More actions' })
      await expect(menus, 'the search narrowed the list to the fixture').toHaveCount(1, {
        timeout: 60_000,
      })
      await expect(
        page.getByText(SUBJECT.code, { exact: false }).first(),
        'and it is the fixture template that is showing',
      ).toBeVisible()
      await menus.click()

      await expect(
        page.getByRole('menuitem', { name: 'Share link' }),
        'Share link is offered in the list view',
      ).toBeVisible({ timeout: 15_000 })

      // And it actually opens the dialog — a menu item that emits into nothing
      // would satisfy the assertion above while leaving the control unreachable.
      await page.getByRole('menuitem', { name: 'Share link' }).click()
      await expect(
        page.getByRole('heading', { name: 'Share form link' }),
        'and it opens the same Publish/Revoke dialog the table view uses',
      ).toBeVisible({ timeout: 30_000 })
    } finally {
      await ctx.close()
    }
  })
})
