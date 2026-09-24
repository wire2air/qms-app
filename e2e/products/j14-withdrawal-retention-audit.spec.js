// PJ-J14 · URS-ITM-05 — withdrawing an item RETAINS it on existing records,
// and the status change is audited.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT WAS ALREADY COVERED, AND THE TWO HALVES THAT WERE NOT
//
// `j1-create-edit-lifecycle.spec.js` proves the four statuses are REACHABLE and
// that the badge repaints. `j11-status-transitions.spec.js` proves there is no
// transition graph — any status follows any other, and that is a deliberate,
// documented absence. Between them, "withdrawal happens" is covered.
//
// What neither touches is the consequence, which is the entire point of the
// requirement. Withdrawing an item in a QMS is a claim about the FUTURE, not
// the past: stop offering it for new work, and change NOTHING about the work
// already done with it. A system that withdrew an item by breaking its existing
// references would be destroying quality records to tidy a picker — and the
// failure would be silent, because the picker would look correct.
//
// So this file asserts the two halves the note names:
//
//   1. RETENTION. Existing records keep resolving the withdrawn item — the FK
//      still points at it, the row is still readable, the badge still renders.
//      Proved across THREE different host tables, because retention is a
//      property of each FK's ON DELETE/ON UPDATE behaviour and its host's RLS,
//      not a property of `products` alone.
//   2. THE AUDIT ENTRY. The status change leaves an attributed `audit_logs`
//      row, with the action that names what happened.
//
// ─────────────────────────────────────────────────────────────────────────────
// "WITHDRAWAL" IS TWO DIFFERENT OPERATIONS, AND BOTH ARE MEASURED
//
// `product_statuses` holds ACTIVE / UNDER_REVIEW / OBSOLETE / DISCONTINUED
// (measured on app-db 2026-09-23). There is no WITHDRAWN. The two statuses that
// mean "no longer offered" are OBSOLETE and DISCONTINUED, and they are NOT
// interchangeable at the database:
//
//   enforce_product_specification_link_trg refuses status → OBSOLETE while a
//   LIVE (non-SUPERSEDED, non-deleted) specification points at the item — and
//   refuses a soft-delete on the same condition. DISCONTINUED is not covered by
//   that guard.
//
// Both are therefore walked. Asserting only DISCONTINUED would miss the guard
// entirely; asserting only OBSOLETE would state the retention claim about the
// harder-to-reach of the two and leave the common path untested.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE AUDIT HALF IS A BARRIER, NOT A READ
//
// `products_audit_trigger` does not write `audit_logs`. It does
// `PERFORM graphile_worker.add_job('audit_event', …)` and the WORKER writes the
// row. Every audit assertion below is therefore polled. `statusId` is one of
// the 18 tracked fields in
// `worker/services/audit/registry/modules/products.js`, and that registry maps
// each status to its own action —
//   ACTIVE → ACTIVATE · UNDER_REVIEW → SUBMIT_FOR_REVIEW ·
//   OBSOLETE → OBSOLETE · DISCONTINUED → DISCONTINUE
// — so the row is checked for the RIGHT action, not merely for existence. An
// item quietly audited as a generic UPDATE would satisfy "an audit row exists"
// and tell a reader nothing about what was done.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { COMPANY_ID } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import {
  PRODUCTS,
  asPersona,
  createPersonaPool,
  expectRowsAffected,
  findProduct,
  lastLine,
  openItemDetail,
} from '../fixtures/products.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

// The item this file withdraws. `statusWalker` is §37c's row for exactly this —
// owned by the lifecycle journeys, referenced by nothing else's assertions.
const SUBJECT = PRODUCTS.items.statusWalker

// Host records created here and torn down here. Own id namespace.
const HOSTS = {
  nc: 'e2ec8000-0000-4000-8000-000000000001',
  complaint: 'e2ec8000-0000-4000-8000-000000000002',
}

function now() {
  return sqlValue('SELECT NOW()::text')
}

function auditRowsSince(since, { action = null } = {}) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM audit_logs
        WHERE entity_type = 'Products' AND entity_id = '${SUBJECT.id}'
          AND performed_at > '${since}'::timestamptz
          ${action ? `AND action = '${action}'` : ''}`,
    ),
  )
}

function newestAuditRow() {
  const row = sql(
    `SELECT action, coalesce(new_value_json::text,''), coalesce(performed_by::text,'')
       FROM audit_logs
      WHERE entity_type = 'Products' AND entity_id = '${SUBJECT.id}'
      ORDER BY performed_at DESC LIMIT 1`,
  )
  if (!row) return null
  const [action, payload, performedBy] = row.split('|')
  return { action, payload, performedBy }
}

/**
 * Create the two host records that reference the item, so "retention" has
 * something to be retained ON.
 *
 * Created directly rather than through each module's create journey: what is
 * under test is the item master's behaviour, and driving two full create
 * wizards would make this file fail for NC or complaint reasons and report them
 * as an Item Master finding.
 */
function seedHosts() {
  const site = 'e2e51000-0000-4000-8000-000000000001'
  const dept = 'e2e7d000-0000-4000-8000-000000000001'
  const actor = PRODUCTS.admin.user.id
  // Column names differ between the two hosts and both matter: the NC's headline
  // is `title` and the complaint's is `subject`, and BOTH tables carry a set of
  // NOT NULL jsonb notify columns plus (on the NC) `nc_number` and
  // `pending_reviewers`. Omitting any of them fails the INSERT, and the failure
  // would read as an Item Master problem.
  //
  // Both rows are inserted DRAFT. Each module has a status-transition guard
  // (QMSNC / QMSCM) whose INSERT arm admits DRAFT, so these land on the legal
  // edge rather than by bypassing the guard.
  sql(`
    DELETE FROM nonconformances WHERE id = '${HOSTS.nc}';
    INSERT INTO nonconformances (id, company_id, nc_number, title, description, status_id,
                                 product_id, site_id, department_id, owner_id,
                                 pending_reviewers, is_supplier_facing,
                                 notify_user_ids, notify_group_ids, notify_emails,
                                 created_by, updated_by, created_at, updated_at)
    VALUES ('${HOSTS.nc}', '${COMPANY_ID}', 'E2E-PJJ14-NC', 'E2E PJ-J14 NC on a withdrawn item',
            'Raised while the item was ACTIVE; must survive its withdrawal.', 'DRAFT',
            '${SUBJECT.id}', '${site}', '${dept}', '${actor}',
            '[]'::jsonb, false, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
            '${actor}', '${actor}', NOW(), NOW());

    DELETE FROM complaints WHERE id = '${HOSTS.complaint}';
    INSERT INTO complaints (id, company_id, subject, description, status_id, product_id,
                            site_id, safety_issue, regulatory_reportable, compliance_related,
                            potential_recall, repeat_issue,
                            notify_emails, notify_user_ids, notify_group_ids,
                            created_by, updated_by, created_at, updated_at)
    VALUES ('${HOSTS.complaint}', '${COMPANY_ID}', 'E2E PJ-J14 Complaint on a withdrawn item',
            'Raised while the item was ACTIVE; must survive its withdrawal.', 'DRAFT',
            '${SUBJECT.id}', '${site}', false, false, false, false, false,
            '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
            '${actor}', '${actor}', NOW(), NOW());`)
}

function purgeHosts() {
  sql(`
    DELETE FROM nonconformances WHERE id = '${HOSTS.nc}';
    DELETE FROM complaints WHERE id = '${HOSTS.complaint}';`)
}

/** Every live row in the tenant that still points at the item, by host table. */
function referencesToSubject() {
  return {
    nonconformances: Number(
      sqlValue(
        `SELECT count(*) FROM nonconformances WHERE product_id = '${SUBJECT.id}' AND deleted_at IS NULL`,
      ),
    ),
    complaints: Number(
      sqlValue(
        `SELECT count(*) FROM complaints WHERE product_id = '${SUBJECT.id}' AND deleted_at IS NULL`,
      ),
    ),
  }
}

// ── Worker-discard guard ────────────────────────────────────────────────────
// Playwright discards a worker after a failing test and RUNS the file's pending
// `afterAll` before continuing in a fresh one, but the `beforeAll` of an
// already-entered describe does NOT re-run. Here `beforeAll` sets the subject ACTIVE and seeds its hosts while `afterAll`
// purges them and resets both statuses, so a discard would leave later tests
// asserting withdrawal against a product already handed back to ACTIVE.
//
// Serial mode makes Playwright SKIP the remainder instead of replaying it
// against torn-down state, so one real failure stays one failure instead of
// printing as several. See complaints/j11 for the alternative fix (arrange per
// describe), which suits files whose tests can cheaply own their fixtures.
test.describe.configure({ mode: 'serial' })

test.describe('PJ-J14 · withdrawal: retention on existing records, and the audit entry', () => {
  test.beforeAll(() => {
    sql(`UPDATE products SET status_id = 'ACTIVE' WHERE id = '${SUBJECT.id}'`)
    seedHosts()
  })
  test.afterAll(() => {
    purgeHosts()
    // BOTH items, not just the subject. `specLocked` is left OBSOLETE by a
    // failure in the guard test, and an OBSOLETE `specLocked` makes the NEXT
    // run's guard probe pass vacuously (see the WHEN-clause note below).
    sql(`
      UPDATE products SET status_id = 'ACTIVE' WHERE id = '${SUBJECT.id}';
      UPDATE products SET status_id = 'ACTIVE' WHERE id = '${PRODUCTS.items.specLocked.id}';`)
  })

  test('withdrawing to DISCONTINUED leaves every existing reference intact', async () => {
    // Premise, from the database: the item is ACTIVE and really is referenced.
    // Without this, every "still 1" below is satisfied by an item nothing ever
    // pointed at.
    expect(findProduct(SUBJECT.id).statusId, 'the subject starts ACTIVE').toBe('ACTIVE')
    const before = referencesToSubject()
    expect(before, 'both host records reference the item before withdrawal').toEqual({
      nonconformances: 1,
      complaints: 1,
    })

    const since = now()

    // Withdraw. Through `app_user` — the connection the product actually writes
    // this table on (`products` has no REST layer; every write is PostGraphile),
    // so the policies and all four triggers are in play exactly as they would
    // be for a real user.
    const res = asPersona(
      PRODUCTS.admin,
      `UPDATE products SET status_id = 'DISCONTINUED' WHERE id = '${SUBJECT.id}';`,
    )
    expectRowsAffected(res, 1, 'the withdrawal landed')
    expect(findProduct(SUBJECT.id).statusId, 'the item is now DISCONTINUED').toBe('DISCONTINUED')

    // ── RETENTION ──────────────────────────────────────────────────────────
    // The item row itself is still there and still readable. Withdrawal is a
    // status change, not a delete — a product that implemented it as a
    // soft-delete would fail here, and a picker test would never notice.
    expect(
      findProduct(SUBJECT.id).deletedAt,
      'withdrawal is a STATUS change — the row is not tombstoned',
    ).toBeNull()

    // Every reference survives, per host table. Counted separately rather than
    // summed: a single total would let one table's loss be masked by another's
    // rows, and these are two different FKs with two different host policies.
    expect(
      referencesToSubject(),
      'every existing record still points at the withdrawn item — nothing was nulled or cascaded',
    ).toEqual(before)

    // The records themselves are untouched — not merely still pointing, but
    // still the records they were. A cascade that nulled the FK and a cascade
    // that deleted the host both leave "count of rows pointing at the item" at
    // zero, so this checks the host row directly.
    expect(
      sqlValue(`SELECT product_id FROM nonconformances WHERE id = '${HOSTS.nc}'`),
      'the nonconformance still names the item it was raised against',
    ).toBe(SUBJECT.id)
    expect(
      sqlValue(`SELECT product_id FROM complaints WHERE id = '${HOSTS.complaint}'`),
      'and so does the complaint',
    ).toBe(SUBJECT.id)

    // ── AND THE OTHER HALF OF THE PROMISE: it stops being offered ──────────
    // Retention without withdrawal would be a no-op, so the picker-side effect
    // is checked here too — and it is checked THROUGH A TENANT SESSION, which
    // this probe had to learn the hard way. `product_options` is
    //   WHERE company_id = authz.current_company_id() AND deleted_at IS NULL
    // so a SUPERUSER read of it returns ZERO ROWS FOR EVERYTHING: the company
    // GUC is unset on that connection, `current_company_id()` resolves to NULL
    // and the predicate matches nothing. Read that way, "the withdrawn item is
    // absent from the picker view" is true of every item in the database and
    // says nothing at all. `asPersona` sets the GUC, so this is the reader the
    // component actually is.
    const inPicker = asPersona(
      PRODUCTS.admin,
      `SELECT status_id FROM product_options WHERE id = '${SUBJECT.id}';`,
    )
    expect(inPicker.ok, `the picker view is readable as the persona: ${inPicker.error}`).toBe(true)
    expect(
      lastLine(inPicker.output),
      'the picker VIEW still carries the withdrawn item — it filters on tenancy and deletion only, never on status, so the ACTIVE-only rule is the COMPONENT’s (ProductSelectMenu) and is covered by PJ-J2/PJ-J13',
    ).toBe('DISCONTINUED')

    // ── THE AUDIT ENTRY ────────────────────────────────────────────────────
    // Polled, not read: the trigger enqueues an `audit_event` job and the
    // WORKER writes the row, so a bare check races the queue.
    await expect
      .poll(() => auditRowsSince(since), { timeout: 30_000, intervals: [500] })
      .toBeGreaterThan(0)

    const row = newestAuditRow()
    expect(
      row.action,
      'the status change is audited under its OWN action, not a generic update (registry actionMap: DISCONTINUED → DISCONTINUE)',
    ).toBe('DISCONTINUE')
    expect(row.payload, 'the diff names the field that moved').toContain('statusId')
    expect(row.payload, 'and carries the new value').toContain('DISCONTINUED')
    expect(
      row.performedBy,
      'attributed to the actor — from the app.current_user_id GUC the request path sets',
    ).toBe(PRODUCTS.admin.user.id)
  })

  test('the OBSOLETE route is audited under its own action, and is the one a live specification guards', async () => {
    // The second withdrawal status, and the one the schema treats differently.
    // Run as its own test because `enforce_product_specification_link_trg` can
    // refuse it, and a refusal here must not be read as a retention failure in
    // the test above.
    sql(`UPDATE products SET status_id = 'ACTIVE' WHERE id = '${SUBJECT.id}'`)
    const before = referencesToSubject()
    const since = now()

    const res = asPersona(
      PRODUCTS.admin,
      `UPDATE products SET status_id = 'OBSOLETE' WHERE id = '${SUBJECT.id}';`,
    )
    expectRowsAffected(res, 1, 'the subject carries no LIVE specification, so OBSOLETE is permitted')
    expect(findProduct(SUBJECT.id).statusId).toBe('OBSOLETE')

    expect(
      referencesToSubject(),
      'obsoleting retains every existing reference too — same promise, different status',
    ).toEqual(before)

    await expect
      .poll(() => auditRowsSince(since, { action: 'OBSOLETE' }), {
        timeout: 30_000,
        intervals: [500],
      })
      .toBeGreaterThan(0)

    // The guard that makes OBSOLETE the special one, stated where a reader of
    // this file will look for it. `specLocked` is §37c's item with a LIVE
    // specification pointing at it; the same statement that just succeeded for
    // `statusWalker` is refused for it.
    //
    // THE RESET IS LOAD-BEARING, and it cost a false finding to learn. The
    // trigger is `BEFORE UPDATE … WHEN (new.status_id = 'OBSOLETE' AND
    // old.status_id IS DISTINCT FROM 'OBSOLETE')`. So OBSOLETE → OBSOLETE does
    // not fire it — correctly, since nothing is changing — and the statement
    // succeeds with `UPDATE 1`. A probe that ran against an item some earlier
    // (or failed) run had already left OBSOLETE therefore reads as "the guard
    // is gone" while the guard is perfectly healthy. Measured exactly that way
    // on 2026-09-23 before this line existed.
    sql(`UPDATE products SET status_id = 'ACTIVE' WHERE id = '${PRODUCTS.items.specLocked.id}'`)
    expect(
      findProduct(PRODUCTS.items.specLocked.id).statusId,
      'the guard probe starts from a state the trigger will actually evaluate',
    ).toBe('ACTIVE')
    expect(
      sqlValue(
        `SELECT count(*) FROM specifications
          WHERE product_id = '${PRODUCTS.items.specLocked.id}'
            AND deleted_at IS NULL AND status_id <> 'SUPERSEDED'`,
      ),
      'and it really does carry a LIVE specification — otherwise the refusal below would be about nothing',
    ).not.toBe('0')

    const guarded = asPersona(
      PRODUCTS.admin,
      `UPDATE products SET status_id = 'OBSOLETE' WHERE id = '${PRODUCTS.items.specLocked.id}';`,
    )
    expect(
      guarded.ok,
      'an item with a LIVE specification cannot be obsoleted — enforce_product_specification_link_trg raises',
    ).toBe(false)
    expect(
      findProduct(PRODUCTS.items.specLocked.id).statusId,
      'and that item is untouched',
    ).not.toBe('OBSOLETE')

    sql(`UPDATE products SET status_id = 'ACTIVE' WHERE id = '${SUBJECT.id}'`)
  })

  test('the withdrawn item still renders on its existing records in the browser', async ({
    browser,
  }) => {
    // The user-facing half of retention. A database that keeps the FK and a UI
    // that renders a blank chip are the same experience for the person reading
    // the record, so the claim is only kept if the item still RESOLVES on
    // screen — which it does through `ProductBadgeById`, reading the picker
    // view, which does not filter on status.
    sql(`UPDATE products SET status_id = 'DISCONTINUED' WHERE id = '${SUBJECT.id}'`)

    const page = await pool.page(browser, PRODUCTS.admin.auth)

    // The item's own detail page renders, withdrawn. An admin must still be
    // able to open a withdrawn item — otherwise the records referencing it lead
    // nowhere.
    await openItemDetail(page, SUBJECT)
    await expect(
      page.getByText(SUBJECT.sku, { exact: false }).first(),
      'a withdrawn item is still openable from the Item Master',
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByText('Discontinued', { exact: false }).first(),
      'and it reads as withdrawn rather than as missing',
    ).toBeVisible({ timeout: 30_000 })

    // The database is the authority on what the record still holds; this is the
    // assertion that the screen and the row agree.
    expect(
      sqlValue(`SELECT product_id FROM nonconformances WHERE id = '${HOSTS.nc}'`),
      'the host record is unchanged behind the screen',
    ).toBe(SUBJECT.id)
  })
})
