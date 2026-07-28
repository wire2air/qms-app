/**
 * webm + overlay track + cards  →  one polished MP4 per test.
 *
 * Three passes, deliberately not one:
 *
 *   1. body   — recording with the overlay track composited on
 *   2. cards  — each still encoded to a short clip with IDENTICAL codec params
 *   3. concat — stream-copy the three together
 *
 * The concat DEMUXER (not the filter) is used for step 3, which requires every
 * segment to share codec, pixel format, resolution, timebase and framerate.
 * That is why ENCODE_ARGS is a single shared constant applied to all segments —
 * the first version of this varied `-r` between cards and body and produced a
 * file that played the body at the wrong speed in QuickTime while looking fine
 * in VLC. Keep them identical.
 *
 * Everything is normalised to VIDEO.fps and yuv420p so the result plays in
 * QuickTime, PowerPoint and browsers without transcoding.
 */
import fs from 'node:fs'
import path from 'node:path'
import { run, probeDuration, probeSize } from '../ffmpeg-bin.js'
import { VIDEO, DIRS } from '../config.js'
import { renderTitleCard, renderSummaryCard } from './cards.js'
import { renderOverlayTrack } from './overlays.js'
import { buildCues, writeSubtitles } from './subtitles.js'

/** Shared by every segment. Divergence here breaks concat in subtle ways. */
const ENCODE_ARGS = [
  '-c:v', 'libx264',
  '-preset', VIDEO.preset,
  '-crf', String(VIDEO.crf),
  '-pix_fmt', 'yuv420p',
  '-r', String(VIDEO.fps),
  '-movflags', '+faststart',
  '-an',
]

/** Still image → clip of `seconds`, at the canonical encode settings. */
async function stillToClip(png, seconds, outPath) {
  await run(
    [
      '-loop', '1',
      '-i', png,
      '-t', String(seconds),
      // Pad guards against a card that is a pixel off the video size; without it
      // concat rejects the segment outright.
      '-vf', `scale=${VIDEO.width}:${VIDEO.height}:force_original_aspect_ratio=decrease,` +
             `pad=${VIDEO.width}:${VIDEO.height}:(ow-iw)/2:(oh-ih)/2:color=#0B1220,format=yuv420p`,
      ...ENCODE_ARGS,
      outPath,
    ],
    { label: `still→clip ${path.basename(png)}` },
  )
  return outPath
}

/** Composite the overlay track over the raw recording. */
async function renderBody(sourceVideo, overlayList, outPath) {
  await run(
    [
      '-i', sourceVideo,
      // The overlay track is a concat-demuxer image sequence; -safe 0 is needed
      // because the manifest holds absolute paths.
      '-f', 'concat', '-safe', '0', '-i', overlayList,
      '-filter_complex',
      // Scale the source to the canonical size first: Playwright's webm can come
      // back a few pixels short of the requested viewport on HiDPI machines, and
      // overlay refuses mismatched dimensions.
      `[0:v]scale=${VIDEO.width}:${VIDEO.height},format=yuva420p[base];` +
        `[1:v]format=rgba,scale=${VIDEO.width}:${VIDEO.height}[ov];` +
        `[base][ov]overlay=0:0:shortest=0:eof_action=repeat,format=yuv420p[v]`,
      '-map', '[v]',
      ...ENCODE_ARGS,
      outPath,
    ],
    { label: 'overlay composite' },
  )
  return outPath
}

async function concatSegments(segments, outPath, workDir) {
  const list = path.join(workDir, 'segments.txt')
  fs.writeFileSync(
    list,
    segments.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join('\n'),
    'utf8',
  )
  await run(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', outPath], {
    label: 'concat segments',
  })
  return outPath
}

/**
 * Build the final MP4 for one test.
 * @returns {Promise<object|null>} artifact paths, or null if there was no video
 */
export async function buildTestVideo(test, { keepWork = false } = {}) {
  const source = test.attachments.videos?.[0]
  if (!source || !fs.existsSync(source)) return null

  const workDir = path.join(DIRS.work, test.id)
  fs.mkdirSync(workDir, { recursive: true })

  const durationSec = await probeDuration(source)
  const videoDurationMs = Math.round(durationSec * 1000)
  if (!videoDurationMs) return null

  // Playwright sizes the recording from the viewport, but honour whatever the
  // container actually says so overlays line up on unusual configurations.
  const size = await probeSize(source)
  if (size?.width && size.height) {
    VIDEO.width = size.width
    VIDEO.height = size.height
  }

  const titlePng = await renderTitleCard(test, path.join(workDir, 'title.png'))
  const summaryPng = await renderSummaryCard(test, path.join(workDir, 'summary.png'))
  const { listFile } = await renderOverlayTrack(test, workDir, videoDurationMs)

  const titleClip = await stillToClip(titlePng, VIDEO.titleSeconds, path.join(workDir, 'a-title.mp4'))
  const bodyClip = await renderBody(source, listFile, path.join(workDir, 'b-body.mp4'))
  const summaryClip = await stillToClip(
    summaryPng,
    VIDEO.summarySeconds,
    path.join(workDir, 'c-summary.mp4'),
  )

  fs.mkdirSync(DIRS.final, { recursive: true })
  const finalPath = path.join(DIRS.final, `${test.id}.mp4`)
  await concatSegments([titleClip, bodyClip, summaryClip], finalPath, workDir)

  // Subtitles are offset by the intro card — see subtitles.js.
  const cues = buildCues(test, videoDurationMs, Math.round(VIDEO.titleSeconds * 1000))
  const { srtPath, vttPath } = writeSubtitles(test, cues)

  if (!keepWork) fs.rmSync(workDir, { recursive: true, force: true })

  return {
    finalPath,
    srtPath,
    vttPath,
    durationMs: videoDurationMs + (VIDEO.titleSeconds + VIDEO.summarySeconds) * 1000,
  }
}
