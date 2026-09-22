// CMP-J8 — OQ TC-17-06: escalation of a CUSTOMER complaint to a nonconformance.
//
// WHY THIS FILE EXISTS. TC-17-06 is described in the OQ protocol
// (content/validation/oq/customer-complaints.md §1) as "the regulated join":
// a customer complaint that reveals a product problem must reach the quality
// system, and the trail between the two records is what an inspector follows.
// Nothing in the suite covered it — J3 drives the ordinary support lifecycle
// (create → accept → assign → close) and stops there, so the ONE path that
// leaves the support module and lands in the QMS had zero E2E coverage.
//
// THE CONTROL THAT MATTERS IS STEP 6, AND IT IS A DATABASE CONTROL. The
// protocol is explicit that conversion is one-way and final, "enforced at the
// database — the converted state has no outgoing edge". A missing UI button
// proves nothing about that, so every refusal below is proved by a DIRECT
// write attempt (REST for the service arm, raw SQL for both trigger arms),
// never by an absent control. Grounded on the LIVE trigger function, not on a
// doc:
//
//   enforce_customer_complaint_status_transition()   (functions.sql ~3530,
//   wired by customer_complaints_status_transition_guard, BEFORE INSERT OR
//   UPDATE OF status_id). Trust test is the module idiom:
//     current_user <> 'app_user' OR app.complaint_transition_context='trusted'
//   so a bare sql() (superuser) IS the trusted arm and sqlAsAppUser() IS the
//   untrusted (SyncEngine / raw-GraphQL) arm — no mock needed. BOTH arms
//   refuse a move off CONVERTED_TO_NC, with DIFFERENT messages:
//     untrusted → 'Customer complaint status cannot be changed directly'
//     trusted   → 'CONVERTED_TO_NC is terminal'
//   Asserting the wrong one would let a regression that deleted the terminal
//   clause still pass (the untrusted arm would swallow it), which is exactly
//   the failure mode this file is built to catch.
//
// THE LINK IS ONE ROW READ TWO WAYS. `record_links` (fromType/fromId →
// toType/toId, relation CAUSED) holds a SINGLE directional row per
// conversion — CustomerComplaint → Nonconformance. The complaint page reads
// it forward (`[fromType+fromId]`, CustomerComplaintsPageId.vue "Linked NCs")
// and NcLinkedComplaintsPanel.vue reads the SAME row backward
// (`[toType+toId]`). "Bidirectional" therefore means both lookups resolve, so
// this file asserts both lookup SHAPES in SQL, not just that a row exists —
// a regression that wrote the pair the wrong way round would satisfy a naive
// count and still blank one of the two panels. (The predecessor table
// nc_source_links was dropped 2026-08-17 for exactly this class of drift.)
//
// WHAT IS *NOT* SEALED. The protocol's own note under step 6 records the
// limit: status is frozen, descriptive fields are NOT. There is no field
// guard on customer_complaints, so a subject/description edit still lands on
// a CONVERTED_TO_NC row. This file asserts that TRUE behaviour rather than a
// seal that does not exist — if a future migration adds the seal, the test
// fails loudly and the OQ note needs rewriting, which is the right outcome.
//
// PERSONA NOTE (a real gating divergence, see the last test). The REST route
// gates on `enforcePermission('complaint_management','update')` ALONE, while
// the UI's `canConvert` requires `complaint_management:update` AND
// `ncr:create`. supportAgent holds the former and not the latter, so the
// button is hidden for them and the endpoint still accepts their call. The
// happy path below therefore runs as `owner` (isOwner bypass, holds both) so
// it exercises the intended journey; the divergence gets its own probe.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, DEPARTMENTS, SITES, USERS } from '../fixtures/cast.js'
import { sql, sqlAsAppUser, sqlValue } from '../fixtures/db.js'
import {
  createPersonaPool,
  errorMessage,
  findCustomerComplaintBySubject,
  purgeCustomerComplaintBySubject,
  purgeMintedCustomerComplaints,
  restPost,
} from '../fixtures/complaints.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

const SUBJECT = 'E2E J8 Customer Complaint (escalation)'
const NC_TITLE = 'E2E J8 NC from customer complaint'

// The seeded NCR workflow's published version (e2e-seed.sql §"E2E NCR Review
// & Approval", workflow_versions e2ef1002-…0001). convertToNcSchema requires
// a uuid here and the controller hands it straight to Nonconformance.create,
// so it must be a REAL published version of this tenant — a made-up uuid
// would fail the FK, not the assertion under test.
const NCR_WORKFLOW_VERSION_ID = 'e2ef1002-0000-4000-8000-000000000001'

// ── Local helpers ───────────────────────────────────────────────────────────
// Deliberately NOT added to fixtures/complaints.js: that file is being
// extended in parallel, and everything here is specific to this one journey.

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`

/**
 * The NC this journey minted, straight out of Postgres. Null when absent.
 *
 * ⚠ `description` IS FETCHED SEPARATELY, AND THAT IS NOT TIDINESS.
 * The pre-filled description is multi-line by construction — the controller
 * builds `Raised from customer complaint(s):\n<CC-number>: <subject>`. psql in
 * tuples-only mode emits that newline verbatim, so the single-query form had
 * to `out.split('\n')[0]` to isolate the row and truncated the description at
 * exactly the point the CC number begins. The steps 1–2 assertion then failed
 * against a product that was entirely correct — it was the reader that was
 * wrong. Newlines are replaced with a literal marker so the value survives the
 * line-oriented transport, and restored here.
 */
function findNcByTitle(title) {
  const out = sql(
    `SELECT id, nc_number, status_id, source_id, type_id, site_id, department_id
       FROM nonconformances WHERE title = ${quote(title)} AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
  )
  if (!out) return null
  const [id, ncNumber, statusId, sourceId, typeId, siteId, departmentId] = out
    .split('\n')[0]
    .split('|')
  const description = sql(
    `SELECT replace(coalesce(description, ''), chr(10), '<<NL>>')
       FROM nonconformances WHERE id = ${quote(id)}`,
  )
    .split('\n')[0]
    .split('<<NL>>')
    .join('\n')
  return { id, ncNumber, statusId, sourceId, typeId, siteId, departmentId, description }
}

/**
 * How many `record_links` rows exist for one directional lookup, matching the
 * exact shape a panel queries with. Both panels index on the COMPOSITE
 * (type,id) pair, so the probe pins both columns rather than the id alone.
 */
function linkCount({ fromType, fromId, toType, toId }) {
  const where = [
    fromType ? `from_type = ${quote(fromType)}` : null,
    fromId ? `from_id = ${quote(fromId)}` : null,
    toType ? `to_type = ${quote(toType)}` : null,
    toId ? `to_id = ${quote(toId)}` : null,
    'deleted_at IS NULL',
  ]
    .filter(Boolean)
    .join(' AND ')
  return Number(sqlValue(`SELECT count(*) FROM record_links WHERE ${where}`))
}

/** Attempt a CC status write as `app_user` — the untrusted (SyncEngine) arm. */
function ccStatusWriteAsAppUser(userId, complaintId, statusId) {
  return sqlAsAppUser(
    `UPDATE customer_complaints SET status_id = ${quote(statusId)} WHERE id = ${quote(complaintId)};`,
    { userId, companyId: COMPANY_ID },
  )
}

/** Attempt a CC status write as the superuser — the TRUSTED (service) arm. */
function ccStatusWriteTrusted(complaintId, statusId) {
  try {
    sql(
      `UPDATE customer_complaints SET status_id = ${quote(statusId)} WHERE id = ${quote(complaintId)}`,
    )
    return { ok: true, error: '' }
  } catch (err) {
    return { ok: false, error: `${err.stderr ?? err.message ?? ''}` }
  }
}

/**
 * A harmless NON-status write as `app_user`. Proves the persona actually
 * reaches the row through `customer_complaints_upd` (the authz-generated
 * UPDATE policy) — so a paired status-write refusal on the SAME row is
 * unambiguously the TRIGGER and not the policy filtering the row out first.
 * Same two-sidedness discipline as CMP-J2: a POLICY refusal succeeds against
 * zero rows and never throws, so `ok` alone cannot tell the two apart.
 */
function ccTouchAsAppUser(userId, complaintId) {
  return sqlAsAppUser(
    `UPDATE customer_complaints SET subject = subject WHERE id = ${quote(complaintId)} RETURNING id;`,
    { userId, companyId: COMPANY_ID },
  )
}

/**
 * Remove the NC this journey minted AND its lineage rows.
 *
 * Both halves matter. Leaving the NC behind collides on the next run (the
 * title is fixed and `findNcByTitle` takes the newest, so a stale DRAFT would
 * accumulate and the NC-number assertions would drift); leaving the
 * record_links row behind leaves a lineage edge pointing at a deleted NC,
 * which the NC panel on any OTHER complaint would try to resolve. audit_logs
 * rows are deliberately NOT deleted — that table is immutable by policy
 * (see fixtures/auditLogs.js) and its rows are scoped to ids that are gone.
 */
function purgeNcByTitle(title) {
  const ids = sql(
    `SELECT id FROM nonconformances WHERE title = ${quote(title)}`,
  )
  if (!ids) return
  const list = ids
    .split('\n')
    .map((id) => quote(id.trim()))
    .join(', ')
  sql(`DELETE FROM record_links WHERE to_type = 'Nonconformance' AND to_id IN (${list})`)
  sql(`DELETE FROM nc_records WHERE nc_id IN (${list})`)
  sql(`DELETE FROM nonconformances WHERE id IN (${list})`)
}

/** Every lineage row hanging off this journey's complaint, by subject. */
function purgeLinksForComplaintSubject(subject) {
  sql(
    `DELETE FROM record_links
      WHERE from_type = 'CustomerComplaint'
        AND from_id IN (SELECT id FROM customer_complaints WHERE subject = ${quote(subject)})`,
  )
}

/** Mint a fresh NEW customer complaint through the real create route. */
async function mintComplaint(page) {
  const res = await restPost(page, '/customerComplaints', {
    subject: SUBJECT,
    description: 'Seeded by CMP-J8 — escalation journey (OQ TC-17-06).',
    customerName: 'Erin E2E Customer',
    customerEmail: 'erin.customer.j8@e2e.test',
  })
  expect(res.status(), `arrange (create) failed: ${await res.text()}`).toBe(201)
  return findCustomerComplaintBySubject(SUBJECT)
}

/** The convertToNc payload, with every schema-required field supplied. */
function convertPayload(complaintId, overrides = {}) {
  return {
    complaintIds: [complaintId],
    title: NC_TITLE,
    siteId: SITES.primary.id,
    departmentId: DEPARTMENTS.quality.id,
    severityId: 'MAJOR',
    detectedAt: '2026-09-22',
    ownerId: USERS.owner.id,
    workflowVersionId: NCR_WORKFLOW_VERSION_ID,
    ...overrides,
  }
}

test.describe.configure({ mode: 'serial' })

test.describe('CMP-J8 · OQ TC-17-06 — escalation to a nonconformance', () => {
  test.beforeAll(() => {
    purgeMintedCustomerComplaints()
    purgeLinksForComplaintSubject(SUBJECT)
    purgeCustomerComplaintBySubject(SUBJECT)
    purgeNcByTitle(NC_TITLE)
  })

  test.afterAll(() => {
    // BOTH sides, or the next run collides: the complaint (fixed subject) and
    // the NC it minted (fixed title), plus the lineage row joining them.
    purgeLinksForComplaintSubject(SUBJECT)
    purgeNcByTitle(NC_TITLE)
    purgeCustomerComplaintBySubject(SUBJECT)
  })

  // ── OQ steps 1 + 2 ────────────────────────────────────────────────────────
  test('steps 1–2 · conversion mints an NC with its own number, pre-filled from the complaint', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.owner)
    const complaint = await mintComplaint(page)
    expect(complaint, 'the complaint was created').not.toBeNull()
    expect(complaint.statusId, 'a fresh ticket starts at NEW').toBe('NEW')

    const res = await restPost(page, '/customerComplaints/convertToNc', convertPayload(complaint.id))
    expect(res.status(), `convertToNc failed: ${await res.text()}`).toBe(201)
    const body = await res.json()
    expect(body.nonconformance?.id, 'the response carried the new NC').toBeTruthy()

    const nc = findNcByTitle(NC_TITLE)
    expect(nc, 'the NC landed in `nonconformances`').not.toBeNull()

    // Step 2 — "The NC is created with its own number". The NC gets an NC-
    // number off the tenant's own NcCounter; it does NOT inherit or reuse the
    // complaint's CC- number. Asserting both halves, because a regression that
    // copied the complaint number across would still produce "a number".
    expect(nc.ncNumber, 'the NC minted its own NC- number').toMatch(/^NC-\d+$/)
    expect(nc.ncNumber, 'the NC number is NOT the complaint number').not.toBe(
      complaint.complaintNumber,
    )

    // Step 1 — "pre-filled from the complaint". Three fields the controller
    // derives rather than takes from the caller:
    expect(nc.sourceId, "source is stamped 'CUSTOMER_COMPLAINT', not the caller's choice").toBe(
      'CUSTOMER_COMPLAINT',
    )
    expect(nc.typeId, 'type defaults to CUSTOMER_RETURN when the caller omits it').toBe(
      'CUSTOMER_RETURN',
    )
    expect(
      nc.description,
      'the description is pre-filled with the originating complaint number + subject',
    ).toContain(complaint.complaintNumber)
    expect(nc.description, 'the pre-fill carries the complaint subject too').toContain(SUBJECT)

    // The NC opens in DRAFT, exactly like createAndSubmitNc — conversion
    // raises the quality record, it does not pre-approve it.
    expect(nc.statusId, 'the NC opens in DRAFT, not part-way through its lifecycle').toBe('DRAFT')
  })

  // ── OQ steps 3 + 4 — the bidirectional link, asserted in the DB ───────────
  test('steps 3–4 · the link resolves in BOTH directions (record_links, both lookup shapes)', async () => {
    const complaint = findCustomerComplaintBySubject(SUBJECT)
    const nc = findNcByTitle(NC_TITLE)
    expect(complaint && nc, 'the conversion test left both records behind').toBeTruthy()

    // Forward — what CustomerComplaintsPageId.vue's "Linked NCs" panel reads:
    // db.RecordLink.where('[fromType+fromId]', ['CustomerComplaint', id]),
    // then filters toType === 'Nonconformance'.
    expect(
      linkCount({ fromType: 'CustomerComplaint', fromId: complaint.id, toType: 'Nonconformance' }),
      'the complaint→NC lookup (the complaint page\'s Linked NCs panel) resolves',
    ).toBe(1)
    expect(
      linkCount({
        fromType: 'CustomerComplaint',
        fromId: complaint.id,
        toType: 'Nonconformance',
        toId: nc.id,
      }),
      'and it points at THIS NC, not some other one',
    ).toBe(1)

    // Reverse — what NcLinkedComplaintsPanel.vue reads off the SAME row:
    // db.RecordLink.where('[toType+toId]', ['Nonconformance', ncId]), then
    // filters fromType ∈ {Complaint, CustomerComplaint}.
    expect(
      linkCount({ toType: 'Nonconformance', toId: nc.id, fromType: 'CustomerComplaint' }),
      "the NC→complaint lookup (the NC's originating-complaint panel) resolves",
    ).toBe(1)

    // The fromType discriminator is load-bearing, not decoration. The dropped
    // nc_source_links table stamped BOTH complaint kinds 'CUSTOMER_COMPLAINT',
    // so an internal `Complaint` id was looked up in customer_complaints and
    // silently vanished from the panel. record_links must name the right kind.
    expect(
      sqlValue(
        `SELECT from_type FROM record_links
          WHERE to_type = 'Nonconformance' AND to_id = ${quote(nc.id)} AND deleted_at IS NULL
          ORDER BY created_at DESC LIMIT 1`,
      ),
      "fromType is 'CustomerComplaint' — the SUPPORT table, not the internal `Complaint` one",
    ).toBe('CustomerComplaint')

    expect(
      sqlValue(
        `SELECT relation FROM record_links
          WHERE from_id = ${quote(complaint.id)} AND to_id = ${quote(nc.id)} AND deleted_at IS NULL
          LIMIT 1`,
      ),
      'the lineage relation is CAUSED (complaint is upstream, NC downstream)',
    ).toBe('CAUSED')

    // Cross-tenant sanity: lineage carries the tenant, so a link can never be
    // read from the other company.
    expect(
      sqlValue(
        `SELECT company_id FROM record_links
          WHERE from_id = ${quote(complaint.id)} AND to_id = ${quote(nc.id)} LIMIT 1`,
      ),
      'the lineage row is stamped with the acting tenant',
    ).toBe(COMPANY_ID)
  })

  // ── OQ step 5 ─────────────────────────────────────────────────────────────
  test('step 5 · the complaint status reflects the escalation', async () => {
    const complaint = findCustomerComplaintBySubject(SUBJECT)
    expect(
      complaint.statusId,
      'the escalated complaint sits in CONVERTED_TO_NC, not NEW/OPEN/CLOSED',
    ).toBe('CONVERTED_TO_NC')
  })

  // ── OQ step 6 — THE CONTROL. Three arms, all direct writes. ──────────────
  test('step 6a · the SERVICE layer refuses every onward action on a converted complaint', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.owner)
    const complaint = findCustomerComplaintBySubject(SUBJECT)

    // Not "the button is gone" — these are real POSTs to the real routes.
    // Every action in the module funnels through assertMutable(), which
    // treats CONVERTED_TO_NC as terminal alongside CLOSED.
    for (const action of ['accept', 'resolve', 'close', 'hold', 'submitForReview']) {
      const res = await restPost(page, `/customerComplaints/${complaint.id}/${action}`, {})
      expect(
        res.status(),
        `POST /${action} on a CONVERTED_TO_NC complaint must be refused, not accepted`,
      ).toBe(409)
      expect(
        await errorMessage(res),
        `the /${action} refusal names the converted state`,
      ).toContain('CONVERTED_TO_NC')
    }

    // Reopen takes a DIFFERENT path (its own from-check, not assertMutable) —
    // "only resolved or closed complaints can be reopened". Worth its own
    // assertion: a regression that widened that list to include
    // CONVERTED_TO_NC would sail past the loop above.
    const reopened = await restPost(page, `/customerComplaints/${complaint.id}/reopen`, {})
    expect(reopened.status(), 'reopening a converted complaint is refused').toBe(409)
    expect(
      await errorMessage(reopened),
      'the reopen refusal says only resolved/closed complaints may reopen',
    ).toMatch(/resolved or closed/i)

    // Converting a second time is refused too — one complaint, one NC.
    const twice = await restPost(
      page,
      '/customerComplaints/convertToNc',
      convertPayload(complaint.id, { title: `${NC_TITLE} (second attempt)` }),
    )
    expect(twice.status(), 're-converting an already-converted complaint is refused').toBe(409)
    expect(await errorMessage(twice), 'the refusal names the complaint already converted').toContain(
      complaint.complaintNumber,
    )
    expect(
      findNcByTitle(`${NC_TITLE} (second attempt)`),
      'the refused second conversion left NO orphan NC behind (the whole action is one txn)',
    ).toBeNull()

    expect(
      findCustomerComplaintBySubject(SUBJECT).statusId,
      'after every refused action the complaint is STILL CONVERTED_TO_NC',
    ).toBe('CONVERTED_TO_NC')
  })

  test('step 6b · the DATABASE refuses it too — untrusted arm (SyncEngine / raw GraphQL)', async () => {
    const complaint = findCustomerComplaintBySubject(SUBJECT)

    // Two-sided, per CMP-J2's discipline. First prove supportAgent actually
    // REACHES the row through customer_complaints_upd — they hold
    // complaint_management:update at TENANT scope, so the policy admits them.
    // Without this, a status-write refusal could just be the policy matching
    // zero rows (which SUCCEEDS silently and would read as a passing guard).
    const reach = ccTouchAsAppUser(USERS.supportAgent.id, complaint.id)
    expect(
      reach.ok && reach.output.includes(complaint.id),
      `the UPDATE policy admits supportAgent to this row (stderr: ${reach.error})`,
    ).toBeTruthy()

    // Now the status write on that same reachable row. It must RAISE.
    for (const target of ['OPEN', 'CLOSED', 'RESOLVED', 'NEW']) {
      const res = ccStatusWriteAsAppUser(USERS.supportAgent.id, complaint.id, target)
      expect(
        res.ok,
        `a raw app_user status write to ${target} must be REFUSED, not silently applied`,
      ).toBeFalsy()
      expect(res.error, 'the untrusted arm raises the QMSCM guard error').toContain(
        'Customer complaint status cannot be changed directly',
      )
    }

    expect(
      findCustomerComplaintBySubject(SUBJECT).statusId,
      'the row survived every untrusted attempt unchanged',
    ).toBe('CONVERTED_TO_NC')
  })

  test('step 6c · the DATABASE refuses it on the TRUSTED arm too — CONVERTED_TO_NC has no outgoing edge', async () => {
    const complaint = findCustomerComplaintBySubject(SUBJECT)

    // This is the assertion the protocol's step 6 actually describes: "the
    // converted state has no outgoing edge". A service bug (or a hand-run
    // migration) that writes the row as the superuser bypasses RLS and
    // assertMutable entirely — the ONLY thing left standing is the trigger's
    // terminal clause, and this arm is the only place it can be observed.
    //
    // Note the message differs from 6b's: the untrusted arm returns before
    // the edge table is consulted, so asserting 6b's text here would pass
    // even if the terminal clause were deleted.
    for (const target of ['OPEN', 'CLOSED', 'RESOLVED', 'PENDING_APPROVAL']) {
      const res = ccStatusWriteTrusted(complaint.id, target)
      expect(
        res.ok,
        `even the TRUSTED path cannot move a converted complaint to ${target}`,
      ).toBeFalsy()
      expect(res.error, 'the trusted arm names the terminal state explicitly').toContain(
        'CONVERTED_TO_NC is terminal',
      )
    }

    // A no-op write is NOT an error — the guard returns early when status_id
    // is unchanged. Pinning this stops a future "tighten the guard" change
    // from breaking every ordinary UPDATE on a converted row.
    expect(
      ccStatusWriteTrusted(complaint.id, 'CONVERTED_TO_NC').ok,
      'writing the SAME status back is a no-op the guard allows through',
    ).toBeTruthy()

    expect(
      findCustomerComplaintBySubject(SUBJECT).statusId,
      'the complaint is still CONVERTED_TO_NC after the whole probe',
    ).toBe('CONVERTED_TO_NC')
  })

  // ── OQ step 7 ─────────────────────────────────────────────────────────────
  test('step 7 · the conversion is recorded in the complaint audit trail', async () => {
    const complaint = findCustomerComplaintBySubject(SUBJECT)
    const nc = findNcByTitle(NC_TITLE)

    // No waitForSqlValue here on purpose. Most audit rows in this suite are
    // enqueued by audit_trigger and written asynchronously by graphile_worker,
    // so they need a barrier — but convertToNc writes db.AuditLog.create()
    // INSIDE its own transaction, so the row is already committed by the time
    // the 201 returned. Polling would only hide a regression that moved this
    // write off the synchronous path.
    const row = sql(
      `SELECT action, performed_by, new_value_json::text FROM audit_logs
        WHERE entity_type = 'CustomerComplaint' AND entity_id = ${quote(complaint.id)}
          AND action = 'CONVERT_TO_NC'
        ORDER BY created_at DESC LIMIT 1`,
    )
    expect(row, 'a CONVERT_TO_NC entry exists on the COMPLAINT').toBeTruthy()
    const [action, performedBy, newValueJson] = row.split('\n')[0].split('|')
    expect(action).toBe('CONVERT_TO_NC')
    expect(performedBy, 'the entry carries the performer').toBe(USERS.owner.id)
    expect(
      newValueJson,
      'the entry records WHICH NC the complaint became — the inspector-followable half',
    ).toContain(nc.ncNumber)

    // The other side of the trail: the NC's own creation entry names the
    // complaint it came from, so the lineage survives even if record_links
    // were ever pruned.
    const ncRow = sqlValue(
      `SELECT new_value_json::text FROM audit_logs
        WHERE entity_type = 'Nonconformance' AND entity_id = ${quote(nc.id)} AND action = 'CREATE'
        ORDER BY created_at DESC LIMIT 1`,
    )
    expect(ncRow, "the NC's CREATE entry exists").toBeTruthy()
    expect(
      ncRow,
      'and it names the originating complaint number (convertedFrom)',
    ).toContain(complaint.complaintNumber)

    // Audit rows are immutable — nothing above can be walked back.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM audit_logs
            WHERE entity_type = 'CustomerComplaint' AND entity_id = ${quote(complaint.id)}
              AND action = 'CONVERT_TO_NC'`,
        ),
      ),
      'exactly one conversion entry — the action ran once',
    ).toBe(1)
  })

  // ── The documented LIMIT (protocol note under step 6) ────────────────────
  test('documented limit · status is sealed but DESCRIPTIVE fields are NOT frozen', async () => {
    const complaint = findCustomerComplaintBySubject(SUBJECT)
    const probe = `${SUBJECT} [edited after escalation]`

    // The OQ note is explicit: "the status cannot change, but the complaint's
    // descriptive fields are not technically frozen — the same position as a
    // closed complaint. The audit trail captures any such edit."
    //
    // There is NO field guard on customer_complaints (the table carries only
    // customer_complaints_status_transition_guard + the audit trigger), so a
    // subject write as app_user lands. Asserting the TRUE behaviour, not a
    // seal that does not exist. If a migration ever adds that seal this test
    // fails — which is the correct signal: the protocol note would then be
    // stale and must be rewritten.
    const edit = sqlAsAppUser(
      `UPDATE customer_complaints SET subject = ${quote(probe)} WHERE id = ${quote(complaint.id)} RETURNING id;`,
      { userId: USERS.supportAgent.id, companyId: COMPANY_ID },
    )
    expect(
      edit.ok,
      `a descriptive-field edit on a converted complaint is NOT refused (stderr: ${edit.error})`,
    ).toBeTruthy()
    expect(
      edit.output.includes(complaint.id),
      'and it genuinely matched the row — not a policy no-op against zero rows',
    ).toBeTruthy()
    expect(
      sqlValue(`SELECT subject FROM customer_complaints WHERE id = ${quote(complaint.id)}`),
      'the new subject is persisted: descriptive fields are open by design',
    ).toBe(probe)

    // …while the status it sits behind is still sealed. The two facts
    // together ARE the documented limit; asserting either alone misstates it.
    expect(
      sqlValue(`SELECT status_id FROM customer_complaints WHERE id = ${quote(complaint.id)}`),
      'the edit did not (and could not) move the status',
    ).toBe('CONVERTED_TO_NC')

    // Restore the subject so afterAll's subject-keyed purge still finds it.
    sql(
      `UPDATE customer_complaints SET subject = ${quote(SUBJECT)} WHERE id = ${quote(complaint.id)}`,
    )
  })

  // ── Gating divergence found while grounding this file ────────────────────
  test('gating · the convert ROUTE accepts complaint_management:update alone, though the UI also demands ncr:create', async ({
    browser,
  }) => {
    // Regression lock on a real divergence, not a nicety. The route is gated
    // `enforcePermission('complaint_management','update')` and NOTHING else,
    // while CustomerComplaintsPageId.vue's `canConvert` requires
    // complaint_management:update AND ncr:create. supportAgent holds the
    // former only (e2e-seed.sql §45: create/read/update on
    // complaint_management, and the trailing DELETE guarantees nothing more),
    // so the Convert button is hidden from them — yet the endpoint takes
    // their call and mints an NC in a module they hold no create on.
    //
    // This test asserts TODAY'S behaviour. If the route is later tightened to
    // require ncr:create, it fails at the status line and should be flipped
    // to expect 403 — that failure is the point.
    const page = await pool.page(browser, AUTH.supportAgent)

    const res = await restPost(page, '/customerComplaints/convertToNc', {
      ...convertPayload('00000000-0000-4000-8000-000000000000'),
      title: `${NC_TITLE} (gating probe)`,
    })

    // 400 "One or more complaints were not found" means the PERMISSION gate
    // let the call through and the controller reached its body — the probe
    // uses a nonexistent complaint id precisely so it cannot mint anything.
    // A 403 would mean the gate stopped it.
    expect(
      res.status(),
      'complaint_management:update alone passes the convert route gate (UI-only ncr:create check)',
    ).toBe(400)
    expect(await errorMessage(res), 'it failed on the complaint lookup, not on permission').toMatch(
      /not found/i,
    )
    expect(
      findNcByTitle(`${NC_TITLE} (gating probe)`),
      'nothing was minted by the probe',
    ).toBeNull()
  })
})
