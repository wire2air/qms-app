// CMP-J11 — the two controls `content/validation/oq/customer-complaints.md` §5
// ("Controls this protocol does not test") names and no test has ever touched:
// the PUBLIC CUSTOMER STATUS PAGE (HMAC-token, no session) and the AUTO-CLOSE
// WORKER (closes resolved tickets with no human action).
//
// WHY THIS FILE EXISTS. §5 lists seven admitted gaps. Two of them are not
// documentation debt, they are an unauthenticated write surface and an
// unattended state machine:
//
//   "The public customer status page, whose HMAC-token access allows an
//    unauthenticated reply that can reopen a closed complaint."
//   "The auto-close worker, which closes resolved complaints with no human
//    action."
//
// Everything else in the complaints suite (J1–J6) speaks as a logged-in
// persona through a session cookie. This file is the only one that speaks as
// NOBODY — which is the entire point, because the surface under test accepts
// exactly that.
//
// ── A. THE PUBLIC STATUS PAGE ──────────────────────────────────────────────
// Real surface, read out of the code rather than the pack:
//
//   GET  /v1/services/public/complaintStatus/:complaintId?token=<hmac>
//   POST /v1/services/public/complaintStatus/:complaintId/reply?token=<hmac>
//   POST /v1/services/public/complaintCsat/:complaintId?token=<hmac>
//   UI:  /support/ticket/:complaintId?token=<hmac>   (PUBLIC_ROUTES '/support')
//
// All three are registered in `api/routes/customerComplaints.js` with no
// `requireAuth`, no `enforcePermission` and no API key — the route's own
// OpenAPI block says so in as many words ("No session, no API key and no
// permission gate — the HMAC `token` query parameter is the only
// authorisation"), and they are on the routeAuthzAllowlist as
// 'public endpoint (token / unauth)'.
//
// The token is NOT stored anywhere. `customerComplaintService.js`:
//
//   publicComplaintToken(purpose, id) =
//     HMAC-SHA256(SESSION_SECRET, `${purpose}:${id}`).hex()
//
// with `purpose = 'status'` for all three endpoints (the CSAT email reuses the
// status token — "one link, one token"). Verification is
// `crypto.timingSafeEqual` after a length pre-check. Because the id is INSIDE
// the MAC, a token is bound to exactly one complaint — which is the claim the
// three refusal probes below actually test rather than assume.
//
// This spec recomputes the MAC itself, from `qms/.env`'s SESSION_SECRET, the
// same way `cast.js` reads VITE_DEV_PORT and `auth.setup.js` reaches into
// `../../../qms/database/e2e-seed.sql`. Minting the token locally is the only
// way to test the surface without an SMTP round-trip, and it is also the
// honest threat model: anyone who can compute the MAC is the attacker we care
// about, and anyone holding a forwarded support email IS holding a live token.
//
// ── B. THE AUTO-CLOSE WORKER ───────────────────────────────────────────────
// `qms/backend/worker/tasks/complaint_auto_close.js`, cron `30 * * * *`.
//
// HOW THIS FILE DRIVES IT, AND WHY. It does NOT boot the worker. A worker
// booted from a test has, in this program's own history, ended up pointed at a
// production database; and `graphile-worker` connects wherever DATABASE_URL
// says, which a Playwright process has no business deciding. Instead this
// spec issues the task's OWN TWO STATEMENTS, copied verbatim from the task
// file, through the same `sql()` helper every other spec uses against the
// local dev container:
//
//   CANDIDATES_QUERY — resolved_at < NOW() - make_interval(days =>
//                      companies.settings->'complaintSettings'->>'autoCloseDays')
//   CLOSE_SQL        — UPDATE ... SET status_id='CLOSED', closed_at=NOW()
//                      WHERE id=$1 AND status_id='RESOLVED'
//
// That is the whole task minus its logger line, so the selection rule, the
// threshold arithmetic, the RESOLVED-only guard and the audit attribution are
// all exercised for real. What it deliberately does not prove is that the cron
// entry exists — that is a crontab assertion, made below as a cheap file-free
// check on `graphile_worker._private_tasks`, not a scheduling test.
//
// ⚠ THE REAL CRON IS ALSO RUNNING. The dev worker fires this task at :30 past
// every hour. A fixture parked at RESOLVED with an old `resolved_at` is
// therefore genuinely closeable by something other than this test. Every
// assertion here is written to survive that: the "not yet due" fixture is kept
// far inside the threshold, and the "already closed" / "terminal" fixtures are
// in states the task's own WHERE clause excludes.
//
// ── ATTRIBUTION ────────────────────────────────────────────────────────────
// The task writes no audit row of its own any more (its G-03 header explains
// the removal). `customer_complaints_audit_trigger` →
// `graphile_worker.add_job('audit_event')` → the worker writes it, with
// `performed_by = NULL` because a cron connection sets no
// `app.current_user_id`. NULL is the system actor. Same async chain as
// `products/j10-audit-coverage.spec.js`, so the audit assertions here are
// `expect.poll` barriers, not bare reads.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, request, test } from '@playwright/test'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql, sqlRow, sqlValue } from '../fixtures/db.js'
import { createPersonaPool, restPost } from '../fixtures/complaints.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

const HERE = path.dirname(fileURLToPath(import.meta.url))
const quote = (s) => `'${String(s).replace(/'/g, "''")}'`

// ── Local helpers ───────────────────────────────────────────────────────────
// Everything this file needs that fixtures/complaints.js does not already
// export lives HERE, on purpose: that fixture file is shared with the other
// complaints journeys and is being extended in parallel.

/**
 * The API origin. The public endpoints are hit DIRECTLY rather than through
 * the Vite proxy — same call `fixtures/forms.js` makes for the public form
 * surface, and for the same reason: these responses are the assertion, and a
 * proxy in the path is one more thing that could be answering.
 */
function apiBase() {
  if (process.env.E2E_API_URL) return process.env.E2E_API_URL.replace(/\/+$/, '')
  for (const f of ['.env.local', '.env']) {
    try {
      const m = fs
        .readFileSync(path.resolve(HERE, '../..', f), 'utf8')
        .match(/^VITE_PROXY_API_TARGET=(\S+)/m)
      if (m) return m[1].replace(/\/+$/, '')
    } catch {
      // file may not exist — fall through
    }
  }
  return 'http://localhost:4000'
}
const API_BASE = apiBase()

/**
 * The API's SESSION_SECRET, which is also the HMAC key for every public
 * complaint token (`customerComplaintService.publicComplaintToken`).
 *
 * Read out of the BACKEND's .env rather than hardcoded, so a rotated secret
 * fails this file with "could not read SESSION_SECRET"/a 404 rather than
 * silently testing a MAC nobody accepts. `auth.setup.js` already reaches into
 * the sibling repo the same way (`../../../qms/database/e2e-seed.sql`).
 *
 * The service falls back to the literal 'dev-secret' when the variable is
 * unset; this mirrors that fallback so a bare checkout still runs.
 */
function sessionSecret() {
  if (process.env.E2E_SESSION_SECRET) return process.env.E2E_SESSION_SECRET
  for (const f of ['.env', '.env.example']) {
    try {
      const m = fs
        .readFileSync(path.resolve(HERE, '../../../qms', f), 'utf8')
        .match(/^SESSION_SECRET=(\S+)/m)
      if (m) return m[1]
    } catch {
      // fall through
    }
  }
  return 'dev-secret'
}
const SESSION_SECRET = sessionSecret()

/** `publicComplaintToken`, reimplemented byte-for-byte from the service. */
function publicToken(purpose, complaintId) {
  return crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`${purpose}:${complaintId}`)
    .digest('hex')
}

/** Flip one hex character of a token — same length, wrong MAC. */
function tamper(token) {
  const i = Math.floor(token.length / 2)
  const swapped = token[i] === 'a' ? 'b' : 'a'
  return token.slice(0, i) + swapped + token.slice(i + 1)
}

const PUBLIC_STATUS = (id, token) =>
  `${API_BASE}/v1/services/public/complaintStatus/${id}?token=${encodeURIComponent(token)}`
const PUBLIC_REPLY = (id, token) =>
  `${API_BASE}/v1/services/public/complaintStatus/${id}/reply?token=${encodeURIComponent(token)}`

/**
 * A request context with NO storageState — the entire point of this surface.
 * A context carrying the suite's session cookie would be exercising a
 * logged-in caller who happens to hit a /public path, and would prove nothing.
 * (`fixtures/forms.js`'s anonymous form probe makes the same call.)
 */
async function anon() {
  return request.newContext({ storageState: undefined })
}

/** One customer_complaints row, with the fields this file reasons about. */
function findCc(id) {
  const row = sqlRow(
    `SELECT complaint_number, subject, status_id, assigned_to, resolved_at, closed_at, company_id
       FROM customer_complaints WHERE id = ${quote(id)}`,
  )
  if (!row) return null
  const nz = (v) => (v === '' ? null : v)
  return {
    complaintNumber: row[0],
    subject: row[1],
    statusId: row[2],
    assignedTo: nz(row[3]),
    resolvedAt: nz(row[4]),
    closedAt: nz(row[5]),
    companyId: row[6],
  }
}

/**
 * Seed one customer complaint directly, in a chosen status.
 *
 * `sql()` connects as the Postgres superuser, which
 * `enforce_customer_complaint_status_transition` treats as the TRUSTED path
 * (`current_user <> 'app_user'`), so a row may be arranged straight into
 * RESOLVED/CLOSED here. That trust is exactly why the INSERT arm's
 * "only NEW on create" rule does not fire — arranging a precondition is not
 * the thing under test, and going through six REST calls to reach RESOLVED
 * would make every test in this file depend on five unrelated controllers.
 */
function seedCc(id, { subject, statusId = 'NEW', resolvedAgo = null, closed = false }) {
  const resolvedAt = resolvedAgo === null ? 'NULL' : `NOW() - INTERVAL ${quote(resolvedAgo)}`
  sql(
    `INSERT INTO customer_complaints
       (id, company_id, complaint_number, subject, description, status_id, source_id,
        customer_name, customer_email, resolved_at, closed_at, created_at, updated_at)
     VALUES (${quote(id)}, '${COMPANY_ID}', ${quote(`CC-E2E-J11-${id.slice(-4)}`)},
             ${quote(subject)}, ${quote('Seeded by CMP-J11.')}, ${quote(statusId)}, 'WEB',
             'Erin E2E Customer', 'erin.customer.j11@e2e.test',
             ${resolvedAt}, ${closed ? 'NOW()' : 'NULL'}, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET
       status_id = EXCLUDED.status_id,
       resolved_at = EXCLUDED.resolved_at,
       closed_at = EXCLUDED.closed_at,
       deleted_at = NULL`,
  )
}

/** Hard-remove this file's fixtures and everything hanging off them. */
function purgeJ11() {
  const ids = Object.values(TICKETS).map((t) => quote(t.id)).join(', ')
  sql(`DELETE FROM customer_complaint_messages WHERE complaint_id IN (${ids})`)
  sql(`DELETE FROM notifications WHERE resource_type = 'CustomerComplaint' AND resource_id IN (${ids})`)
  // audit_logs is DELIBERATELY NOT PURGED. `audit_logs_immutable` (BEFORE
  // DELETE OR UPDATE) raises 'audit_logs rows are immutable', so the statement
  // that used to be here aborted the whole purge and took the first test of
  // the file down with it — the trigger doing its job, read as a failure.
  // j9 asserts that same refusal as a control, so the rows are meant to
  // survive. They are harmless: entity_id is this file's own e2e… fixture set,
  // and nothing reads them once the complaints are gone.
  sql(`DELETE FROM customer_complaints WHERE id IN (${ids})`)
}

/**
 * The company's complaintSettings.autoCloseDays, as the worker reads it.
 *
 * Normalised to `null` for "unset". `sqlValue` hands back psql's tuples-only
 * stdout, where a SQL NULL is the EMPTY STRING and not null — the same trap
 * `fixtures/db.js`'s own `isSqlReady` comment is about. Left unnormalised,
 * `expect(...).toBeNull()` below would compare against '' and never fail.
 */
function autoCloseDays() {
  const v = sqlValue(
    `SELECT settings -> 'complaintSettings' ->> 'autoCloseDays' FROM companies WHERE id = '${COMPANY_ID}'`,
  )
  return v === null || v === '' ? null : v
}

/** Set (or clear) autoCloseDays without disturbing the rest of `settings`. */
function setAutoCloseDays(days) {
  if (days === null) {
    sql(
      `UPDATE companies SET settings = settings #- '{complaintSettings,autoCloseDays}'
        WHERE id = '${COMPANY_ID}'`,
    )
    return
  }
  sql(
    `UPDATE companies
        SET settings = jsonb_set(
              jsonb_set(coalesce(settings, '{}'::jsonb), '{complaintSettings}',
                        coalesce(settings -> 'complaintSettings', '{}'::jsonb), true),
              '{complaintSettings,autoCloseDays}', ${quote(String(days))}::jsonb, true)
      WHERE id = '${COMPANY_ID}'`,
  )
}

// ── The auto-close task, driven directly ───────────────────────────────────
// Both statements are verbatim from worker/tasks/complaint_auto_close.js. If
// that file's SQL changes and these copies do not, the divergence is the
// finding — which is why they are reproduced rather than paraphrased.

const CANDIDATES_QUERY = `
  SELECT c.id
  FROM customer_complaints c
  JOIN companies co ON co.id = c.company_id
  WHERE c.deleted_at IS NULL
    AND c.status_id = 'RESOLVED'
    AND (co.settings -> 'complaintSettings' ->> 'autoCloseDays') IS NOT NULL
    AND c.resolved_at < NOW() - make_interval(days => (co.settings -> 'complaintSettings' ->> 'autoCloseDays')::int)
  LIMIT 500
`

/**
 * Run the auto-close task's own logic against the local dev database.
 * Returns the ids it closed, exactly as the task's `rows` would have held.
 */
function runAutoCloseTask() {
  const out = sql(CANDIDATES_QUERY)
  const ids = out ? out.split('\n').filter(Boolean) : []
  for (const id of ids) {
    sql(
      `UPDATE customer_complaints
          SET status_id = 'CLOSED', closed_at = NOW(), updated_at = NOW()
        WHERE id = ${quote(id)} AND status_id = 'RESOLVED'`,
    )
  }
  return ids
}

/** Audit rows for one complaint since a psql timestamp, newest first. */
function auditRowsSince(complaintId, since) {
  const out = sql(
    `SELECT action, coalesce(performed_by::text, 'NULL'), coalesce(new_value_json::text, '')
       FROM audit_logs
      WHERE entity_id = ${quote(complaintId)}
        AND performed_at > ${quote(since)}::timestamptz
      ORDER BY performed_at DESC`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [action, performedBy, payload] = line.split('|')
    return { action, performedBy, payload }
  })
}

const now = () => sqlValue('SELECT NOW()::text')

// ── Fixtures ────────────────────────────────────────────────────────────────
// Distinct ids so a failure names the ticket it happened on, and so the
// per-test arrangement never fights another test's row.

const TICKETS = {
  // A — token scope + response shape + the CUSTOMER-attribution reply.
  portal: {
    id: 'e2e5e111-0000-4000-8000-000000000001',
    subject: 'E2E J11 portal ticket (token scope)',
  },
  // B — the OTHER ticket, for "a token for A must not open B".
  neighbour: {
    id: 'e2e5e111-0000-4000-8000-000000000002',
    subject: 'E2E J11 neighbour ticket (must stay unreachable)',
  },
  // C — CLOSED, then replied to by an anonymous customer. The §5 control.
  reopen: {
    id: 'e2e5e111-0000-4000-8000-000000000003',
    subject: 'E2E J11 closed ticket (unauthenticated reopen)',
  },
  // D — RESOLVED, well past the threshold → the worker must close it.
  autoDue: {
    id: 'e2e5e111-0000-4000-8000-000000000004',
    subject: 'E2E J11 resolved and overdue (auto-close due)',
  },
  // E — RESOLVED, resolved moments ago → the worker must leave it alone.
  autoNotDue: {
    id: 'e2e5e111-0000-4000-8000-000000000005',
    subject: 'E2E J11 resolved just now (auto-close not due)',
  },
  // F — already CLOSED, old. Not a candidate: the WHERE clause is RESOLVED-only.
  autoClosed: {
    id: 'e2e5e111-0000-4000-8000-000000000006',
    subject: 'E2E J11 already closed (auto-close must not touch)',
  },
  // G — ON_HOLD (escalated to an internal team / third party), old. Same.
  autoHeld: {
    id: 'e2e5e111-0000-4000-8000-000000000007',
    subject: 'E2E J11 escalated on hold (auto-close must not touch)',
  },
}

let originalAutoCloseDays = null

/**
 * Re-arrange the portal pair (A and its neighbour B) in IN_PROGRESS.
 *
 * WHY THIS IS CALLED FROM EVERY DESCRIBE THAT TOUCHES THEM, AND NOT ONCE.
 * Playwright discards the worker process after a failing test and continues
 * the file in a FRESH one. Discarding a worker runs its pending `afterAll`
 * hooks — including this file's outer `purgeJ11()` — so the moment any test in
 * this file fails, every fixture row is deleted and the tests that follow run
 * against nothing. On the suite's first full run that turned ONE genuine
 * failure (the 201-vs-200 above) into four: three later tests 404'd or found
 * an empty page and were reported as defects in the public portal, which was
 * behaving correctly the whole time.
 *
 * `beforeAll` of an ALREADY-FINISHED describe does not re-run in the new
 * worker, so "seed once in the first describe" is not a guarantee the later
 * describes can rely on. Each describe arranges what it reads.
 *
 * `seedCc` is ON CONFLICT DO UPDATE, so calling this repeatedly is a no-op on
 * a healthy run and a repair on a restarted one; it deliberately does NOT
 * touch `customer_complaint_messages`, because the projection test's own
 * agent-written notes are its arrangement, not this helper's.
 */
function seedPortalPair() {
  seedCc(TICKETS.portal.id, { subject: TICKETS.portal.subject, statusId: 'IN_PROGRESS' })
  seedCc(TICKETS.neighbour.id, { subject: TICKETS.neighbour.subject, statusId: 'IN_PROGRESS' })
}

test.describe('CMP-J11 · public status page (HMAC) + auto-close worker', () => {
  test.beforeAll(() => {
    originalAutoCloseDays = autoCloseDays()
    purgeJ11()
  })

  test.afterAll(() => {
    purgeJ11()
    setAutoCloseDays(originalAutoCloseDays === null ? null : Number(originalAutoCloseDays))
  })

  // ══ A. PUBLIC STATUS PAGE — TOKEN SCOPE ═══════════════════════════════════

  test.describe('A · the HMAC token opens exactly one ticket', () => {
    test.beforeAll(seedPortalPair)

    test('a valid token reads its own ticket, with no session of any kind', async () => {
      const ctx = await anon()
      const res = await ctx.get(PUBLIC_STATUS(TICKETS.portal.id, publicToken('status', TICKETS.portal.id)))
      expect(res.status(), `public status read failed: ${await res.text()}`).toBe(200)

      const { ticket } = await res.json()
      expect(ticket.subject, 'the token resolved to the ticket it was minted for').toBe(
        TICKETS.portal.subject,
      )
      expect(ticket.complaintNumber, 'and it carried the CC number').toMatch(/^CC-/)
      await ctx.dispose()
    })

    test('the same token against a DIFFERENT complaint id is refused (the id is inside the MAC)', async () => {
      // The load-bearing scope test. If the token were a bearer credential for
      // "the public complaint surface" rather than for one row, swapping the
      // id would work — and one leaked support email would read the whole
      // tenant's ticket queue.
      const ctx = await anon()
      const tokenForA = publicToken('status', TICKETS.portal.id)

      const res = await ctx.get(PUBLIC_STATUS(TICKETS.neighbour.id, tokenForA))
      expect(
        res.status(),
        "ticket A's token must not open ticket B — verifyPublicComplaintToken re-derives the MAC over the id in the URL",
      ).toBe(404)

      // And the converse, so the result cannot be an artefact of one direction.
      const tokenForB = publicToken('status', TICKETS.neighbour.id)
      const back = await ctx.get(PUBLIC_STATUS(TICKETS.portal.id, tokenForB))
      expect(back.status(), "and ticket B's token must not open ticket A").toBe(404)
      await ctx.dispose()
    })

    test('a tampered token of the correct length is refused, and so is a missing one', async () => {
      const ctx = await anon()
      const good = publicToken('status', TICKETS.portal.id)

      const flipped = await ctx.get(PUBLIC_STATUS(TICKETS.portal.id, tamper(good)))
      expect(
        flipped.status(),
        'one flipped hex character fails timingSafeEqual — the length pre-check passes, so this exercises the MAC comparison itself and not the length guard',
      ).toBe(404)

      const empty = await ctx.get(
        `${API_BASE}/v1/services/public/complaintStatus/${TICKETS.portal.id}`,
      )
      expect(empty.status(), 'no token at all is refused').toBe(404)

      const short = await ctx.get(PUBLIC_STATUS(TICKETS.portal.id, 'deadbeef'))
      expect(short.status(), 'a short token is refused by the length pre-check').toBe(404)

      // A token minted for a DIFFERENT purpose string must not work either —
      // the MAC covers `${purpose}:${id}`, and all three public endpoints use
      // 'status'. A future purpose must not become a skeleton key.
      const wrongPurpose = await ctx.get(
        PUBLIC_STATUS(TICKETS.portal.id, publicToken('csat', TICKETS.portal.id)),
      )
      expect(wrongPurpose.status(), "a token minted for another purpose is refused").toBe(404)

      await ctx.dispose()
    })

    test('a refusal does not disclose whether the ticket exists', async () => {
      const ctx = await anon()
      const real = await ctx.get(PUBLIC_STATUS(TICKETS.portal.id, tamper(publicToken('status', TICKETS.portal.id))))
      const fake = await ctx.get(
        PUBLIC_STATUS('e2e5e111-0000-4000-8000-0000000000ff', publicToken('status', 'e2e5e111-0000-4000-8000-0000000000ff')),
      )

      expect(real.status(), 'a real ticket with a bad token 404s').toBe(404)
      expect(fake.status(), 'a valid token for a nonexistent ticket also 404s').toBe(404)
      // Compare the ERROR MESSAGE, not the whole body. Every response carries
      // its own `requestId` and `timestamp` in `meta`, so a raw text-equality
      // check can never pass — it did not on the suite's first full run, even
      // though the security property it is testing holds. The disclosure
      // channel is the message and the status, and those are what must match.
      expect(
        (await real.json()).error?.message,
        'both answer identically — loadComplaintByToken throws the same NotFoundError before and after the row lookup ("don\'t reveal existence on bad token")',
      ).toBe((await fake.json()).error?.message)
      await ctx.dispose()
    })
  })

  // ══ A. PUBLIC STATUS PAGE — RESPONSE SHAPE (no internal leakage) ══════════

  test.describe('A · the portal projection leaks nothing internal', () => {
    test.beforeAll(seedPortalPair)

    test('internal notes, QA notes and the whole internal column set are absent from the payload', async ({
      browser,
    }) => {
      // Arrange through the REAL agent path so the internal content is
      // genuinely internal — an INTERNAL_NOTE written by the controller, not a
      // row this test shaped to be convenient.
      const agent = await pool.page(browser, AUTH.supportAgent)

      // 200, NOT 201. This test asserted 201 on its first run because the
      // PUBLIC reply route next door answers `sendCreated` (201) and the two
      // were assumed symmetric. They are not: the AGENT route
      // (`replyToComplaint`) ends `sendSuccess(res, req, { customerComplaint,
      // message })` — 200 with the created message in the body. The product is
      // right either way (a 200 carrying the new resource is a legitimate
      // answer); the test encoded the wrong half of the pair. Asserting the
      // message came back too, so this stays a real "the note was created"
      // check rather than a bare status downgrade.
      const note = await restPost(agent, `/customerComplaints/${TICKETS.portal.id}/reply`, {
        body: 'INTERNAL-ONLY-J11: the customer is on their third refund request this quarter.',
        kind: 'INTERNAL_NOTE',
      })
      expect(note.status(), `internal note failed: ${await note.text()}`).toBe(200)
      expect((await note.json()).message?.kind, 'and it was filed as an INTERNAL_NOTE').toBe(
        'INTERNAL_NOTE',
      )

      const qaNote = await restPost(agent, `/customerComplaints/${TICKETS.portal.id}/reply`, {
        body: 'QA-ONLY-J11: root cause looks like the same seal batch as NCR-2201.',
        kind: 'QA_NOTE',
      })
      expect(qaNote.status(), `QA note failed: ${await qaNote.text()}`).toBe(200)
      expect((await qaNote.json()).message?.kind, 'and as a QA_NOTE').toBe('QA_NOTE')

      const publicReply = await restPost(agent, `/customerComplaints/${TICKETS.portal.id}/reply`, {
        body: 'PUBLIC-J11: thanks for getting in touch, we are looking into this now.',
      })
      expect(publicReply.status(), `public reply failed: ${await publicReply.text()}`).toBe(200)
      expect(
        (await publicReply.json()).message?.kind,
        'a reply with no `kind` is a PUBLIC_REPLY — the one an anonymous reader may see',
      ).toBe('PUBLIC_REPLY')

      // Act, as nobody.
      const ctx = await anon()
      const res = await ctx.get(PUBLIC_STATUS(TICKETS.portal.id, publicToken('status', TICKETS.portal.id)))
      expect(res.status()).toBe(200)
      const payload = await res.json()
      const raw = JSON.stringify(payload)
      const { ticket } = payload

      // The projection is an allowlist, so assert the EXACT key set. A new
      // column added to the model must not appear here by accident — that is
      // the failure mode this assertion exists to catch, and a subset check
      // (`toHaveProperty`) would never catch it.
      expect(
        Object.keys(ticket).sort(),
        'the customer-safe projection is exactly these seven keys (getPublicComplaintStatus)',
      ).toEqual([
        'complaintNumber',
        'createdAt',
        'csatRating',
        'companyName',
        'messages',
        'statusId',
        'subject',
      ].sort())

      // Named internal fields, called out one by one so a regression says
      // WHICH field leaked rather than "the shape changed".
      for (const field of [
        'id',
        'companyId',
        'description',
        'assignedTo',
        'assignedTeamId',
        'sentiment',
        'isSpam',
        'spamMarkedBy',
        'customerEmail',
        'customerPhone',
        'customerId',
        'organizationId',
        'slaFirstResponseDueAt',
        'slaResolutionDueAt',
        'csatComment',
        'customFields',
        'formSnapshot',
        'createdBy',
        'updatedBy',
      ]) {
        expect(ticket, `the portal must not expose \`${field}\``).not.toHaveProperty(field)
      }

      // Message-level leakage. `messages` is filtered `kind: 'PUBLIC_REPLY'`,
      // so the note bodies must not be in the response AT ALL — checked
      // against the serialised payload rather than the array, because a
      // future field (a preview, a "latest activity" line) could reintroduce
      // them somewhere other than `messages`.
      expect(raw, 'an INTERNAL_NOTE body never reaches the customer').not.toContain('INTERNAL-ONLY-J11')
      expect(raw, 'a QA_NOTE body never reaches the customer').not.toContain('QA-ONLY-J11')
      expect(raw, 'the agent\'s public reply DOES reach the customer').toContain('PUBLIC-J11')

      // The agent's identity is reduced to a role word. `senderUserId` and the
      // real user id must not travel.
      const outbound = ticket.messages.filter((m) => m.direction === 'OUTBOUND')
      expect(outbound.length, 'exactly one public agent reply is visible').toBe(1)
      expect(
        Object.keys(outbound[0]).sort(),
        'a message is projected down to four fields — no ids, no kind, no senderEmail',
      ).toEqual(['body', 'createdAt', 'direction', 'senderName'])
      expect(raw, "no internal user id travels with the agent's reply").not.toContain(
        USERS.supportAgent.id,
      )

      // Other customers' data: the neighbour ticket is untouched by this read.
      expect(raw, "the neighbour ticket's subject is not in this response").not.toContain(
        TICKETS.neighbour.subject,
      )

      await ctx.dispose()
    })
  })

  // ══ A. UNAUTHENTICATED REPLY — ATTRIBUTION ════════════════════════════════

  test.describe('A · an unauthenticated reply is attributed to the CUSTOMER', () => {
    test.beforeAll(seedPortalPair)

    test('the message lands INBOUND with no sender user, and the audit row has no actor', async () => {
      const since = now()
      const marker = `J11-CUSTOMER-REPLY-${Date.now()}`

      const ctx = await anon()
      const res = await ctx.post(
        PUBLIC_REPLY(TICKETS.portal.id, publicToken('status', TICKETS.portal.id)),
        { data: { body: marker } },
      )
      expect(res.status(), `public reply failed: ${await res.text()}`).toBe(201)
      await ctx.dispose()

      const row = sqlRow(
        `SELECT direction, kind, coalesce(sender_user_id::text, 'NULL'),
                coalesce(sender_name, ''), coalesce(sender_email, '')
           FROM customer_complaint_messages
          WHERE complaint_id = ${quote(TICKETS.portal.id)} AND body = ${quote(marker)}`,
      )
      expect(row, 'the reply was recorded').not.toBeNull()
      const [direction, kind, senderUserId, senderName, senderEmail] = row

      expect(direction, 'a customer reply is INBOUND, not an agent OUTBOUND').toBe('INBOUND')
      expect(
        senderUserId,
        'and it is NOT attributed to a staff user — recordCustomerReply never sets senderUserId, unlike the agent replyToComplaint path which sets it to req.user.id',
      ).toBe('NULL')
      expect(
        senderName,
        'the sender is the ticket\'s own customerName, copied by the controller (the anonymous caller does not get to name themselves)',
      ).toBe('Erin E2E Customer')
      expect(senderEmail, 'ditto the customer email on the ticket').toBe(
        'erin.customer.j11@e2e.test',
      )
      expect(
        kind,
        'it defaults to PUBLIC_REPLY, so the customer sees their own message back on the portal',
      ).toBe('PUBLIC_REPLY')

      // `updatedBy` is explicitly nulled by recordCustomerReply, so the ticket
      // row itself does not claim a staff editor either.
      expect(
        sqlValue(
          `SELECT coalesce(updated_by::text, 'NULL') FROM customer_complaints WHERE id = ${quote(TICKETS.portal.id)}`,
        ),
        'the ticket is not stamped as last-edited by any user',
      ).toBe('NULL')

      // The service writes this audit row inline (not via the trigger), so it
      // is synchronous — but the trigger's own row for the status change is
      // async, hence the poll.
      await expect
        .poll(() => auditRowsSince(TICKETS.portal.id, since).map((r) => r.action), {
          timeout: 30_000,
          intervals: [500],
        })
        .toContain('RECEIVE')

      const receive = auditRowsSince(TICKETS.portal.id, since).find((r) => r.action === 'RECEIVE')
      expect(
        receive.performedBy,
        'performed_by is NULL — there is no user to attribute an unauthenticated reply to, and inventing one would be the worse failure',
      ).toBe('NULL')
      expect(
        receive.payload,
        'and the row records HOW it arrived, which is the only provenance a customer reply has',
      ).toContain('STATUS_PAGE')
    })

    test('an empty reply is refused before anything is written', async () => {
      const before = sqlValue(
        `SELECT count(*) FROM customer_complaint_messages WHERE complaint_id = ${quote(TICKETS.portal.id)}`,
      )
      const ctx = await anon()
      const res = await ctx.post(
        PUBLIC_REPLY(TICKETS.portal.id, publicToken('status', TICKETS.portal.id)),
        { data: { body: '   ' } },
      )
      expect(res.status(), 'a whitespace-only reply is a 400').toBe(400)
      await ctx.dispose()

      expect(
        sqlValue(
          `SELECT count(*) FROM customer_complaint_messages WHERE complaint_id = ${quote(TICKETS.portal.id)}`,
        ),
        'and no message row was created',
      ).toBe(before)
    })

    test('a reply with a bad token writes nothing', async () => {
      const before = sqlValue(
        `SELECT count(*) FROM customer_complaint_messages WHERE complaint_id = ${quote(TICKETS.portal.id)}`,
      )
      const ctx = await anon()
      const res = await ctx.post(
        PUBLIC_REPLY(TICKETS.portal.id, tamper(publicToken('status', TICKETS.portal.id))),
        { data: { body: 'J11 should never be stored' } },
      )
      expect(res.status(), 'the write path checks the MAC before it reads the body').toBe(404)
      await ctx.dispose()

      expect(
        sqlValue(
          `SELECT count(*) FROM customer_complaint_messages WHERE complaint_id = ${quote(TICKETS.portal.id)}`,
        ),
        'nothing was written',
      ).toBe(before)
    })
  })

  // ══ A. THE CONTROL THAT MATTERS: UNAUTHENTICATED REOPEN ═══════════════════

  test.describe('A · an unauthenticated reply REOPENS a closed complaint', () => {
    /**
     * The closed ticket, re-created (not transitioned) at CLOSED, closed
     * `closedAgo` ago.
     *
     * Delete-then-insert for the same two reasons as arrangeAutoDue below:
     * a plain `seedCc` upsert onto a row this describe's own earlier tests
     * left at OPEN or CONVERTED_TO_NC is an UPDATE, and
     * `enforce_customer_complaint_status_transition` refuses both
     * CONVERTED_TO_NC -> anything (terminal) and CLOSED -> anything-but-OPEN
     * even for the trusted superuser path. The INSERT arm has no such rule for
     * a trusted caller, so a fresh row may simply be born CLOSED.
     */
    function arrangeReopenTicket(closedAgo = null) {
      sql(
        `DELETE FROM customer_complaint_messages WHERE complaint_id = ${quote(TICKETS.reopen.id)}`,
      )
      sql(
        `DELETE FROM notifications WHERE resource_type = 'CustomerComplaint' AND resource_id = ${quote(TICKETS.reopen.id)}`,
      )
      sql(`DELETE FROM customer_complaints WHERE id = ${quote(TICKETS.reopen.id)}`)
      seedCc(TICKETS.reopen.id, {
        subject: TICKETS.reopen.subject,
        statusId: 'CLOSED',
        resolvedAgo: '40 days',
        closed: true,
      })
      if (closedAgo) {
        // closed_at only, and only DOWNWARDS in time — no status change, so
        // the transition guard is not involved.
        sql(
          `UPDATE customer_complaints SET closed_at = NOW() - INTERVAL ${quote(closedAgo)}
            WHERE id = ${quote(TICKETS.reopen.id)}`,
        )
      }
    }

    test.beforeAll(() => arrangeReopenTicket())

    // SECURITY-RELEVANT: this is a CHARACTERISATION test. It asserts what the
    // code does TODAY, which is not the same as asserting that the behaviour
    // is correct. The reopen is intentional (`customer_complaint_statuses`
    // describes CLOSED as "Complaint closed. A customer reply reopens it.",
    // and the CLOSED -> OPEN edge is the one transition the DB guard
    // whitelists out of CLOSED) — but the AUTHORISATION on it is a bearer
    // token that:
    //
    //   1. NEVER EXPIRES. `publicComplaintToken` MACs only `purpose:id` —
    //      there is no timestamp, no nonce and no counter in the message, so a
    //      token minted at intake is still valid years later. The only
    //      invalidation available is rotating SESSION_SECRET, which would log
    //      out every real user in the product at the same time.
    //   2. IS NOT REVOCABLE PER TICKET. Nothing is stored, so there is no
    //      record to delete and no "revoke this link" anywhere in the product.
    //      Compare the forms surface, which HAS a revocable stored token
    //      (fixtures/forms.js's liveToken/revoke journey).
    //   3. IS NOT RATE-LIMITED BEYOND THE GLOBAL LIMITER. The route's own
    //      OpenAPI block states "**No dedicated rate limiter** beyond the
    //      global apiLimiter" — unlike `publicFormLimiter`, which the sibling
    //      public surface has.
    //   4. ~~HAS NO REOPEN CEILING.~~ **FIXED (CC-D4).** This WAS the finding:
    //      `recordCustomerReply` reopened on `statusId === 'CLOSED'`
    //      unconditionally — no cap, no window, no distinction between a
    //      closure a minute ago and one from two years ago. It now consults
    //      `reopenWindowAllows()`: a reply is ALWAYS recorded and audited, but
    //      only moves the status while the ticket is within
    //      `complaintSettings.customerReopenDays` of its closure (default 30;
    //      0 disables customer reopening outright). Outside the window the
    //      audit row carries `reopenRefused: 'OUTSIDE_REOPEN_WINDOW'`.
    //      Points 1-3 and 5 below are UNCHANGED and still open.
    //   5. GRANTS MORE THAN AN AUTHENTICATED AGENT DOES. The logged-in reply
    //      route calls `assertMutable`, which treats CLOSED as terminal, so a
    //      support agent holding `complaint_management:update` gets a 409 on
    //      the same row the anonymous caller reopens. Pinned by its own test
    //      below; it is the clearest single statement of the problem.
    //
    // Consequence, and this is the finding rather than a hypothetical: anyone
    // holding one support email — a forwarded thread, a shared inbox, a
    // mail archive, an ex-employee's mailbox — can move a CLOSED quality
    // record back into OPEN, indefinitely and repeatedly, with no account and
    // no trace beyond `performed_by IS NULL`. In a regulated QMS, "a closed
    // record can be reopened by an unauthenticated party" is a records-control
    // statement, not a UX one, and it belongs in the risk assessment §5 points
    // at. The test below is deliberately written to PASS on the current
    // behaviour so it documents the surface accurately; if a cap, an expiry or
    // a revocation list is added later, THIS TEST SHOULD FAIL and be rewritten
    // to the new rule rather than deleted.
    test('SECURITY-RELEVANT · a CLOSED ticket is reopened to OPEN by an anonymous reply, INSIDE the window', async () => {
      arrangeReopenTicket()
      expect(findCc(TICKETS.reopen.id).statusId, 'arranged CLOSED').toBe('CLOSED')
      expect(findCc(TICKETS.reopen.id).closedAt, 'and stamped closed').not.toBeNull()

      const since = now()
      const ctx = await anon()
      const token = publicToken('status', TICKETS.reopen.id)

      const res = await ctx.post(PUBLIC_REPLY(TICKETS.reopen.id, token), {
        data: { body: 'J11 reopen #1 — this is still not fixed.' },
      })
      expect(
        res.status(),
        'the reply is ACCEPTED on a closed ticket — there is no closed-ticket refusal on this route (the only 409 is CONVERTED_TO_NC)',
      ).toBe(201)

      const after = findCc(TICKETS.reopen.id)
      expect(
        after.statusId,
        'SECURITY-RELEVANT: an unauthenticated caller moved a CLOSED quality record to OPEN',
      ).toBe('OPEN')
      expect(
        after.closedAt,
        'and closed_at was cleared, so the record no longer carries the date it was closed',
      ).toBeNull()

      // Still no CAP on the number of reopens inside the window — close it
      // again and it reopens again. CC-D4 bounded reopening by TIME SINCE
      // CLOSURE, not by a count, so a ticket that keeps being closed and
      // replied to promptly keeps reopening. That is the intended service
      // behaviour; the out-of-window case is the control, and it has its own
      // test immediately below.
      sql(
        `UPDATE customer_complaints SET status_id = 'CLOSED', closed_at = NOW()
          WHERE id = ${quote(TICKETS.reopen.id)}`,
      )
      const second = await ctx.post(PUBLIC_REPLY(TICKETS.reopen.id, token), {
        data: { body: 'J11 reopen #2 — same link, same token, hours later.' },
      })
      expect(
        second.status(),
        'the SAME never-expiring token reopens it a second time — no cap, no cooldown, no per-ticket revocation',
      ).toBe(201)
      expect(
        findCc(TICKETS.reopen.id).statusId,
        'reopen is not once-only: inside the window it may happen repeatedly',
      ).toBe('OPEN')

      await ctx.dispose()

      // It IS audited, which is the one mitigation actually present. REOPEN
      // rather than RECEIVE, because recordCustomerReply branches on the
      // prior status.
      await expect
        .poll(() => auditRowsSince(TICKETS.reopen.id, since).map((r) => r.action), {
          timeout: 30_000,
          intervals: [500],
        })
        .toContain('REOPEN')

      const reopens = auditRowsSince(TICKETS.reopen.id, since).filter((r) => r.action === 'REOPEN')
      expect(reopens.length, 'both reopens are on the record').toBeGreaterThanOrEqual(2)
      for (const r of reopens) {
        expect(
          r.performedBy,
          'each reopen is attributed to nobody — the audit trail can say it happened and via STATUS_PAGE, but never who did it',
        ).toBe('NULL')
      }
    })

    // ── THE CONTROL (CC-D4) ────────────────────────────────────────────────
    // The counterpart to the test above, and the one that proves the window is
    // load-bearing rather than decorative. A ticket closed longer ago than
    // `customerReopenDays` must NOT reopen — but the reply must still be
    // recorded, because silently dropping genuine customer contact is the
    // worse failure and was never the intent of the fix.
    test('CC-D4 · a reply OUTSIDE the reopen window is recorded but does NOT reopen the ticket', async () => {
      // Park the closure well outside the 30-day default. Re-created rather
      // than transitioned: the test above leaves this row at OPEN, and an
      // UPDATE back to CLOSED is a status change the guard would allow — but
      // the same statement run twice (a retry, a worker restart) would start
      // from CLOSED and be refused. arrangeReopenTicket is idempotent from
      // ANY prior state, which is what makes this test independent.
      arrangeReopenTicket('90 days')
      expect(findCc(TICKETS.reopen.id).statusId, 'arranged CLOSED long ago').toBe('CLOSED')

      const since = now()
      const ctx = await anon()
      const token = publicToken('status', TICKETS.reopen.id)

      const res = await ctx.post(PUBLIC_REPLY(TICKETS.reopen.id, token), {
        data: { body: 'J11 — replying to a ticket closed three months ago.' },
      })
      expect(
        res.status(),
        'the reply is still ACCEPTED — the window bounds the REOPEN, not the customer being heard',
      ).toBe(201)

      const after = findCc(TICKETS.reopen.id)
      expect(
        after.statusId,
        'CC-D4: the ticket stays CLOSED — an expired link can no longer move a closed quality record',
      ).toBe('CLOSED')
      expect(after.closedAt, 'and it keeps the date it was closed').not.toBeNull()

      // The message must exist, or the control has become data loss.
      expect(
        sqlValue(
          `SELECT count(*) FROM customer_complaint_messages
            WHERE complaint_id = ${quote(TICKETS.reopen.id)}
              AND body LIKE '%three months ago%'`,
        ),
        'the customer reply is on the thread for a human to triage — the window bounds the reopen, it must not drop the message',
      ).toBe('1')

      // RECEIVE, not REOPEN — and stamped so the trail shows the control fired
      // rather than leaving it indistinguishable from an ordinary reply.
      await expect
        .poll(() => auditRowsSince(TICKETS.reopen.id, since).map((r) => r.action), {
          timeout: 30_000,
          intervals: [500],
        })
        .toContain('RECEIVE')
      expect(
        auditRowsSince(TICKETS.reopen.id, since).map((r) => r.action),
        'no REOPEN was written',
      ).not.toContain('REOPEN')

      await ctx.dispose()
    })

    test('SECURITY-RELEVANT · the AUTHENTICATED agent is refused on a closed ticket that the anonymous customer may reopen', async ({
      browser,
    }) => {
      // The asymmetry, stated as one assertion pair. `replyToComplaint` (the
      // logged-in agent route) calls `assertMutable`, and
      // CC_TERMINAL_STATUSES = ['CLOSED', 'CONVERTED_TO_NC'] — so a support
      // agent holding `complaint_management:update` gets a 409 on a closed
      // ticket. `postPublicComplaintReply` calls no such guard: its only
      // status check is the CONVERTED_TO_NC branch.
      //
      // So on a CLOSED record the unauthenticated caller has STRICTLY MORE
      // capability than the authenticated one. That inversion is the part
      // worth flagging: whatever the intent behind "a customer reply reopens
      // it", the permission model is upside down at this one state, and no
      // grant, role or scope participates in the anonymous path at all.
      arrangeReopenTicket()

      const agent = await pool.page(browser, AUTH.supportAgent)
      const staff = await restPost(agent, `/customerComplaints/${TICKETS.reopen.id}/reply`, {
        body: 'J11 agent reply on a closed ticket',
      })
      expect(
        staff.status(),
        'the authenticated agent is refused — assertMutable treats CLOSED as terminal',
      ).toBe(409)

      const ctx = await anon()
      const stranger = await ctx.post(
        PUBLIC_REPLY(TICKETS.reopen.id, publicToken('status', TICKETS.reopen.id)),
        { data: { body: 'J11 anonymous reply on the same closed ticket' } },
      )
      expect(
        stranger.status(),
        'SECURITY-RELEVANT: the anonymous caller is ACCEPTED on the very same row the permissioned agent was just refused on',
      ).toBe(201)
      await ctx.dispose()

      expect(
        findCc(TICKETS.reopen.id).statusId,
        'and the record moved, so the capability is real rather than a silently-dropped write',
      ).toBe('OPEN')
    })

    test('CONVERTED_TO_NC is the one state the portal refuses — the reopen path has exactly one exclusion', async () => {
      // Worth pinning precisely because it is the ONLY status the controller
      // special-cases. Everything else — CLOSED included — falls through to
      // recordCustomerReply.
      // From a fresh CLOSED row: CLOSED -> CONVERTED_TO_NC is refused by the
      // guard (CLOSED may only reopen to OPEN), and CONVERTED_TO_NC -> * is
      // refused as terminal, so the row is BORN converted rather than moved
      // there. Deleting first also means a re-run is not blocked by the
      // terminal row this test itself leaves behind.
      sql(
        `DELETE FROM customer_complaint_messages WHERE complaint_id = ${quote(TICKETS.reopen.id)}`,
      )
      sql(
        `DELETE FROM notifications WHERE resource_type = 'CustomerComplaint' AND resource_id = ${quote(TICKETS.reopen.id)}`,
      )
      sql(`DELETE FROM customer_complaints WHERE id = ${quote(TICKETS.reopen.id)}`)
      seedCc(TICKETS.reopen.id, {
        subject: TICKETS.reopen.subject,
        statusId: 'CONVERTED_TO_NC',
      })

      const ctx = await anon()
      const res = await ctx.post(
        PUBLIC_REPLY(TICKETS.reopen.id, publicToken('status', TICKETS.reopen.id)),
        { data: { body: 'J11 reply after NC conversion' } },
      )
      expect(res.status(), 'a converted ticket no longer accepts replies').toBe(409)
      await ctx.dispose()

      expect(
        findCc(TICKETS.reopen.id).statusId,
        'and it stays terminal — the DB guard would refuse the move anyway',
      ).toBe('CONVERTED_TO_NC')
    })
  })

  // ══ A. THE UI, AS A STRANGER SEES IT ══════════════════════════════════════

  test.describe('A · the /support/ticket page renders for a caller with no session', () => {
    // This describe arranges BOTH the ticket and the two messages it reads.
    //
    // It used to read the public reply and the internal note the projection
    // test happened to leave behind three describes earlier. That is a
    // cross-test dependency in normal running and a guaranteed failure after a
    // worker restart (see seedPortalPair), which is how it failed on the first
    // full run: the page rendered perfectly, there was simply no ticket left to
    // render. Arranging its own pair also means the "internal note is NOT on
    // the page" assertion is a real negative — an internal note provably
    // exists on this ticket right now — rather than a vacuous one that would
    // also pass on an empty conversation.
    test.beforeAll(async ({ browser }) => {
      seedPortalPair()
      // Start from an EMPTY thread. The projection test three describes up
      // posts the same PUBLIC-J11 body, and leaving it in place made
      // `getByText('PUBLIC-J11')` match twice — a strict-mode violation, i.e.
      // this describe asserting on a conversation it did not fully arrange.
      // Wiping first means the counts below are exact and this test reads the
      // messages it wrote, not whichever ones survived.
      sql(
        `DELETE FROM customer_complaint_messages WHERE complaint_id = ${quote(TICKETS.portal.id)}`,
      )
      const agent = await pool.page(browser, AUTH.supportAgent)
      const note = await restPost(agent, `/customerComplaints/${TICKETS.portal.id}/reply`, {
        body: 'INTERNAL-ONLY-J11: the customer is on their third refund request this quarter.',
        kind: 'INTERNAL_NOTE',
      })
      expect(note.status(), `arrange internal note failed: ${await note.text()}`).toBe(200)
      const reply = await restPost(agent, `/customerComplaints/${TICKETS.portal.id}/reply`, {
        body: 'PUBLIC-J11: thanks for getting in touch, we are looking into this now.',
      })
      expect(reply.status(), `arrange public reply failed: ${await reply.text()}`).toBe(200)
    })

    test('a stranger with the emailed link reads the ticket and replies through the page', async ({
      browser,
    }) => {
      // The API tests above are the load-bearing ones; this proves the chain
      // the customer actually walks — `/support` is in PUBLIC_ROUTES, so
      // App.vue takes the public boot branch (no tenant resolution, no
      // syncEngine) and the page fetches the same token-authenticated endpoint.
      const ctx = await browser.newContext({ storageState: undefined })
      const page = await ctx.newPage()

      const token = publicToken('status', TICKETS.portal.id)
      await page.goto(`/support/ticket/${TICKETS.portal.id}?token=${token}`, {
        waitUntil: 'domcontentloaded',
      })

      await expect(page.getByText(TICKETS.portal.subject), 'the ticket rendered').toBeVisible({
        timeout: 30_000,
      })
      const publicBubble = page.getByText('PUBLIC-J11', { exact: false })
      await expect(
        publicBubble,
        'exactly the one agent reply this describe posted is on the page',
      ).toHaveCount(1)
      await expect(publicBubble, 'and the public conversation is shown').toBeVisible()
      await expect(
        page.getByText('INTERNAL-ONLY-J11', { exact: false }),
        'and the internal note is not on the page',
      ).toHaveCount(0)

      const marker = `J11-UI-REPLY-${Date.now()}`
      await page.getByPlaceholder('Add a reply…').fill(marker)
      await page.getByRole('button', { name: /Send Reply/i }).click()

      await expect
        .poll(
          () =>
            sqlValue(
              `SELECT count(*) FROM customer_complaint_messages
                WHERE complaint_id = ${quote(TICKETS.portal.id)} AND body = ${quote(marker)}`,
            ),
          { timeout: 30_000, intervals: [500] },
        )
        .toBe('1')

      await ctx.close()
    })

    test('a bad link shows the dead-link panel rather than the ticket', async ({ browser }) => {
      const ctx = await browser.newContext({ storageState: undefined })
      const page = await ctx.newPage()
      await page.goto(
        `/support/ticket/${TICKETS.portal.id}?token=${tamper(publicToken('status', TICKETS.portal.id))}`,
        { waitUntil: 'domcontentloaded' },
      )
      await expect(
        page.getByText('This ticket link is not valid', { exact: false }),
        'the page fails closed, showing no ticket content',
      ).toBeVisible({ timeout: 30_000 })
      await expect(page.getByText(TICKETS.portal.subject)).toHaveCount(0)
      await ctx.close()
    })
  })

  // ══ B. AUTO-CLOSE WORKER ══════════════════════════════════════════════════

  test.describe('B · the auto-close worker closes resolved tickets with no human action', () => {
    const THRESHOLD_DAYS = 7

    /**
     * Re-arrange the auto-close candidate at RESOLVED, `resolvedAgo` old.
     *
     * WHY A RE-SEED AND NOT AN UPDATE. Three tests below need this row back at
     * RESOLVED after an earlier one legitimately closed it, and they used to
     * get there with `UPDATE ... SET status_id = 'RESOLVED'`. That statement
     * cannot work: `enforce_customer_complaint_status_transition` refuses
     * CLOSED -> anything-but-OPEN **on the trusted path too** — superuser only
     * buys past the "status cannot be changed directly" arm, not past the
     * CLOSED rule underneath it, so the arrange died with
     * `Illegal customer complaint transition: CLOSED -> RESOLVED`.
     *
     * DELETE + re-INSERT is the honest arrangement: the INSERT arm of the same
     * trigger lets a trusted caller create a row in any status, so the row is
     * BORN resolved rather than transitioned there, and no test inherits the
     * status an earlier test left behind. (`seedCc`'s ON CONFLICT UPDATE is
     * not enough on its own — an UPSERT onto an existing CLOSED row is still
     * an UPDATE and hits the same guard.)
     */
    function arrangeAutoDue(resolvedAgo) {
      sql(`DELETE FROM customer_complaint_messages WHERE complaint_id = ${quote(TICKETS.autoDue.id)}`)
      sql(
        `DELETE FROM notifications WHERE resource_type = 'CustomerComplaint' AND resource_id = ${quote(TICKETS.autoDue.id)}`,
      )
      sql(`DELETE FROM customer_complaints WHERE id = ${quote(TICKETS.autoDue.id)}`)
      seedCc(TICKETS.autoDue.id, {
        subject: TICKETS.autoDue.subject,
        statusId: 'RESOLVED',
        resolvedAgo,
      })
    }

    /**
     * The three CONTROL rows (E/F/G), re-arranged. Same worker-restart reason
     * as seedPortalPair: a failure anywhere in this file discards the worker,
     * which runs the outer `purgeJ11()`, and the tests that continue in the
     * next worker must not depend on a `beforeAll` that will never run again.
     * None of these three crosses CLOSED, so a plain `seedCc` upsert is fine.
     */
    function arrangeAutoControls() {
      // E: resolved 1 hour ago → nowhere near due. Deliberately far inside the
      // window, so the real hourly cron cannot close it between arrange and
      // assert and turn a true negative into a flake.
      seedCc(TICKETS.autoNotDue.id, {
        subject: TICKETS.autoNotDue.subject,
        statusId: 'RESOLVED',
        resolvedAgo: '1 hour',
      })
      // F: already CLOSED, old.
      seedCc(TICKETS.autoClosed.id, {
        subject: TICKETS.autoClosed.subject,
        statusId: 'CLOSED',
        resolvedAgo: '60 days',
        closed: true,
      })
      // G: ON_HOLD — escalated to an internal team / third party. Old enough
      // to be caught by the date arithmetic if the status filter were wrong,
      // which is the only reason to date it at all.
      seedCc(TICKETS.autoHeld.id, {
        subject: TICKETS.autoHeld.subject,
        statusId: 'ON_HOLD',
        resolvedAgo: '60 days',
      })
    }

    test.beforeAll(() => {
      setAutoCloseDays(THRESHOLD_DAYS)
      // D: resolved 30 days ago, threshold 7 → due.
      arrangeAutoDue('30 days')
      arrangeAutoControls()
    })

    test('the task is scheduled, not merely implemented', () => {
      // A task nobody runs is a function, not a control. `worker/crontab` says
      // `30 * * * *  complaint_auto_close  ?id=complaint-auto-close`, and
      // graphile-worker materialises a known-crontab row per cron identifier
      // the first time it boots against a database.
      //
      // Skipped rather than failed when the schema is absent: a freshly reset
      // dev DB that the worker has never attached to legitimately has no
      // graphile_worker tables yet, and that is a stack-state fact about the
      // machine, not a defect in the control. The tests below drive the task's
      // SQL directly and do not depend on this.
      // `_private_known_crontabs`, not `known_crontabs`: graphile-worker 0.16
      // renamed the table (sql/000016.sql) and — unlike `jobs` and `tasks` —
      // left no compatibility view behind for it.
      const installed = sqlValue(
        `SELECT count(*) FROM information_schema.tables
          WHERE table_schema = 'graphile_worker' AND table_name = '_private_known_crontabs'`,
      )
      test.skip(
        installed === '0',
        'graphile_worker has never booted against this database — no schedule to inspect',
      )

      expect(
        sqlValue(
          `SELECT count(*) FROM graphile_worker._private_known_crontabs WHERE identifier = 'complaint-auto-close'`,
        ),
        'the crontab identifier from worker/crontab is registered — if this is 0 the hourly schedule is not live and nothing closes a resolved ticket on its own, whatever the task file says',
      ).not.toBe('0')
    })

    test('a resolved complaint past the threshold is closed with no human action', async () => {
      arrangeAutoDue('30 days')
      setAutoCloseDays(THRESHOLD_DAYS)
      const since = now()
      expect(findCc(TICKETS.autoDue.id).statusId, 'arranged RESOLVED').toBe('RESOLVED')

      const closed = runAutoCloseTask()
      expect(
        closed,
        'the candidate query selected the overdue ticket on the threshold arithmetic alone',
      ).toContain(TICKETS.autoDue.id)

      const after = findCc(TICKETS.autoDue.id)
      expect(after.statusId, 'and the task closed it').toBe('CLOSED')
      expect(after.closedAt, 'stamping closed_at, which is what makes it a real closure').not.toBeNull()
      expect(
        after.assignedTo,
        'nobody was assigned and nobody acted — this is the whole point of the control §5 flags',
      ).toBeNull()

      // Attribution. The task writes no audit row itself any more (G-03); the
      // row comes from customer_complaints_audit_trigger →
      // graphile_worker → audit_event, so this is a barrier not a read.
      await expect
        .poll(() => auditRowsSince(TICKETS.autoDue.id, since).map((r) => r.action), {
          timeout: 45_000,
          intervals: [1000],
        })
        .toContain('CLOSE')

      const close = auditRowsSince(TICKETS.autoDue.id, since).find((r) => r.action === 'CLOSE')
      expect(
        close.performedBy,
        'SYSTEM, not a person: a cron connection sets no app.current_user_id, so performed_by lands NULL — the truthful actor for "a timer expired"',
      ).toBe('NULL')
      expect(
        close.payload,
        'and the diff records the RESOLVED -> CLOSED move the hand-written row never carried',
      ).toContain('CLOSED')

      // No real user id anywhere on the row.
      for (const user of [USERS.supportAgent, USERS.owner]) {
        expect(
          close.payload.includes(user.id) || close.performedBy === user.id,
          `the auto-close is not attributed to ${user.name}`,
        ).toBe(false)
      }
    })

    test('a resolved complaint NOT past the threshold is left alone', () => {
      arrangeAutoControls()
      setAutoCloseDays(THRESHOLD_DAYS)
      const before = findCc(TICKETS.autoNotDue.id)
      expect(before.statusId, 'arranged RESOLVED, one hour ago').toBe('RESOLVED')

      const closed = runAutoCloseTask()
      expect(
        closed,
        `the candidate query excluded it — resolved_at is inside the ${THRESHOLD_DAYS}-day window`,
      ).not.toContain(TICKETS.autoNotDue.id)

      const after = findCc(TICKETS.autoNotDue.id)
      expect(after.statusId, 'it is still RESOLVED').toBe('RESOLVED')
      expect(after.closedAt, 'and was never stamped closed').toBeNull()
    })

    test('an already-closed complaint is not touched, and an escalated (ON_HOLD) one is out of scope entirely', () => {
      arrangeAutoControls()
      setAutoCloseDays(THRESHOLD_DAYS)
      const closedBefore = findCc(TICKETS.autoClosed.id)
      const heldBefore = findCc(TICKETS.autoHeld.id)

      const closed = runAutoCloseTask()

      expect(
        closed,
        'a CLOSED ticket is not a candidate — the WHERE clause is status_id = RESOLVED, so a closed one cannot be re-closed and re-audited every hour forever',
      ).not.toContain(TICKETS.autoClosed.id)
      expect(
        findCc(TICKETS.autoClosed.id).closedAt,
        'its original closed_at is untouched, so the closure date on the record is the real one',
      ).toBe(closedBefore.closedAt)

      expect(
        closed,
        'an ON_HOLD ticket — escalated to an internal team or third party — is not a candidate either, however old, because the timer only ever runs from RESOLVED',
      ).not.toContain(TICKETS.autoHeld.id)
      expect(findCc(TICKETS.autoHeld.id).statusId, 'it is still ON_HOLD').toBe(heldBefore.statusId)
    })

    test('a tenant with no autoCloseDays setting is skipped entirely — the timer is opt-in', () => {
      // The clearest statement of the control's blast radius: absent the
      // setting, the worker closes nothing, so a company that never opted in
      // cannot have records closed under it by a timer.
      // The test immediately above legitimately CLOSED this row, and a closed
      // customer complaint may only go to OPEN — so it is re-created at
      // RESOLVED rather than transitioned back. See arrangeAutoDue.
      arrangeAutoDue('30 days')
      setAutoCloseDays(null)
      expect(autoCloseDays(), 'the setting is gone').toBeNull()

      const closed = runAutoCloseTask()
      expect(
        closed,
        'with no autoCloseDays the candidate query yields nothing for this tenant (the `IS NOT NULL` arm)',
      ).not.toContain(TICKETS.autoDue.id)
      expect(findCc(TICKETS.autoDue.id).statusId, 'the ticket stays RESOLVED').toBe('RESOLVED')

      setAutoCloseDays(THRESHOLD_DAYS)
    })

    test('the threshold is read per-tenant and honoured as written', () => {
      // Same row, same resolved_at, two settings: the only variable is the
      // number in `companies.settings`. That is what makes this a test of the
      // THRESHOLD rather than of "old tickets close".
      arrangeAutoDue('10 days')

      setAutoCloseDays(30)
      expect(
        runAutoCloseTask(),
        'a 10-day-old resolution is inside a 30-day threshold',
      ).not.toContain(TICKETS.autoDue.id)
      expect(findCc(TICKETS.autoDue.id).statusId).toBe('RESOLVED')

      setAutoCloseDays(3)
      expect(runAutoCloseTask(), 'and outside a 3-day one').toContain(TICKETS.autoDue.id)
      expect(findCc(TICKETS.autoDue.id).statusId).toBe('CLOSED')
    })
  })
})
