/**
 * Single source of truth for the demo-video pipeline: paths, theme, and the
 * knobs worth turning. Everything else imports from here so the look of the
 * final MP4 can be changed in one file.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const DIRS = {
  artifacts: path.join(ROOT, 'artifacts'),
  videos: path.join(ROOT, 'artifacts/videos'),
  screenshots: path.join(ROOT, 'artifacts/screenshots'),
  traces: path.join(ROOT, 'artifacts/traces'),
  logs: path.join(ROOT, 'artifacts/logs'),
  subtitles: path.join(ROOT, 'artifacts/subtitles'),
  reports: path.join(ROOT, 'artifacts/reports'),
  final: path.join(ROOT, 'artifacts/final-videos'),
  work: path.join(ROOT, 'artifacts/.work'),
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
