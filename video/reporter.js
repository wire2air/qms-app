/**
 * Playwright reporter that harvests everything the video pipeline needs and
 * writes one JSON log per test into artifacts/logs/.
 *
 * THE KEY IDEA. This suite has 62 spec files and not one of them calls
 * `test.step()`. A pipeline that narrates only `test.step` would render blank
 * videos here. But Playwright already builds a full step tree for every run:
 * each action is a `pw:api` step ("locator.click", "page.goto") and each
 * assertion is an `expect` step. `onStepBegin`/`onStepEnd` receive all of them.
 *
 * So narration is derived from the step tree the runner produces anyway, and
 * works today with zero edits to any spec. When someone does add `test.step()`,
 * those titles are strictly better and take priority — the video improves on its
 * own. See STEPS.categories in video/config.js.
 *
 * Also collected here, because the reporter is the only place that sees them:
 * the video/trace/screenshot attachment paths Playwright writes per test.
 */
import fs from 'node:fs'
import path from 'node:path'
import { DIRS, STEPS, ENVIRONMENT, slugify } from './config.js'

/**
 * Turn a Playwright step title into a caption a non-engineer can read.
 *
 * Playwright 1.6x already emits half-friendly titles — `Navigate to "/sites"`,
 * `Click getByPlaceholder('e.g. NY-HQ')`, `Expect "toBeVisible" getByRole('cell',
 * { name: 'Foo' })`. The verb is fine; what ruins them on screen is the raw
 * locator expression trailing behind it. So the job here is to pull the HUMAN
 * part out of the locator (its name/placeholder/text) and drop the syntax.
 *
 * (An earlier version parsed `locator.click(...)` style titles, which is what
 * older Playwright produced. It silently did nothing on 1.61 and shipped the
 * locator source straight to the caption.)
 */

/** `getByRole('cell', { name: 'Foo' })` → `Foo`; `getByText('Bar')` → `Bar`. */
function locatorLabel(expr) {
  if (!expr) return ''
  let s = String(expr).trim()

  // Prefer an explicit accessible name / placeholder / label.
  const named = s.match(/\bname:\s*(['"`])(.+?)\1/) || s.match(/\b(?:getBy(?:Placeholder|Text|Label|TestId|Title|AltText))\((['"`])(.+?)\2/)
  if (named) return named[2]

  // Fall back to the first quoted string anywhere in the expression — but a
  // quoted CSS selector is still a selector. `locator('[id="v-10-listbox"]')`
  // put `[id="v-10-listbox"]` on screen until this branch learned to check too.
  const quoted = s.match(/(['"`])(.+?)\1/)
  if (quoted) return isSelectorish(quoted[2]) ? '' : quoted[2]

  // Nothing human to show. A raw CSS/XPath selector on screen ("[id=\"v-14-listbox\"]")
  // is noise to the audience this video is for, so it is described by shape
  // rather than quoted verbatim.
  const bare = s.replace(/\.(first|last|nth)\(\d*\)/g, '').replace(/^\w+\(|\)$/g, '')
  return isSelectorish(bare) ? '' : bare
}

/** Does this read as machine syntax rather than something a person would say? */
function isSelectorish(s) {
  return /^[[.#]/.test(s) || /[[\]{}=>~]|::/.test(s) || /^\/\//.test(s)
}

const MATCHER_WORDS = {
  toPass: 'settles',
  toBeVisible: 'is visible',
  toBeHidden: 'is hidden',
  toBeEnabled: 'is enabled',
  toBeDisabled: 'is disabled',
  toBeChecked: 'is checked',
  toBeEmpty: 'is empty',
  toBeFocused: 'has focus',
  toHaveText: 'has the expected text',
  toContainText: 'contains the expected text',
  toHaveValue: 'has the expected value',
  toHaveCount: 'has the expected count',
  toHaveURL: 'is on the expected URL',
  toHaveTitle: 'has the expected title',
  toHaveAttribute: 'has the expected attribute',
  toBe: 'matches',
  toEqual: 'equals',
  toContain: 'contains',
}

function humanise(title, category) {
  const t = String(title || '').trim()

  if (category === 'expect') {
    // Expect "toBeVisible" getByRole('cell', { name: 'Foo' })
    const m = t.match(/^Expect\s+"([\w.]+)"\s*(.*)$/s)
    if (m) {
      const raw = m[1]
      const negated = /\bnot\b/i.test(raw)
      const key = raw.replace(/^not\./, '')
      const phrase = MATCHER_WORDS[key] || key.replace(/([A-Z])/g, ' $1').toLowerCase().trim()
      const label = locatorLabel(m[2])
      const subject = label ? `“${label}”` : 'the page'
      return `Verify ${subject} ${negated ? 'is not ' : ''}${phrase}`.replace(/\s+/g, ' ')
    }
    return t
  }

  if (category === 'pw:api') {
    // Navigate to "/sites"  → keep as-is, it is already a sentence.
    if (/^Navigate to/i.test(t)) return t.replace(/"/g, '')

    // Click|Fill|Press|… <locator expression>
    const m = t.match(/^([A-Z][\w-]*(?:\s[a-z]+)?)\s+(.*)$/s)
    if (m) {
      const label = locatorLabel(m[2])
      return label ? `${m[1]} “${label}”` : m[1]  // verb alone when the target is a raw selector
    }
    return t
  }

  return t
}

/** Walk the (possibly nested) step tree into a flat, ordered list. */
function flatten(steps, depth = 0, out = []) {
  for (const s of steps || []) {
    out.push({ step: s, depth })
    if (depth < STEPS.maxDepth) flatten(s.steps, depth + 1, out)
  }
  return out
}

export default class DemoVideoReporter {
  constructor(options = {}) {
    this.options = options
    this.tests = []
    this.startedAt = Date.now()
  }

  onBegin(config, suite) {
    fs.mkdirSync(DIRS.logs, { recursive: true })
    this.config = config
    this.totalTests = suite.allTests().length
    // A run-level manifest so build-videos.js can work without re-parsing
    // Playwright's own report.
    this.runMeta = {
      startedAt: new Date().toISOString(),
      environment: ENVIRONMENT,
      totalTests: this.totalTests,
      ci: !!process.env.CI,
    }
  }

  onTestBegin(test, result) {
    result[Symbol.for('qa.steps')] = []
  }

  onStepBegin(test, result, step) {
    if (!STEPS.categories.includes(step.category)) return
    // startTime is a Date; keep the raw ms so the pipeline can align to video t0.
    step[Symbol.for('qa.begin')] = step.startTime?.getTime?.() ?? Date.now()
  }

  onStepEnd() {
    // Nothing to do — the full tree with durations is on `result.steps` at
    // onTestEnd, and reading it there avoids double-counting retried steps.
  }

  onTestEnd(test, result) {
    const meta = this._readDemoMeta(result)
    const testStartMs = result.startTime.getTime()
    // Fall back to the test start if the fixture did not run (VIDEO_MODE off, or
    // a spec that has not been instrumented). Steps are then relative to the
    // test rather than the video, which is off by only a few ms in practice.
    const t0 = meta?.videoStartMs ?? testStartMs

    const steps = this._collectSteps(result, t0)
    const attachments = this._collectAttachments(result)

    const projectName = test.parent.project()?.name || 'unknown'
    const titlePath = test.titlePath().filter(Boolean)
    // titlePath is [rootSuite, file, describe..., test]; drop the root + file.
    const describePath = titlePath.slice(2, -1)

    const record = {
      id: `${projectName}--${slugify(test.title)}--${result.retry}`,
      title: test.title,
      describePath,
      fullTitle: [...describePath, test.title].join(' › '),
      file: path.relative(process.cwd(), test.location.file),
      line: test.location.line,
      project: projectName,
      browser: meta?.browserName || this._browserFor(test),
      channel: meta?.channel || test.parent.project()?.use?.channel || null,
      viewport: meta?.viewport || null,
      environment: ENVIRONMENT,
      status: result.status,
      expectedStatus: test.expectedStatus,
      // A test written to fail against a known defect is "expected: failed";
      // surfacing that keeps the video honest instead of showing a scary ❌ on
      // something that is behaving as designed.
      isExpected: result.status === test.expectedStatus,
      retry: result.retry,
      durationMs: result.duration,
      startedAt: result.startTime.toISOString(),
      videoStartMs: t0,
      testStartMs,
      error: result.error
        ? {
            message: stripAnsi(result.error.message || ''),
            snippet: stripAnsi(result.error.snippet || ''),
          }
        : null,
      steps,
      attachments,
    }

    this.tests.push(record)
    fs.writeFileSync(
      path.join(DIRS.logs, `${record.id}.json`),
      JSON.stringify(record, null, 2),
      'utf8',
    )
  }

  _browserFor(test) {
    const use = test.parent.project()?.use || {}
    return use.defaultBrowserType || use.browserName || 'chromium'
  }

  _readDemoMeta(result) {
    const a = result.attachments.find((x) => x.name === 'qa-demo-meta')
    if (!a) return null
    try {
      const raw = a.body ? a.body.toString('utf8') : fs.readFileSync(a.path, 'utf8')
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  _collectSteps(result, t0) {
    const flat = flatten(result.steps)
      .filter(({ step }) => STEPS.categories.includes(step.category))
      .map(({ step, depth }) => {
        const begin = step.startTime.getTime()
        return {
          title: humanise(step.title, step.category),
          rawTitle: step.title,
          category: step.category,
          depth,
          startMs: Math.max(0, begin - t0),
          durationMs: Math.max(0, step.duration),
          status: step.error ? 'failed' : 'passed',
          error: step.error ? stripAnsi(step.error.message || '') : null,
        }
      })
      .sort((a, b) => a.startMs - b.startMs)

    // `test.step` titles are authored prose and always beat generated ones. If a
    // test uses them at all, drop the machine-generated siblings so the narration
    // reads as the author intended rather than interleaving both.
    const authored = flat.filter((s) => s.category === 'test.step')
    const chosen = authored.length ? authored : flat

    return this._coalesce(chosen).slice(0, STEPS.maxSteps)
  }

  /**
   * Fold sub-threshold steps into their predecessor.
   *
   * Without this a burst of 40ms locator resolutions produces an overlay that
   * changes faster than it can be read — the video looks broken rather than
   * informative. The merged step keeps the FIRST title (the one that started the
   * visible action) and absorbs the elapsed time.
   */
  _coalesce(steps) {
    const out = []
    for (const s of steps) {
      const prev = out[out.length - 1]
      if (prev && s.durationMs < STEPS.minDurationMs && prev.status !== 'failed') {
        prev.durationMs = Math.max(prev.durationMs, s.startMs + s.durationMs - prev.startMs)
        prev.mergedCount = (prev.mergedCount || 1) + 1
        if (s.status === 'failed') {
          prev.status = 'failed'
          prev.error = s.error
          prev.title = s.title
        }
        continue
      }
      out.push({ ...s })
    }
    return out
  }

  _collectAttachments(result) {
    const pick = (pred) => result.attachments.filter(pred).map((a) => a.path).filter(Boolean)
    return {
      videos: pick((a) => a.contentType === 'video/webm' || a.name === 'video'),
      traces: pick((a) => a.name === 'trace'),
      screenshots: pick((a) => a.contentType?.startsWith('image/') && a.name !== 'qa-demo-meta'),
    }
  }

  async onEnd(result) {
    const manifest = {
      ...this.runMeta,
      finishedAt: new Date().toISOString(),
      status: result.status,
      durationMs: Date.now() - this.startedAt,
      counts: this.tests.reduce(
        (acc, t) => ({ ...acc, [t.status]: (acc[t.status] || 0) + 1 }),
        {},
      ),
      tests: this.tests.map((t) => ({
        id: t.id,
        title: t.title,
        project: t.project,
        status: t.status,
        isExpected: t.isExpected,
        durationMs: t.durationMs,
        steps: t.steps.length,
      })),
    }
    fs.writeFileSync(
      path.join(DIRS.logs, 'run-manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8',
    )
    // eslint-disable-next-line no-console
    console.log(
      `\n[demo-video] captured ${this.tests.length} test log(s) → ${path.relative(process.cwd(), DIRS.logs)}`,
    )
  }
}

function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return String(s).replace(/\[[0-9;]*m/g, '')
}
