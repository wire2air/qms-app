#!/usr/bin/env node
/**
 * Post-run orchestrator. Reads artifacts/logs/*.json (written by the reporter),
 * collects Playwright's own artifacts, and produces the final MP4s + report.
 *
 * Runs as a SEPARATE process after `playwright test` rather than inside a
 * reporter hook, for two reasons: encoding a long suite inside onEnd() delays
 * the runner's exit code (breaking CI gating), and a crash in ffmpeg would then
 * mark a passing test run as failed. Decoupled, the tests own their verdict and
 * the video build owns its own.
 *
 * Usage:
 *   node video/build-videos.js [--module <name>] [--no-merge] [--keep-work]
 */
import fs from 'node:fs'
import path from 'node:path'
import { DIRS, slugify } from './config.js'
import { assertCapabilities } from './ffmpeg-bin.js'
import { buildTestVideo } from './render/pipeline.js'
import { buildModuleReel } from './render/merge.js'
import { writeHtmlReport } from './render/htmlReport.js'

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const opt = (name, def = null) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def
}

const ONLY_MODULE = opt('--module')
const MERGE = !flag('--no-merge')
const KEEP_WORK = flag('--keep-work')

function loadLogs() {
  if (!fs.existsSync(DIRS.logs)) return []
  return fs
    .readdirSync(DIRS.logs)
    .filter((f) => f.endsWith('.json') && f !== 'run-manifest.json')
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(DIRS.logs, f), 'utf8'))
      } catch {
        return null
      }
    })
    .filter(Boolean)
    // Keep only the final attempt of a retried test — otherwise a flaky test
    // yields two videos and the report shows the same title twice.
    .reduce((acc, rec) => {
      const key = `${rec.project}--${rec.fullTitle}`
      const prev = acc.get(key)
      if (!prev || rec.retry > prev.retry) acc.set(key, rec)
      return acc
    }, new Map())
}

/**
 * Copy Playwright's artifacts into artifacts/ and repoint the record at the
 * copies, so the output folder is self-contained and survives `test-results/`
 * being wiped by the next run.
 */
function harvest(test) {
  const copy = (src, destDir, suffix) => {
    if (!src || !fs.existsSync(src)) return null
    fs.mkdirSync(destDir, { recursive: true })
    const dest = path.join(destDir, `${test.id}${suffix}`)
    fs.copyFileSync(src, dest)
    return dest
  }

  const videos = (test.attachments.videos || [])
    .map((v, i) => copy(v, DIRS.videos, `${i ? `-${i}` : ''}.webm`))
    .filter(Boolean)
  const traces = (test.attachments.traces || [])
    .map((t, i) => copy(t, DIRS.traces, `${i ? `-${i}` : ''}.zip`))
    .filter(Boolean)
  const screenshots = (test.attachments.screenshots || [])
    .map((s, i) => copy(s, DIRS.screenshots, `${i ? `-${i}` : ''}.png`))
    .filter(Boolean)

  return { ...test, attachments: { videos, traces, screenshots } }
}

async function main() {
  const t0 = Date.now()
  await assertCapabilities()

  let tests = [...loadLogs().values()]
  if (!tests.length) {
    console.error(
      '[demo-video] No logs in artifacts/logs/. Run the tests first:\n' +
        '            npm run test:video  (or: VIDEO_MODE=1 playwright test -c playwright.video.config.js)',
    )
    process.exit(1)
  }
  if (ONLY_MODULE) tests = tests.filter((t) => t.project === ONLY_MODULE)
  tests.sort((a, b) => a.project.localeCompare(b.project) || a.startedAt.localeCompare(b.startedAt))

  console.log(`[demo-video] building ${tests.length} video(s)…`)

  const harvested = tests.map(harvest)
  const videosById = new Map()
  const failures = []

  for (const [i, test] of harvested.entries()) {
    const label = `${i + 1}/${harvested.length} ${test.project} › ${test.title}`
    try {
      const built = await buildTestVideo(test, { keepWork: KEEP_WORK })
      if (built) {
        videosById.set(test.id, built)
        console.log(`  ✔ ${label}`)
      } else {
        console.log(`  – ${label} (no recording)`)
      }
    } catch (err) {
      // One bad video must not abort the batch — the rest are still useful.
      failures.push({ test: test.fullTitle, error: err.message })
      console.error(`  ✖ ${label}\n     ${err.message.split('\n')[0]}`)
    }
  }

  const reels = new Map()
  if (MERGE) {
    const byModule = new Map()
    for (const t of harvested) {
      if (!byModule.has(t.project)) byModule.set(t.project, [])
      byModule.get(t.project).push(t)
    }
    for (const [mod, list] of byModule) {
      if (list.length < 2) continue // a one-test reel is just the test
      try {
        const reel = await buildModuleReel(mod, list, videosById)
        if (reel) {
          reels.set(mod, reel)
          console.log(`  ✔ module reel: ${mod}`)
        }
      } catch (err) {
        failures.push({ test: `module reel ${mod}`, error: err.message })
        console.error(`  ✖ module reel ${mod}: ${err.message.split('\n')[0]}`)
      }
    }
  }

  const manifestPath = path.join(DIRS.logs, 'run-manifest.json')
  const runMeta = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    : { environment: harvested[0]?.environment || 'Unknown' }

  const reportPath = writeHtmlReport(harvested, videosById, reels, runMeta)

  if (!KEEP_WORK) fs.rmSync(DIRS.work, { recursive: true, force: true })

  const secs = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(
    `\n[demo-video] ${videosById.size} video(s) + ${reels.size} reel(s) in ${secs}s\n` +
      `             videos: ${path.relative(process.cwd(), DIRS.final)}\n` +
      `             report: ${path.relative(process.cwd(), reportPath)}`,
  )
  if (failures.length) {
    console.error(`\n[demo-video] ${failures.length} video(s) failed to build:`)
    for (const f of failures) console.error(`  · ${f.test}: ${f.error.split('\n')[0]}`)
    // Non-zero so CI surfaces a broken pipeline, but only AFTER everything that
    // could be built has been.
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[demo-video] fatal:', err.message)
  process.exit(1)
})
