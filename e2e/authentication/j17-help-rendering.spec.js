// PW-J17 · Help article rendering.
//
// Help content is authored as Docusaurus-flavour markdown and compiled into a
// bundle at build time, then rendered through a shared `marked` pipeline. Two
// things in that chain fail silently and are only ever caught by reading the
// page: an unsupported block syntax leaks its markers into the prose, and a
// mis-resolved intra-doc link renders and clicks perfectly well while landing
// on nothing. Both have happened. These are the cheap standing checks.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'

test.use({ storageState: AUTH.owner })

// The two longest, most heavily formatted articles — tables, callouts, nested
// lists, cross-links. If the pipeline breaks, it breaks here first.
const ARTICLES = [
  { slug: 'KB/documents/document-control', heading: 'Document Control' },
  { slug: 'KB/administration/single-sign-on', heading: 'Single Sign-On' },
]

for (const { slug, heading } of ARTICLES) {
  test(`${slug} renders without leaking markup`, async ({ page }) => {
    await page.goto(`/help/${slug}`)
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({
      timeout: 15_000,
    })
    const prose = page.locator('.help-prose')
    // Callouts render AS callouts rather than as ":::note" text.
    await expect(prose.locator('.admonition').first()).toBeVisible()
    await expect(prose).not.toContainText(':::')
    // Tables survive the sanitizer (it strips unknown attributes, and has
    // eaten structural markup before).
    await expect(prose.locator('table').first()).toBeVisible()
  })
}

test('an in-page anchor and a cross-article link both land somewhere', async ({ page }) => {
  await page.goto('/help/KB/documents/document-control')
  const prose = page.locator('.help-prose')

  await prose.getByRole('link', { name: 'Releasing a document' }).click()
  await expect(page.getByRole('heading', { name: /Releasing a document/i })).toBeVisible()

  // Cross-article links are rewritten at build time; a bare filename silently
  // resolves to the wrong slug, so follow one for real.
  await page.goto('/help/KB/documents/document-control')
  await prose.getByRole('link', { name: 'Audit Snapshots' }).first().click()
  await expect(page.getByRole('heading', { name: /Audit Snapshots/i }).first()).toBeVisible({
    timeout: 15_000,
  })
})

// ── The help button has to survive the page shell ──────────────────────────
// Several modules render their list inside a tab shell, and the shell owns the
// real PageHeader while the list component is mounted `embedded`. The list's
// own header — help button included — is suppressed. Documents, NCs and CAPAs
// all shipped a HelpButton that never rendered for exactly this reason, and
// nothing failed: the markup was present, just never mounted. Only opening the
// page catches it.
const MODULE_PAGES = [
  // Tab-shell modules — the shell owns the header, so the button has to live there.
  ['/documents', 'Document Control'],
  ['/nonconformances', 'Nonconformances'],
  ['/capas', 'CAPA'],
  ['/change-requests', 'Change Request'],
  ['/training-instances', 'Training'],
  // List pages — these had an article and no way to reach it.
  ['/users', 'Users'],
  ['/sites', 'Sites'],
  ['/departments', 'Sites'],
  ['/groups', 'Groups'],
  ['/api-keys', 'API'],
  ['/audit-logs', 'Audit Log'],
  ['/lookups', 'Option Sets'],
  ['/document-templates', 'Document Templates'],
  ['/automation-rules', 'Automation Rules'],
  ['/records', 'Records'],
  ['/task-instances', 'Tasks'],
  ['/suppliers', 'Supplier'],
  ['/products', 'Item Master'],
  ['/rca-templates', 'Root Cause'],
  ['/risk-assessment-templates', 'Risk Assessment'],
],
]

for (const [path, articleTitle] of MODULE_PAGES) {
  test(`${path} offers help from its header`, async ({ page }) => {
    await page.goto(path)
    const help = page.getByRole('button', { name: /^Help:/ }).first()
    await expect(help).toBeVisible({ timeout: 20_000 })
    await help.click()
    // And it opens the RIGHT article, not just any article.
    await expect(page.getByRole('dialog')).toContainText(articleTitle, { timeout: 10_000 })
  })
}
