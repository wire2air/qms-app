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
   * The fixture-managed context — used by specs written as `async ({ page })`.
   *
   * Deliberately NOT an auto fixture: Playwright only instantiates it when a
   * test actually asks for `page`/`context`, so a `({ browser })` spec does not
   * get a stray blank context created (and recorded) on its behalf.
   */
  context: async ({ context }, use) => {
    if (VIDEO_MODE) await context.addInitScript(CURSOR_OVERLAY_SOURCE)
    await use(context)
  },

  /**
   * Auto fixture covering the OTHER 106 tests, which are written as
   * `async ({ browser })` and build their own contexts — one per actor, because
   * these journeys hand a record between an author, a reviewer and an approver.
   *
   * Two things have to be done to those contexts, and neither can be configured:
   *
   * 1. **recordVideo.** `use: { video: 'on' }` only reaches the context FIXTURE.
   *    A context from `browser.newContext()` inherits nothing, so 73% of the
   *    suite recorded no footage at all — the only video attached was the blank
   *    fixture page, which is why those demos were a white screen.
   * 2. **The cursor overlay**, for the same reason the fixture exists at all.
   *
   * Depending on `browser` rather than `page` is what stops the blank context
   * from being created: the browser is launched for every test anyway, but a
   * context is not.
   */
  demoRecording: [
    async ({ browser }, use, testInfo) => {
      if (!VIDEO_MODE) {
        await use(null)
        return
      }

      // t=0 for every step timestamp. Recording actually begins a few ms earlier
      // (at context creation), and build-videos.js corrects that residual drift
      // by comparing this stamp against the real container duration from ffprobe.
      const videoStartMs = Date.now()
      const viewport = testInfo.project.use?.viewport || { width: 1280, height: 720 }
      const videoDir = testInfo.outputPath('qa-video')

      const opened = []
      const original = browser.newContext.bind(browser)
      browser.newContext = async (options = {}) => {
        const context = await original({
          ...options,
          recordVideo: { dir: videoDir, size: viewport },
        })
        await context.addInitScript(CURSOR_OVERLAY_SOURCE)
        context.on('page', (page) => opened.push(page))
        return context
      }

      // Handed to the reporter through the attachment channel, which is the only
      // reliable test→reporter path (they run in different processes under
      // parallel workers).
      await testInfo.attach('qa-demo-meta', {
        contentType: 'application/json',
        body: JSON.stringify({
          videoStartMs,
          browserName: testInfo.project.use?.defaultBrowserType || 'chromium',
          channel: testInfo.project.use?.channel || null,
          viewport,
          // The reporter reads this rather than the attachment list: attachments
          // added during fixture TEARDOWN are registered after `onTestEnd` has
          // already snapshotted the result, so the recordings below would be
          // invisible to it. The directory is known here, at setup time.
          videoDir,
        }),
      })

      await use({ videoStartMs })

      browser.newContext = original

      // A recording is only flushed to disk when its context closes. Specs close
      // their own contexts, but a failing test can abort before that line — so
      // close anything still open rather than lose the footage of the failure,
      // which is the recording most worth having.
      for (const page of opened) {
        if (!page.isClosed()) await page.context().close().catch(() => {})
      }
      for (const page of opened) {
        const video = page.video()
        if (!video) continue
        try {
          await testInfo.attach('video', {
            path: await video.path(),
            contentType: 'video/webm',
          })
        } catch {
          // A context that never navigated may have no file; nothing to attach.
        }
      }
    },
    { auto: true },
  ],
})

export { expect }
export * from '@playwright/test'
