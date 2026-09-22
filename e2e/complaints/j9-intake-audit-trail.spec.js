// CMP-J9 — Customer Complaint intake, classification and audit trail:
// OQ-17 TC-17-01, TC-17-02 and TC-17-08.
//
// WHY THIS FILE EXISTS. J3 drives the CUSTOMER module's lifecycle
// (create → accept → assign → close) and J6 proves the one required field on
// both modules' create routes. Neither covers what OQ-17 actually asks an
// executor to observe AT INTAKE: that the minted number is unique AND drawn
// from a PER-COMPANY counter, that the row lands in `New`, that the recorder
// and raise date are captured, that the classification an agent picks survives
// a re-read, and that every one of those steps leaves an immutable audit row.
// Those are the protocol's evidence lines, and nothing in the suite asserted
// them. This file is that gate.
//
// WHAT IT DELIBERATELY DOES NOT REDO. J6 already owns the REST/UI
// required-field refusals for `/customerComplaints` (missing `subject` → 400,
// nothing written; empty form → validation summary). TC-17-01 steps 2 and 3
// ask for the refusal TWICE — once bare, once with the description populated,
// to establish that `subject` (not the narrative) is the mandatory field. Step
// 2's bare arm is J6's; only step 3's arm is here, because it makes a claim J6
// does not: that a request carrying a FULL description and no subject is still
// refused. That is the step the protocol's own warning note hangs on ("a
// complaint saves successfully with the description empty"), so it is worth
// its own arm and is not a duplicate.
//
// ── THE AUDIT CHAIN IS ASYNCHRONOUS, AND THAT SHAPES EVERY ASSERTION ────────
// `customer_complaints_audit_trigger` (AFTER INSERT OR UPDATE OR DELETE) does
// NOT write `audit_logs`. It builds a payload and calls
// `graphile_worker.add_job('audit_event', …)`; backend/worker/tasks/audit_event.js
// is what INSERTs the row. So every audit assertion below is a poll barrier,
// not a bare read — the same discipline products/j10-audit-coverage.spec.js
// established, and for the same reason: a straight read races the queue and
// fails intermittently, which is worse than not testing it.
//
// ── TWO ENTITY_TYPE SPELLINGS, BOTH CORRECT ────────────────────────────────
// Trigger-driven rows get `entity_type` from `toPascalCase(table)` in
// worker/services/audit/defaultHandler.js → 'CustomerComplaints' (PLURAL).
// Controller-written rows (accept / assign / reply / close / export …) hardcode
// `entityType: 'CustomerComplaint'` (SINGULAR). Migration
// 20260918020740-create-audit-entity-type-aliases seeds
// ('CustomerComplaints', 'CustomerComplaint', 'TRIGGER') precisely because both
// occur, and `audit_canonical_entity_type()` folds one onto the other. A probe
// that pinned only one spelling would silently miss half the trail, so the
// helper below matches through the canonical function — which additionally
// keeps this file green if the alias is ever retired in favour of one spelling.
import { test, expect } from '@playwright/test'
import { ALT_COMPANY_ID, AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import {
  createPersonaPool,
  findCustomerComplaintBySubject,
  purgeCustomerComplaintBySubject,
  purgeMintedCustomerComplaints,
  restPost,
} from '../fixtures/complaints.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

// Two intakes in the same run: the pair is what proves the counter ADVANCES,
// which a single create can never show.
const SUBJECT_A = 'E2E J9 Customer Intake A'
const SUBJECT_B = 'E2E J9 Customer Intake B'
const SUBJECT_NO_SUBJECT = 'E2E J9 refusal arm (never written)'

// ── local helpers ───────────────────────────────────────────────────────────
// Deliberately NOT added to fixtures/complaints.js: that file is being extended
// concurrently, and these are J9-shaped (the audit chain and the counter are
// this protocol's evidence, not general complaint plumbing).

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`

/** `NOW()` as a psql-castable string — the barrier every audit poll starts from. */
function now() {
  return sqlValue('SELECT NOW()::text')
}

/**
 * Audit rows for one customer complaint since `since`, counted through
 * `audit_canonical_entity_type()` so BOTH the trigger's plural spelling and the
 * controllers' singular one are included. See the header note.
 */
function auditRowsSince(complaintId, since, { action } = {}) {
  const actionFilter = action ? ` AND action = ${quote(action)}` : ''
  return Number(
    sqlValue(
      `SELECT count(*) FROM audit_logs
        WHERE audit_canonical_entity_type(entity_type) = 'CustomerComplaint'
          AND entity_id = ${quote(complaintId)}
          AND performed_at > ${quote(since)}::timestamptz${actionFilter}`,
    ),
  )
}

/** The newest audit row for a complaint: action, actor, timestamp and diff. */
function newestAuditRow(complaintId) {
  const out = sql(
    `SELECT action,
            coalesce(performed_by::text, ''),
            coalesce(performed_at::text, ''),
            coalesce(old_value_json::text, ''),
            coalesce(new_value_json::text, ''),
            id::text
       FROM audit_logs
      WHERE audit_canonical_entity_type(entity_type) = 'CustomerComplaint'
        AND entity_id = ${quote(complaintId)}
      ORDER BY performed_at DESC, created_at DESC
      LIMIT 1`,
  )
  if (!out) return null
  const [action, performedBy, performedAt, oldJson, newJson, id] = out.trim().split('|')
  return { action, performedBy, performedAt, oldJson, newJson, id }
}

/**
 * Wait for the `audit_event` worker to drain past `since` for this complaint.
 * Returns the row count so a caller can assert on it directly.
 */
async function waitForAuditRow(complaintId, since, opts) {
  await expect
    .poll(() => auditRowsSince(complaintId, since, opts), {
      timeout: 30_000,
      intervals: [500],
      message:
        `no audit_logs row for customer complaint ${complaintId} arrived within 30s. ` +
        'The row is written by the graphile_worker `audit_event` task, not by ' +
        'customer_complaints_audit_trigger itself — a persistent zero here means the ' +
        'worker is not running, not that the trigger is missing.',
    })
    .toBeGreaterThan(0)
  return auditRowsSince(complaintId, since, opts)
}

/** The per-(company, prefix) CC counter value, or null when no row exists yet. */
function ccCounterValue(companyId) {
  const v = sqlValue(
    `SELECT current_value FROM customer_complaint_counters
      WHERE company_id = ${quote(companyId)} AND prefix = 'CC' AND deleted_at IS NULL`,
  )
  return v === '' || v === null ? null : Number(v)
}

/** Everything TC-17-01 step 7 calls "recorder and date raised". */
function intakeProvenance(id) {
  const out = sql(
    `SELECT coalesce(created_by::text, ''),
            coalesce(created_at::text, ''),
            coalesce(updated_by::text, ''),
            status_id
       FROM customer_complaints WHERE id = ${quote(id)}`,
  )
  if (!out) return null
  const [createdBy, createdAt, updatedBy, statusId] = out.trim().split('|')
  return { createdBy, createdAt, updatedBy, statusId }
}

test.describe('CMP-J9 · Customer Complaint intake, classification and audit trail', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    purgeMintedCustomerComplaints()
    for (const s of [SUBJECT_A, SUBJECT_B, SUBJECT_NO_SUBJECT]) {
      purgeCustomerComplaintBySubject(s)
    }
  })

  test.afterAll(() => {
    for (const s of [SUBJECT_A, SUBJECT_B, SUBJECT_NO_SUBJECT]) {
      purgeCustomerComplaintBySubject(s)
    }
  })

  // ── TC-17-01 — Intake ─────────────────────────────────────────────────────

  test('TC-17-01 step 3 · a full description with an empty subject is still refused, and writes nothing', async ({
    browser,
  }) => {
    // The step J6 does NOT cover. J6's arm omits `subject` from an otherwise
    // minimal body; this one sends a COMPLETE intake — narrative, customer
    // name, contact, classification — with only the subject blank. That is the
    // claim the protocol's warning note rests on: the subject, not the
    // narrative, is the mandatory field, so a rich-but-subjectless submission
    // must not slip through on the strength of everything else being present.
    const page = await pool.page(browser, AUTH.supportAgent)

    const before = Number(sqlValue('SELECT count(*) FROM customer_complaints'))

    const res = await restPost(page, '/customerComplaints', {
      subject: '',
      description:
        'The unit arrived with a cracked housing and the seal was already broken. ' +
        'Customer is requesting a replacement under warranty.',
      customerName: 'Erin E2E Customer',
      customerEmail: 'erin.customer.j9@e2e.test',
      customerPhone: '+1-555-0142',
      priorityId: 'HIGH',
      sourceId: 'PHONE',
    })

    expect(
      res.status(),
      'a complaint with a populated description but an empty subject must be refused — ' +
        '`subject` is the one mandatory field (createComplaintSchema: z.string().min(1))',
    ).toBe(400)

    expect(
      Number(sqlValue('SELECT count(*) FROM customer_complaints')),
      'a refused intake must not write a row — not even a partial one',
    ).toBe(before)

    // A refusal must also not burn a number. The counter advancing on a
    // rejected submission would leave gaps an inspector reads as deleted
    // records, so this is a real control and not a tidiness check.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM customer_complaints WHERE company_id = ${quote(COMPANY_ID)}
             AND subject = ${quote(SUBJECT_NO_SUBJECT)}`,
        ),
      ),
      'nothing was written under the refusal arm subject either',
    ).toBe(0)
  })

  test('TC-17-01 steps 4-7 · a valid intake mints a CC number, opens in New, and records recorder + date raised', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.supportAgent)

    const counterBefore = ccCounterValue(COMPANY_ID)

    const res = await restPost(page, '/customerComplaints', {
      subject: SUBJECT_A,
      description: 'Seeded by CMP-J9 — first of two intakes (the sequence pair).',
      customerName: 'Erin E2E Customer',
      customerEmail: 'erin.customer.j9@e2e.test',
      customerPhone: '+1-555-0142',
    })
    expect(res.status(), `create failed: ${await res.text()}`).toBe(201)

    const row = findCustomerComplaintBySubject(SUBJECT_A)
    expect(row, 'the intake landed in customer_complaints').not.toBeNull()

    // Step 4/5 — the number format is fixed (`CC-` + six digits), per the
    // protocol's own note: there is no pattern SETTING to compare against, so
    // the shape is asserted literally rather than read from configuration.
    expect(
      row.complaintNumber,
      'the minted number is CC- followed by exactly six digits (CC_NUMBER_PREFIX + CC_NUMBER_PAD=6)',
    ).toMatch(/^CC-\d{6}$/)

    // Step 6 — New, and NOT configurable: enforce_customer_complaint_status_transition
    // refuses an INSERT in any other state on the untrusted path.
    expect(row.statusId, 'a new complaint is always created in NEW').toBe('NEW')

    // Step 7 — recorder and date raised. There is no separate "date received"
    // column for web intake (the protocol says so); `created_at` IS the date
    // raised, and `created_by` is the recorder.
    const prov = intakeProvenance(row.id)
    expect(prov.createdBy, 'the recorder is the agent who submitted the intake').toBe(
      USERS.supportAgent.id,
    )
    expect(prov.createdAt, 'the date the complaint was raised is captured').not.toBe('')
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM customer_complaints
            WHERE id = ${quote(row.id)} AND created_at <= NOW() AND created_at > NOW() - interval '10 minutes'`,
        ),
      ),
      'the raise date is the real intake time, not a placeholder or a backdated value',
    ).toBe(1)

    // Step 5, first half — the counter row is per (company, prefix) and it moved.
    const counterAfter = ccCounterValue(COMPANY_ID)
    expect(counterAfter, "E2ELAB's own CC counter row exists after the first intake").not.toBeNull()
    if (counterBefore !== null) {
      expect(counterAfter, 'the intake advanced this company’s counter by exactly one').toBe(
        counterBefore + 1,
      )
    }
  })

  test('TC-17-01 step 5 · the number is unique and the sequence advances PER COMPANY', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.supportAgent)
    const first = findCustomerComplaintBySubject(SUBJECT_A)
    expect(first, 'the previous test left an intake behind').not.toBeNull()

    const counterBefore = ccCounterValue(COMPANY_ID)
    const altCounterBefore = ccCounterValue(ALT_COMPANY_ID)

    const res = await restPost(page, '/customerComplaints', {
      subject: SUBJECT_B,
      description: 'Seeded by CMP-J9 — second of two intakes (the sequence pair).',
      customerName: 'Erin E2E Customer',
      customerEmail: 'erin.customer.j9@e2e.test',
    })
    expect(res.status(), `second create failed: ${await res.text()}`).toBe(201)

    const second = findCustomerComplaintBySubject(SUBJECT_B)
    expect(second, 'the second intake landed').not.toBeNull()
    expect(second.complaintNumber).toMatch(/^CC-\d{6}$/)

    // ADVANCES: the second number is strictly the first plus one. Asserting
    // "different" would pass for a random id; the protocol asks for a SEQUENCE.
    const seqOf = (n) => Number(String(n).replace(/^CC-/, ''))
    expect(
      seqOf(second.complaintNumber),
      'the sequence advances by one — consecutive intakes in one company are consecutive numbers',
    ).toBe(seqOf(first.complaintNumber) + 1)

    expect(
      ccCounterValue(COMPANY_ID),
      'the company counter tracks the numbers it issued',
      // generateComplaintNumber() locks the counter row (SELECT … FOR UPDATE)
      // and returns the POST-increment value, so counter == the last number.
    ).toBe(seqOf(second.complaintNumber))
    if (counterBefore !== null) {
      expect(ccCounterValue(COMPANY_ID)).toBe(counterBefore + 1)
    }

    // UNIQUE: enforced by `customer_complaints_company_number_unique`
    // (company_id, complaint_number). Proven by measurement, not by trusting
    // the index name — a duplicate anywhere in the tenant fails this.
    expect(
      sqlValue(
        `SELECT coalesce(max(c), 1)::text FROM (
           SELECT count(*) AS c FROM customer_complaints
            WHERE company_id = ${quote(COMPANY_ID)} AND deleted_at IS NULL
            GROUP BY complaint_number
         ) dupes`,
      ),
      'no CC number is issued twice inside a company',
    ).toBe('1')

    // PER COMPANY, not global. This is the half a uniqueness check cannot show:
    // the counter is keyed on (company_id, prefix), so E2ELAB's two intakes must
    // have left E2EALT's counter exactly where it was. A GLOBAL sequence would
    // have moved it (or, if E2EALT has no row yet, would never create one per
    // tenant at all).
    expect(
      altCounterBefore,
      'E2ELAB’s intakes did not touch E2EALT’s counter — the sequence is per company, not global',
    ).toBe(ccCounterValue(ALT_COMPANY_ID))
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM customer_complaint_counters
            WHERE prefix = 'CC' AND company_id = ${quote(COMPANY_ID)}`,
        ),
      ),
      'exactly one CC counter row per company — the row IS the per-company sequence',
    ).toBe(1)

    // The unique index is scoped to the company, which is what makes the
    // per-company sequence safe: two tenants may legitimately both hold
    // CC-000001. Proven directly against the constraint rather than inferred.
    const clash = first.complaintNumber
    let refused = false
    try {
      sql(
        `UPDATE customer_complaints SET complaint_number = ${quote(clash)}
          WHERE id = ${quote(second.id)}`,
      )
    } catch (err) {
      refused = /unique|duplicate key/i.test(`${err.stderr ?? err.message ?? ''}`)
    }
    expect(
      refused,
      'reusing a number inside the same company is refused by ' +
        'customer_complaints_company_number_unique — uniqueness is genuinely enforced, ' +
        'not merely a convention of the minting code',
    ).toBe(true)
  })

  test('TC-17-01 step 8 · the intake never appears in the internal Quality Complaints register', async ({
    browser,
  }) => {
    // The two modules are separate records over separate tables. J3 pins this
    // for its own lifecycle row; asserted again here because it is a numbered
    // protocol step against THESE intakes, and because a leak would most
    // plausibly appear on a NEWLY created row rather than a seeded one.
    for (const subject of [SUBJECT_A, SUBJECT_B]) {
      expect(
        sqlValue(`SELECT count(*) FROM complaints WHERE subject = ${quote(subject)}`),
        `"${subject}" is a customer complaint and must be absent from the internal complaints table`,
      ).toBe('0')
    }

    const page = await pool.page(browser, AUTH.complaintOwner)
    await page.goto('/complaints')
    await expect(page.getByText('New Complaint', { exact: true })).toBeVisible({ timeout: 30_000 })
    for (const subject of [SUBJECT_A, SUBJECT_B]) {
      await expect(
        page.getByText(subject, { exact: false }),
        'the QA register must not render a customer ticket',
      ).toHaveCount(0)
    }
  })

  // ── TC-17-02 — Classification and detail ──────────────────────────────────

  test('TC-17-02 steps 1-5 · priority, source and customer reference persist and read back', async ({
    browser,
  }) => {
    // WHAT "CLASSIFICATION" ACTUALLY IS ON THIS TABLE. The protocol's step 1
    // says "category, priority and source". `customer_complaints` has
    // `priority_id` and `source_id` columns — but NO `category_id`, and no
    // severity / product / lot columns either. Those belong to the INTERNAL
    // `complaints` table.
    //
    // The create schema USED to accept them via a `qmsComplaintFields` spread
    // while the controller's allowlist dropped them, so the request returned
    // 201 and the values vanished (defect CC-D1). That is now fixed: the
    // schema REFUSES those keys with a 400 naming the module that does hold
    // them. The refusal itself is covered by unit tests in
    // qms/backend/api/tests/schemas/customerComplaints.test.js, so this test
    // stays on its own subject — asserting the classification that is REAL
    // and persists.
    const page = await pool.page(browser, AUTH.supportAgent)
    const row = findCustomerComplaintBySubject(SUBJECT_A)
    expect(row, 'the intake tests left a row behind').not.toBeNull()

    // Step 1 — set at intake, read back from the database, not from the
    // response body: a controller that echoes its own input would pass a
    // response-shaped assertion while persisting nothing.
    const classified = sql(
      `SELECT coalesce(priority_id, ''), coalesce(source_id, ''), coalesce(customer_email, ''),
              coalesce(customer_phone, ''), coalesce(customer_name, '')
         FROM customer_complaints WHERE id = ${quote(row.id)}`,
    )
    const [, sourceId, email, phone, name] = classified.trim().split('|')

    // sourceId defaults to WEB for manual intake (the controller's
    // `sourceId || 'WEB'`), which IS the recorded source for this route.
    expect(sourceId, 'the intake source is recorded — WEB for a manual agent create').toBe('WEB')

    // Steps 3 + 5 — the customer reference detail survives a re-read.
    expect(name, 'the customer name persisted').toBe('Erin E2E Customer')
    expect(email, 'the customer contact persisted').toBe('erin.customer.j9@e2e.test')
    expect(phone, 'the customer phone persisted').toBe('+1-555-0142')

    // Step 1 (priority) — set it explicitly on a second intake and confirm it
    // round-trips. SUBJECT_B was created without one, so this proves the
    // column is genuinely writable through the create route rather than
    // defaulted into place.
    const priorityRow = findCustomerComplaintBySubject(SUBJECT_B)
    const priorityRes = await restPost(page, '/customerComplaints', {
      subject: `${SUBJECT_B} (classified)`,
      description: 'CMP-J9 — priority/source classification arm.',
      priorityId: 'HIGH',
      sourceId: 'PHONE',
      customerName: 'Erin E2E Customer',
      customerEmail: 'erin.customer.j9@e2e.test',
    })
    expect(priorityRes.status(), `classified create failed: ${await priorityRes.text()}`).toBe(201)

    const classifiedRow = findCustomerComplaintBySubject(`${SUBJECT_B} (classified)`)
    expect(classifiedRow, 'the classified intake landed').not.toBeNull()
    const persisted = sql(
      `SELECT coalesce(priority_id, ''), coalesce(source_id, '')
         FROM customer_complaints WHERE id = ${quote(classifiedRow.id)}`,
    )
    const [persistedPriority, persistedSource] = persisted.trim().split('|')
    expect(persistedPriority, 'the priority chosen at intake persisted').toBe('HIGH')
    expect(persistedSource, 'the source chosen at intake persisted').toBe('PHONE')

    // Step 5 — reopen and confirm. The detail page reads the same row through
    // the syncEngine; a value that persisted in Postgres but never reached the
    // client would be a different (and equally real) failure, so the UI read is
    // part of the step rather than a decoration.
    await page.goto(`/customer-complaints/${classifiedRow.id}`)
    await expect(
      page.getByText(classifiedRow.complaintNumber, { exact: false }).first(),
      'the reopened complaint renders its own number — the detail page hydrated',
    ).toBeVisible({ timeout: 30_000 })

    // Housekeeping: this arm minted a third row under an 'E2E J%' subject, which
    // the afterAll purge by exact subject would miss.
    sql(`DELETE FROM customer_complaints WHERE id = ${quote(classifiedRow.id)}`)
    expect(priorityRow, 'the sequence-pair row is untouched by this arm').not.toBeNull()
  })

  // ── TC-17-08 — Audit trail ────────────────────────────────────────────────

  test('TC-17-08 steps 1-3 · intake and each subsequent change leave an audit entry with actor, timestamp and diff', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.supportAgent)
    const row = findCustomerComplaintBySubject(SUBJECT_A)
    expect(row, 'the intake tests left a row behind').not.toBeNull()

    // Step 1, intake. The CREATE row comes from the trigger → worker chain
    // (createComplaint writes no inline AuditLog of its own), so this is a poll
    // barrier. `resolveAction` maps INSERT → 'CREATE'.
    await waitForAuditRow(row.id, '1970-01-01', { action: 'CREATE' })
    expect(
      auditRowsSince(row.id, '1970-01-01', { action: 'CREATE' }),
      'the intake itself is in the trail exactly once',
    ).toBe(1)

    const createRow = sql(
      `SELECT coalesce(performed_by::text, ''), coalesce(performed_at::text, '')
         FROM audit_logs
        WHERE audit_canonical_entity_type(entity_type) = 'CustomerComplaint'
          AND entity_id = ${quote(row.id)} AND action = 'CREATE'
        LIMIT 1`,
    )
    const [createActor, createAt] = createRow.trim().split('|')
    // Step 3 — performer and timestamp. `performed_by` is NULL for SYSTEM
    // actors (email intake, cron sweeps) by design; an AGENT intake must be
    // attributed, and a NULL here would mean applyAuditSessionVars lost the
    // app.current_user_id GUC on the controller's nested transaction.
    expect(createActor, 'the intake is attributed to the agent who recorded it').toBe(
      USERS.supportAgent.id,
    )
    expect(createAt, 'the intake audit entry carries a timestamp').not.toBe('')

    // Step 1 + 2, a subsequent change. `accept` is the next real lifecycle
    // action and the controller writes its own AuditLog row (singular
    // entity_type) IN ADDITION to the trigger's UPDATE row — which is exactly
    // why the canonical-alias helper is used here.
    const sinceAccept = now()
    const acceptRes = await restPost(page, `/customerComplaints/${row.id}/accept`, {})
    expect(acceptRes.status(), `accept failed: ${await acceptRes.text()}`).toBe(200)

    await waitForAuditRow(row.id, sinceAccept)
    expect(
      auditRowsSince(row.id, sinceAccept),
      'accepting the complaint added at least one audit entry',
    ).toBeGreaterThan(0)

    const afterAccept = newestAuditRow(row.id)
    expect(afterAccept, 'an audit row exists after accept').not.toBeNull()
    expect(afterAccept.performedAt, 'every entry carries a timestamp').not.toBe('')
    expect(
      afterAccept.performedBy,
      'every entry carries a performer — an agent action is never recorded as System',
    ).toBe(USERS.supportAgent.id)

    // Step 2 — "old and new values shown". The trigger-driven UPDATE row is
    // where the diff lives (`buildAuditValues` fills old_value_json /
    // new_value_json from the changed fields); the controller's action row is
    // a semantic marker and does not necessarily carry both sides. So the diff
    // assertion targets the UPDATE row specifically rather than "the newest".
    const diffRow = sql(
      `SELECT coalesce(old_value_json::text, ''), coalesce(new_value_json::text, '')
         FROM audit_logs
        WHERE audit_canonical_entity_type(entity_type) = 'CustomerComplaint'
          AND entity_id = ${quote(row.id)}
          AND performed_at > ${quote(sinceAccept)}::timestamptz
          AND old_value_json IS NOT NULL AND new_value_json IS NOT NULL
        ORDER BY performed_at DESC LIMIT 1`,
    )
    expect(
      diffRow,
      'an update entry records BOTH sides of the change — a trail that says only ' +
        '"something changed" cannot answer what an inspector asks',
    ).toBeTruthy()
    const [oldJson, newJson] = diffRow.trim().split('|')
    expect(oldJson, 'the entry shows the value before the change').not.toBe('')
    expect(newJson, 'the entry shows the value after the change').not.toBe('')
    expect(
      oldJson === newJson,
      'the two sides genuinely differ — an entry whose old and new are identical ' +
        'records nothing',
    ).toBe(false)
    // `assignedTo` is on the registry's trackFields for this table, and accept
    // self-assigns, so it is the field the diff must name.
    expect(
      `${oldJson}${newJson}`,
      'the diff names the field that actually changed (assignedTo / statusId on accept)',
    ).toMatch(/assignedTo|statusId/)
  })

  test('TC-17-08 step 4 · the audit trail is append-only — no entry can be edited or deleted', async () => {
    const row = findCustomerComplaintBySubject(SUBJECT_A)
    expect(row, 'the intake tests left a row behind').not.toBeNull()

    const entry = newestAuditRow(row.id)
    expect(entry, 'there is an audit entry to attempt a mutation against').not.toBeNull()

    // Immutability here is a DATABASE control, not an application one:
    // `audit_logs_immutable` (BEFORE DELETE OR UPDATE, FOR EACH ROW) calls
    // `prevent_audit_log_mutation()`, which raises unconditionally. The
    // Sequelize model additionally throws in a beforeUpdate hook — but a hook
    // is bypassed by raw SQL, PostGraphile and psql alike, so the trigger is
    // the control worth proving. These probes run as the SUPERUSER precisely
    // because that is the strongest possible attacker: if the owner of the
    // database cannot edit the row, nobody reachable through the app can.
    let updateRefused = false
    let updateError = ''
    try {
      sql(`UPDATE audit_logs SET action = 'TAMPERED' WHERE id = ${quote(entry.id)}`)
    } catch (err) {
      updateError = `${err.stderr ?? err.message ?? ''}`
      updateRefused = /immutable|prohibited/i.test(updateError)
    }
    expect(
      updateRefused,
      `an UPDATE against audit_logs must be refused by audit_logs_immutable. Got: ${updateError || '(no error — THE UPDATE SUCCEEDED)'}`,
    ).toBe(true)

    let deleteRefused = false
    let deleteError = ''
    try {
      sql(`DELETE FROM audit_logs WHERE id = ${quote(entry.id)}`)
    } catch (err) {
      deleteError = `${err.stderr ?? err.message ?? ''}`
      deleteRefused = /immutable|prohibited/i.test(deleteError)
    }
    expect(
      deleteRefused,
      `a DELETE against audit_logs must be refused by audit_logs_immutable. Got: ${deleteError || '(no error — THE DELETE SUCCEEDED)'}`,
    ).toBe(true)

    // The refusals must have been refusals, not no-ops. A trigger that raised
    // on a row that was never matched would look identical to one that
    // protected it, so the entry is re-read and confirmed intact.
    const after = sql(
      `SELECT action, coalesce(performed_by::text, '')
         FROM audit_logs WHERE id = ${quote(entry.id)}`,
    )
    expect(after, 'the entry still exists after both attempts').toBeTruthy()
    const [actionAfter, actorAfter] = after.trim().split('|')
    expect(actionAfter, 'the action was not rewritten').toBe(entry.action)
    expect(actorAfter, 'the actor was not rewritten').toBe(entry.performedBy)
  })
})
