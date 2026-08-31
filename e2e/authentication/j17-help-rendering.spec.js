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
