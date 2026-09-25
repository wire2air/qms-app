// Module screenshot capture for the E2E suites.
//
// One helper, deliberately tiny: the specs do the driving (with the module's own
// fixtures and the same selectors the journeys use), this only decides WHERE the
// file lands and enforces the observation pause before every capture.
//
//   const shot = shooter('documents')
//   await expect(page.getByRole('button', { name: 'Create Document' })).toBeVisible()
//   await shot(page, 'list')            // → tests/screenshots/documents/list.png
//
// The 3s pause is intentional and must NOT be removed: in headed mode the app
// moves faster than a human can follow, and the pause is what makes each state
// observable while the run drives itself. It is NOT a substitute for waiting on
// the UI — always assert the expected state first, then call shot().
//
// It is GATED ON `E2E_HEADED`, which is the same flag playwright.config.js uses
// to decide `headless`. The reason it exists — a human watching the run — does
// not apply when nobody is watching, and the cost is not small: 285 screenshot
// captures x 3s is roughly 14 minutes of unconditional sleep in a suite that
// runs `workers: 1`. That is time bought with nothing.
//
// Deliberately gated rather than deleted: run with `E2E_HEADED=1` and the pause
// is back, unchanged, which is the only mode where it ever did anything.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Deliberate settle/observation pause before every capture.
 *
 * 3s when a human is watching (`E2E_HEADED`), 0 otherwise. Do not remove — see
 * the header for why it exists and why it is gated rather than deleted.
 */
export const OBSERVE_MS = process.env.E2E_HEADED ? 3_000 : 0

// e2e/fixtures/ → qms-app/tests/screenshots
const SCREENSHOT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
  'tests/screenshots',
)

/** Absolute directory for a module's screenshots (created on demand). */
export function screenshotDir(module) {
  const dir = path.join(SCREENSHOT_ROOT, module)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Bind the capture helper to one module's folder.
 * @param {string} module e.g. 'documents' → tests/screenshots/documents/
 * @returns {(page: import('@playwright/test').Page, name: string) => Promise<string>}
 */
export function shooter(module) {
  const dir = screenshotDir(module)
  return async function shot(page, name) {
    const file = path.join(dir, name.endsWith('.png') ? name : `${name}.png`)
    // Skipped entirely when headless — `waitForTimeout(0)` still yields to the
    // event loop 285 times, and the screenshot itself already waits for the
    // page to be capturable.
    if (OBSERVE_MS) await page.waitForTimeout(OBSERVE_MS) // observation pause — see header
    await page.screenshot({ path: file, fullPage: true })
    return file
  }
}
