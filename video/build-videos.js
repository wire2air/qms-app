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
import { DIRS, RESERVED_DIRS, slugify, moduleDirs, artifactName } from './config.js'
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

/** Every `artifacts/<module>/logs/` that currently exists. */
function moduleLogDirs() {
  if (!fs.existsSync(DIRS.artifacts)) return []
  return fs
    .readdirSync(DIRS.artifacts, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !RESERVED_DIRS.has(d.name))
    .map((d) => path.join(DIRS.artifacts, d.name, 'logs'))
    .filter((d) => fs.existsSync(d))
}

function loadLogs() {
  return moduleLogDirs()
    .flatMap((dir) =>
      fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json') && f !== 'run-manifest.json')
        .map((f) => {
          try {
            return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
          } catch {
            return null
          }
        }),
    )
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
  const dirs = moduleDirs(test.project)
  const base = artifactName(test)
  // Playwright wipes `test-results/` at the start of every run, so a module that
  // was NOT re-recorded this time has dead source paths in its logs. Its own
  // harvested copy is still sitting in the module folder though — falling back to
  // it is what keeps `artifacts/<module>/` self-contained across runs.
  const copy = (src, destDir, suffix) => {
    const dest = path.join(destDir, `${base}${suffix}`)
    if (!src || !fs.existsSync(src)) return fs.existsSync(dest) ? dest : null
    fs.mkdirSync(destDir, { recursive: true })
    fs.copyFileSync(src, dest)
    return dest
  }

  // A multi-actor journey records one context per actor (author, reviewer,
  // approver). pipeline.js films videos[0], so the busiest recording is put
  // first — byte size is a good enough proxy for "where the journey happened",
  // and it beats defaulting to whichever actor the spec constructed first.
  // Sorted, never filtered: a source path that no longer exists still has to
  // reach `copy`, which is where the fall back to the already-harvested copy
  // lives. Filtering dead paths out here silently skipped every module that was
  // not re-recorded this run.
  const sizeOf = (p) => {
    try {
      return fs.statSync(p).size
    } catch {
      return 0
    }
  }
  const videos = (test.attachments.videos || [])
    .slice()
    .sort((a, b) => sizeOf(b) - sizeOf(a))
    .map((v, i) => copy(v, dirs.videos, `${i ? `-${i}` : ''}.webm`))
    .filter(Boolean)
  const traces = (test.attachments.traces || [])
    .map((t, i) => copy(t, dirs.traces, `${i ? `-${i}` : ''}.zip`))
    .filter(Boolean)
  const screenshots = (test.attachments.screenshots || [])
    .map((s, i) => copy(s, dirs.screenshots, `${i ? `-${i}` : ''}.png`))
    .filter(Boolean)

  return { ...test, attachments: { videos, traces, screenshots } }
}

/**
 * Artifacts a previous run already built for this test, if they survive.
 *
 * Re-running one module must not re-encode the other seven: their MP4s are
 * finished work sitting in their own folders. They are picked up as-is so the
 * combined index still shows the whole suite.
 */
function reuseBuilt(test) {
  const dirs = moduleDirs(test.project)
  const base = artifactName(test)
  const finalPath = path.join(dirs.final, `${base}.mp4`)
  if (!fs.existsSync(finalPath)) return null
  const srtPath = path.join(dirs.subtitles, `${base}.srt`)
  const vttPath = path.join(dirs.subtitles, `${base}.vtt`)
  return {
    finalPath,
    srtPath: fs.existsSync(srtPath) ? srtPath : null,
    vttPath: fs.existsSync(vttPath) ? vttPath : null,
  }
}

async function main() {
  const t0 = Date.now()
  await assertCapabilities()

  let tests = [...loadLogs().values()]
  if (!tests.length) {
    console.error(
      '[demo-video] No logs in artifacts/<module>/logs/. Run the tests first:\n' +
        '            npm run test:video  (or: VIDEO_MODE=1 playwright test -c playwright.video.config.js)',
    )
    process.exit(1)
  }
  if (ONLY_MODULE) tests = tests.filter((t) => t.project === ONLY_MODULE)
  tests.sort((a, b) => a.project.localeCompare(b.project) || a.startedAt.localeCompare(b.startedAt))

  const manifestPath = path.join(DIRS.logs, 'run-manifest.json')
  const runMeta = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    : { environment: tests[0]?.environment || 'Unknown' }

  // Only the modules in the last recording need encoding. Everything else is
  // already-finished work in its own folder, so a single-module run costs one
  // module of ffmpeg rather than the whole suite. A standalone `video:build`
  // reads the same manifest and therefore rebuilds the same set; with no
  // manifest at all there is nothing to narrow by, so everything is rebuilt.
  const fresh = ONLY_MODULE
    ? new Set([ONLY_MODULE])
    : new Set((runMeta.tests || []).map((t) => t.project))
  const rebuildAll = fresh.size === 0

  console.log(
    `[demo-video] building ${tests.length} video(s)` +
      (rebuildAll ? '' : ` — encoding: ${[...fresh].join(', ') || 'none'}`) +
      '…',
  )

  const harvested = tests.map(harvest)
  const videosById = new Map()
  const failures = []
  // A module that was not filmed this run and has nothing built on disk is a
  // leftover log from an interrupted run — real enough to keep the folder, but
  // showing it as a row of empty cards would misreport the suite.
  const orphaned = new Set()

  for (const [i, test] of harvested.entries()) {
    const label = `${i + 1}/${harvested.length} ${test.project} › ${test.title}`

    if (!rebuildAll && !fresh.has(test.project)) {
      const reused = reuseBuilt(test)
      if (reused) {
        videosById.set(test.id, reused)
        console.log(`  ↺ ${label} (reused)`)
      } else {
        orphaned.add(test.id)
      }
      continue
    }

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

  const reported = harvested.filter((t) => !orphaned.has(t.id))
  if (orphaned.size) {
    const mods = [...new Set(harvested.filter((t) => orphaned.has(t.id)).map((t) => t.project))]
    console.log(
      `  – skipped ${orphaned.size} test(s) from ${mods.join(', ')} — logged by an earlier run but never built`,
    )
  }

  const reels = new Map()
  if (MERGE) {
    const byModule = new Map()
    for (const t of reported) {
      if (!byModule.has(t.project)) byModule.set(t.project, [])
      byModule.get(t.project).push(t)
    }
    for (const [mod, list] of byModule) {
      if (list.length < 2) continue // a one-test reel is just the test

      if (!rebuildAll && !fresh.has(mod)) {
        const existing = path.join(moduleDirs(mod).final, `_module-${slugify(mod)}.mp4`)
        if (fs.existsSync(existing)) reels.set(mod, existing)
        continue
      }

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

  const { indexPath, modulePaths } = writeHtmlReport(reported, videosById, reels, runMeta)

  if (!KEEP_WORK) fs.rmSync(DIRS.work, { recursive: true, force: true })

  const secs = ((Date.now() - t0) / 1000).toFixed(1)
  const here = (p) => path.relative(process.cwd(), p)
  console.log(
    `\n[demo-video] ${videosById.size} video(s) + ${reels.size} reel(s) in ${secs}s\n` +
      [...modulePaths]
        .map(([mod, p]) => `             ${mod.padEnd(16)} ${here(p)}`)
        .join('\n') +
      `\n             ${'combined'.padEnd(16)} ${here(indexPath)}`,
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
