// Shared flows + DB assertions for the Complaints journeys.
//
// TWO SEPARATE MODULES, ONE FILE. `complaints` (internal Quality Complaints,
// table `complaints`, CMP- numbers) and `complaint_management` (Customer
// Complaints / support, table `customer_complaints`, CC- numbers) are
// distinct authz modules granted independently — see e2e-seed.sql §45 and
// docs/modules/complaints/README.md's "two sibling subsystems" note. A grant
// on one says nothing about the other.
//
// THE ROUTE NAMING IS A TRAP. `/complaints` (QaComplaintsIndex.vue) is a QA
// lens over the INTERNAL `complaints` table (`db.Complaint`) — despite an
// in-code comment on that very file claiming it "writes to the same
// customer_complaints table". Verified by reading the component: every query
// is `db.Complaint`, and create POSTs to `/v1/services/complaints`. The
// separate `/customer-complaints` route is the support ticket surface over
// `db.CustomerComplaint`. Do not let the misleading comment redirect a journey
// at the wrong table.
//
// STATUSES. Internal complaints use the unified DRAFT / OPEN / CLOSED /
// CANCELLED vocabulary (20260828180000-unify-complaint-statuses.js) — NOT the
// NEW/IN_PROGRESS/RESOLVED/CONVERTED_TO_NC set the module's own (superseded)
// 07-state-machine.md still shows in its body text. Live edges: DRAFT->OPEN,
// DRAFT->CANCELLED, OPEN->CLOSED, OPEN->CANCELLED, CLOSED->OPEN. `createComplaint`
// always lands a new row at OPEN — DRAFT is reachable only as the column
// default (20260901240000), never written by any controller path; see the
// README note this file's journeys point at.
import { sql, sqlAsAppUser, sqlRow, sqlValue } from './db.js'
import { COMPANY_ID } from './cast.js'

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`

/**
 * One browser context per persona, shared by every test in a spec file. Same
 * shape as fixtures/equipment.js's pool — a fresh context is a brand new
 * IndexedDB, and opening one per test wastes most of a run re-bootstrapping
 * the same rows.
 */
export function createPersonaPool() {
  const pool = new Map()
  return {
    async page(browser, storageState) {
      if (!pool.has(storageState)) {
        const ctx = await browser.newContext({ storageState })
        pool.set(storageState, { ctx, page: await ctx.newPage() })
      }
      return pool.get(storageState).page
    },
    async close() {
      for (const { ctx } of pool.values()) await ctx.close().catch(() => {})
      pool.clear()
    },
  }
}

// ── Internal `complaints` (Quality Complaints) ──────────────────────────────

/** One internal complaint, straight out of Postgres. */
export function findComplaint(id) {
  const row = sqlRow(
    `SELECT complaint_number, subject, status_id, owner_id, site_id, company_id, deleted_at
       FROM complaints WHERE id = ${quote(id)}`,
  )
  if (!row) return null
  const nz = (v) => (v === '' ? null : v)
  return {
    complaintNumber: row[0],
    subject: row[1],
    statusId: row[2],
    ownerId: nz(row[3]),
    siteId: nz(row[4]),
    companyId: row[5],
    deletedAt: nz(row[6]),
  }
}

/** The live row for a subject substring, ignoring tombstones. Null when none. */
export function findComplaintBySubject(subject) {
  const id = sqlValue(
    `SELECT id FROM complaints WHERE subject = ${quote(subject)} AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
  )
  return id ? { id, ...findComplaint(id) } : null
}

/**
 * Hard-remove throwaway complaints a test minted (by exact subject).
 *
 * `complaint_number` is a generated CMP- sequence, not something a test picks,
 * so subject is the handle. DELETE rather than restore — these never existed
 * as far as the fixture set is concerned. Workflow rows (workflow_instances /
 * complaint_records) cascade or are left as harmless orphans the same way
 * departments/equipment purges accept; nothing FKs INTO a complaint from a
 * table this suite cares about keeping clean.
 */
export function purgeComplaintBySubject(subject) {
  sql(
    `DELETE FROM complaint_records WHERE complaint_id IN (SELECT id FROM complaints WHERE subject = ${quote(subject)})`,
  )
  sql(
    `DELETE FROM workflow_instances WHERE resource_type = 'Complaint' AND resource_id IN (SELECT id FROM complaints WHERE subject = ${quote(subject)})`,
  )
  sql(`DELETE FROM complaints WHERE subject = ${quote(subject)}`)
}

/**
 * Purge every complaint a previous run of this suite minted (subjects are
 * prefixed 'E2E J'). Worth calling once at the start of the first spec: a run
 * that dies mid-test leaves throwaway rows that would otherwise inflate list
 * counts and confuse "my queue" filters in later specs.
 */
export function purgeMintedComplaints() {
  sql(
    `DELETE FROM complaint_records WHERE complaint_id IN (SELECT id FROM complaints WHERE subject LIKE 'E2E J%')`,
  )
  sql(
    `DELETE FROM workflow_instances WHERE resource_type = 'Complaint' AND resource_id IN (SELECT id FROM complaints WHERE subject LIKE 'E2E J%')`,
  )
  sql(`DELETE FROM complaints WHERE subject LIKE 'E2E J%'`)
}

/** Workflow instance (and its steps) for one complaint's QA-review. */
export function workflowInstanceForComplaint(complaintId) {
  const row = sqlRow(
    `SELECT id, status_id FROM workflow_instances WHERE resource_type = 'Complaint' AND resource_id = ${quote(complaintId)} ORDER BY created_at DESC LIMIT 1`,
  )
  return row ? { id: row[0], statusId: row[1] } : null
}

export function workflowStepsForInstance(workflowInstanceId) {
  const out = sql(
    `SELECT id, name, step_type, status_id FROM workflow_instance_steps WHERE workflow_instance_id = ${quote(workflowInstanceId)} ORDER BY step_order`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [id, name, stepType, statusId] = line.split('|')
    return { id, name, stepType, statusId }
  })
}

// ── QMSCM lifecycle-guard probes (enforce_complaint_status_transition) ──────
// Same idiom as fixtures/records.js's REC-J3 helpers: the guard's trust check
// is `current_user <> 'app_user' OR <GUC>`, so a bare `sql()` UPDATE (which
// connects as the Postgres superuser) IS the trusted path, and `sqlAsAppUser`
// IS the untrusted (SyncEngine/raw-GraphQL) path — no separate mock needed.

/** Attempt one status write as `app_user` — the untrusted (SyncEngine) path. */
export function statusWriteAsAppUser(userId, complaintId, statusId) {
  return sqlAsAppUser(
    `UPDATE complaints SET status_id = ${quote(statusId)} WHERE id = ${quote(complaintId)};`,
    { userId, companyId: COMPANY_ID },
  )
}

/** Attempt one status write as the superuser — the trusted (REST/service) path. */
export function statusWriteTrusted(complaintId, statusId) {
  try {
    sql(`UPDATE complaints SET status_id = ${quote(statusId)} WHERE id = ${quote(complaintId)}`)
    return { ok: true, error: '' }
  } catch (err) {
    return { ok: false, error: `${err.stderr ?? err.message ?? ''}` }
  }
}

/**
 * INSERT one complaint directly in a given status, as the trusted (superuser)
 * path — used only to ARRANGE a DRAFT-status precondition, since no app path
 * ever creates one (createComplaint hardcodes OPEN). Returns {ok, error} like
 * statusWriteTrusted so a refused arrange (e.g. INSERT ... CLOSED, which the
 * INSERT arm also refuses) reads the same way.
 */
export function insertComplaintTrusted(id, statusId, { subject = 'CMP-J2 probe', ownerId } = {}) {
  try {
    sql(
      `INSERT INTO complaints (id, company_id, subject, status_id, owner_id, created_by, updated_by)
       VALUES (${quote(id)}, '${COMPANY_ID}', ${quote(subject)}, ${quote(statusId)}, ${ownerId ? quote(ownerId) : 'NULL'}, ${ownerId ? quote(ownerId) : 'NULL'}, ${ownerId ? quote(ownerId) : 'NULL'})`,
    )
    return { ok: true, error: '' }
  } catch (err) {
    return { ok: false, error: `${err.stderr ?? err.message ?? ''}` }
  }
}

/** INSERT one complaint as `app_user` — the untrusted path's own INSERT arm. */
export function insertComplaintAsAppUser(userId, id, statusId, { subject = 'CMP-J2 probe' } = {}) {
  return sqlAsAppUser(
    `INSERT INTO complaints (id, company_id, subject, status_id, created_by, updated_by)
     VALUES (${quote(id)}, '${COMPANY_ID}', ${quote(subject)}, ${quote(statusId)}, ${quote(userId)}, ${quote(userId)});`,
    { userId, companyId: COMPANY_ID },
  )
}

/**
 * A harmless non-status write as `app_user` — proves a persona reaches the
 * row via `complaint_update_rls` at all, so a paired status-write refusal on
 * the same row is unambiguously the TRIGGER and not the policy filtering the
 * row out first.
 */
export function touchAsAppUser(userId, complaintId) {
  return sqlAsAppUser(
    `UPDATE complaints SET subject = subject WHERE id = ${quote(complaintId)} RETURNING id;`,
    { userId, companyId: COMPANY_ID },
  )
}

/** Hard-remove probe rows by id (status-machine probes never existed as far
 *  as the fixture set is concerned). */
export function purgeComplaintsById(ids) {
  if (!ids.length) return
  const list = ids.map(quote).join(', ')
  sql(`DELETE FROM complaint_records WHERE complaint_id IN (${list})`)
  sql(
    `DELETE FROM workflow_instances WHERE resource_type = 'Complaint' AND resource_id IN (${list})`,
  )
  sql(`DELETE FROM complaints WHERE id IN (${list})`)
}

// ── Customer Complaints (`customer_complaints`, support) ────────────────────

export function findCustomerComplaint(id) {
  const row = sqlRow(
    `SELECT complaint_number, subject, status_id, assigned_to, company_id, deleted_at
       FROM customer_complaints WHERE id = ${quote(id)}`,
  )
  if (!row) return null
  const nz = (v) => (v === '' ? null : v)
  return {
    complaintNumber: row[0],
    subject: row[1],
    statusId: row[2],
    assignedTo: nz(row[3]),
    companyId: row[4],
    deletedAt: nz(row[5]),
  }
}

export function findCustomerComplaintBySubject(subject) {
  const id = sqlValue(
    `SELECT id FROM customer_complaints WHERE subject = ${quote(subject)} AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
  )
  return id ? { id, ...findCustomerComplaint(id) } : null
}

export function purgeCustomerComplaintBySubject(subject) {
  sql(`DELETE FROM customer_complaints WHERE subject = ${quote(subject)}`)
}

/**
 * Remove customer complaints MINTED by a journey (subject `E2E J…`).
 *
 * ⚠ J11 IS EXCLUDED, AND IT HAS TO BE.
 * This is called from four specs' `beforeAll` (j3, j8, j9, j10). J11 seeds its
 * fixtures ONCE in its own `beforeAll` and then reads them across ~20 tests,
 * and its subjects also begin `E2E J11 …` — so whichever of those four ran
 * after J11 had seeded deleted J11's rows out from under it, and six J11 tests
 * failed with "Customer complaint not found" despite passing in isolation.
 * That is exactly the failure mode a broad LIKE purge produces: invisible when
 * a file runs alone, and blamed on the wrong spec when the suite runs whole.
 *
 * The exclusion is narrow on purpose — J11's fixtures are explicitly seeded
 * and explicitly purged by its own `purgeJ11()`, so nothing here is leaked.
 */
export function purgeMintedCustomerComplaints() {
  sql(`DELETE FROM customer_complaints WHERE subject LIKE 'E2E J%' AND subject NOT LIKE 'E2E J11 %'`)
}

/**
 * Reset the assignment on the shared J3/J4 fixture (CUSTOMER_COMPLAINTS.unassigned)
 * back to unassigned. `ON CONFLICT DO NOTHING` in the seed can never undo an
 * assignment a journey made, so a spec that assigns it must restore this in
 * its own afterAll — this helper is the one place that restore logic lives.
 */
export function resetCustomerComplaintAssignment(id) {
  sql(
    `UPDATE customer_complaints SET assigned_to = NULL, status_id = 'NEW', updated_at = NOW() WHERE id = ${quote(id)}`,
  )
}

// ── REST ────────────────────────────────────────────────────────────────────
// `page.request` inherits the page's cookies — these speak as the persona the
// context was opened for.
export async function restPost(page, path, body) {
  return page.request.post(`/api/v1/services${path}`, { data: body ?? {} })
}

/** The message an API error carried (same two response shapes as everywhere else). */
export async function errorMessage(res) {
  const body = await res.text()
  try {
    const json = JSON.parse(body)
    return json?.error?.message ?? json?.message ?? json?.error ?? body
  } catch {
    return body
  }
}

// ── UI ──────────────────────────────────────────────────────────────────────

/**
 * Open the internal Quality Complaints list and wait until it has genuinely
 * hydrated. Anchoring on a SEEDED ROW, not on page chrome — the list renders
 * its header and empty state before the syncEngine has put a single Complaint
 * row in IndexedDB.
 */
export async function openComplaints(
  page,
  { anchorText = 'CMP-E2E-001', firstWaitMs = 60_000, retryWaitMs = 45_000 } = {},
) {
  const anchor = page.getByText(anchorText, { exact: false }).first()
  for (const budget of [firstWaitMs, retryWaitMs]) {
    await page.goto('/complaints')
    const ok = await anchor
      .waitFor({ state: 'visible', timeout: budget })
      .then(() => true)
      .catch(() => false)
    if (ok) return
  }
  throw new Error(
    `openComplaints: the list never hydrated — "${anchorText}" never appeared. ` +
      'The page shell renders before IndexedDB has any Complaint rows, so this is a sync/bootstrap failure, not a filter miss.',
  )
}

/** The list row for one complaint, located by subject or CMP number text. */
export function complaintRow(page, text) {
  return page.locator('tbody tr, [role="row"]').filter({ hasText: text }).first()
}

// ── Closure approval (OQ-17 TC-17-05) ───────────────────────────────────────
// `requireClosureApproval` is NOT a column — it lives inside the
// `complaintSettings` object on the `companies.settings` JSONB blob
// (api/services/customerComplaintService.js `getComplaintSettings`, which
// reads `company.settings.complaintSettings` and is NOT cached, so a direct
// SQL write below takes effect on the very next request). The settings suite's
// restoreSettingsKeys() idiom applies here too: never write the whole
// `settings` column back, only the one key, or a concurrent suite's change to
// a different key is silently reverted.

/** The whole `complaintSettings` object, or null when the tenant has none. */
export function complaintSettings(companyId = COMPANY_ID) {
  const raw = sqlValue(
    `SELECT coalesce((settings -> 'complaintSettings')::text, 'null') FROM companies WHERE id = ${quote(companyId)}`,
  )
  return JSON.parse(raw ?? 'null')
}

/**
 * Turn the company-wide closure-approval requirement on or off, merging into
 * whatever `complaintSettings` already holds rather than replacing it.
 * Returns nothing — snapshot with complaintSettings() first and hand that back
 * to restoreComplaintSettings() in afterAll.
 */
export function setRequireClosureApproval(on, companyId = COMPANY_ID) {
  sql(
    `UPDATE companies
        SET settings = jsonb_set(
              coalesce(settings, '{}'::jsonb),
              '{complaintSettings}',
              coalesce(settings -> 'complaintSettings', '{}'::jsonb)
                || jsonb_build_object('requireClosureApproval', ${on ? 'true' : 'false'}),
              true)
      WHERE id = ${quote(companyId)}`,
  )
}

/**
 * Put `complaintSettings` back exactly as `snapshot` found it — removing the
 * key entirely when the tenant never had one (the E2ELAB default: the seed
 * writes no complaintSettings at all, so leaving `{"requireClosureApproval":
 * false}` behind would be a state change this suite made and never undid).
 */
export function restoreComplaintSettings(snapshot, companyId = COMPANY_ID) {
  if (snapshot === null || snapshot === undefined) {
    sql(
      `UPDATE companies SET settings = settings - 'complaintSettings'
        WHERE id = ${quote(companyId)} AND settings IS NOT NULL`,
    )
    return
  }
  sql(
    `UPDATE companies SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{complaintSettings}',
       ${quote(JSON.stringify(snapshot))}::jsonb, true) WHERE id = ${quote(companyId)}`,
  )
}

/**
 * One customer complaint's audit trail, newest first.
 *
 * NOTE WHICH WRITER THIS READS. `audit_logs` rows for CustomerComplaint are
 * written by the CONTROLLERS (`db.AuditLog.create` in close / approveClosure /
 * reopen) inside the same transaction as the status change — synchronous, so a
 * REST call that returned 200 has already left its row. The table's
 * `customer_complaints_audit_trigger` is a different thing: it enqueues a
 * graphile_worker `audit_event` job for the sync broadcast, so trail entries
 * for a RAW (SyncEngine / app_user) write are asynchronous and worker-
 * dependent. Never assert on those without a waitForSqlValue barrier.
 */
export function complaintAuditTrail(complaintId) {
  const out = sql(
    `SELECT action, performed_by, coalesce(new_value_json::text, '')
       FROM audit_logs
      WHERE entity_type = 'CustomerComplaint' AND entity_id = ${quote(complaintId)}
      ORDER BY performed_at DESC`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [action, performedBy, newValueJson] = line.split('|')
    return { action, performedBy, newValueJson }
  })
}

/**
 * Rows in the SYSTEM-WIDE signature register that name this complaint.
 *
 * Always zero, structurally: `signatures` carries one subject FK per regulated
 * record type (capa_id, nc_id, change_request_id, quality_event_id, record_id,
 * …) constrained by `signatures_subject_exactly_one_chk`, and NONE of them is
 * a customer complaint — verified against the live column list. So the e-signed
 * closure approval CANNOT write a ledger row even though it genuinely verifies
 * the approver's PIN. OQ-17 TC-17-05 5b steps 5–6 call this out explicitly: the
 * audit trail IS the signature evidence and an empty register is the EXPECTED
 * observation. This helper exists so the spec can assert that emptiness on
 * purpose rather than by omission.
 */
export function signatureRegisterRowsFor(complaintId) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM signatures WHERE record_id = ${quote(complaintId)}
          OR capa_id = ${quote(complaintId)} OR nc_id = ${quote(complaintId)}
          OR change_request_id = ${quote(complaintId)} OR quality_event_id = ${quote(complaintId)}`,
    ),
  )
}

/**
 * Force one customer complaint into a given status on the TRUSTED path
 * (a bare `sql()` runs as the Postgres superuser, which the QMSCM guard's
 * `current_user <> 'app_user'` test treats as trusted). Used only to ARRANGE a
 * precondition the REST surface cannot reach cheaply. Returns {ok, error} the
 * same way fixtures/complaints.js's internal-complaint probes do, so a
 * trigger-refused arrange reads as data rather than throwing.
 */
export function customerComplaintStatusTrusted(complaintId, statusId) {
  try {
    sql(
      `UPDATE customer_complaints SET status_id = ${quote(statusId)} WHERE id = ${quote(complaintId)}`,
    )
    return { ok: true, error: '' }
  } catch (err) {
    return { ok: false, error: `${err.stderr ?? err.message ?? ''}` }
  }
}

/** Attempt one status write as `app_user` — the untrusted (SyncEngine) path. */
export function customerComplaintStatusAsAppUser(userId, complaintId, statusId) {
  return sqlAsAppUser(
    `UPDATE customer_complaints SET status_id = ${quote(statusId)} WHERE id = ${quote(complaintId)};`,
    { userId, companyId: COMPANY_ID },
  )
}

/**
 * Edit one DESCRIPTIVE (non-status) field as `app_user` — the SyncEngine path
 * an update-holder actually writes through, since `customer_complaints` has no
 * REST update route at all (every mutation is an ACTION endpoint:
 * accept/assign/reply/resolve/close/reopen). This is the probe behind OQ-17
 * TC-17-05 5a step 3's warning: a closed complaint is NOT sealed, the
 * `customer_complaints_upd` policy carries no status condition, and only the
 * STATUS is refused by the QMSCM trigger.
 */
export function editCustomerComplaintDescriptionAsAppUser(userId, complaintId, description) {
  return sqlAsAppUser(
    `UPDATE customer_complaints SET description = ${quote(description)} WHERE id = ${quote(complaintId)} RETURNING id;`,
    { userId, companyId: COMPANY_ID },
  )
}
