/**
 * Drop-in replacement for `@playwright/test` that adds demo-recording behaviour.
 *
 * Specs change one line:
 *   -import { test, expect } from '@playwright/test'
 *   +import { test, expect } from '../../video/fixtures/videoTest.js'
 *
 * `video/instrument.js` does that rewrite mechanically, and can undo it.
 *
 * IT IS SAFE TO LEAVE IN PERMANENTLY. Everything below is inert unless
 * VIDEO_MODE=1, which only `npm run test:video` sets. A normal `playwright test`
 * run behaves exactly as before — same fixtures, same timings, no injected DOM.
 *
 * Why a fixture is required at all: the cursor HUD has to run INSIDE the page,
 * and `page.addInitScript` is the only way to guarantee it survives navigation.
 * A reporter cannot do this — reporters never touch a page. That is the one
 * capability that genuinely cannot be added from the outside.
 */
import { test as base, expect } from '@playwright/test'
import { CURSOR_OVERLAY_SOURCE } from './cursor-overlay.js'

const VIDEO_MODE = process.env.VIDEO_MODE === '1'

export const test = base.extend({
  /**
   * Auto fixture. Depends on `page`, so by the time it runs the BrowserContext
   * exists and Playwright has already started recording — which is exactly the
   * moment we want to stamp as t=0 for the overlay track.
   */
  // eslint-disable-next-line no-empty-pattern
  demoRecording: [
    async ({ page }, use, testInfo) => {
      if (!VIDEO_MODE) {
        await use(null)
        return
      }

      // t=0 for every step timestamp. Recording actually begins a few ms earlier
      // (at context creation, inside the `context` fixture); build-videos.js
      // corrects that residual drift by comparing this stamp against the real
      // container duration reported by ffprobe.
      const videoStartMs = Date.now()

      await page.addInitScript(CURSOR_OVERLAY_SOURCE)
      // addInitScript only applies from the NEXT navigation. A context that has
      // already navigated (storageState reuse, or a redirect during setup) would
      // otherwise show no cursor until the first goto.
      await page
        .evaluate(CURSOR_OVERLAY_SOURCE)
        .catch(() => {}) // about:blank / cross-origin — the init script covers it

      // Handed to the reporter through the attachment channel, which is the only
      // reliable test→reporter path (they run in different processes under
      // parallel workers).
      await testInfo.attach('qa-demo-meta', {
        contentType: 'application/json',
        body: JSON.stringify({
          videoStartMs,
          browserName: testInfo.project.use?.defaultBrowserType || 'chromium',
          channel: testInfo.project.use?.channel || null,
          viewport: page.viewportSize(),
        }),
      })

      await use({ videoStartMs })
    },
    { auto: true },
  ],
})

export { expect }
export * from '@playwright/test'
