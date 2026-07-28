/**
 * Subtitle generation (requirement 14) in two formats.
 *
 * SRT is what the spec asked for and what every player and NLE ingests. WebVTT
 * is written alongside it because the HTML report plays the MP4 in a <video>
 * element, and browsers will not load an .srt track.
 *
 * The cue timings are shifted by the intro-card length, because the final MP4 is
 * [title card][recording][summary card] — subtitles authored against raw
 * recording time would drift by exactly the card duration otherwise. That
 * offset is the single most likely thing to get wrong here.
 */
import fs from 'node:fs'
import path from 'node:path'
import { STATUS_ICON, VIDEO, moduleDirs, artifactName } from '../config.js'

function srtTime(ms) {
  const t = Math.max(0, Math.round(ms))
  const h = String(Math.floor(t / 3600000)).padStart(2, '0')
  const m = String(Math.floor((t % 3600000) / 60000)).padStart(2, '0')
  const s = String(Math.floor((t % 60000) / 1000)).padStart(2, '0')
  const msec = String(t % 1000).padStart(3, '0')
  return `${h}:${m}:${s},${msec}`
}

function vttTime(ms) {
  return srtTime(ms).replace(',', '.')
}

/**
 * @param {object} test reporter record
 * @param {number} videoDurationMs length of the RECORDING (not the final MP4)
 * @param {number} offsetMs        length of the intro card
 */
export function buildCues(test, videoDurationMs, offsetMs) {
  const cues = []

  cues.push({
    startMs: 0,
    endMs: offsetMs,
    lines: [test.title, `${test.project} · ${test.browser} · ${test.environment}`],
  })

  test.steps.forEach((step, i) => {
    const next = test.steps[i + 1]
    const rawEnd = next ? next.startMs : step.startMs + step.durationMs
    const startMs = offsetMs + step.startMs
    const endMs = offsetMs + Math.min(Math.max(rawEnd, step.startMs + 700), videoDurationMs)
    if (endMs <= startMs) return
    const icon = STATUS_ICON[step.status] || '•'
    cues.push({
      startMs,
      endMs,
      lines: [`Step ${i + 1}/${test.steps.length}: ${step.title}`, `${icon} ${step.status}`],
    })
  })

  const tail = offsetMs + videoDurationMs
  cues.push({
    startMs: tail,
    endMs: tail + VIDEO.summarySeconds * 1000,
    lines: [
      `Result: ${test.status.toUpperCase()}${test.isExpected ? '' : ' (UNEXPECTED)'}`,
      `${test.steps.length} steps`,
    ],
  })

  return cues
}

export function writeSubtitles(test, cues) {
  const outDir = moduleDirs(test.project).subtitles
  fs.mkdirSync(outDir, { recursive: true })

  const srt = cues
    .map((c, i) => `${i + 1}\n${srtTime(c.startMs)} --> ${srtTime(c.endMs)}\n${c.lines.join('\n')}\n`)
    .join('\n')

  const vtt = `WEBVTT\n\n${cues
    .map((c) => `${vttTime(c.startMs)} --> ${vttTime(c.endMs)}\n${c.lines.join('\n')}\n`)
    .join('\n')}`

  const srtPath = path.join(outDir, `${artifactName(test)}.srt`)
  const vttPath = path.join(outDir, `${artifactName(test)}.vtt`)
  fs.writeFileSync(srtPath, srt, 'utf8')
  fs.writeFileSync(vttPath, vtt, 'utf8')
  return { srtPath, vttPath }
}
