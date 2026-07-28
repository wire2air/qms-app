/**
 * Single source of truth for the demo-video pipeline: paths, theme, and the
 * knobs worth turning. Everything else imports from here so the look of the
 * final MP4 can be changed in one file.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Run-level directories. Everything else is per-module — see `moduleDirs`.
 *
 * `logs` holds only the run manifest; per-test logs live under the module that
 * produced them, so re-running one module cannot invalidate another's videos.
 * `reports` holds the combined index that links out to the module reports.
 */
export const DIRS = {
  artifacts: path.join(ROOT, 'artifacts'),
  logs: path.join(ROOT, 'artifacts/logs'),
  reports: path.join(ROOT, 'artifacts/reports'),
  work: path.join(ROOT, 'artifacts/.work'),
}

/**
 * Subdirectories of `artifacts/` that are NOT a module. Anything else in there
 * is a module root, which is what lets `run.js` wipe the right folders without
 * being told which modules exist.
 */
export const RESERVED_DIRS = new Set(['logs', 'reports', '.work'])

/**
 * The suites worth filming. Shared with playwright.video.config.js so the
 * recorder and the cleaner agree on what "all modules" means.
 */
export const MODULES = (
  process.env.VIDEO_MODULES ||
  'documents,nonconformances,capas,changeRequests,training,sites,departments,users'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

/**
 * Projects that exist to support the run rather than to be filmed. `setup` only
 * logs in and writes storage state — it has no video, so giving it a module
 * folder would add an empty report and a row of blank cards to the index.
 */
export const NON_FILMED_PROJECTS = new Set(['setup'])

/** `artifacts/<module>/` — one self-contained folder per Playwright project. */
export function moduleRoot(moduleName) {
  return path.join(DIRS.artifacts, slugify(moduleName || 'unknown'))
}

/**
 * Every output path for one module. Each module owns its whole tree, so
 * `--project=training` rebuilds `artifacts/training/` and leaves the rest alone.
 */
export function moduleDirs(moduleName) {
  const root = moduleRoot(moduleName)
  return {
    root,
    videos: path.join(root, 'videos'),
    screenshots: path.join(root, 'screenshots'),
    traces: path.join(root, 'traces'),
    logs: path.join(root, 'logs'),
    subtitles: path.join(root, 'subtitles'),
    reports: path.join(root, 'reports'),
    final: path.join(root, 'final-videos'),
  }
}

/**
 * Leaf filename for a test's artifacts.
 *
 * `test.id` is prefixed with the project so it stays unique in a flat folder.
 * Inside `artifacts/<module>/` that prefix is repeated in the path, so it is
 * dropped from the filename — the id itself is untouched (it is the key the
 * report, the subtitle writer and the reel builder all look up by).
 */
export function artifactName(test) {
  const prefix = `${test.project}--`
  return test.id.startsWith(prefix) ? test.id.slice(prefix.length) : test.id
}

/** Environment label burned into the title card + HUD. */
export const ENVIRONMENT =
  process.env.E2E_ENV_LABEL ||
  (process.env.CI ? 'CI' : 'Local Dev') ||
  'Unknown'

export const VIDEO = {
  /** Playwright records at the viewport size; the pipeline never rescales. */
  width: Number(process.env.VIDEO_WIDTH || 1280),
  height: Number(process.env.VIDEO_HEIGHT || 720),
  fps: Number(process.env.VIDEO_FPS || 25),
  /** Seconds the intro/outro cards hold on screen. */
  titleSeconds: Number(process.env.VIDEO_TITLE_SECONDS || 3.5),
  summarySeconds: Number(process.env.VIDEO_SUMMARY_SECONDS || 4),
  /** x264 quality. Lower = better. 20 is visually lossless for UI capture. */
  crf: Number(process.env.VIDEO_CRF || 20),
  preset: process.env.VIDEO_PRESET || 'veryfast',
}

/**
 * The canvas overlays and cards are AUTHORED against, regardless of the real
 * recording size.
 *
 * Every font size and offset in render/overlays.js and render/cards.js is a
 * hand-tuned 720p number. Without a design space they are literal pixels on
 * whatever canvas the recording happens to be, so raising VIDEO_WIDTH to 1920
 * would leave a HUD tuned for 1280 sitting on a 1920 frame — 33% smaller and
 * visibly wrong. Emitting them into a fixed viewBox and letting the SVG scale to
 * VIDEO.width/height keeps the composition identical at any resolution.
 *
 * The height tracks the real aspect ratio so a non-16:9 recording scales rather
 * than letterboxes.
 */
export const DESIGN = {
  width: 1280,
  get height() {
    return Math.round((1280 * VIDEO.height) / VIDEO.width)
  },
}

export const STEPS = {
  /**
   * Which Playwright step categories become on-screen steps.
   *
   * `test.step` is the ideal source, but a suite that has never called it would
   * render an empty video — so actions (`pw:api`) and assertions (`expect`) are
   * on by default. Every Playwright action is already a step in the reporter
   * tree, which is what makes narration work with zero edits to the specs.
   */
  categories: (process.env.VIDEO_STEP_CATEGORIES || 'test.step,pw:api,expect')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  /**
   * Steps shorter than this are folded into the previous one. Without this a
   * chain of 40ms locator calls produces a strobing overlay that reads as noise
   * rather than narration.
   */
  minDurationMs: Number(process.env.VIDEO_STEP_MIN_MS || 220),
  /**
   * Minimum time a caption stays on screen, independent of how long its step
   * actually took.
   *
   * With coalescing off (VIDEO_STEP_MIN_MS=0) every action gets its own caption,
   * and a real run is full of 4–60ms steps — `Press "Enter"` would flash for two
   * frames and be unreadable. Holding each caption for at least this long, and
   * pushing the following ones back, turns a burst of keystrokes into something
   * a viewer can follow.
   */
  minShowMs: Number(process.env.VIDEO_STEP_MIN_SHOW_MS || 650),
  /**
   * Ceiling on how far captions may lag the footage because of `minShowMs`.
   *
   * Every held caption pushes the next one later, so without a cap a test with
   * many short steps would drift until the narration described something that
   * left the screen ten seconds ago. At the cap, captions stop being extended
   * and the track re-syncs with the video.
   */
  maxDriftMs: Number(process.env.VIDEO_STEP_MAX_DRIFT_MS || 2500),
  /**
   * Harness plumbing Playwright reports as `pw:api` steps. They are not actions
   * anybody performed on the product — filming `Launch "browser"` as step 1 of a
   * demo just spends a caption slot on the test runner.
   */
  ignore: new RegExp(
    process.env.VIDEO_STEP_IGNORE ||
      '^(Launch|Close)\\s|^Create\\s+["“]?(context|page|browser)|^Evaluate$',
    'i',
  ),
  /** Hard ceiling so a pathological test cannot generate 800 overlay frames. */
  maxSteps: Number(process.env.VIDEO_MAX_STEPS || 60),
  /** Nested steps deeper than this are ignored (keeps narration at one level). */
  maxDepth: Number(process.env.VIDEO_MAX_DEPTH || 1),
}

/** Dark, high-contrast palette that survives video compression. */
export const THEME = {
  bg: '#0B1220',
  panel: 'rgba(11,18,32,0.88)',
  panelSolid: '#111C2F',
  border: 'rgba(148,163,184,0.28)',
  text: '#F8FAFC',
  textDim: '#94A3B8',
  accent: '#38BDF8',
  pass: '#22C55E',
  fail: '#EF4444',
  running: '#FACC15',
  skipped: '#64748B',
  fontStack:
    "'Helvetica Neue', Helvetica, Arial, 'DejaVu Sans', 'Liberation Sans', sans-serif",
  monoStack: "'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace",
}

/** Emoji are fine in HTML — the browser has a colour emoji font. */
export const STATUS_ICON = {
  passed: '✅',
  failed: '❌',
  timedOut: '⏱',
  skipped: '⏭',
  running: '▶',
  interrupted: '⛔',
}

/**
 * Glyphs for the GENERATED SVG. Deliberately monochrome.
 *
 * Emoji do rasterise in sharp, but as colour-layer glyphs: the `fill` we set
 * flattens every layer to one colour, so ✅ came out as a solid green box with
 * the tick invisible. Monochrome dingbats take `fill` correctly and stay legible
 * after video compression. Verified rendering with the project font stack.
 */
export const SVG_STATUS_GLYPH = {
  passed: '✓',
  failed: '✗',
  timedOut: '✗',
  skipped: '–',
  running: '●',
  interrupted: '✕',
}

export const STATUS_COLOR = {
  passed: THEME.pass,
  failed: THEME.fail,
  timedOut: THEME.fail,
  skipped: THEME.skipped,
  running: THEME.running,
  interrupted: THEME.fail,
}

/** hh:mm:ss for durations shown on the cards. */
export function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = String(Math.floor(total / 3600)).padStart(2, '0')
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const s = String(total % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

/** mm:ss.mmm — the elapsed stamp shown against each step. */
export function formatStamp(ms) {
  const clamped = Math.max(0, ms)
  const m = String(Math.floor(clamped / 60000)).padStart(2, '0')
  const s = String(Math.floor((clamped % 60000) / 1000)).padStart(2, '0')
  const cs = String(Math.floor((clamped % 1000) / 10)).padStart(2, '0')
  return `${m}:${s}.${cs}`
}

/** Filesystem-safe slug used for every artifact name belonging to one test. */
export function slugify(str, max = 90) {
  return String(str)
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
    .slice(0, max)
    .replace(/^-|-$/g, '')
}

/**
 * Strip emoji before rasterising to SVG.
 *
 * Emoji are colour-layer glyphs. sharp renders them, but the `fill` we set
 * flattens every layer to a single colour — so this suite's 🔴/✅/⚖️ markers came
 * out as solid white blobs sitting in the middle of the title. HTML keeps them
 * (browsers have a colour emoji font); the generated SVG must not.
 *
 * Status is already carried by the badge and the per-step glyph, so dropping the
 * emoji loses no information here.
 */
export function stripEmoji(str) {
  return String(str ?? '')
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{200D}\u{20E3}]/gu,
      '',
    )
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** XML-escape + emoji-strip. Use for anything drawn into generated SVG. */
export function sesc(str) {
  return esc(stripEmoji(str))
}

/** XML-escape for text interpolated into generated SVG. */
export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Hard-truncate with an ellipsis so long titles cannot overflow their box. */
export function clamp(str, max) {
  const s = String(str ?? '')
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`
}
