/**
 * Recording config. Wraps the normal playwright.config.js and changes only what
 * the demo pipeline needs, so the two cannot drift apart:
 *
 *   · video: 'on'  + a fixed 1280x720 recording size (predictable overlay geometry)
 *   · trace: 'on'  + screenshot on failure (requirements 12/13)
 *   · the demo reporter alongside the usual list/html
 *   · one worker, headed by default — parallel workers interleave two browsers
 *     into one screen recording and produce unusable footage
 *
 * Browser coverage (requirement 18) is selected with VIDEO_BROWSER:
 *   chrome (default) | firefox | edge | all
 *
 * Chrome and Edge use Playwright's branded channels, so they are the REAL
 * browsers rather than bundled Chromium. They must be installed:
 *   npx playwright install chrome msedge firefox
 */
import fs from 'node:fs'
import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config.js'

const SIZE = {
  width: Number(process.env.VIDEO_WIDTH || 1280),
  height: Number(process.env.VIDEO_HEIGHT || 720),
}

/**
 * Branded Chrome/Edge are real installed applications, not something Playwright
 * downloads. Defaulting to `channel: 'chrome'` therefore hard-fails on any
 * machine without it ("Chromium distribution 'chrome' is not found") — which is
 * this one, and would be most CI images too.
 *
 * So: auto-detect for the DEFAULT, and be strict about an EXPLICIT choice. A
 * silent fall back from a requested `edge` to bundled chromium would put the
 * wrong browser name on the title card, and a QA artifact that misreports what
 * it ran on is worse than one that refuses to build.
 */
const CHANNEL_PATHS = {
  chrome: {
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
    linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome'],
    win32: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ],
  },
  msedge: {
    darwin: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
    linux: ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable'],
    win32: [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ],
  },
}

function channelInstalled(channel) {
  const candidates = CHANNEL_PATHS[channel]?.[process.platform] || []
  return candidates.some((p) => fs.existsSync(p))
}

const EXPLICIT = !!process.env.VIDEO_BROWSER
const WANT = (
  process.env.VIDEO_BROWSER || (channelInstalled('chrome') ? 'chrome' : 'chromium')
).toLowerCase()

if (!EXPLICIT && WANT === 'chromium') {
  console.log(
    "[demo-video] Google Chrome not installed — recording on bundled Chromium.\n" +
      '             For branded Chrome/Edge: npx playwright install chrome msedge',
  )
}

/** Browser flavours the demo projects can be built from. */
const FLAVOURS = {
  chrome: { ...devices['Desktop Chrome'], channel: 'chrome' },
  // No channel: use the Chromium that Playwright installs. The safe default when
  // real Chrome is not on the machine (verified: this box has neither Chrome nor
  // Edge installed, only chromium-1228).
  chromium: { ...devices['Desktop Chrome'] },
  firefox: { ...devices['Desktop Firefox'] },
  edge: { ...devices['Desktop Edge'], channel: 'msedge' },
}

const selected =
  WANT === 'all' ? ['chrome', 'firefox', 'edge'] : WANT.split(',').map((s) => s.trim())

// Fail here with something actionable rather than 40 identical launch errors
// once the run is already under way.
for (const flavour of selected) {
  const channel = FLAVOURS[flavour]?.channel
  if (channel && !channelInstalled(channel)) {
    const hint =
      WANT === 'all'
        ? `VIDEO_BROWSER=all needs ${channel}. Install it, or record a subset: VIDEO_BROWSER=chromium,firefox`
        : `Install it (npx playwright install ${channel}) or use VIDEO_BROWSER=chromium`
    throw new Error(`[demo-video] browser "${flavour}" requires ${channel}, which is not installed.\n  ${hint}`)
  }
}

/** The suites worth filming. `setup` is a dependency, never filmed itself. */
const MODULES = (
  process.env.VIDEO_MODULES ||
  'documents,nonconformances,capas,changeRequests,training,sites,departments,users'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const projects = [
  { name: 'setup', testMatch: /fixtures\/auth\.setup\.js/ },
  ...selected.flatMap((flavour) =>
    MODULES.map((mod) => ({
      // Single browser → keep the original project name so `--project=users`
      // and every existing script still work. Multi-browser → suffix it.
      name: selected.length > 1 ? `${mod}-${flavour}` : mod,
      testMatch: new RegExp(`${mod}/.*\\.spec\\.js`),
      dependencies: ['setup'],
      use: {
        ...(FLAVOURS[flavour] || FLAVOURS.chromium),
        viewport: SIZE,
        // Must match the viewport, or the overlay geometry is computed against
        // the wrong canvas and the lower third sits off-screen.
        video: { mode: 'on', size: SIZE },
      },
    })),
  ),
]

export default defineConfig({
  ...base,
  workers: 1,
  fullyParallel: false,
  // Retries produce a second recording of the same title; the builder keeps only
  // the final attempt, but filming a retry at all is usually wasted work.
  retries: 0,
  reporter: [
    ['list'],
    ['./video/reporter.js'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    // Allure is opt-in: it is a test report, not a video pipeline, and pulling
    // it in unconditionally adds a heavy dep for something most runs don't use.
    ...(process.env.VIDEO_ALLURE === '1'
      ? [['allure-playwright', { resultsDir: 'artifacts/reports/allure-results' }]]
      : []),
  ],
  use: {
    ...base.use,
    headless: process.env.VIDEO_HEADED === '1' ? false : true,
    trace: 'on',
    screenshot: 'only-on-failure',
    video: { mode: 'on', size: SIZE },
    viewport: SIZE,
    // Animations left ON deliberately: this footage is for humans, and a UI with
    // `reducedMotion: 'reduce'` looks broken rather than fast in a demo.
  },
  projects,
})
