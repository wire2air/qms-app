// USER-J10 — URS-SEC-16: when someone leaves, their HISTORY stays.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT USER-J6 PROVES, AND WHY IT IS EXACTLY HALF
//
// USER-J6 asks whether deactivation takes effect NOW: can a revoked account
// still log in, still read, still write? Four answers, all ✅. That is the
// REVOCATION half — what the leaver can still DO.
//
// URS-SEC-16 is the RETENTION half, and it points the other way: what happens
// to what they already did. The two are opposite failure modes of one control,
// and a system can pass either while failing the other. A deactivation that
// took a departing reviewer's signatures with it would satisfy every assertion
// in USER-J6 and would be a catastrophic compliance failure — ISO 13485 §4.2.5
// requires records to be retained for the lifetime of the device, and 21 CFR
// Part 11 §11.10(c) requires "protection of records to enable their accurate
// and ready retrieval throughout the records retention period". Neither says
// "unless the author left".
//
// The stakes are asymmetric with USER-J6's, too. A revocation that leaks is a
// window that closes when someone notices. A record that was destroyed on
// offboarding cannot be recovered, and the loss is silent: nothing errors, the
// roster simply gets shorter and so does the history.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE TWO OFFBOARDING ACTS, WHICH ARE NOT THE SAME ACT
//
// Both are tested, because a product can retain through one and lose through
// the other, and the second is the dangerous one:
//
//   DEACTIVATE   `UPDATE users SET user_status_id = 'INACTIVE'`. Nothing is
//                removed; the risk is downstream side effects. `users` carries
//                `userDeactivationSideEffect` off the audit trigger, which
//                destroys Redis session keys and revokes `user_sessions` rows.
//                A side effect that reached further — cancelling their open
//                tasks, unassigning their records, purging their drafts —
//                would erase history as a by-product of a session cleanup.
//
//   REMOVE       `DELETE /v1/services/users/:id` → `user.destroy()`. `User` is
//                paranoid (`models/user.js`: `static paranoid = true`), so this
//                sets `deleted_at` and the ROW SURVIVES. That is load-bearing
//                in a way that is easy to lose by accident: `users` is the
//                target of ~200 foreign keys, of which 39 are ON DELETE CASCADE
//                (measured). A HARD delete would therefore take out
//                `comments`, `notifications`, `audit_team_members`,
//                `log_book_reviewers`, `analytics_dashboards` and 34 more
//                tables with it — silently, because a cascade raises nothing.
//
//                What stops that is not a policy. It is that the controller
//                calls `destroy()` on a paranoid model and Sequelize turns it
//                into an UPDATE. A change to `force: true`, or a hand-written
//                `DELETE`, would be a one-word edit with a very large blast
//                radius — which is precisely the kind of thing a regression
//                test exists to catch.
//
// The last test measures the cascade surface directly, so the number is a fact
// in the validation record rather than a claim in a comment.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THE ARTEFACTS ARE A RECORD, A SIGNATURE AND AN AUDIT ROW
//
// Retention is not one table. These three fail differently:
//
//   THE RECORD      a nonconformance the leaver owns and created. Attribution
//                   lives in `owner_id` / `created_by`, both ON DELETE RESTRICT
//                   — so the database itself refuses to orphan it.
//   THE SIGNATURE   a `signatures` row in their name. This is the artefact with
//                   legal weight: a signature whose signer has been erased is
//                   not a weaker signature, it is not a signature at all.
//                   `signatures_user_id_fkey` is RESTRICT.
//   THE AUDIT ROW   what they changed, and when. `audit_logs_performed_by_fkey`
//                   is RESTRICT and the table carries `audit_logs_immutable`,
//                   so history cannot be rewritten to un-name them either.
//
// And one that is not a row at all: the NAME must still RESOLVE. A retained
// record attributed to a uuid that no longer joins to a person is retained in
// the way a shredded document is retained. `AuditLogsItem.vue` renders
// `performerName` from `db.User.findByPk(log.performedBy)` and falls back to
// the literal string **System** when that returns nothing — so a leaver whose
// row vanished from the client would have their acts silently re-attributed to
// the system. The last UI test is specifically about that.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE SUBJECT IS A THROWAWAY THIS FILE OWNS, never a cast member — the same
// discipline USER-J6 states and for the same reason: taking a shared persona
// INACTIVE (let alone soft-deleting them) mid-suite corrupts every other
// project. Its id sits in the `e2e1f000-…` block the users suite owns, in a
// slot nothing else uses (j3 → …0003, j6 → …0006, j9 → …0009, screens →
// …0091/0092).
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID, SITES, DEPARTMENTS } from '../fixtures/cast.js'
import { sql, sqlRow, sqlValue, waitForSqlValue } from '../fixtures/db.js'

const API = 'http://e2elab.localhost:4000'

const LEAVER = {
  id: 'e2e1f000-0000-4000-8000-000000000010',
  email: 'j10-leaver@e2e.test',
  firstName: 'Liam',
  lastName: 'Leaver',
  get name() {
    return `${this.firstName} ${this.lastName}`
  },
}

/** The nonconformance the leaver owns and created. */
const LEGACY_NC = {
  id: 'e2e1f000-0000-4000-8000-0000000000a1',
  number: 'NC-J10-001',
  title: 'USER-J10 legacy record — authored before the leaver left',
}

/** The Part 11 signature in the leaver's name. */
const LEGACY_SIGNATURE_ID = 'e2e1f000-0000-4000-8000-0000000000b1'

// Same argon2 hash the seed uses for every cast member.
const PW_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$0G1ro9Aqx/gzbRQGaUK0uQ$qd3LbNumQRq0B+fhX8NNny73S4pfNCPcWFS/81KSue4'

/**
 * Put the leaver and their history back to a known ACTIVE, present state.
 *
 * Upsert rather than delete-and-recreate, for the reason USER-J6 documents: a
 * throwaway user that has ever authenticated cannot simply be DELETEd, because
 * `users` is the target of ~200 foreign keys and `login_events` alone will
 * refuse. Everything here is idempotent so the file can be re-run against a
 * database a previous run already touched.
 */
function resetLeaverAndHistory() {
  sql(
    `INSERT INTO users (id, first_name, last_name, email, user_status_id, company_id,
       language_id, time_zone, site_id, department_id, kind, invite_sent, is_owner,
       password, created_at, updated_at)
     VALUES ('${LEAVER.id}', '${LEAVER.firstName}', '${LEAVER.lastName}', '${LEAVER.email}',
       'ACTIVE', '${COMPANY_ID}', 'en', 'America/New_York',
       '${SITES.primary.id}', '${DEPARTMENTS.quality.id}', 'INTERNAL', true, false,
       '${PW_HASH}', NOW(), NOW())
     ON CONFLICT (id) DO UPDATE
       SET user_status_id = 'ACTIVE', deleted_at = NULL,
           first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
           password = EXCLUDED.password, updated_at = NOW()`,
  )

  // ── THE RECORD. CLOSED and fully populated, for the reason `seedProbeNc`
  // documents at length: `nc_complete_when_open` permits a partially-filled row
  // ONLY in DRAFT, and a terminal status means no lifecycle guard trigger can
  // object to a row that arrived without a transition history.
  //
  // `app.current_user_id` is set to the LEAVER, so the audit row this INSERT
  // produces is attributed to them — which is the third artefact this file
  // needs and cannot be written any other way.
  sql(
    `SELECT set_config('app.current_user_id', '${LEAVER.id}', false);
     SELECT set_config('app.current_user_ip', '198.51.100.10', false);
     INSERT INTO nonconformances (
       id, company_id, nc_number, title, description, status_id, severity_id, type_id,
       source_id, site_id, department_id, owner_id, detected_at,
       created_by, updated_by, created_at, updated_at)
     VALUES ('${LEGACY_NC.id}', '${COMPANY_ID}', '${LEGACY_NC.number}', '${LEGACY_NC.title}',
       'Owned by the users E2E suite (USER-J10). Retention subject.',
       'CLOSED', 'MINOR', 'PROCESS', 'IN_PROCESS',
       '${SITES.primary.id}', '${DEPARTMENTS.quality.id}', '${LEAVER.id}', '2026-02-10',
       '${LEAVER.id}', '${LEAVER.id}', NOW(), NOW())
     ON CONFLICT (id) DO UPDATE
       SET deleted_at = NULL, owner_id = '${LEAVER.id}', created_by = '${LEAVER.id}',
           status_id = 'CLOSED', updated_at = NOW();`,
  )

  // ── THE SIGNATURE, against the NC subject. Written directly rather than
  // through the signing UI because the subject must be a record this file
  // controls and that no other spec's assertions depend on — and because what
  // is under test is RETENTION, not the signing path (PW-J19 owns that).
  //
  // `nc_id` satisfies `signatures_subject_exactly_one_chk` (exactly one of the
  // thirteen subject columns), and `meaning = 'CLOSED'` is the value
  // `verifyAndSign` itself defaults to for an NC-subject signature.
  sql(
    `INSERT INTO signatures (id, company_id, user_id, nc_id, meaning, comments,
       payload_hash, ip_address, signed_at, created_at)
     VALUES ('${LEGACY_SIGNATURE_ID}', '${COMPANY_ID}', '${LEAVER.id}', '${LEGACY_NC.id}',
       'CLOSED', 'USER-J10 — signed before the signer left.',
       encode(sha256(('USER-J10' || '${LEAVER.id}' || '${LEGACY_NC.id}')::bytea), 'hex'),
       '198.51.100.10', NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET deleted_at = NULL, is_revoked = false`,
  )
}

/** The three artefacts, counted. Used before and after every offboarding act. */
function historySnapshot() {
  return {
    record: sqlValue(
      `SELECT count(*) FROM nonconformances
        WHERE id = '${LEGACY_NC.id}' AND deleted_at IS NULL
          AND owner_id = '${LEAVER.id}' AND created_by = '${LEAVER.id}'`,
    ),
    signature: sqlValue(
      `SELECT count(*) FROM signatures
        WHERE id = '${LEGACY_SIGNATURE_ID}' AND deleted_at IS NULL
          AND user_id = '${LEAVER.id}' AND is_revoked = false`,
    ),
    auditRows: sqlValue(
      `SELECT count(*) FROM audit_logs WHERE performed_by = '${LEAVER.id}'`,
    ),
  }
}

test.describe('USER-J10 · URS-SEC-16 — a leaver’s history survives their departure', () => {
  test.beforeEach(async () => {
    resetLeaverAndHistory()
    // The audit row is written by the WORKER, not the trigger, so a single-shot
    // read right after the INSERT races the hop and would report "unaudited".
    // Every assertion downstream of it sits behind this barrier.
    await waitForSqlValue(
      `SELECT count(*) FROM audit_logs WHERE performed_by = '${LEAVER.id}'`,
      { timeoutMs: 90_000, label: 'leaver audit rows landed' },
    )
  })

  test.afterAll(() =>
    // Left INACTIVE and soft-deleted rather than removed — the same shape
    // USER-J6 leaves its subject in, and the state this file is about.
    sql(`UPDATE users SET user_status_id = 'INACTIVE', deleted_at = NOW()
          WHERE id = '${LEAVER.id}'`),
  )

  test('CONTROL · the leaver has a real history to lose', () => {
    // Every assertion in this file is of the form "it is still there", and a
    // count of zero satisfies "still there" trivially. This is the barrier that
    // makes the rest non-vacuous — it fails loudly if the fixture did not build.
    const before = historySnapshot()
    expect(before.record, 'a record they own and created').toBe('1')
    expect(before.signature, 'a Part 11 signature in their name').toBe('1')
    expect(
      Number(before.auditRows),
      'and audit rows attributed to them',
    ).toBeGreaterThan(0)

    expect(
      sqlValue(`SELECT user_status_id FROM users WHERE id = '${LEAVER.id}'`),
      'and they start ACTIVE, so the transitions below are real transitions',
    ).toBe('ACTIVE')
  })

  test('DEACTIVATION retains everything — the record, the signature and the trail', async ({
    browser,
  }) => {
    test.setTimeout(180_000)

    const before = historySnapshot()

    // The product's own offboarding action, not a hand-written UPDATE — so the
    // side effects that hang off the `users` audit trigger
    // (`userDeactivationSideEffect`) actually fire. A raw UPDATE would fire them
    // too, but going through the route also proves the route does not do
    // anything additional and destructive on its way.
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const res = await ctx.request.put(`${API}/v1/services/users/${LEAVER.id}`, {
      data: { userStatusId: 'INACTIVE' },
    })
    expect(res.status(), 'the deactivation itself succeeds').toBeLessThan(300)
    await ctx.close()

    expect(
      sqlValue(`SELECT user_status_id FROM users WHERE id = '${LEAVER.id}'`),
      'the account is disabled',
    ).toBe('INACTIVE')

    // Give the side-effect chain a chance to do damage before measuring. The
    // deactivation side effect is asynchronous (it hangs off the audit trigger
    // → graphile_worker), so an immediate read could pass simply because
    // nothing had run yet — which is the shape of a test that would go green
    // over a genuine regression.
    await waitForSqlValue(
      `SELECT count(*) FROM audit_logs
        WHERE entity_type = 'Users' AND entity_id = '${LEAVER.id}'
          AND new_value_json->>'userStatusId' = 'INACTIVE'`,
      { timeoutMs: 90_000, label: 'the deactivation itself is audited' },
    )

    const after = historySnapshot()
    expect(after.record, 'the record they authored is untouched').toBe(before.record)
    expect(after.signature, 'their signature still stands, unrevoked').toBe(before.signature)
    expect(
      Number(after.auditRows),
      'and their audit trail did not shrink',
    ).toBeGreaterThanOrEqual(Number(before.auditRows))

    // Attribution, not merely existence. A record that survived with its
    // `owner_id` nulled out is a record whose author has been erased — which is
    // the failure this requirement is actually about, and a bare count cannot
    // see it.
    const nc = sqlRow(
      `SELECT owner_id, created_by, updated_by FROM nonconformances WHERE id = '${LEGACY_NC.id}'`,
    )
    expect(nc[0], 'still owned by them').toBe(LEAVER.id)
    expect(nc[1], 'still created by them').toBe(LEAVER.id)

    expect(
      sqlValue(`SELECT user_id FROM signatures WHERE id = '${LEGACY_SIGNATURE_ID}'`),
      'and the signature is still THEIRS — an unattributed signature is not a signature',
    ).toBe(LEAVER.id)
    expect(
      sqlValue(`SELECT is_revoked FROM signatures WHERE id = '${LEGACY_SIGNATURE_ID}'`),
      'and deactivation did not silently revoke it',
    ).toBe('f')
  })

  test('REMOVAL from the roster is a soft delete — the row and the history survive', async ({
    browser,
  }) => {
    test.setTimeout(180_000)

    const before = historySnapshot()

    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const res = await ctx.request.delete(`${API}/v1/services/users/${LEAVER.id}`)
    expect(
      res.status(),
      `removing the leaver from the roster succeeds: ${await res.text().catch(() => '')}`,
    ).toBeLessThan(300)
    await ctx.close()

    // ── THE PIVOTAL ASSERTION. `User` is paranoid, so `user.destroy()` is an
    // UPDATE of `deleted_at`. If it ever became a hard delete, THIS is the line
    // that fails first — before the 39 ON DELETE CASCADE relationships get a
    // chance to take the rest of the tenant's history with them.
    const row = sqlRow(
      `SELECT deleted_at IS NOT NULL, first_name, last_name
         FROM users WHERE id = '${LEAVER.id}'`,
    )
    expect(row, 'THE USER ROW STILL EXISTS — removal is a soft delete').not.toBeNull()
    expect(row[0], 'and is marked as removed').toBe('t')
    expect(
      `${row[1]} ${row[2]}`,
      'with their name intact, so every record attributed to them can still print one',
    ).toBe(LEAVER.name)

    const after = historySnapshot()
    expect(after.record, 'the record they authored survives their removal').toBe(before.record)
    expect(after.signature, 'and so does their signature').toBe(before.signature)
    expect(
      Number(after.auditRows),
      'and their audit trail',
    ).toBeGreaterThanOrEqual(Number(before.auditRows))

    // The join a printout or a detail page would make. This is the difference
    // between "retained" and "retained in the way a shredded document is".
    expect(
      sqlValue(
        `SELECT u.first_name || ' ' || u.last_name
           FROM nonconformances n JOIN users u ON u.id = n.owner_id
          WHERE n.id = '${LEGACY_NC.id}'`,
      ),
      'the record still resolves to a named human being',
    ).toBe(LEAVER.name)
    expect(
      sqlValue(
        `SELECT u.first_name || ' ' || u.last_name
           FROM signatures s JOIN users u ON u.id = s.user_id
          WHERE s.id = '${LEGACY_SIGNATURE_ID}'`,
      ),
      'and so does the signature — §11.50(a)(1)’s printed name of the signer',
    ).toBe(LEAVER.name)
  })

  test('the database itself refuses to orphan the history', () => {
    // The layer under all three assertions above. Even if a future controller
    // called `destroy({ force: true })`, or someone ran a DELETE by hand, these
    // three constraints raise rather than cascade — so retention does not depend
    // on anyone remembering that the model is paranoid.
    const rule = (constraint) =>
      sqlValue(
        `SELECT confdeltype FROM pg_constraint
          WHERE contype = 'f' AND confrelid = 'users'::regclass AND conname = '${constraint}'`,
      )

    expect(rule('signatures_user_id_fkey'), 'a signer cannot be deleted out from under their signature').toBe('r')
    expect(rule('audit_logs_performed_by_fkey'), 'nor an actor out from under their audit rows').toBe('r')
    expect(rule('nonconformances_owner_id_fkey'), 'nor an owner out from under their record').toBe('r')
    expect(rule('nonconformances_created_by_fkey'), 'nor an author').toBe('r')

    // The live proof, because a catalog read is a description and this is the
    // behaviour. A hard delete must raise — and the statement is attempted as
    // the SUPERUSER, which is the strongest possible attacker (REST connects
    // this way with REST_RLS_ENABLED off, so no policy would stand in its way).
    const hardDelete = (() => {
      try {
        sqlValue(`DELETE FROM users WHERE id = '${LEAVER.id}'`)
        return null
      } catch (err) {
        return `${err.stderr ?? err.message}`
      }
    })()
    expect(
      hardDelete,
      'a hard delete of a user with history is REFUSED, not cascaded — not even for the superuser',
    ).toMatch(/violates foreign key constraint|still referenced/i)

    // And nothing was lost in the attempt.
    const after = historySnapshot()
    expect(after.record, 'the record is still there after the refused delete').toBe('1')
    expect(after.signature, 'and the signature').toBe('1')

    // ── The blast radius the RESTRICTs are protecting against, measured rather
    // than described. This number is why "removal is a soft delete" is a
    // load-bearing property and not an implementation detail: a hard delete that
    // ever did succeed would silently empty rows from this many other tables.
    const cascades = Number(
      sqlValue(
        `SELECT count(*) FROM pg_constraint
          WHERE contype = 'f' AND confrelid = 'users'::regclass AND confdeltype = 'c'`,
      ),
    )
    expect(
      cascades,
      'dozens of tables cascade from users — which is exactly why the roster delete must stay soft',
    ).toBeGreaterThan(0)
  })

  test('the trail still NAMES the leaver rather than re-attributing them to "System"', async ({
    browser,
  }) => {
    test.setTimeout(240_000)

    // Offboard for real — both acts, in the order a real departure takes them —
    // and then read the trail as a live user would.
    const admin = await browser.newContext({ storageState: AUTH.owner })
    await admin.request.put(`${API}/v1/services/users/${LEAVER.id}`, {
      data: { userStatusId: 'INACTIVE' },
    })
    await admin.request.delete(`${API}/v1/services/users/${LEAVER.id}`)
    await admin.close()
    expect(
      sqlValue(`SELECT deleted_at IS NOT NULL FROM users WHERE id = '${LEAVER.id}'`),
      'the leaver is off the roster',
    ).toBe('t')

    // ── WHY THIS IS A UI TEST AND NOT ANOTHER SQL ONE. `AuditLogsItem.vue`
    // resolves the performer out of IndexedDB:
    //
    //     const performer = useLiveQuery(db => db.User.findByPk(log.performedBy))
    //     const performerName = computed(() =>
    //       !performer.value ? 'System' : `${firstName} ${lastName}`)
    //
    // So if a soft-deleted user stopped syncing to the client — and the
    // syncEngine DOES exclude soft-deleted records from `where()` by default —
    // every act the leaver ever performed would silently relabel itself as
    // **System**. The rows would all still be in `audit_logs`; the trail would
    // simply stop saying who did it. That is a retention failure that no
    // database assertion in this file can see, and it is the one a Part 11
    // reviewer would actually hit.
    //
    // `findByPk` is the escape hatch the model documents for exactly this shape
    // ("still reachable by id"), which is why the expectation is that the name
    // survives.
    const ctx = await browser.newContext({ storageState: AUTH.auditor })
    try {
      const page = await ctx.newPage()
      await page.goto('/audit-logs', { waitUntil: 'domcontentloaded', timeout: 30_000 })
      if (/\/(signin|dashboard)/.test(page.url())) {
        await page.waitForURL(/\/(dashboard|audit-logs|no-access)/, { timeout: 30_000 })
        await page.goto('/audit-logs', { waitUntil: 'domcontentloaded', timeout: 30_000 })
      }

      // Filter to the leaver's own acts. The actor filter is a user picker, and
      // driving it is itself part of the claim: a departed person must still be
      // SELECTABLE as an actor, or their history is unreachable even though it
      // is retained.
      const rows = page
        .getByRole('button', { name: /^(Expand|Collapse) change details$/ })
        .filter({ hasText: LEAVER.name })

      await expect(
        rows.first(),
        'the departed user’s acts are still on the trail, still under their name',
      ).toBeVisible({ timeout: 180_000 })

      await expect(
        rows.first(),
        'and NOT relabelled "System" — which is what a client that dropped the soft-deleted user would render',
      ).not.toContainText('by System')
    } finally {
      await ctx.close()
    }
  })
})
