#!/usr/bin/env node
/**
 * `npm run test:video` — the one command that does everything.
 *
 *   1. verify ffmpeg can do the job (fail here, not 4 minutes in)
 *   2. instrument the specs if they are not already
 *   3. run Playwright with VIDEO_MODE=1 and the recording config
 *   4. build overlays, subtitles, cards and the final MP4s
 *   5. write the HTML report
 *
 * Any argument not consumed here is forwarded to Playwright, so
 * `npm run test:video -- --project=users -g "roster"` works as expected.
 *
 * EXIT CODES ARE DELIBERATE. Videos are built even when tests fail — a failing
 * run is exactly when the recording is most useful. The process then exits with
 * Playwright's original code so CI still gates on the tests, not on the film
 * crew. Only a broken pipeline (bad ffmpeg, unwritable artifacts) exits 2.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { DIRS } from './config.js'
import { assertCapabilities, FFMPEG_PATH } from './ffmpeg-bin.js'

const forwarded = process.argv.slice(2)

function sh(cmd, args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      env: { ...process.env, ...env },
      shell: false,
    })
    child.on('close', (code) => resolve(code ?? 1))
  })
}

async function main() {
  // 1 — fail fast on the toolchain.
  try {
    await assertCapabilities()
    console.log(`[test:video] ffmpeg ok → ${FFMPEG_PATH}`)
  } catch (err) {
    console.error(`[test:video] ${err.message}`)
    process.exit(2)
  }

  // Fresh logs each run, or the builder would rebuild videos for tests that are
  // no longer in the selection.
  fs.rmSync(DIRS.logs, { recursive: true, force: true })
  for (const dir of Object.values(DIRS)) fs.mkdirSync(dir, { recursive: true })

  // 2 — instrument (idempotent; no-ops once done).
  const instrumented = await sh(process.execPath, [path.join('video', 'instrument.js')])
  if (instrumented !== 0) {
    console.error('[test:video] instrumentation failed')
    process.exit(2)
  }

  // 3 — record.
  console.log('\n[test:video] running Playwright…\n')
  const testCode = await sh(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', '-c', 'playwright.video.config.js', ...forwarded],
    { VIDEO_MODE: '1' },
  )

  // 4/5 — build regardless of the test verdict.
  console.log('\n[test:video] building videos…\n')
  const buildCode = await sh(process.execPath, [path.join('video', 'build-videos.js')])

  const report = path.join(DIRS.reports, 'index.html')
  if (fs.existsSync(report)) {
    console.log(`\n[test:video] report → ${path.relative(process.cwd(), report)}`)
  }

  if (buildCode !== 0) {
    console.error('[test:video] the video build reported errors (see above)')
    process.exit(testCode !== 0 ? testCode : 2)
  }
  process.exit(testCode)
}

main().catch((err) => {
  console.error('[test:video] fatal:', err)
  process.exit(2)
})
