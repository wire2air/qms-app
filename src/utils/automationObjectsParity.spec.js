/**
 * The automation object registry exists twice and must not drift.
 *
 *   src/utils/automationObjects.js                        the rule builder's pickers
 *   backend/worker/services/automation/objectRegistry.js  what actually evaluates
 *
 * The frontend copy's own header says "keep the field keys in sync with the
 * worker registry — the worker reads row[key] off the audit payload". A comment
 * is not a mechanism: an object offered in the builder but absent from the
 * worker produces rules that silently never fire, and a field key that exists
 * only on one side produces a condition that never matches. Both fail quietly,
 * which is the worst way for an automation rule to fail.
 *
 * They cannot share an import — one runs in the browser, the other in the
 * worker, and the worker entry carries table/column plumbing the browser has no
 * use for. So: duplicated deliberately, pinned here.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AUTOMATION_OBJECTS } from './automationObjects.js'

/** Pull the worker registry's shape out of its source. */
function workerRegistry() {
  const src = readFileSync(
    join(process.cwd(), '../qms/backend/worker/services/automation/objectRegistry.js'),
    'utf8',
  )
  // Top-level object keys: two-space indent, then `Name: {`.
  const objects = [...src.matchAll(/^ {2}(\w+): \{$/gm)].map((m) => m[1])
  // Field keys per object, in source order, so they can be sliced per block.
  const fieldsByObject = {}
  for (const name of objects) {
    const start = src.indexOf(`  ${name}: {`)
    const nextStarts = objects
      .map((o) => src.indexOf(`  ${o}: {`))
      .filter((i) => i > start)
    const end = nextStarts.length ? Math.min(...nextStarts) : src.length
    const block = src.slice(start, end)
    // `\bkey:` rather than `{ key:` — prettier wraps long field entries across
    // lines, and matching the opening brace made a pure formatting change look
    // like real drift. The registry uses `key:` only in field definitions.
    fieldsByObject[name] = [...block.matchAll(/\bkey: '([^']+)'/g)].map((m) => m[1])
  }
  return { objects, fieldsByObject }
}

const worker = workerRegistry()

describe('automation object registry parity', () => {
  it('found both registries', () => {
    expect(AUTOMATION_OBJECTS.length).toBeGreaterThan(0)
    expect(worker.objects.length).toBeGreaterThan(0)
  })

  it('every object the builder offers exists in the worker', () => {
    // The direction that matters most: an object here but not there means a
    // rule the user can create and the engine will never evaluate.
    const missing = AUTOMATION_OBJECTS.map((o) => o.value).filter(
      (v) => !worker.objects.includes(v),
    )
    expect(missing, `offered in the builder, unknown to the worker: ${missing}`).toEqual([])
  })

  it('every field key the builder offers exists on the worker object', () => {
    const problems = []
    for (const obj of AUTOMATION_OBJECTS) {
      const theirs = worker.fieldsByObject[obj.value] ?? []
      for (const f of obj.fields) {
        if (!theirs.includes(f.key)) problems.push(`${obj.value}.${f.key}`)
      }
    }
    expect(problems, `field keys the worker cannot read: ${problems}`).toEqual([])
  })

  it('covers the two objects added 2026-08-19', () => {
    // "Notify QA when a QC lot is rejected" was inexpressible before these.
    for (const v of ['InspectionLot', 'AuditInstance']) {
      expect(AUTOMATION_OBJECTS.map((o) => o.value)).toContain(v)
      expect(worker.objects).toContain(v)
    }
  })
})
