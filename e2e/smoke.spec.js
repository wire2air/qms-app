import { test, expect } from '../video/fixtures/videoTest.js'

/**
 * Route smoke tests.
 *
 * Goal: catch the class of bug that build/lint/unit tests miss — a route that
 * fails to render, crashes on mount, or throws at runtime (e.g. an unresolved
 * component, a bad import, a render-time exception).
 *
 * Coverage: public/auth routes, which render without a backend. The backend is
 * mocked (401 / aborted socket) so app boot completes cleanly to the auth UI.
 * Authenticated app routes need a real session + tenant subdomain; point the
 * suite at a seeded environment with E2E_BASE_URL to extend coverage there.
 */

const PUBLIC_ROUTES = ['/signin', '/signup', '/login', '/forgot-password', '/reset-password']

// Console noise that is expected in a no-backend smoke run (failed API calls,
// missing favicon, aborted socket). Anything else is treated as a real error.
const BENIGN = /401|unauthorized|favicon|Failed to load resource|net::ERR|socket|ECONNREFUSED/i

async function mockBackend(page) {
  // Scoped to the real REST prefix (/api/v1/...) — a bare **/api/** or
  // **/auth/** glob also matches Vite's own module URLs for source files
  // that happen to live under those path segments (src/api/*.js,
  // src/components/auth/*.vue, including LoginForm.vue itself), 401-ing the
  // app's own JS/SFC modules and white-screening it before mount.
  await page.route('**/api/v1/**', (r) =>
    r.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
  )
  await page.route('**/socket.io/**', (r) => r.abort())
}

for (const path of PUBLIC_ROUTES) {
  test(`route ${path} renders without errors`, async ({ page }) => {
    const pageErrors = []
    const consoleErrors = []
    page.on('pageerror', (err) => pageErrors.push(err.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !BENIGN.test(msg.text())) consoleErrors.push(msg.text())
    })

    await mockBackend(page)
    await page.goto(path, { waitUntil: 'domcontentloaded' })

    // The page rendered real content past the boot splash — a form control is
    // visible. A blank/crashed route would never satisfy this.
    await expect(page.locator('input, button').first()).toBeVisible({ timeout: 20_000 })

    // No uncaught exceptions, and no non-benign console errors.
    expect(pageErrors, `uncaught errors on ${path}:\n${pageErrors.join('\n')}`).toEqual([])
    expect(consoleErrors, `console errors on ${path}:\n${consoleErrors.join('\n')}`).toEqual([])
  })
}

test('app boot does not crash (unknown app route falls back to auth)', async ({ page }) => {
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err.message))
  await mockBackend(page)
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  // Without a tenant/session the app boots and lands on a sign-in form rather
  // than white-screening.
  await expect(page.locator('input, button').first()).toBeVisible({ timeout: 20_000 })
  expect(pageErrors, `uncaught errors on boot:\n${pageErrors.join('\n')}`).toEqual([])
})
