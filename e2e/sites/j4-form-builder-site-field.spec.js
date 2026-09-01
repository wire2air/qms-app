// PW-J4 — The form-builder `site` field: the unbounded consumer surface.
//
// Every other consumer of `sites` is a component someone wrote and can be
// counted. This one is not. formBuilderConfig.js registers `site` as a lookup
// entity — `{ value: 'site', selectMenu: 'SiteSelectMenu', badgeById:
// 'SiteBadgeById', idProp: 'siteId', model: 'Site' }` — so any admin, in any
// tenant, can drop a site picker into any form template without touching the
// codebase. DynamicForm.js resolves it through LOOKUP_MENUS at render time.
//
// That is exactly why it is worth an E2E test: the set of surfaces that read
// `sites` is defined by tenant content, not by the repository, so no amount of
// grepping enumerates it and no component test covers it. This journey stands
// in for the whole open-ended category with one seeded template
// (e2e-seed.sql §15e) carrying a required `site` lookup field.
//
// 🔴 WHAT IT FOUND. The field renders the right component and the component is
// empty. `/form/:shareToken` is a standalone page (`meta.layout: empty`) that
// fetches its schema from `/v1/services/public/formTemplates/:token` — it is the
// external-submission surface, outside the app shell. (It was `/form/:templateId`
// against `/public/formTemplates/:id` until FORMS F-01 was closed on 2026-09-01;
// the finding below is unaffected by that change.) SiteSelectMenu reads
// `db.Site.where()` from IndexedDB, which only the in-app syncEngine populates,
// so on this page the picker resolves to "No matches found" — for a logged-in
// administrator who can see every site one route away.
//
// The field is authored as REQUIRED, so the form cannot be submitted at all.
// Every lookup entity shares this path (product, supplier, department, user,
// equipment), so this is not a sites-specific bug; sites is just where it
// surfaced. The controls below separate "this page cannot resolve entities"
// from "this user cannot see sites", which are very different fixes.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, SITES } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'

const TEMPLATE_ID = 'e2e60000-0000-4000-8000-000000000001'

// ── FORMS F-01, 2026-09-01 ──────────────────────────────────────────────────
// This journey used to navigate to `/form/${TEMPLATE_ID}` — the template's
// PRIMARY KEY, which was the public capability. It is not one any more: the page
// takes a share token, minted by the database when a form is explicitly
// published, and the id is refused with a 404 like anything else.
//
// The token is read at runtime rather than pinned as a constant BECAUSE it
// cannot be seeded: enforce_form_template_integrity mints it and overwrites
// whatever a caller supplies, so that a token can never be chosen and therefore
// never guessed. e2e-seed.sql §15e sets `is_public = true`; the database decides
// the URL. Lazily resolved so the module still loads if the seed has not run.
let _shareToken
function shareUrl() {
  if (!_shareToken) {
    _shareToken = sqlValue(`SELECT public_token FROM form_templates WHERE id = '${TEMPLATE_ID}'`)
    if (!_shareToken) {
      throw new Error(
        `PW-J4: form template ${TEMPLATE_ID} has no public_token — re-run database/e2e-seed.sql. ` +
          'Since FORMS F-01 the anonymous fill page resolves a share token, not a template id, ' +
          'and only for a form whose is_public flag is set.',
      )
    }
  }
  return `/form/${_shareToken}`
}

test.describe('PW-J4 · a site field authored in the form builder', () => {
  test('PRECONDITION · the seeded template really carries a site lookup', () => {
    // Guard the premise: if the schema were wrong, the render assertions below
    // would fail for a reason that has nothing to do with the sites module.
    const entity = sqlValue(
      `SELECT schema->0->>'lookupEntity' FROM form_templates WHERE id = '${TEMPLATE_ID}'`,
    )
    expect(entity, 'field 0 is a site lookup').toBe('site')
    expect(
      sqlValue(`SELECT schema->0->>'type' FROM form_templates WHERE id = '${TEMPLATE_ID}'`),
    ).toBe('lookup')

    // …and that it is PUBLISHED. Since FORMS F-01 an unpublished form is a 404
    // on the anonymous page, so without this the render assertions below would
    // fail for a seeding reason rather than a sites reason.
    expect(
      sqlValue(`SELECT is_public FROM form_templates WHERE id = '${TEMPLATE_ID}'`),
      'the seeded template is published (e2e-seed.sql §15e)',
    ).toBe('t')
    expect(shareUrl()).toMatch(/^\/form\/[0-9a-f]{64}$/)
  })

  test('🔴 renders as a site picker listing the tenant’s sites (FAILS TODAY)', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.siteAdmin })
    const page = await ctx.newPage()
    await page.goto(shareUrl(), { waitUntil: 'domcontentloaded' })

    // The field's authored label is what identifies it — the component is
    // resolved dynamically, so there is no stable test id to anchor on.
    await expect(page.getByText('Affected Site').first()).toBeVisible({ timeout: 30_000 })

    const picker = page
      .getByText('Affected Site')
      .first()
      .locator('xpath=following::*[@role="combobox"][1]')
    await expect(picker, 'a lookup field renders an entity picker, not a text input').toBeVisible({
      timeout: 20_000,
    })
    await picker.click()

    // The component is right; its data is not. Today this listbox renders
    // "No matches found" — a required field with nothing to choose.
    const listbox = page.getByRole('listbox')
    await expect(
      listbox.getByRole('option', { name: SITES.primary.name, exact: true }),
      'a site lookup field must offer the tenant’s sites',
    ).toBeVisible({ timeout: 20_000 })
    await expect(listbox.getByRole('option', { name: SITES.secondary.name, exact: true })).toBeVisible()

    // Tenant isolation must reach here too, once it resolves anything at all.
    await expect(listbox.getByRole('option', { name: SITES.alt.name, exact: true })).toHaveCount(0)

    await ctx.close()
  })

  test('CONTROL · the same user sees both sites in an in-app picker (must pass today)', async ({
    browser,
  }) => {
    // The decisive control. Same session, same grant, same component — and on a
    // page inside the app shell it lists both sites. So the empty picker above
    // is a property of the standalone form route, not of the user's access.
    const ctx = await browser.newContext({ storageState: AUTH.siteAdmin })
    const page = await ctx.newPage()
    await page.goto('/departments', { waitUntil: 'domcontentloaded' })
    await page.getByRole('combobox').first().click()

    const listbox = page.getByRole('listbox')
    await expect(listbox.getByRole('option', { name: SITES.primary.name, exact: true })).toBeVisible({
      timeout: 20_000,
    })
    await expect(listbox.getByRole('option', { name: SITES.secondary.name, exact: true })).toBeVisible()

    await ctx.close()
  })

  test('CONTROL · a plain field on the same template works (must pass today)', async ({
    browser,
  }) => {
    // Control. Proves the page itself renders and is interactive, so the empty
    // picker above is about entity resolution rather than a broken form — and
    // that the picker assertion is not matching some unrelated combobox.
    const ctx = await browser.newContext({ storageState: AUTH.siteAdmin })
    const page = await ctx.newPage()
    await page.goto(shareUrl(), { waitUntil: 'domcontentloaded' })

    await expect(page.getByText('Notes').first()).toBeVisible({ timeout: 30_000 })
    const notes = page
      .getByText('Notes')
      .first()
      .locator('xpath=following::input[1]')
    await expect(notes).toBeVisible({ timeout: 20_000 })
    await notes.fill('E2E J4 plain text')
    await expect(notes).toHaveValue('E2E J4 plain text')

    await ctx.close()
  })
})
