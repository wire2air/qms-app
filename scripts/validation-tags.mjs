#!/usr/bin/env node
/**
 * Validation tags — keeps the E2E suite's tags in step with VAL-ARC-001
 * (content/validation/framework/automated-regression-coverage.md), the document
 * that tells a customer which baseline user requirements (URS-*) Qability's own
 * automated suite covers, and with which test.
 *
 * Every test the document cites as evidence carries two kinds of tag:
 *   @validation   — the whole evidence set, run with `npm run test:e2e:validation`
 *   @URS-XXX-NN   — the requirement(s) it evidences, so one requirement's evidence
 *                   runs alone: `npx playwright test --grep @URS-DOC-07`
 *
 *   node scripts/validation-tags.mjs            report what would change (dry run)
 *   node scripts/validation-tags.mjs --write    add the missing tags to the specs
 *   node scripts/validation-tags.mjs --check    exit 1 if the document and the tags disagree
 *
 * A citation is `e2e/<dir>/<file>.spec.js` (or a bare `<file>.spec.js` / `j3`,
 * resolved within the section's module directory) followed by zero or more
 * quoted test titles. A title ending in "…" matches as a prefix. A citation with
 * no quoted title ("— 9 tests") evidences every test in the file.
 *
 * The document's status column is NOT turned into a pass/fail expectation here:
 * "Product non-conformant" rows cite deliberately RED tests, and the document's
 * own "Two opposite test conventions" section is what a reader of a red
 * validation run must consult.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DOC = join(ROOT, 'content/validation/framework/automated-regression-coverage.md')
const E2E = join(ROOT, 'e2e')
const SUITE_TAG = '@validation'
const STATUSES = ['Covered', 'Partial', 'Gap pinned', 'Product non-conformant', 'Not automated']

const mode = process.argv.includes('--write') ? 'write' : process.argv.includes('--check') ? 'check' : 'dry'

function normalize(s) {
  return s
    .replace(/\(FAILS TODAY\)/gi, '')
    .replace(/`/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Every test Playwright can see, deduplicated across projects. */
function listTests() {
  const out = execFileSync('npx', ['playwright', 'test', '--list', '--reporter=json'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const tests = new Map()
  function walk(suite) {
    for (const spec of suite.specs ?? []) {
      const key = `${spec.file}:${spec.line}`
      if (!tests.has(key)) {
        tests.set(key, { file: spec.file, line: spec.line, title: spec.title, tags: new Set(spec.tags ?? []) })
      }
    }
    for (const child of suite.suites ?? []) walk(child)
  }
  for (const suite of JSON.parse(out).suites) walk(suite)
  return [...tests.values()]
}

/** The requirement rows of the document: { id, status, section, evidence }. */
function parseDoc() {
  const rows = []
  let section = ''
  for (const line of readFileSync(DOC, 'utf8').split('\n')) {
    const heading = line.match(/^## (\d+)\. (.+)$/)
    if (heading) section = heading[2].trim()
    const cols = line.startsWith('| URS-') ? line.split('|').map((c) => c.trim()) : null
    if (!cols || !STATUSES.includes(cols[2])) continue
    rows.push({ id: cols[1], status: cols[2], section, evidence: cols[3] })
  }
  return rows
}

/** Split one evidence cell into { fileToken, titles[] } citations. */
function parseCitations(evidence) {
  const citations = []
  const re = /`([^`]+)`/g
  const marks = [...evidence.matchAll(re)].filter((m) => /(\.spec\.js$|^j\d+[a-z]?$)/.test(m[1]))
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : evidence.length
    const tail = evidence.slice(m.index + m[0].length, end)
    const titles = [...tail.matchAll(/"([^"]+)"/g)].map((t) => t[1])
    citations.push({ fileToken: m[1], titles })
  })
  return citations
}

function resolveFile(token, specFiles, sectionDir) {
  if (token.startsWith('e2e/')) {
    const rel = token.slice(4)
    return specFiles.has(rel) ? rel : null
  }
  const base = token.endsWith('.spec.js') ? token : null
  const prefix = base ? null : `${token}-`
  const candidates = [...specFiles].filter((f) => {
    const name = f.split('/').pop()
    return base ? name === base : name.startsWith(prefix)
  })
  if (candidates.length === 1) return candidates[0]
  const inSection = candidates.filter((f) => sectionDir && f.startsWith(`${sectionDir}/`))
  return inSection.length === 1 ? inSection[0] : null
}

function matchTitle(test, cited) {
  return normalize(test.title).includes(normalize(cited.replace(/…$/, '')))
}

function commonPrefix(a, b) {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

/**
 * Tests in `file` evidencing `cited`, most exact rule first:
 *   1. the cited text is (part of) a test title;
 *   2. the cited text is an assertion message inside a test — the document
 *      sometimes quotes the message rather than the title;
 *   3. the cited text shares a long prefix (≥ 40 chars) with exactly one title —
 *      the document abbreviates some long titles.
 */
function findTests(inFile, file, cited) {
  const byTitle = inFile.filter((t) => matchTitle(t, cited))
  if (byTitle.length) return byTitle

  const want = normalize(cited.replace(/…$/, ''))
  const lines = readFileSync(join(E2E, file), 'utf8').split('\n')
  const at = lines.findIndex((l) => normalize(l).includes(want))
  if (at >= 0) {
    const enclosing = inFile.filter((t) => t.line <= at + 1).sort((a, b) => b.line - a.line)[0]
    if (enclosing) return [enclosing]
  }

  const scored = inFile
    .map((t) => ({ t, n: commonPrefix(normalize(t.title), want) }))
    .filter((x) => x.n >= 40)
  return scored.length === 1 ? [scored[0].t] : []
}

/** Build { `file:line` → Set(tags) } and the list of citations that did not resolve. */
function plan(rows, tests) {
  const specFiles = new Set(tests.map((t) => t.file))
  const byFile = new Map()
  for (const t of tests) {
    if (!byFile.has(t.file)) byFile.set(t.file, [])
    byFile.get(t.file).push(t)
  }
  const wanted = new Map()
  const unresolved = []
  const sectionDirs = new Map()

  function want(test, id) {
    const key = `${test.file}:${test.line}`
    if (!wanted.has(key)) wanted.set(key, { test, tags: new Set([SUITE_TAG]) })
    wanted.get(key).tags.add(`@${id}`)
  }

  for (const row of rows) {
    for (const c of parseCitations(row.evidence)) {
      const file = resolveFile(c.fileToken, specFiles, sectionDirs.get(row.section))
      if (!file) {
        unresolved.push(`${row.id}: file \`${c.fileToken}\` not found`)
        continue
      }
      sectionDirs.set(row.section, file.split('/')[0])
      const inFile = byFile.get(file) ?? []
      if (!c.titles.length) {
        inFile.forEach((t) => want(t, row.id))
        continue
      }
      for (const title of c.titles) {
        const hits = findTests(inFile, file, title)
        if (!hits.length) unresolved.push(`${row.id}: "${title}" not found in ${file}`)
        hits.forEach((t) => want(t, row.id))
      }
    }
  }
  return { wanted, unresolved }
}

// ── Source editing ────────────────────────────────────────────────────────────

/** Index just past the string literal that starts at `i` (', " or `). */
function skipString(src, i) {
  const q = src[i]
  let j = i + 1
  while (j < src.length) {
    if (src[j] === '\\') j += 2
    else if (q === '`' && src[j] === '$' && src[j + 1] === '{') {
      let depth = 1
      j += 2
      while (j < src.length && depth) {
        if (src[j] === '{') depth++
        else if (src[j] === '}') depth--
        j++
      }
    } else if (src[j] === q) return j + 1
    else j++
  }
  return -1
}

function formatTags(tags) {
  return tags.length === 1 ? `'${tags[0]}'` : `[${tags.map((t) => `'${t}'`).join(', ')}]`
}

/**
 * Add `tags` to the test( call on `line` (1-based). Returns the new source, or
 * null with a reason when the call shape is not one this edits safely.
 */
function addTags(src, line, tags) {
  const lineStart = src.split('\n').slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0)
  const call = /\btest(?:\.(?:only|skip|fixme|fail))?\(\s*/g
  call.lastIndex = lineStart
  const m = call.exec(src)
  if (!m) return { error: 'no test( call on that line' }
  const titleStart = m.index + m[0].length
  if (!`'"\``.includes(src[titleStart])) return { error: 'title is not a string literal' }
  const titleEnd = skipString(src, titleStart)
  const afterTitle = src.slice(titleEnd).match(/^\s*,\s*/)
  if (!afterTitle) return { error: 'unexpected call shape after the title' }
  const argStart = titleEnd + afterTitle[0].length

  const existing = src.slice(argStart).match(/^\{\s*tag:\s*('[^']*'|\[[^\]]*\])\s*\}/)
  if (existing) {
    const have = [...existing[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
    const merged = [...have, ...tags.filter((t) => !have.includes(t))]
    return { src: src.slice(0, argStart) + `{ tag: ${formatTags(merged)} }` + src.slice(argStart + existing[0].length) }
  }
  if (src[argStart] === '{' && !/^\{\s*\}/.test(src.slice(argStart)) && /^\{[^}]*\btag\b/.test(src.slice(argStart))) {
    return { error: 'existing tag option is not a plain string or array' }
  }
  if (src[argStart] === '{' && !/^\{\s*(browser|page|context|request|playwright)\b/.test(src.slice(argStart))) {
    return { error: 'test already has a details object without a tag' }
  }
  return { src: src.slice(0, argStart) + `{ tag: ${formatTags(tags)} }, ` + src.slice(argStart) }
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const rows = parseDoc()
  const tests = listTests()
  const { wanted, unresolved } = plan(rows, tests)

  const missing = []
  for (const { test, tags } of wanted.values()) {
    const need = [...tags].filter((t) => !test.tags.has(t.slice(1)))
    if (need.length) missing.push({ test, need })
  }
  const wantedKeys = new Set(wanted.keys())
  const stale = tests.filter(
    (t) =>
      !wantedKeys.has(`${t.file}:${t.line}`) &&
      [...t.tags].some((tag) => tag === 'validation' || tag.startsWith('URS-')),
  )

  const cited = new Set(rows.flatMap((r) => (parseCitations(r.evidence).length ? [r.id] : [])))
  console.info(
    `VAL-ARC-001: ${rows.length} requirements, ${cited.size} with automated evidence → ${wanted.size} tests.`,
  )
  for (const u of unresolved) console.warn(`  unresolved  ${u}`)
  for (const s of stale) console.warn(`  stale tag   e2e/${s.file}:${s.line} is tagged but no longer cited`)

  if (mode === 'check') {
    for (const { test, need } of missing) console.error(`  missing     e2e/${test.file}:${test.line} needs ${need.join(' ')}`)
    const bad = missing.length + unresolved.length + stale.length
    if (bad) {
      console.error(`${bad} problem(s). Run \`node scripts/validation-tags.mjs --write\` and fix the unresolved citations.`)
      process.exit(1)
    }
    console.info('Tags agree with the document.')
    return
  }

  const byFile = new Map()
  for (const item of missing) {
    if (!byFile.has(item.test.file)) byFile.set(item.test.file, [])
    byFile.get(item.test.file).push(item)
  }
  let edited = 0
  const failed = []
  for (const [file, items] of byFile) {
    const path = join(E2E, file)
    let src = readFileSync(path, 'utf8')
    // Bottom-up, so an edit never shifts a line still to be edited.
    for (const { test, need } of items.sort((a, b) => b.test.line - a.test.line)) {
      const res = addTags(src, test.line, need)
      if (res.error) failed.push(`e2e/${file}:${test.line} — ${res.error}`)
      else {
        src = res.src
        edited++
      }
    }
    if (mode === 'write') writeFileSync(path, src)
  }
  console.info(`${mode === 'write' ? 'Tagged' : 'Would tag'} ${edited} test(s) in ${byFile.size} file(s).`)
  for (const f of failed) console.warn(`  not edited  ${f}`)
}

main()
