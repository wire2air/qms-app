/**
 * The overlay track: one transparent PNG per step, composited over the recording
 * as a single video input.
 *
 * WHY A TRACK RATHER THAN N OVERLAY FILTERS. The obvious approach is one
 * `overlay=...:enable='between(t,a,b)'` per step, but that is O(steps) filters
 * in one graph — a 60-step test produces a filter chain long enough to be slow
 * to build and painful to debug when it breaks. Instead the PNGs are fed through
 * the concat demuxer as a second input with explicit per-image durations, giving
 * a single `overlay` filter regardless of step count.
 *
 * Each PNG carries BOTH the persistent HUD (test name, browser, environment,
 * running clock) and the current step, so there is exactly one thing to
 * composite and no z-order to reason about.
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import {
  VIDEO, THEME, STATUS_COLOR, formatStamp, sesc, clamp,
} from '../config.js'

const W = () => VIDEO.width
const H = () => VIDEO.height

/** Rounded status pill shown against the active step. */
function pill(x, y, label, color) {
  const w = 22 + label.length * 10.5
  return `
    <rect x="${x}" y="${y - 21}" width="${w}" height="30" rx="15"
          fill="${color}" fill-opacity="0.16" stroke="${color}" stroke-width="1.5"/>
    <text x="${x + w / 2}" y="${y}" text-anchor="middle" font-family="${THEME.fontStack}"
          font-size="16" font-weight="700" fill="${color}">${sesc(label)}</text>`
}

/**
 * One overlay frame.
 *
 * @param {object} test    the reporter record
 * @param {object|null} step the step this frame covers (null = pre-first-step)
 * @param {number} index   1-based step number
 * @param {number} atMs    elapsed video time this frame begins at
 */
/**
 * Many specs in this suite never drive the UI — they assert over REST, raw
 * GraphQL or psql (`browser.newContext()` + `request`, no `goto`). Playwright
 * still records their context, so the footage is a blank white page for the
 * whole run, which looks like the recording failed.
 *
 * Saying so on screen turns a broken-looking video into an accurate one.
 */
function isHeadlessApiTest(test) {
  return !test.steps.some((s) => /^Navigate to/i.test(s.title))
}

function apiWatermark(test) {
  if (!isHeadlessApiTest(test)) return ''
  const cx = W() / 2
  const cy = H() / 2
  return `
    <rect x="${cx - 330}" y="${cy - 74}" width="660" height="148" rx="14"
          fill="${THEME.panelSolid}" stroke="${THEME.border}" stroke-width="1"/>
    <text x="${cx}" y="${cy - 22}" text-anchor="middle" font-family="${THEME.fontStack}"
          font-size="15" letter-spacing="2.6" fill="${THEME.accent}">NO BROWSER UI IN THIS TEST</text>
    <text x="${cx}" y="${cy + 18}" text-anchor="middle" font-family="${THEME.fontStack}"
          font-size="25" font-weight="600" fill="${THEME.text}">API / database-level assertions</text>
    <text x="${cx}" y="${cy + 50}" text-anchor="middle" font-family="${THEME.fontStack}"
          font-size="17" fill="${THEME.textDim}">The blank page is expected — see the step captions below</text>`
}

function frameSvg(test, step, index, atMs) {
  const statusKey = step ? (step.status === 'failed' ? 'failed' : 'running') : 'running'
  const color = STATUS_COLOR[statusKey] || THEME.running
  const statusLabel = step ? (step.status === 'failed' ? 'FAILED' : 'RUNNING') : 'STARTING'

  const browser = [test.browser, test.channel].filter(Boolean).join(' · ') || 'chromium'

  // ---- top HUD: identity, always on screen -------------------------------
  const hud = `
    <rect x="0" y="0" width="${W()}" height="64" fill="${THEME.panelSolid}"/>
    <rect x="0" y="62" width="${W()}" height="2" fill="${THEME.accent}" fill-opacity="0.55"/>
    <text x="28" y="40" font-family="${THEME.fontStack}" font-size="21" font-weight="700"
          fill="${THEME.text}">${sesc(clamp(test.title, 52))}</text>
    <text x="${W() - 28}" y="40" text-anchor="end" font-family="${THEME.monoStack}"
          font-size="16" fill="${THEME.textDim}"
          >${sesc(browser)}  ·  ${sesc(test.environment)}  ·  ${formatStamp(atMs)}</text>`

  if (!step) {
    return `<svg width="${W()}" height="${H()}" xmlns="http://www.w3.org/2000/svg">${hud}${apiWatermark(test)}</svg>`
  }

  // ---- lower third: the current step -------------------------------------
  const boxY = H() - 132
  const merged = step.mergedCount > 1 ? ` (+${step.mergedCount - 1} sub-steps)` : ''

  const errorLine =
    step.status === 'failed' && step.error
      ? `<text x="44" y="${boxY + 104}" font-family="${THEME.monoStack}" font-size="15"
               fill="${THEME.fail}">${sesc(clamp(step.error.split('\n')[0], 108))}</text>`
      : ''

  const lower = `
    <rect x="24" y="${boxY}" width="${W() - 48}" height="108" rx="12"
          fill="${THEME.panelSolid}" stroke="${THEME.border}" stroke-width="1"/>
    <rect x="24" y="${boxY}" width="5" height="108" rx="2.5" fill="${color}"/>

    <text x="44" y="${boxY + 32}" font-family="${THEME.fontStack}" font-size="14"
          letter-spacing="2.4" fill="${THEME.textDim}"
          >STEP ${String(index).padStart(2, '0')} / ${String(test.steps.length).padStart(2, '0')}</text>

    ${pill(190, boxY + 32, statusLabel, color)}

    <text x="${W() - 44}" y="${boxY + 32}" text-anchor="end" font-family="${THEME.monoStack}"
          font-size="15" fill="${THEME.textDim}"
          >${formatStamp(step.startMs)} → ${formatStamp(step.startMs + step.durationMs)}  ·  ${(step.durationMs / 1000).toFixed(1)}s</text>

    <text x="44" y="${boxY + 74}" font-family="${THEME.fontStack}" font-size="27"
          font-weight="600" fill="${THEME.text}">${sesc(clamp(step.title + merged, 76))}</text>
    ${errorLine}`

  return `<svg width="${W()}" height="${H()}" xmlns="http://www.w3.org/2000/svg">${hud}${apiWatermark(test)}${lower}</svg>`
}

/**
 * Render the overlay PNGs plus the concat manifest ffmpeg will read.
 *
 * @returns {{listFile:string, frames:string[], totalMs:number}}
 */
export async function renderOverlayTrack(test, workDir, videoDurationMs) {
  fs.mkdirSync(workDir, { recursive: true })

  const cues = []
  const first = test.steps[0]

  // Lead-in: the recording starts before the first action (page load, fixture
  // setup). Without this frame the HUD would pop in mid-scene.
  if (!first || first.startMs > 0) {
    cues.push({ step: null, index: 0, startMs: 0, endMs: first ? first.startMs : videoDurationMs })
  }

  test.steps.forEach((step, i) => {
    const next = test.steps[i + 1]
    // Hold each step until the next one begins, so there is never a gap where
    // the lower third disappears between actions.
    const endMs = next ? next.startMs : Math.max(step.startMs + step.durationMs, videoDurationMs)
    cues.push({ step, index: i + 1, startMs: step.startMs, endMs })
  })

  // Clamp to the real container length; steps recorded after the last video
  // frame (teardown assertions) would otherwise stretch the track past the end.
  const clamped = cues
    .map((c) => ({ ...c, endMs: Math.min(c.endMs, videoDurationMs) }))
    .filter((c) => c.endMs - c.startMs > 40)

  const frames = []
  const lines = []
  for (const [i, cue] of clamped.entries()) {
    const file = path.join(workDir, `ov-${String(i).padStart(4, '0')}.png`)
    const svg = frameSvg(test, cue.step, cue.index, cue.startMs)
    await sharp(Buffer.from(svg)).png({ compressionLevel: 6 }).toFile(file)
    frames.push(file)
    const seconds = Math.max(0.04, (cue.endMs - cue.startMs) / 1000)
    lines.push(`file '${file.replace(/'/g, "'\\''")}'`)
    lines.push(`duration ${seconds.toFixed(3)}`)
  }

  // The concat demuxer drops the final image unless it is repeated without a
  // duration — a documented quirk, and the reason the last overlay would
  // otherwise vanish a frame early.
  if (frames.length) lines.push(`file '${frames[frames.length - 1].replace(/'/g, "'\\''")}'`)

  const listFile = path.join(workDir, 'overlay.txt')
  fs.writeFileSync(listFile, lines.join('\n'), 'utf8')

  return {
    listFile,
    frames,
    totalMs: clamped.reduce((a, c) => a + (c.endMs - c.startMs), 0),
  }
}
