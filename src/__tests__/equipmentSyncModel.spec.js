// Equipment — the SyncEngine model contract.
//
// The register is a live query over IndexedDB. Nothing on the page ever calls
// the API to read an instrument: `models/equipment.js` decides which columns the
// syncEngine asks PostGraphile for, and a column that is not a `@Property` is
// simply absent from the generated query. The failure mode is therefore SILENT
// — the column renders "—" forever, no error is logged, and the row in Postgres
// is perfectly correct — which is why this file exists and why every assertion
// in it is about a declaration rather than a behaviour.
//
// Source-scanned, not imported: `models/*.js` use legacy decorators that need
// vite-plugin-babel, which the lighter vitest config deliberately does not load
// (same reason and same technique as workflowClientModelsParanoid.spec.js).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_MODEL = readFileSync(path.resolve(HERE, '../../models/equipment.js'), 'utf8')
const BACKEND_MODEL = readFileSync(
  path.resolve(HERE, '../../../qms/backend/shared/models/equipment.js'),
  'utf8',
)

/** `@Property({ type: X, … }) name = …` → Map<name, type>. */
function clientProperties(source) {
  const out = new Map()
  const re = /@Property\(\{([^}]*)\}\)\s*([A-Za-z0-9_]+)\s*=/g
  let m
  while ((m = re.exec(source))) {
    const type = /type:\s*([A-Za-z]+)/.exec(m[1])?.[1] ?? null
    out.set(m[2], type)
  }
  return out
}

/** `fieldName: { type: DataTypes.X … }` inside Equipment.init's attribute block. */
function backendAttributes(source) {
  const start = source.indexOf('Equipment.init(')
  const end = source.indexOf('modelName:', start)
  const block = source.slice(start, end)
  const out = new Set()
  const re = /^\s{6}([A-Za-z][A-Za-z0-9_]*):\s*\{/gm
  let m
  while ((m = re.exec(block))) out.add(m[1])
  return out
}

const props = clientProperties(CLIENT_MODEL)

describe('Equipment client model — the collection name', () => {
  it('bootstraps against the PLURAL collection, `equipments`', () => {
    // "equipment" is uncountable, so pg-simplify-inflection's distinctPluralize
    // rule emits `equipments` for the collection while the single-row query
    // stays `equipment(id:)`. Pointing @ClientModel at the singular resolves to
    // the single-row field and the bootstrap dies with "Unknown argument filter
    // / first / orderBy" — i.e. the register is empty for every user, on every
    // page load, with the failure buried in a bootstrap that runs in the
    // background. There is no runtime assertion anywhere that would catch it.
    expect(CLIENT_MODEL).toMatch(/@ClientModel\(\s*'equipments'/)
  })

  it('delta-syncs on updatedAt', () => {
    // The watermark. On `createdAt`, every EDIT to an existing instrument —
    // including a recorded calibration moving next_calibration_due — would sit
    // below the watermark and never be re-fetched on the next bootstrap.
    expect(CLIENT_MODEL).toMatch(/syncField:\s*'updatedAt'/)
  })

  it('is paranoid and declares deletedAt (F-24 invariant)', () => {
    // The register's delete is `row.delete()` — BaseModel picks the soft-delete
    // branch only when `paranoid` is set, and `equipment` is a paranoid table
    // server-side. Without this pair the button would issue a HARD delete of a
    // calibration record over GraphQL.
    expect(CLIENT_MODEL).toMatch(/static\s+paranoid\s*=\s*true/)
    expect(props.has('deletedAt')).toBe(true)
  })
})

describe('Equipment client model — the calibration programme is fully declared', () => {
  // Everything the register's calibration surface, the QC gate banner and the
  // edit dialog read. Each of these is invisible-when-missing.
  const REQUIRED = [
    'code',
    'name',
    'serialNumber',
    'category',
    'siteId',
    'departmentId',
    'supplierId',
    'ownerUserId',
    'statusId',
    'retiredAt',
    'requiresCalibration',
    'calibrationInterval',
    'calibrationIntervalUnit',
    'lastCalibratedAt',
    'nextCalibrationDue',
    'requiresPm',
    'pmInterval',
    'pmIntervalUnit',
    'lastPmAt',
    'nextPmDue',
  ]

  it.each(REQUIRED)('declares %s', (name) => {
    expect(props.has(name)).toBe(true)
  })

  it('supplierId is declared — the field the UI can now set', () => {
    // It was declared here, in UPDATABLE_FIELDS, and in both of the dialog's
    // payload builders long before any control rendered it. Keeping the
    // assertion means the round trip stays intact now that one does.
    expect(props.get('supplierId')).toBe('String')
  })

  it('every date the UI calls DateTime methods on is DateTime-typed', () => {
    // Not cosmetic. InspectionLotDetail's `calibrationBlocked` computes
    // `due.toMillis() < Date.now()` with NO guard, so a String-typed
    // nextCalibrationDue would throw inside a computed and blank the whole QC
    // lot page — the register's own dueClass() happens to accept both, which
    // would make the breakage look module-specific.
    expect(props.get('nextCalibrationDue')).toBe('DateTime')
    expect(props.get('lastCalibratedAt')).toBe('DateTime')
    expect(props.get('nextPmDue')).toBe('DateTime')
    expect(props.get('lastPmAt')).toBe('DateTime')
    expect(props.get('retiredAt')).toBe('DateTime')
    expect(props.get('installedAt')).toBe('DateTime')
  })

  it('the four evidence columns are excluded from the create AND update mutations', () => {
    // Migration 20260911150000 attaches a SECURITY INVOKER trigger that refuses
    // any CHANGE to these on the `app_user` connection — which is the connection
    // the edit dialog's SyncEngine save runs on. Leaving them writable client-side
    // makes the failure a runtime 400 on an ordinary "rename this instrument"
    // edit; excluding them makes it unreachable.
    //
    // `lastCalibrationVendorId` is the sharpest of the four: it is a uuid column,
    // and the SyncEngine's known write-path trap is `''` reaching one.
    for (const field of [
      'lastCalibrationCertificateNumber',
      'lastCalibrationCertificateUrl',
      'lastCalibrationVendorId',
      'lastCalibrationVendorName',
    ]) {
      const decl = new RegExp(
        `@Property\\(\\{[^}]*excludeFromGraphQL:\\s*\\['create',\\s*'update'\\][^}]*\\}\\)\\s*\\n?\\s*${field}\\b`,
      )
      expect(CLIENT_MODEL, `${field} must be client-read-only`).toMatch(decl)
    }
  })

  it('statusId is NOT excluded from update — the dialog IS the status editor', () => {
    // Recorded as a decision, because the obvious "consistency with capa.js /
    // nonconformance.js" edit would break the product. Those two models exclude
    // `statusId` because their lifecycle moves through workflow actions, never
    // through a field edit. Equipment has no workflow: `CreateEquipmentDialog`'s
    // <select> is the ONLY way an instrument is taken out of service or retired,
    // and it persists over GraphQL. Excluding it would silently make every status
    // change a no-op — including the RETIRED transition EQ-J1 asserts.
    //
    // The real risk that exclusion would have covered is closed at the database
    // instead: `equipment_status_id_chk` plus the transition trigger
    // (20260911130000) apply on every path, GraphQL included.
    expect(CLIENT_MODEL).toMatch(/@Property\(\{ type: String \}\) statusId = 'IN_SERVICE'/)
  })

  it('the flags are Boolean, because the quick actions are gated on them', () => {
    // `v-if="canUpdate && row.requiresCalibration"`. A String 'false' is truthy,
    // so the "Record calibration" action would appear on every instrument in
    // the register including the deliberately-uncontrolled ones.
    expect(props.get('requiresCalibration')).toBe('Boolean')
    expect(props.get('requiresPm')).toBe('Boolean')
  })
})

describe('Equipment client model — parity with the server model', () => {
  // Fields the server owns that the browser deliberately does not sync.
  // Anything else new on the server has to be added to the client model or to
  // this list, consciously.
  const NOT_SYNCED = new Set([
    'id', // declared on both, listed here only because the regexes differ
  ])

  it('every server attribute is either a client @Property or an explicit exclusion', () => {
    const server = backendAttributes(BACKEND_MODEL)
    expect(server.size, 'the backend model parsed').toBeGreaterThan(20)

    const missing = [...server].filter((f) => !props.has(f) && !NOT_SYNCED.has(f))
    expect(
      missing,
      'a column that exists server-side but is not a @Property here is fetched by nothing, ' +
        'renders as "—" forever and logs no error. Add it to models/equipment.js, or add it ' +
        'to NOT_SYNCED above with a reason.',
    ).toEqual([])
  })

  it('the status enum the dialog offers is the enum the server accepts', () => {
    // The dialog hard-codes three <option>s; the server's STATUSES check and
    // this frozen map are the other two copies of the same list.
    const statuses = /static Status = Object\.freeze\(\{([^}]*)\}\)/.exec(BACKEND_MODEL)[1]
    for (const s of ['IN_SERVICE', 'OUT_OF_SERVICE', 'RETIRED']) {
      expect(statuses).toContain(s)
    }
  })

  it('the category enum the dialog offers is the enum the server accepts', () => {
    const categories = /static Category = Object\.freeze\(\{([^}]*)\}\)/.exec(BACKEND_MODEL)[1]
    for (const c of ['INSTRUMENT', 'MACHINE', 'VEHICLE', 'SENSOR', 'OTHER']) {
      expect(categories).toContain(c)
    }
    // And the categories `database/seeder-local.sql` seeds ('LAB', 'PRODUCTION')
    // are NOT in it — they are unreachable through any write path and render as
    // "—" in the register. Pinned so nobody "fixes" the register by widening
    // the enum instead of fixing the seed.
    expect(categories).not.toContain('LAB')
    expect(categories).not.toContain('PRODUCTION')
  })
})
