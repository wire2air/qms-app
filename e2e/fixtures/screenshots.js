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
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Deliberate settle/observation pause before every capture. Do not remove. */
export const OBSERVE_MS = 3_000

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
    await page.waitForTimeout(OBSERVE_MS) // observation pause — see header
    await page.screenshot({ path: file, fullPage: true })
    return file
  }
}
