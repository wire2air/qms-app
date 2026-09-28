// SMK-006 · every sidebar route renders for the owner — no 404, no crash.
//
// The class of bug build/lint/unit tests miss: a route whose component fails to
// resolve, throws on mount, or was renamed out from under its nav entry. The old
// e2e/smoke.spec.js only reaches the PUBLIC routes (backend mocked); this is the
// authenticated half, against the live stack, as the owner (isOwner bypass — the
// persona for whom every nav entry is visible).
//
// Read-only. Failures are ACCUMULATED and reported together at the end, so one
// broken route does not hide the next five.
import { test, expect } from '@playwright/test'
import { AUTH } from '../fixtures/cast.js'
import { collectPageErrors } from '../fixtures/smoke.js'

// The main-nav `to:` targets of src/components/layout/MainSidebar.vue (the
// non-supplier, non-platform navItems, including the Settings sub-nav that only
// renders after clicking "Settings" — which is why these cannot simply be scraped
// from the rendered <aside>). Keep in sync with that file; the crawl ALSO unions
// in whatever <aside> links it finds at runtime, so a new top-level entry is
// crawled even before this list is updated.
//
// Excluded on purpose: /platform/* (platform-operator plane, not a tenant owner
// surface), /supplier/* (EXTERNAL_SUPPLIER nav only), and data-driven /m/<module>
// entries (picked up by the runtime union when the tenant has any).
const SIDEBAR_ROUTES = [
  '/dashboard',
  '/task-instances',
  '/analytics/dashboards',
  '/analytics/reports',
  '/analytics/explore',
  '/analytics/alerts',
  '/analytics/metrics',
  '/documents',
  '/nonconformances',
  '/qualityEvents',
  '/complaints',
  '/capas',
  '/change-requests',
  '/audits?tab=insights',
  '/auditee',
  '/audits?tab=calendar',
  '/audits?tab=standards',
  '/audits?tab=readiness',
  '/inspections-logs?tab=logs',
  '/inspections-logs?tab=log-books',
  '/inspections-logs?tab=assignments',
  '/qc-inspection?tab=lots',
  '/qc-inspection?tab=retain-samples',
  '/qc-inspection?tab=inspection-plans',
  '/qc-inspection?tab=specifications',
  '/qc-inspection?tab=sampling-plans',
  '/qc-inspection?tab=aql-standards',
  '/qc-inspection?tab=test-library',
  '/qc-inspection?tab=line-clearance',
  '/task-instances?taskKindId=TRAINING',
  '/trainings',
  '/training-instances',
  '/training-verifications',
  '/training-curriculum',
  '/records',
  '/customer-complaints',
  '/workflow-templates',
  '/approval-flows',
  '/form-blocks',
  '/automation-rules',
  '/custom-fields',
  '/rca-templates',
  '/risk-assessment-templates',
  '/suppliers',
  '/equipment',
  '/products',
  '/lookups',
  '/settings',
  '/organization-security',
  '/admin-security',
  '/sites',
  '/departments',
  '/users',
  '/roles',
  '/groups',
  '/service-accounts',
  '/api-tokens',
  '/ai-usage',
  '/audit-logs',
  '/shared-records',
  '/validation',
  // User-menu entries (same sidebar file, account popover).
  '/profile',
  '/help',
]

/** src/pages/[...all].vue — the catch-all 404 page's copy. */
const NOT_FOUND_TEXT = 'Oops. Nothing here...'

test.use({ storageState: AUTH.owner })

test.describe('SMK-006 · authenticated route crawl', () => {
  test(
    'every sidebar route renders its page without 404 or runtime errors',
    { tag: ['@smoke', '@p0'] },
    async ({ page }) => {
      test.setTimeout(20 * 60_000)
      const errors = collectPageErrors(page)

      // Boot once and union in any top-level <aside> links the static list lacks.
      await page.goto('/dashboard')
      await expect(page.locator('header').first(), 'app shell rendered for the owner').toBeVisible({
        timeout: 60_000,
      })
      await expect(page, 'owner session is live (not bounced to sign-in)').not.toHaveURL(/\/signin/)
      const runtimeLinks = await page
        .locator('aside a[href^="/"]')
        .evaluateAll((as) => as.map((a) => a.getAttribute('href')))
        .catch(() => [])
      const routes = [
        ...new Set([
          ...SIDEBAR_ROUTES,
          ...runtimeLinks.filter((h) => h && !/^\/(platform|supplier)(\/|$)/.test(h)),
        ]),
      ]
      errors.take() // discard boot noise; each route is judged on its own

      const failures = []
      for (const route of routes) {
        await test.step(route, async () => {
          const problems = []
          try {
            await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30_000 })
            await page
              .locator('header')
              .first()
              .waitFor({ state: 'visible', timeout: 30_000 })
              .catch(() => problems.push('page header never rendered (30s)'))
            // Let mount-time fetches + live queries settle; socket traffic means
            // networkidle may never arrive, so it is bounded and best-effort.
            await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
            await page.waitForTimeout(500)

            if (new URL(page.url()).pathname.startsWith('/signin')) {
              problems.push(`bounced to sign-in (${page.url()}) — session lost mid-crawl`)
            }
            if (
              await page
                .getByText(NOT_FOUND_TEXT)
                .isVisible()
                .catch(() => false)
            ) {
              problems.push('rendered the 404 catch-all page')
            }
          } catch (err) {
            problems.push(`navigation failed: ${err.message.split('\n')[0]}`)
          }
          const { pageErrors, consoleErrors } = errors.take()
          for (const e of pageErrors) problems.push(`pageerror: ${e.slice(0, 300)}`)
          for (const e of consoleErrors) problems.push(`console.error: ${e.slice(0, 300)}`)

          if (problems.length) {
            failures.push({ route, problems })
            // Soft, so the step is marked red in the report while the crawl continues.
            expect.soft(problems, `${route} is broken`).toEqual([])
          }
        })
      }

      const report = failures
        .map((f) => `${f.route}\n    - ${f.problems.join('\n    - ')}`)
        .join('\n')
      test
        .info()
        .annotations.push({
          type: 'crawl',
          description: `${routes.length} routes, ${failures.length} broken`,
        })
      if (report)
        await test.info().attach('broken-routes.txt', { body: report, contentType: 'text/plain' })
      expect(failures.length, `${failures.length}/${routes.length} routes broken:\n${report}`).toBe(
        0,
      )
    },
  )
})
