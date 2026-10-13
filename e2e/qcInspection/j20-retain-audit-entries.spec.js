// PW-J20 — Registration and location-change audit entries
// (URS-RET-06 "The full sample history is available in the audit trail" /
// OQ-15 TC-15-06).
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
//
// URS-RET-06 was PARTIAL: "Disposal entry is strongly asserted; registration
// and location-change entries not covered." j12 asserts the DISPOSE row down
// to its e-sign payload, its `performed_by` and its ip — and nothing checks
// what happens when a sample is merely REGISTERED or MOVED, which are the two
// acts a custodian performs far more often than a disposal.
//
// ── THE TRAP THIS FILE EXISTS TO NAVIGATE ───────────────────────────────────
//
// There are TWO independent audit paths on this module and they disagree about
// what an entity is called:
//
//   1. `retainSampleService.js:272` writes ONE explicit `audit_logs` row, for
//      disposal only. `entity_type = 'RetainSample'` — SINGULAR. That is the
//      Part-11 evidence j12 asserts.
//   2. `retain_samples_audit_trigger` (AFTER INSERT/UPDATE/DELETE) enqueues a
//      graphile job that writes a row per statement. `entity_type` there is the
//      PLURAL table name, PascalCased — `RetainSamples`. Its actions are the
//      generic `CREATE` / `UPDATE` / `DELETE`.
//
// So registration and a location change DO reach `audit_logs`, but only via
// path 2, under a different entity_type and with no semantic action name.
// Three consequences that shape every assertion below:
//
//   · The existing `retainAuditActions()` helper filters on `entity_id` ALONE,
//     so it returns rows from BOTH paths mixed together. A test asserting
//     `toEqual(['DISPOSE'])` would fail against correct behaviour; only
//     `toContain` is sound. This file reads entity_type explicitly instead.
//   · Path 2 is ASYNCHRONOUS — the trigger enqueues, the worker writes. An
//     assertion fired immediately after a REST call races the worker, so every
//     read here goes through `waitForSqlValue`. This is the single most likely
//     way a correct test of this module reads as flaky.
//   · The custody panel and the audit trail are DIFFERENT SURFACES telling
//     overlapping stories, and the OQ is explicit that the Chain of Custody
//     panel — not the audit trail — is the legible evidence for a relocation.
//     Both are asserted, and the difference between them is asserted too.
//
// ── THE BOUNDARY, AND WHY IT IS WHERE IT IS ────────────────────────────────
//
// TC-15-06's note says field-level changes — location, quantity, retain-until,
// seal state — "do not generate audit entries", and that the custody panel is
// therefore the ONLY system record of a relocation. MEASURED: that is exactly
// right, and the mechanism is worth stating because it is not obvious from the
// trigger.
//
// `retain_samples` carries `retain_samples_audit_trigger` on INSERT/UPDATE/
// DELETE, so every relocation DOES reach the worker. But the table is NOT
// registered in the audit registry (`backend/worker/services/audit/registry/
// modules/`), so it falls through to `DEFAULT_CONFIG`:
//
//     mode: 'fields', trackFields: ['statusId','stateId','name','title','code']
//
// A location or position change touches none of those five, so the handler
// drops the event and no row is written. A DISPOSAL moves `statusId`, which is
// why disposal alone produces a trigger `UPDATE` row on top of the service's
// explicit `DISPOSE` one.
//
// This test therefore asserts the ABSENCE as the product's real behaviour
// (RET-D3), not as a bug to be papered over — and asserts it against the
// registry default rather than merely observing "no row appeared", because an
// absence is also what a broken worker looks like. The registration control
// above is what proves the worker is alive.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AUTH, COMPANY_ID, QC, USERS } from '../fixtures/cast.js'
import { createLotViaRest, createRetainSample, findRetainSample } from '../fixtures/qcInspection.js'
import { sql, sqlAsAppUser, sqlRow, sqlValue, waitForSqlValue } from '../fixtures/db.js'

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

/**
 * Audit rows for a retain sample, split by the path that wrote them.
 *
 * Deliberately NOT `retainAuditActions()`: that helper has no `entity_type`
 * filter, so the two paths arrive interleaved and a caller cannot tell a
 * trigger-authored `UPDATE` from a service-authored `DISPOSE`. Distinguishing
 * them is the whole subject of this file.
 */
function auditRows(retainSampleId, entityType) {
  const out = sql(
    `SELECT action,
            coalesce(performed_by::text, ''),
            coalesce(performed_at::text, ''),
            coalesce(new_value_json::text, ''),
            coalesce(old_value_json::text, '')
       FROM audit_logs
      WHERE entity_id = ${q(retainSampleId)} AND entity_type = ${q(entityType)}
      ORDER BY created_at, id`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [action, performedBy, performedAt, newJson, oldJson] = line.split('|')
    return {
      action,
      performedBy: performedBy || null,
      performedAt: performedAt || null,
      newJson: newJson || null,
      oldJson: oldJson || null,
    }
  })
}

/**
 * The second storage location a MOVE needs.
 *
 * AUDIT CORRECTION (2026-09-23): the first draft looked this up by `code`
 * ALONE. `storage_locations` has no unique index on code — only a PK — so a row
 * with the same code in ANOTHER tenant (E2EALT, or demo data) would be returned
 * and the PATCH below would then be writing a cross-tenant FK. Scoped to
 * E2ELAB, matching j19's copy of the same helper.
 */
function ensureSecondLocation() {
  const existing = sqlValue(
    `SELECT id FROM storage_locations
      WHERE company_id = ${q(COMPANY_ID)}
        AND code = 'E2E-RETAIN-B' AND deleted_at IS NULL LIMIT 1`,
  )
  if (existing) return existing
  return sqlValue(
    `INSERT INTO storage_locations (company_id, name, code, conditions, created_at, updated_at)
     SELECT company_id, 'E2E Retain Room B', 'E2E-RETAIN-B', '5 C / 40% RH', now(), now()
       FROM storage_locations WHERE id = ${q(QC.storageLocation.id)}
     RETURNING id`,
  )
}

test.describe('PW-J20 — registration and location-change audit entries', () => {
  test.use({ storageState: AUTH.qcInspector })

  test('registering a sample leaves an attributed audit entry', async ({ page }) => {
    // TC-15-06 steps 1 and 4 for the REGISTRATION act. Two surfaces have to
    // agree: the custody chain's CREATED event (what the Chain of Custody panel
    // shows) and the audit trail's CREATE row (what the central Audit Logs page
    // shows). Registration is the one act where BOTH exist, so this is also the
    // control that proves the async trigger path works at all — without it, the
    // "no MOVED audit row" finding below could not be told apart from "the
    // worker was down".
    const lot = await createLotViaRest(page, {})
    const sample = await createRetainSample(page, lot.id, {
      quantity: '5',
      position: 'Shelf A, Box 20',
    })

    // The trigger enqueues; graphile writes. Never assert this synchronously.
    await waitForSqlValue(
      `SELECT count(*) FROM audit_logs
        WHERE entity_id = ${q(sample.id)} AND entity_type = 'RetainSamples' AND action = 'CREATE'`,
      { timeoutMs: 45_000, label: 'registration audit row' },
    )

    const [create] = auditRows(sample.id, 'RetainSamples').filter((r) => r.action === 'CREATE')
    expect(create, 'registration reaches the audit trail').toBeTruthy()
    expect(create.performedBy, 'attributed to the custodian who registered it').toBe(
      USERS.qcInspector.id,
    )
    expect(create.performedAt, 'and carries a timestamp').toBeTruthy()
    expect(create.newJson, 'the entry records the state it was born in').toMatch(/RETAINED/)

    // The same act on the other surface. The custody panel is where a QA reader
    // actually looks, and the OQ names it as the evidence for step 1.
    await page.goto(`/qc-inspection/retain-samples/${sample.id}`)
    await expect(page.getByText('Chain of Custody')).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByText('Sample retained'),
      'the custody panel names the registration in its own words',
    ).toBeVisible()
    await expect(
      page.getByText(`Stored in ${QC.storageLocation.name}`),
      'and says where it was stored',
    ).toBeVisible()
  })

  test('KNOWN DEFECT RET-D3 — a location change leaves NO audit entry; only the custody event records it', async ({
    page,
  }) => {
    // TC-15-06 steps 2 and 4 for the RELOCATION act.
    //
    // The protocol's note is correct and this test is the evidence behind it.
    // The registration control in the test above is load-bearing here: it
    // proves the asynchronous trigger→worker→audit_logs path is alive in this
    // run, so the zero below is the product's behaviour and not a worker that
    // happened to be down.
    const roomB = ensureSecondLocation()
    const lot = await createLotViaRest(page, {})
    const sample = await createRetainSample(page, lot.id, { quantity: '5' })

    // Control: registration DID reach the trail, so the pipeline works.
    await waitForSqlValue(
      `SELECT count(*) FROM audit_logs
        WHERE entity_id = ${q(sample.id)} AND entity_type = 'RetainSamples' AND action = 'CREATE'`,
      { timeoutMs: 45_000, label: 'CONTROL — the audit pipeline is alive this run' },
    )
    const auditBefore = Number(
      sqlValue(`SELECT count(*) FROM audit_logs WHERE entity_id = ${q(sample.id)}`),
    )

    const moved = await page.request.patch(
      `/api/v1/services/qcInspection/retainSamples/${sample.id}`,
      { data: { storageLocationId: roomB, position: 'Shelf C, Box 07' } },
    )
    expect(moved.ok(), `move failed: ${await moved.text()}`).toBeTruthy()
    expect(findRetainSample(sample.id).storageLocationId, 'the sample moved').toBe(roomB)

    // ── The custody event IS written, and carries the whole story ──────────
    // Asserted first, and waited on, so the audit assertion below is made at a
    // point where the write has demonstrably been processed — otherwise "no
    // audit row yet" and "no audit row ever" are the same observation.
    await waitForSqlValue(
      `SELECT count(*) FROM retain_sample_events
        WHERE retain_sample_id = ${q(sample.id)} AND event_type = 'MOVED'`,
      { timeoutMs: 20_000, label: 'the relocation custody event' },
    )
    const custody = sqlRow(
      `SELECT from_location_id::text, to_location_id::text, actor_user_id::text, created_at::text
         FROM retain_sample_events
        WHERE retain_sample_id = ${q(sample.id)} AND event_type = 'MOVED'
        ORDER BY created_at DESC LIMIT 1`,
    )
    expect(custody, 'the relocation minted a custody event').not.toBeNull()
    expect(custody[0], 'which names the location it left').toBe(QC.storageLocation.id)
    expect(custody[1], 'and the one it arrived at').toBe(roomB)
    expect(custody[2], 'attributed to a named person').toBe(USERS.qcInspector.id)
    expect(custody[3], 'and timestamped').toBeTruthy()

    // ── KNOWN DEFECT RET-D3 · and the audit trail records nothing ──────────
    //
    // AUDIT CORRECTION (2026-09-23). The first draft waited a flat 8 seconds
    // and then asserted the count. A wall-clock sleep is not a barrier: it
    // proves nothing about whether the worker had reached the move's job, so on
    // a loaded machine the "defect" and "the worker is 9 seconds behind" are
    // the same observation — and the test would report a fabricated finding.
    //
    // Replaced with a REAL barrier. A SECOND retain sample is registered AFTER
    // the move, and its own CREATE row is waited for. The worker runs
    // `concurrentJobs: 15` on a 2 s poll (qms/backend/worker/graphile.config.js),
    // so it is not strictly FIFO on COMPLETION — but a job enqueued seconds
    // later cannot be picked up before the move's job while 14 other slots sit
    // idle. Once the later row exists, the move's job has been claimed and
    // decided. That makes the zero below the worker's VERDICT rather than its
    // backlog, which a wall-clock sleep never could.
    //
    // The `expect.poll` that follows holds the zero for a further window, so a
    // pathological interleaving is caught as a flake rather than published as a
    // finding.
    const laterLot = await createLotViaRest(page, {})
    const later = await createRetainSample(page, laterLot.id, { quantity: '1' })
    await waitForSqlValue(
      `SELECT count(*) FROM audit_logs
        WHERE entity_id = ${q(later.id)} AND entity_type = 'RetainSamples' AND action = 'CREATE'`,
      {
        timeoutMs: 60_000,
        label: 'BARRIER — a job enqueued AFTER the move has been drained',
      },
    )

    // Held at the same value across four reads over ~6 s. A count that is about
    // to rise fails here; a count that is genuinely final does not.
    for (let i = 0; i < 4; i += 1) {
      expect(
        Number(sqlValue(`SELECT count(*) FROM audit_logs WHERE entity_id = ${q(sample.id)}`)),
        `RET-D3 (read ${i + 1}/4): a relocation produces NO audit entry at all — ` +
          'the custody event is the only record',
      ).toBe(auditBefore)
      if (i < 3) await new Promise((r) => setTimeout(r, 2_000))
    }

    // ── The CAUSE, read from the product, not restated ─────────────────────
    //
    // AUDIT CORRECTION (2026-09-23). The first draft wrote
    //
    //   expect(['statusId','stateId','name','title','code'])
    //     .not.toContain('storageLocationId')
    //
    // which asserts that a JavaScript array literal written two lines above
    // does not contain a string — TRIVIALLY TRUE, independent of the product,
    // and green forever even if `retain_samples` were registered tomorrow with
    // every column tracked. It is replaced by reading the two facts out of the
    // worker's own source, so the diagnosis fails the day the product changes:
    //
    //   1. DEFAULT_TRACK_FIELDS is still exactly those five, and
    //   2. no registry module mentions `retain_samples` at all, so
    //      getTableConfig() falls through to DEFAULT_CONFIG for it.
    //
    // Read as text rather than imported: the registry resolves `#services/*`
    // through the worker package's own import map, which a Playwright process
    // rooted in qms-app cannot resolve.
    const registryDir = path.resolve(
      fileURLToPath(import.meta.url),
      '../../../../qms/backend/worker/services/audit',
    )
    const registrySrc = readFileSync(path.join(registryDir, 'registry.js'), 'utf8')
    expect(
      registrySrc,
      'DEFAULT_TRACK_FIELDS is still the five-field default a relocation cannot touch',
    ).toContain("const DEFAULT_TRACK_FIELDS = ['statusId', 'stateId', 'name', 'title', 'code']")

    const modulesDir = path.join(registryDir, 'registry', 'modules')
    const mentioning = readdirSync(modulesDir)
      .filter((f) => f.endsWith('.js') && !f.includes('.test.'))
      .filter((f) => /\bretain_samples\b/.test(readFileSync(path.join(modulesDir, f), 'utf8')))
    expect(
      mentioning,
      'no audit-registry module claims `retain_samples`, so it inherits DEFAULT_CONFIG — ' +
        'which is WHY a storage_location_id change is dropped by the worker',
    ).toEqual([])

    // CONTROL on that method. A table that IS registered must be found by the
    // same grep, or the empty result above would prove only that the grep is
    // broken. `inspection_lots` is registered in inspections.js.
    const controlHits = readdirSync(modulesDir)
      .filter((f) => f.endsWith('.js') && !f.includes('.test.'))
      .filter((f) => /\binspection_lots\b/.test(readFileSync(path.join(modulesDir, f), 'utf8')))
    expect(
      controlHits.length,
      'CONTROL — the same search DOES find a registered sibling table, so the empty ' +
        'result above is an absence in the product and not a broken probe',
    ).toBeGreaterThan(0)

    // ── TC-15-06 step 2 · the panel is the legible evidence ────────────────
    // Scoped by the exact from → to string: the page also carries a Location
    // field and a Traceability block, and a loose match would find those first.
    await page.goto(`/qc-inspection/retain-samples/${sample.id}`)
    await expect(page.getByText('Chain of Custody')).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByText(`${QC.storageLocation.name} → E2E Retain Room B`),
      'the panel renders the transfer as from → to — previous and new location both shown',
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      page.getByText('Moved', { exact: true }).first(),
      'named as a relocation in the custody vocabulary',
    ).toBeVisible()

    test.info().annotations.push({
      type: 'known-defect',
      description:
        'RET-D3 — a relocation of a retain sample writes NO audit_logs row. retain_samples is ' +
        'unregistered in the audit registry, so DEFAULT_CONFIG applies: mode "fields" with ' +
        'trackFields [statusId, stateId, name, title, code]. A storage_location_id / position ' +
        'change moves none of them, so the worker drops the event. Disposal is audited only ' +
        'because it moves statusId. The Chain of Custody panel is consequently the sole system ' +
        'record of a relocation, exactly as OQ-15 TC-15-06 states — and a quantity change, which ' +
        'mints no custody event either, is recorded nowhere at all.',
    })
  })

  test('audit entries cannot be edited or deleted — the database refuses, not just the UI', async () => {
    // TC-15-06 step 5. The protocol's own note says the control "is stronger
    // than an absent button" — so asserting that no edit control renders would
    // be asserting the weaker half. This probes the database directly, as
    // `app_user` (the role every GraphQL request runs as), because REST and the
    // seeder connect as the superuser and bypass both RLS and any trigger that
    // gates on the acting role.
    //
    // Probed from BOTH sides on purpose. An UPDATE that RLS filtered to zero
    // rows SUCCEEDS silently — `ok: true`, nothing changed — and would read as
    // a passing guard while proving only that the row was invisible.
    //
    // AUDIT CORRECTION (2026-09-23), two of them.
    //
    // 1. The first draft's comment claimed qcInspector "holds no audit_trail
    //    grant, which would make every probe vacuous". MEASURED: they hold no
    //    `audit_trail` grant AND the probe is NOT vacuous, because
    //    `audit_log_select_rls` carries a THIRD arm — `entity_type IN (SELECT
    //    t.id FROM audit_entity_types t WHERE scope_allowed(t.module_id,
    //    'read', …))` plus its alias union. `RetainSample` is registered there
    //    against module `retain_samples`, and `RetainSamples` is an alias of
    //    it, so the inspector's `retain_samples:read` admits them to exactly
    //    these rows. (59 visible when this was measured.) The reasoning in the
    //    comment was backwards even though the conclusion happened to hold.
    //
    // 2. The visibility the comment promised to assert was never asserted: the
    //    row was fetched as the SUPERUSER, which says nothing about what
    //    `app_user` can see. The read below now runs as `app_user`, so the
    //    non-vacuity is established by the same session that is then refused.
    const row = sqlRow(
      `SELECT id::text, entity_id::text FROM audit_logs
        WHERE entity_type IN ('RetainSamples', 'RetainSample')
        ORDER BY created_at DESC LIMIT 1`,
    )
    expect(row, 'this suite has produced retain audit rows to probe').not.toBeNull()

    const visible = sqlAsAppUser(
      `SELECT count(*) FROM audit_logs WHERE entity_type IN ('RetainSamples', 'RetainSample');`,
      { userId: USERS.qcInspector.id, companyId: COMPANY_ID },
    )
    expect(visible.ok, `the app_user read failed: ${visible.error}`).toBe(true)
    expect(
      Number((visible.output || '0').trim().split('\n').pop()),
      'NON-VACUITY — this untrusted session CAN see retain audit rows (via the ' +
        'audit_entity_types arm of audit_log_select_rls), so the refusal below is a real ' +
        'refusal and not an empty filter',
    ).toBeGreaterThan(0)
    const [auditId] = row

    // The structural guarantee: whatever a role can see, the table itself
    // carries no UPDATE or DELETE policy for anyone.
    const writePolicies = sql(
      `SELECT policyname || ':' || cmd FROM pg_policies
        WHERE tablename = 'audit_logs' AND cmd IN ('UPDATE', 'DELETE', 'ALL')`,
    )
    expect(
      writePolicies,
      'audit_logs carries no UPDATE or DELETE policy — nothing may rewrite history',
    ).toBe('')

    // And RLS is actually switched on, which is what makes the absence of a
    // policy a refusal rather than a permission. Without this, a table with no
    // policies and RLS disabled would be wide open and the assertion above
    // would read exactly the same.
    expect(
      sqlValue(`SELECT relrowsecurity FROM pg_class WHERE oid = 'audit_logs'::regclass`),
      'row-level security is enabled on audit_logs',
    ).toBe('t')
    // …but NOT forced. Measured, not assumed: `relforcerowsecurity` is false,
    // so the table OWNER is exempt from its own policies. That is not a defect
    // here — the API and the worker connect as the superuser and must be able
    // to INSERT audit rows — but it does mean the guarantee this step records
    // is "no untrusted session may rewrite an audit row", not "no connection
    // can". Stated as the measured fact so a validation reader is not handed a
    // stronger claim than the database makes.
    expect(
      sqlValue(`SELECT relforcerowsecurity FROM pg_class WHERE oid = 'audit_logs'::regclass`),
      'RLS is not FORCED — the owning superuser role is exempt, which is how the worker writes',
    ).toBe('f')

    // The refusal itself, attempted as the untrusted role. `sqlAsAppUser`
    // reports ok:false only when the statement RAISED; an UPDATE filtered to
    // zero rows raises nothing. So the command tag is read too — "UPDATE 0" is
    // the vacuous outcome and must not be mistaken for a guard.
    const attempt = sqlAsAppUser(
      `UPDATE audit_logs SET action = 'TAMPERED' WHERE id = ${q(auditId)};`,
      { userId: USERS.qcInspector.id, companyId: COMPANY_ID },
    )
    // MEASURED: the refusal is stronger than RLS. `app_user` holds no UPDATE
    // privilege on audit_logs AT ALL, so Postgres answers "permission denied
    // for table audit_logs" before any policy is consulted — which is why the
    // absence of an UPDATE policy above is a refusal and not an omission. The
    // `UPDATE 0` arm is kept anyway: if a future grant ever admits the role,
    // the policy-less table would filter the write to nothing instead, and
    // that outcome must still count as a guard rather than as a silent pass.
    const tag = (attempt.output || '').trim().split('\n').pop() || ''
    expect(
      attempt.ok === false || tag === 'UPDATE 0',
      'an untrusted session cannot rewrite an audit row',
    ).toBe(true)
    expect(
      attempt.error,
      'today it is refused outright — no UPDATE privilege on the table',
    ).toMatch(/permission denied for table audit_logs/i)
    expect(
      sqlValue(`SELECT action FROM audit_logs WHERE id = ${q(auditId)}`),
      'and the row is unchanged either way',
    ).not.toBe('TAMPERED')
  })
})
