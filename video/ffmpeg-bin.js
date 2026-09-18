/**
 * Resolve a FULL ffmpeg/ffprobe and hand them to fluent-ffmpeg.
 *
 * Two traps this module exists to close:
 *
 * 1. Playwright ships its own ffmpeg (`ms-playwright/ffmpeg-*`), and it is
 *    tempting to reuse. Don't — it is a minimal capture-only build. Verified on
 *    this machine: no libx264, no `overlay` filter, no drawtext. The pipeline
 *    needs all three, so we deliberately resolve our own.
 *
 * 2. `@ffmpeg-installer` sets the +x bit from a postinstall script, and pnpm
 *    blocks build scripts by default ("Ignored build scripts:
 *    @ffmpeg-installer/darwin-arm64"). A fresh `pnpm install` therefore yields a
 *    non-executable binary and an EACCES that reads like a missing install. We
 *    chmod defensively on load rather than depending on `pnpm approve-builds`.
 *
 * FFMPEG_PATH / FFPROBE_PATH win if set, so CI images that already bake ffmpeg
 * in are not forced through the npm copy.
 */
import fs from 'node:fs'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import ffmpegLib from 'fluent-ffmpeg'

const require = createRequire(import.meta.url)

function ensureExecutable(binPath, what) {
  try {
    fs.accessSync(binPath, fs.constants.X_OK)
  } catch {
    try {
      fs.chmodSync(binPath, 0o755)
    } catch (err) {
      throw new Error(`${what} at ${binPath} is not executable (chmod failed: ${err.message})`)
    }
  }
  return binPath
}

function resolve(envVar, moduleName, what, installHint) {
  if (process.env[envVar]) return ensureExecutable(process.env[envVar], what)
  try {
    return ensureExecutable(require(moduleName).path, what)
  } catch (err) {
    if (err.message.includes('not executable')) throw err
    throw new Error(`No ${what} found. ${installHint}, or set ${envVar}.`)
  }
}

export const FFMPEG_PATH = resolve(
  'FFMPEG_PATH',
  '@ffmpeg-installer/ffmpeg',
  'ffmpeg',
  'Install with `pnpm add -D @ffmpeg-installer/ffmpeg`',
)

export const FFPROBE_PATH = resolve(
  'FFPROBE_PATH',
  '@ffprobe-installer/ffprobe',
  'ffprobe',
  'Install with `pnpm add -D @ffprobe-installer/ffprobe`',
)

ffmpegLib.setFfmpegPath(FFMPEG_PATH)
ffmpegLib.setFfprobePath(FFPROBE_PATH)
export const ffmpeg = ffmpegLib

function exec(bin, args, { maxBuffer = 64 << 20 } = {}) {
  return new Promise((resolve_, reject) => {
    execFile(bin, args, { maxBuffer }, (err, stdout, stderr) => {
      if (err) {
        // ffmpeg puts the real cause in the last few stderr lines; the Error
        // message on its own is just "Command failed".
        const tail = String(stderr || '').trim().split('\n').slice(-15).join('\n')
        reject(new Error(`${err.message}\n${tail}`))
      } else resolve_({ stdout, stderr })
    })
  })
}

/** Run ffmpeg with explicit args. Always `-y` and quiet unless it fails. */
export async function run(args, { label = 'ffmpeg' } = {}) {
  try {
    return await exec(FFMPEG_PATH, ['-hide_banner', '-loglevel', 'error', '-y', ...args])
  } catch (err) {
    throw new Error(`${label}: ${err.message}`)
  }
}

/** Fail early, with an actionable message, if the build lacks what we need. */
export async function assertCapabilities() {
  const [{ stdout: encoders }, { stdout: filters }] = await Promise.all([
    exec(FFMPEG_PATH, ['-hide_banner', '-encoders']),
    exec(FFMPEG_PATH, ['-hide_banner', '-filters']),
  ])
  const missing = []
  if (!/\blibx264\b/.test(encoders)) missing.push('encoder libx264')
  if (!/\boverlay\b/.test(filters)) missing.push('filter overlay')
  if (!/\bscale\b/.test(filters)) missing.push('filter scale')
  if (missing.length) {
    throw new Error(
      `ffmpeg at ${FFMPEG_PATH} is missing: ${missing.join(', ')}.\n` +
        "This is usually Playwright's bundled ffmpeg being picked up by accident — it is a " +
        'capture-only build. Unset FFMPEG_PATH so the @ffmpeg-installer copy is used.',
    )
  }
}

/** Duration in seconds, via ffprobe. Returns 0 for unreadable input. */
export async function probeDuration(file) {
  try {
    const { stdout } = await exec(FFPROBE_PATH, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      file,
    ])
    const seconds = Number.parseFloat(String(stdout).trim())
    return Number.isFinite(seconds) ? seconds : 0
  } catch {
    return 0
  }
}

/** Pixel dimensions of the first video stream. */
export async function probeSize(file) {
  try {
    const { stdout } = await exec(FFPROBE_PATH, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=p=0:s=x',
      file,
    ])
    const [w, h] = String(stdout).trim().split('x').map(Number)
    return Number.isFinite(w) && Number.isFinite(h) ? { width: w, height: h } : null
  } catch {
    return null
  }
}
