// QC finding #1 (client half) — the inspection-lot lifecycle is server-owned.
//
// `inspection_lots` was the last reviewed module whose lifecycle column had no
// client-side lock: every peer (`capa`, `nonconformance`, `changeRequest`,
// `auditInstance`, `auditFinding`, `complaint`, `customerComplaint`,
// `documentVersion`, `qualityEvent`) already marks `statusId`
// `excludeFromGraphQL: ['update']`, and the lot model did not.
//
// The 2026-08-28 unification (`20260828190000-unify-inspection-lot-statuses`)
// split the one overloaded column into two lifecycle-bearing ones, so the lock
// has to cover BOTH:
//
//     statusId         DRAFT / OPEN / CLOSED / CANCELLED
//     inspectionPhase  PENDING → IN_PROGRESS → COMPLETED → UNDER_REVIEW →
//                      DISPOSED, or HOLD
//
// Three layers carry the invariant and this file asserts the two that live in
// the client. The third — the `enforce_inspection_lot_lifecycle` trigger, which
// is the only one a hand-rolled GraphQL mutation cannot route around — is
// asserted in `e2e/qcInspection/j8-lot-lifecycle-lock.spec.js` against a real
// `app_user` session.
//
//   1. MECHANISM — `computeUpdatePatch` (the function directSaveStrategy calls
//      to build every update mutation's `patch`) drops excluded fields. Proved
//      against the real syncEngine, through a synthetic model, so this is a
//      test of the machinery rather than of a string.
//   2. DECLARATION — `models/inspectionLot.js` actually uses it, on both
//      columns, plus a UI scan so a status/phase picker cannot come back.
//
// Both declaration checks are SOURCE SCANS on purpose. `models/*.js` use the
// legacy `@ClientModel`/`@Property` decorators, which need vite-plugin-babel;
// the lighter vitest config deliberately does not load it, so the classes
// cannot be imported here. This is the same constraint (and the same remedy)
// as `workflowClientModelsParanoid.spec.js`.
import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ModelRegistry from '@syncEngine/core/ModelRegistry.js'
import { computeUpdatePatch, serializeModel } from '@syncEngine/persistence/hydration.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const LOT_MODEL = path.join(ROOT, 'models/inspectionLot.js')
const QC_COMPONENTS = path.join(ROOT, 'src/components/qcInspection')

// The two columns under lock, as they are spelled in the client model.
const LOCKED = ['statusId', 'inspectionPhase']

describe('the update patch cannot carry an excluded field (the mechanism)', () => {
  const MODEL = '__LifecycleLockProbe'

  afterEach(() => {
    delete ModelRegistry.schemas[MODEL]
    delete ModelRegistry.modelLookup[MODEL]
  })

  function register() {
    ModelRegistry.register(
      MODEL,
      class Probe {},
      [
        { name: 'id', type: 'String', options: { type: String } },
        { name: 'notes', type: 'String', options: { type: String } },
        { name: 'statusId', type: 'String', options: { type: String, excludeFromGraphQL: ['update'] } },
        {
          name: 'inspectionPhase',
          type: 'String',
          options: { type: String, excludeFromGraphQL: ['update'] },
        },
      ],
      undefined,
      1,
      [],
      'id',
    )
  }

  it('drops the locked fields from the patch while keeping a real edit', () => {
    register()
    const previous = { id: 'lot-1', notes: 'before', statusId: 'OPEN', inspectionPhase: 'PENDING' }
    // Everything changed, including both lifecycle columns — the exact shape a
    // compromised or careless caller would produce.
    const instance = { id: 'lot-1', notes: 'after', statusId: 'CLOSED', inspectionPhase: 'DISPOSED' }

    const patch = computeUpdatePatch(MODEL, instance, previous)

    expect(patch).toEqual({ notes: 'after' })
    for (const field of LOCKED) {
      expect(patch, `${field} must never reach the update mutation`).not.toHaveProperty(field)
    }
  })

  it('a lifecycle-only edit produces an EMPTY patch, so no mutation is sent at all', () => {
    // directSaveStrategy returns early on an empty patch (`if
    // (Object.keys(patch).length === 0) return`). So a UI control bound
    // straight to `lot.statusId` would not fail loudly — it would do nothing
    // and leave the in-memory instance disagreeing with the row until the next
    // hydrate. That is why the lock is paired with "no such control exists"
    // below, and with a DB trigger for the paths neither reaches.
    register()
    const previous = { id: 'lot-1', notes: 'same', statusId: 'OPEN', inspectionPhase: 'PENDING' }
    const instance = { id: 'lot-1', notes: 'same', statusId: 'CLOSED', inspectionPhase: 'DISPOSED' }

    expect(computeUpdatePatch(MODEL, instance, previous)).toEqual({})
  })

  it('the CREATE path still carries them — a lot is born with a status', () => {
    // `excludeFromGraphQL: ['update']`, not `['create', 'update']`: the server
    // mints the lot (POST /lots writes OPEN/PENDING) but the model must still
    // be able to serialize a complete record, and the DB trigger's INSERT
    // branch — not the client — is what refuses a lot born already CLOSED.
    register()
    const instance = { id: 'lot-1', notes: 'n', statusId: 'OPEN', inspectionPhase: 'PENDING' }

    const created = serializeModel(MODEL, instance, 'create')
    expect(created.statusId).toBe('OPEN')
    expect(created.inspectionPhase).toBe('PENDING')

    const updated = serializeModel(MODEL, instance, 'update')
    expect(updated).not.toHaveProperty('statusId')
    expect(updated).not.toHaveProperty('inspectionPhase')
  })
})

describe('models/inspectionLot.js declares the lock', () => {
  const source = readFileSync(LOT_MODEL, 'utf8')

  it.each(LOCKED)('%s is excluded from the update mutation', (field) => {
    // Matches the @Property options block that ends in this field's
    // declaration, so a stray `excludeFromGraphQL` on a neighbouring property
    // cannot satisfy it.
    const declaration = new RegExp(
      String.raw`@Property\(\{[^}]*excludeFromGraphQL:\s*\[[^\]]*'update'[^\]]*\][^}]*\}\)\s*${field}\s*=`,
    )
    expect(
      declaration.test(source),
      `models/inspectionLot.js must declare ${field} with excludeFromGraphQL: ['update'] — ` +
        `without it the generated updateInspectionLot mutation can carry the lifecycle.`,
    ).toBe(true)
  })

  it('the scan is looking at the real model', () => {
    // Guards against a rename turning both assertions above into vacuous passes.
    expect(source).toMatch(/@ClientModel\('inspectionLots'/)
    expect(source).toMatch(/class InspectionLot extends BaseModel/)
  })
})

describe('no QC control writes the lot lifecycle', () => {
  function qcSources() {
    return readdirSync(QC_COMPONENTS)
      .filter((name) => name.endsWith('.vue') || (name.endsWith('.js') && !name.endsWith('.spec.js')))
      .map((name) => ({ name, source: readFileSync(path.join(QC_COMPONENTS, name), 'utf8') }))
  }

  it('the scan actually sees the QC component directory', () => {
    const files = qcSources()
    expect(files.length).toBeGreaterThan(30)
    expect(files.map((f) => f.name)).toContain('InspectionLotDetail.vue')
  })

  it.each(LOCKED)('nothing v-models %s', (field) => {
    // The Quality Events exploit (F-02) was exactly this: a `<QualityEventStatusSelectMenu
    // v-model="event.statusId">` behind a 600 ms debounced autosave, offered to
    // every `:update` holder. Reading the field is fine and pervasive — badges,
    // list pills and every action gate in inspectionLotDetailConfig.js read it.
    // Two-way binding it is the thing that must never appear.
    const bound = new RegExp(String.raw`v-model(?::[\w.-]+)?\s*=\s*"[^"]*\b${field}\b`)
    const offenders = qcSources()
      .filter((f) => bound.test(f.source))
      .map((f) => `  src/components/qcInspection/${f.name}`)

    expect(
      offenders,
      `A QC control two-way-binds ${field}. The lot lifecycle moves only through the ` +
        `server endpoints (start / complete / submit / reopen / check-in / check-out) ` +
        `and the disposition workflow:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('nothing assigns either column on a lot instance', () => {
    // The other half of the same risk: a plain `lot.statusId = 'CLOSED'` ahead
    // of a save. With the lock in place that write is silently dropped from the
    // patch rather than refused, so it has to be caught here.
    const assign = new RegExp(String.raw`\b\w+\.(?:${LOCKED.join('|')})\s*=(?!=)`)
    const offenders = qcSources()
      .filter((f) => assign.test(f.source))
      .map((f) => `  src/components/qcInspection/${f.name}`)

    expect(offenders, `Direct lifecycle assignment in:\n${offenders.join('\n')}`).toEqual([])
  })
})
