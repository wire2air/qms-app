// CMP-J10 — Customer Complaint assignment + the permission split that keeps
// the two complaint modules apart. OQ protocol VAL-OQ-17, TC-17-03
// (Acceptance and assignment) and TC-17-04 (Working the complaint).
//
// WHY THIS FILE EXISTS. J3 walks the happy path of ONE persona
// (`supportAgent`) through create → accept → assign → close, and J4 probes the
// INTERNAL `complaints` module's own/site/tenant scope tiers. Neither asks the
// question an auditor executing OQ-17 actually asks: *does holding the wrong
// module's grant get you in?* `complaints` (internal Quality Complaints) and
// `complaint_management` (customer support tickets, table `customer_complaints`)
// are two SEPARATE authz modules that share the "Quality Records" section of
// the role editor and are granted independently (e2e-seed.sql §45). They are
// one careless `module_id` edit apart from collapsing into each other, and
// nothing in the suite would have noticed. This file is that tripwire, run in
// BOTH directions: `complaintOwner` (internal grants only, including
// `complaints:close`) must be refused on every customer route, and
// `supportAgent` (customer grants only) must be refused on every internal one.
//
// THERE IS NO NAMED-OWNER GATE ON THIS MODULE, AND THAT IS THE DOCUMENTED
// REALITY — not an oversight this file should paper over. `customer_complaints`
// carries NO `owner_id` column: it was dropped by
// 20260714002100-decouple-support-complaints.js and never re-added (verified
// against backend/shared/models/customercomplaint.js and the create migration
// 20260918021550 — `assigned_to` is the ONLY assignment column). The
// controllers that do call `assertCanActOnRecord({ ownerField: 'ownerId' })`
// therefore always hand it `undefined` → `ownerForScope = null` → the own-tier
// branch of `authz.scope_allowed` can never match, so the grant must be held at
// TENANT scope and ANY tenant-scope holder may act on ANY ticket. So this file
// asserts "a second permission-holder who is not the assignee can act", NOT a
// per-user ownership check. Writing the ownership test would be writing a test
// for behaviour the schema cannot produce.
//
// CLOSE IS GATED ON `:update` ALONE, BY DESIGN-AS-SHIPPED. The close route
// mounts enforcePermission('complaint_management','update') (always on) PLUS
// requirePermission('complaint_management','close'), and `requirePermission`
// returns `next()` unconditionally unless AUTHZ_VERBS_ENABLED === 'true'
// (utils/permissionService.js:80-90); the flag is absent from qms/.env and
// ships `false` in .env.example. OQ-17 §3's permission note records exactly
// this ("update permission alone is sufficient to close a ticket: a separate
// close capability exists in the permission catalogue but is not enforced by
// default"). `supportAgent` holds create/read/update and NOT `close`, which is
// what makes the close assertion below meaningful: it proves the dormancy,
// rather than asserting a gate that would fail the moment someone flips the
// flag. Same dormancy applies to `:assign` and `:reopen`.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql, sqlAsAppUser, sqlValue } from '../fixtures/db.js'
import {
  createPersonaPool,
  findCustomerComplaintBySubject,
  purgeCustomerComplaintBySubject,
  purgeMintedCustomerComplaints,
  restPost,
} from '../fixtures/complaints.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

// One ticket per concern. TC-17-03's ticket is walked accept → reassign →
// acted-on-by-a-second-holder; TC-17-04's is kept separate so a public reply's
// automatic WAITING_CUSTOMER flip cannot perturb the assignment assertions.
const SUBJECT_ASSIGN = 'E2E J10 CC Assignment'
const SUBJECT_WORK = 'E2E J10 CC Working'
const SUBJECT_DENIED = 'E2E J10 CC Should Never Exist'

// ── Local helpers ────────────────────────────────────────────────────────────
// Deliberately NOT added to fixtures/complaints.js: that file is being extended
// concurrently, and every helper here is specific to this file's two questions
// (attribution rows, and cross-module refusals).

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`

/** Smallest thing the upload pipeline accepts — `application/pdf` is on
 *  uploadService.js's ALLOWED_FILE_TYPES list, `text/plain` is not. */
const PDF = Buffer.from('%PDF-1.4\n% E2E CMP-J10 complaint evidence\n')

/** Conversation messages on one ticket, oldest first, with their attribution. */
function messagesFor(complaintId) {
  const out = sql(
    `SELECT kind, direction, sender_user_id, body
       FROM customer_complaint_messages
      WHERE complaint_id = ${quote(complaintId)}
      ORDER BY created_at, id`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [kind, direction, senderUserId, body] = line.split('|')
    return { kind, direction, senderUserId: senderUserId || null, body }
  })
}

/** Audit-trail rows for one ticket. `entity_type` is the SINGULAR model name
 *  here ('CustomerComplaint') — the controller writes it literally, unlike the
 *  pluralised names the generic audit registry emits elsewhere. */
function auditRowsFor(complaintId) {
  const out = sql(
    `SELECT action, performed_by
       FROM audit_logs
      WHERE entity_type = 'CustomerComplaint' AND entity_id = ${quote(complaintId)}
      ORDER BY performed_at, id`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [action, performedBy] = line.split('|')
    return { action, performedBy: performedBy || null }
  })
}

/** How many customer_complaints rows this persona can SELECT under RLS.
 *  `customer_complaints` is generator-bound (authz.apply_module_rls) with
 *  tenant + assigned-to reach only — see database/rls.sql's
 *  "customer_complaints → NATIVE (authz-only, scope-enforced)" block. */
function ccVisibleTo(userId, complaintId) {
  const out = sqlAsAppUser(
    `SELECT count(*) FROM customer_complaints WHERE id = ${quote(complaintId)};`,
    { userId, companyId: COMPANY_ID },
  ).output
  return Number(out.trim().split('\n').pop().trim())
}

/** Purge any conversation/attachment children before the ticket itself — the
 *  shared purge helpers only touch `customer_complaints`, and this file is the
 *  first to write messages. */
function purgeTicket(subject) {
  sql(
    `DELETE FROM customer_complaint_messages WHERE complaint_id IN (SELECT id FROM customer_complaints WHERE subject = ${quote(subject)})`,
  )
  sql(
    `DELETE FROM customer_complaint_attachments WHERE complaint_id IN (SELECT id FROM customer_complaints WHERE subject = ${quote(subject)})`,
  )
  purgeCustomerComplaintBySubject(subject)
}

test.describe('CMP-J10 · Customer Complaint assignment + cross-module permission split', () => {
  test.beforeAll(() => {
    purgeMintedCustomerComplaints()
    for (const s of [SUBJECT_ASSIGN, SUBJECT_WORK, SUBJECT_DENIED]) purgeTicket(s)
  })
  test.afterAll(() => {
    for (const s of [SUBJECT_ASSIGN, SUBJECT_WORK, SUBJECT_DENIED]) purgeTicket(s)
  })

  // ── TC-17-03 — Acceptance and assignment ───────────────────────────────────

  test('TC-17-03 step 1+2: accept moves the ticket off NEW, sets the assignee, and is attributed to the accepter', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.supportAgent)

    const created = await restPost(page, '/customerComplaints', {
      subject: SUBJECT_ASSIGN,
      description: 'Seeded by CMP-J10 for the assignment journey.',
      customerName: 'Erin E2E Customer',
      customerEmail: 'erin.customer.j10@e2e.test',
    })
    expect(created.status(), `create failed: ${await created.text()}`).toBe(201)

    const row = findCustomerComplaintBySubject(SUBJECT_ASSIGN)
    expect(row, 'the ticket landed in customer_complaints').not.toBeNull()
    expect(row.assignedTo, 'a freshly created ticket carries no assignee yet').toBeNull()

    const res = await restPost(page, `/customerComplaints/${row.id}/accept`, {})
    expect(res.status(), `accept failed: ${await res.text()}`).toBe(200)

    const after = findCustomerComplaintBySubject(SUBJECT_ASSIGN)
    // OQ-17 TC-17-03's note is explicit that Accept lands on IN_PROGRESS, NOT
    // on "Assigned" — ASSIGNED is what step 3 (assigning to a second user)
    // produces, and only from NEW/OPEN. Assert the exact status rather than a
    // set, so a controller change that started routing Accept through the
    // assign path would surface here instead of passing quietly.
    expect(after.statusId, 'accept lands the ticket on IN_PROGRESS per TC-17-03').toBe(
      'IN_PROGRESS',
    )
    expect(after.assignedTo, 'the accepting agent became the assignee').toBe(USERS.supportAgent.id)

    // Step 2 — attribution with a timestamp. `updated_by` carries the actor on
    // the row, and the audit trail carries the act itself.
    expect(
      sqlValue(`SELECT updated_by FROM customer_complaints WHERE id = '${after.id}'`),
      'the row records WHO last wrote it',
    ).toBe(USERS.supportAgent.id)
    expect(
      sqlValue(
        `SELECT count(*) FROM audit_logs WHERE entity_type = 'CustomerComplaint' AND entity_id = '${after.id}' AND performed_by = '${USERS.supportAgent.id}' AND performed_at IS NOT NULL`,
      ),
      'the acceptance is attributed to the accepting user with a timestamp',
    ).not.toBe('0')
  })

  test('TC-17-03 step 3: reassignment to a second user moves assignedTo — no named-owner gate stands in the way', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.supportAgent)
    const row = findCustomerComplaintBySubject(SUBJECT_ASSIGN)
    expect(row, 'the accept test left the ticket behind').not.toBeNull()
    expect(row.assignedTo, 'precondition: supportAgent currently holds it').toBe(
      USERS.supportAgent.id,
    )

    // The second agent is `owner` (company owner, a valid user of this tenant).
    // The assignee needs NO complaint_management grant of their own: assignment
    // is a routing decision made by the caller, and `assignComplaint` only
    // checks the target exists in the company (BadRequestError otherwise).
    const res = await restPost(page, `/customerComplaints/${row.id}/assign`, {
      userId: USERS.owner.id,
    })
    expect(res.status(), `assign failed: ${await res.text()}`).toBe(200)

    const after = findCustomerComplaintBySubject(SUBJECT_ASSIGN)
    expect(after.assignedTo, 'the second user is now the assignee').toBe(USERS.owner.id)
    // Assign only RE-statuses a ticket sitting at NEW/OPEN; this one is already
    // IN_PROGRESS from the accept above, so the status is deliberately left
    // alone. Pinning that keeps a future "assign always sets ASSIGNED" change
    // from silently walking a worked ticket backwards.
    expect(
      after.statusId,
      'assigning an already-IN_PROGRESS ticket does not rewind its status',
    ).toBe('IN_PROGRESS')
    expect(
      auditRowsFor(after.id).some(
        (r) => r.action === 'ASSIGN' && r.performedBy === USERS.supportAgent.id,
      ),
      'the assignment is attributed to the agent who made it, not to the new assignee',
    ).toBe(true)
  })

  test('TC-17-03: NO named-owner gate — a permission holder who is NOT the assignee can still act', async ({
    browser,
  }) => {
    // THE DOCUMENTED REALITY, ASSERTED AS SUCH. `customer_complaints` has no
    // owner_id column (dropped by 20260714002100-decouple-support-complaints.js,
    // never re-added), so there is nothing for an ownership check to compare
    // against. supportAgent was just reassigned OFF this ticket by the previous
    // test — under a named-owner model that would lock them out. It does not,
    // because `complaint_management:update` at TENANT scope is the whole gate.
    const page = await pool.page(browser, AUTH.supportAgent)
    const row = findCustomerComplaintBySubject(SUBJECT_ASSIGN)
    expect(row.assignedTo, 'precondition: supportAgent is NOT the assignee').toBe(USERS.owner.id)

    const res = await restPost(page, `/customerComplaints/${row.id}/reply`, {
      body: 'CMP-J10: a non-assignee permission holder writing an internal note.',
      kind: 'INTERNAL_NOTE',
    })
    expect(
      res.status(),
      `a non-assignee holding complaint_management:update is NOT refused: ${await res.text()}`,
    ).toBe(200)

    // And the schema really does lack the column the gate would need — pinned
    // directly, so if a migration ever re-adds owner_id this test tells the
    // next reader that the comment above has expired.
    expect(
      sqlValue(
        `SELECT count(*) FROM information_schema.columns WHERE table_name = 'customer_complaints' AND column_name = 'owner_id'`,
      ),
      'customer_complaints carries no owner_id column — there is no named owner to gate on',
    ).toBe('0')

    // Reassign back so the close step below runs as the accepting agent, and so
    // a re-run of this file starts from the same shape.
    const back = await restPost(page, `/customerComplaints/${row.id}/assign`, {
      userId: USERS.supportAgent.id,
    })
    expect(back.status()).toBe(200)
  })

  test('TC-17-03 steps 5+6: the NO-ACCESS account is refused every action and offered no entry point', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.noAccess)
    const row = findCustomerComplaintBySubject(SUBJECT_ASSIGN)

    // Step 6 — no navigation entry. permissionGuard.js gates the
    // /customer-complaints route on complaint_management:read.
    await page.goto('/customer-complaints')
    await expect(page, 'a zero-grant persona is bounced off the module').toHaveURL(/\/no-access/, {
      timeout: 15_000,
    })

    // Step 5 — "refused by direct URL; no complaint detail is disclosed". The
    // ROUTER does not bounce the detail URL: permissionGuard's
    // RECORD_LIST_PERMISSIONS deliberately gates the bare list route only, and
    // `permissionFor` returns null for `/customer-complaints/:id` so that
    // assignees and shared users keep row-level access without the module
    // grant. What withholds the ticket is RLS — the same shape as
    // audits/auditee detail and as J4's Secondary-Site probe. So the assertion
    // that matters for this OQ step is DISCLOSURE, checked two ways: the
    // ticket's own identifiers never render, and the row is invisible under
    // RLS (below).
    await page.goto(`/customer-complaints/${row.id}`)
    await expect(
      page.getByText(row.complaintNumber, { exact: false }),
      'no complaint detail is disclosed to a zero-grant account',
    ).toHaveCount(0, { timeout: 15_000 })
    await expect(page.getByText(SUBJECT_ASSIGN, { exact: false })).toHaveCount(0)

    // …and the part a hidden UI control proves nothing about: every verb
    // refused at the API. Not just create — a module that gated create and
    // forgot update would sail through a create-only probe.
    const probes = [
      ['create', await restPost(page, '/customerComplaints', { subject: SUBJECT_DENIED })],
      ['accept', await restPost(page, `/customerComplaints/${row.id}/accept`, {})],
      [
        'assign',
        await restPost(page, `/customerComplaints/${row.id}/assign`, { userId: USERS.owner.id }),
      ],
      [
        'update (reply)',
        await restPost(page, `/customerComplaints/${row.id}/reply`, {
          body: 'CMP-J10 denial probe',
          kind: 'INTERNAL_NOTE',
        }),
      ],
      ['close', await restPost(page, `/customerComplaints/${row.id}/close`, {})],
      ['hold', await restPost(page, `/customerComplaints/${row.id}/hold`, {})],
    ]
    for (const [label, res] of probes) {
      expect(res.status(), `noAccess must be refused ${label}: ${await res.text()}`).toBe(403)
    }

    // Read, at the layer the UI actually reads through. The REST surface has no
    // per-ticket GET, so the read refusal lives in RLS — and this is the probe
    // that proves the row exists and is still withheld, rather than the query
    // matching nothing.
    expect(
      ccVisibleTo(USERS.noAccess.id, row.id),
      'no complaint_management grant — the ticket is invisible under RLS',
    ).toBe(0)
    expect(
      ccVisibleTo(USERS.supportAgent.id, row.id),
      'and the paired positive: a tenant-scope grant DOES see the same row, so the 0 above is the gate and not an empty table',
    ).toBe(1)

    // Nothing leaked through as a side effect of the refusals.
    expect(
      sqlValue(`SELECT count(*) FROM customer_complaints WHERE subject = '${SUBJECT_DENIED}'`),
      'the refused create wrote nothing',
    ).toBe('0')
  })

  // ── The permission split: complaint_management:* vs complaints:* ───────────
  // The regression the two-module split exists to catch. J4 covers the
  // zero-grant half on both modules; these two cover the far more likely
  // failure — a user who holds the WRONG module's grants at full strength.

  test('SPLIT: complaintOwner (INTERNAL complaints:* only, close included) is refused on every CUSTOMER route', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.complaintOwner)
    const row = findCustomerComplaintBySubject(SUBJECT_ASSIGN)

    // complaintOwner holds complaints:create/read/update/close/delete at TENANT
    // scope (e2e-seed.sql §45) and NOTHING on complaint_management — the seed's
    // trailing DELETE guarantees "exactly these grants and no more". They are
    // the strongest possible internal-complaints persona, which is precisely
    // why their refusal here is the assertion worth having: `complaints:close`
    // must not answer `complaint_management:close`.
    const probes = [
      ['create', await restPost(page, '/customerComplaints', { subject: SUBJECT_DENIED })],
      ['accept', await restPost(page, `/customerComplaints/${row.id}/accept`, {})],
      [
        'assign',
        await restPost(page, `/customerComplaints/${row.id}/assign`, { userId: USERS.owner.id }),
      ],
      [
        'reply',
        await restPost(page, `/customerComplaints/${row.id}/reply`, {
          body: 'CMP-J10 cross-module probe',
          kind: 'INTERNAL_NOTE',
        }),
      ],
      ['close', await restPost(page, `/customerComplaints/${row.id}/close`, {})],
    ]
    for (const [label, res] of probes) {
      expect(
        res.status(),
        `an internal-complaints grant must not reach customer ${label}: ${await res.text()}`,
      ).toBe(403)
    }

    expect(
      ccVisibleTo(USERS.complaintOwner.id, row.id),
      'and the customer ticket is invisible to them under RLS too — the split holds at the database, not only at the route',
    ).toBe(0)

    expect(
      sqlValue(`SELECT count(*) FROM customer_complaints WHERE subject = '${SUBJECT_DENIED}'`),
      'nothing was created by the refused cross-module create',
    ).toBe('0')
  })

  test('SPLIT (reverse): supportAgent (CUSTOMER complaint_management:* only) is refused on every INTERNAL route', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.supportAgent)

    // The mirror image, and the half a one-directional test would miss: a
    // `complaint_management` grant must not open the internal Quality Complaint
    // record either. `/complaints` is the QA lens over the INTERNAL table
    // despite the stale in-code comment on QaComplaintsIndex claiming otherwise
    // (see fixtures/complaints.js's header).
    const create = await restPost(page, '/complaints', {
      subject: 'CMP-J10 should never be created (internal)',
      description: 'x',
    })
    expect(
      create.status(),
      `a customer-support grant must not reach internal complaints:create: ${await create.text()}`,
    ).toBe(403)

    await page.goto('/complaints')
    await expect(
      page,
      'permissionGuard gates /complaints on complaints:read, which supportAgent does not hold',
    ).toHaveURL(/\/no-access/, { timeout: 15_000 })

    expect(
      sqlValue(
        `SELECT count(*) FROM complaints WHERE subject = 'CMP-J10 should never be created (internal)'`,
      ),
      'nothing landed in the internal complaints table',
    ).toBe('0')
  })

  // ── TC-17-04 — Working the complaint ──────────────────────────────────────

  test('TC-17-04 steps 1+2+5: a public reply persists, is attributed to the actor, and sets Waiting on Customer', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.supportAgent)

    // TC-17-04's preamble: a public reply REQUIRES a customer email on the
    // complaint, so this journey's ticket carries one from the start. Own
    // ticket rather than reusing SUBJECT_ASSIGN, because the WAITING_CUSTOMER
    // flip below would otherwise churn that file's assignment assertions.
    const created = await restPost(page, '/customerComplaints', {
      subject: SUBJECT_WORK,
      description: 'Seeded by CMP-J10 for the working-the-complaint journey.',
      customerName: 'Erin E2E Customer',
      customerEmail: 'erin.customer.j10work@e2e.test',
    })
    expect(created.status(), `create failed: ${await created.text()}`).toBe(201)
    const row = findCustomerComplaintBySubject(SUBJECT_WORK)

    const accepted = await restPost(page, `/customerComplaints/${row.id}/accept`, {})
    expect(accepted.status()).toBe(200)

    const replyBody = 'CMP-J10: thank you for reporting this, we are investigating.'
    const res = await restPost(page, `/customerComplaints/${row.id}/reply`, {
      body: replyBody,
      kind: 'PUBLIC_REPLY',
    })
    expect(res.status(), `public reply failed: ${await res.text()}`).toBe(200)

    const msgs = messagesFor(row.id)
    const publicReply = msgs.find((m) => m.kind === 'PUBLIC_REPLY' && m.body === replyBody)
    expect(publicReply, 'the reply persisted as a PUBLIC_REPLY message').toBeTruthy()
    expect(publicReply.direction, 'agent replies are OUTBOUND').toBe('OUTBOUND')
    // Step 5 — attributed to the person who performed it, on the message row
    // itself and not merely on the parent complaint.
    expect(publicReply.senderUserId, 'the reply is attributed to the replying agent').toBe(
      USERS.supportAgent.id,
    )

    // Step 2 — the status move is AUTOMATIC, set by the public reply. TC-17-04's
    // note is emphatic that this is not something the tester sets by hand.
    const after = findCustomerComplaintBySubject(SUBJECT_WORK)
    expect(after.statusId, 'a public reply sets Waiting on Customer by itself').toBe(
      'WAITING_CUSTOMER',
    )
    expect(
      sqlValue(
        `SELECT first_response_at IS NOT NULL FROM customer_complaints WHERE id = '${row.id}'`,
      ),
      'the first agent reply stamps first_response_at (response-time analytics / SLA)',
    ).toBe('t')
  })

  test('TC-17-04 step 5: internal and QA notes persist, are attributed, and never move the status', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.supportAgent)
    const row = findCustomerComplaintBySubject(SUBJECT_WORK)
    const before = row.statusId

    for (const kind of ['INTERNAL_NOTE', 'QA_NOTE']) {
      const res = await restPost(page, `/customerComplaints/${row.id}/reply`, {
        body: `CMP-J10 ${kind} body`,
        kind,
      })
      expect(res.status(), `${kind} failed: ${await res.text()}`).toBe(200)
    }

    const msgs = messagesFor(row.id)
    for (const kind of ['INTERNAL_NOTE', 'QA_NOTE']) {
      const note = msgs.find((m) => m.kind === kind && m.body === `CMP-J10 ${kind} body`)
      expect(note, `the ${kind} persisted`).toBeTruthy()
      expect(note.senderUserId, `the ${kind} is attributed to its author`).toBe(
        USERS.supportAgent.id,
      )
    }

    // TC-17-04's note: "Internal notes and QA notes never change the status."
    // Asserting the negative is the whole point — a note that silently flipped
    // the ticket back to IN_PROGRESS would corrupt the awaiting-customer signal.
    expect(
      findCustomerComplaintBySubject(SUBJECT_WORK).statusId,
      'notes are agent-only and leave the status exactly where it was',
    ).toBe(before)
  })

  test('TC-17-04 step 4: an attachment persists against the ticket and is attributed to the uploader', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.supportAgent)
    const row = findCustomerComplaintBySubject(SUBJECT_WORK)

    // multipart, because the route mounts uploadMiddleware — page.request's
    // `multipart` option speaks as the persona the context was opened for the
    // same way restPost does. PDF, not text/plain: `text/plain` is NOT in
    // uploadService.js's ALLOWED_FILE_TYPES and would come back a 400 that
    // reads like an authorization failure. Same minimal-PDF idiom as
    // suppliers/j5.
    const res = await page.request.post(
      `/api/v1/services/customerComplaints/${row.id}/attachments`,
      {
        multipart: {
          file: {
            name: 'cmp-j10-evidence.pdf',
            mimeType: 'application/pdf',
            buffer: PDF,
          },
        },
      },
    )
    expect(res.status(), `attachment upload failed: ${await res.text()}`).toBe(201)

    expect(
      sqlValue(
        `SELECT count(*) FROM customer_complaint_attachments WHERE complaint_id = '${row.id}'`,
      ),
      'the attachment is linked to this ticket',
    ).not.toBe('0')

    // ATTRIBUTION LIVES ON THE ASSET, NOT THE JOIN ROW.
    // `customer_complaint_attachments` carries only (complaint_id, message_id,
    // asset_id, company_id) — there is no uploaded_by column on it. The
    // uploader is recorded once, on the `assets` row the controller creates via
    // saveAssetToDatabase({ uploadedBy: user.id }). Asserting through the join
    // is the only way to make this step's "attributed to the actor" claim true.
    expect(
      sqlValue(
        `SELECT count(*) FROM customer_complaint_attachments cca
           JOIN assets a ON a.id = cca.asset_id
          WHERE cca.complaint_id = '${row.id}' AND a.uploaded_by = '${USERS.supportAgent.id}'`,
      ),
      'and the asset behind it is attributed to the uploading agent',
    ).not.toBe('0')
  })

  test('TC-17-04 step 4 + OQ §3 note: `:update` ALONE closes the ticket — the close capability is dormant', async ({
    browser,
  }) => {
    // THE ASSERTION OQ-17 §3 ASKS FOR, AND THE ONE IT WARNS AGAINST.
    // supportAgent holds complaint_management:create/read/update and NOT
    // `close` (e2e-seed.sql §45's trailing DELETE makes that exact, so this
    // cannot drift). The route mounts requirePermission(...,'close') on top of
    // enforcePermission(...,'update'), but requirePermission short-circuits to
    // next() unless AUTHZ_VERBS_ENABLED === 'true' — which is unset in qms/.env
    // and false in .env.example. So a 200 here is the TRUE current behaviour,
    // and the protocol's instruction "do not rely on withholding [close] to
    // prevent closure" is what this test pins. DO NOT rewrite this as a 403
    // expectation: that gate is dormant, and asserting it would be asserting a
    // configuration this product does not ship.
    const page = await pool.page(browser, AUTH.supportAgent)
    const row = findCustomerComplaintBySubject(SUBJECT_ASSIGN)

    expect(
      sqlValue(
        `SELECT count(*) FROM authz.role_module_permissions rmp
           JOIN roles_on_users rou ON rou.role_id = rmp.role_id
          WHERE rou.user_id = '${USERS.supportAgent.id}'
            AND rmp.module_id = 'complaint_management'
            AND rmp.action_id = 'close'`,
      ),
      'precondition: supportAgent holds NO complaint_management:close grant — otherwise the close below proves nothing',
    ).toBe('0')

    const res = await restPost(page, `/customerComplaints/${row.id}/close`, {
      comment: 'CMP-J10 resolution: replacement shipped, customer satisfied.',
    })
    expect(
      res.status(),
      `update alone must be sufficient to close (AUTHZ_VERBS_ENABLED off): ${await res.text()}`,
    ).toBe(200)

    const after = findCustomerComplaintBySubject(SUBJECT_ASSIGN)
    // requireClosureApproval is off unless configured, so Close writes straight
    // to CLOSED rather than PENDING_APPROVAL (OQ-17 TC-17-05's 5a/5b split).
    expect(after.statusId, 'with closure approval off, Close writes straight to CLOSED').toBe(
      'CLOSED',
    )
    expect(
      sqlValue(`SELECT closed_at IS NOT NULL FROM customer_complaints WHERE id = '${after.id}'`),
      'closure is timestamped',
    ).toBe('t')
    expect(
      auditRowsFor(after.id).some(
        (r) => r.action === 'CLOSE' && r.performedBy === USERS.supportAgent.id,
      ),
      'and the closure is attributed to the closing agent in the audit trail',
    ).toBe(true)
  })

  test('KNOWN DEFECT (CC-M1): the QA-review step routes carry NO route-level permission', async ({
    browser,
  }) => {
    // KNOWN DEFECT (CC-M1): eight authenticated customerComplaints routes mount
    // only requireAuthByApiKey + requireCompanyAccess, with no
    // enforcePermission at the route layer — submitForReview, markComplete,
    // approveClosure, reassignStepReviewer, sendBackStepTask, rejectStepTask,
    // cancelStep and reopenStep (routes/customerComplaints.js lines 1502-2046).
    // They are listed in backend/api/tests/routeAuthzAllowlist.js, so
    // routePermissions.test.js stays green and its snapshot never shows them.
    //
    // PARTIALLY REMEDIATED, NOT CLOSED. Three of the eight now assert in the
    // CONTROLLER via assertCanActOnRecord (submitForReview → 'update',
    // markComplete → 'close', approveClosure → 'approve'). The remaining five
    // step actions carry no catalogue verb at all by deliberate engine design
    // ("owner/assignee", per the allowlist reason) — but see the file header:
    // customer_complaints has NO owner_id column, so the engine's owner half of
    // that check has nothing to read on this table.
    //
    // ASSERT WHAT IS TRUE TODAY. A zero-grant caller must still be refused
    // SOMETHING on the controller-gated routes, and this test pins the shape of
    // the refusal rather than claiming a route-layer 403 that does not exist.
    // If a later pass mounts enforcePermission on these routes, this test keeps
    // passing and the comment above becomes the thing to delete.
    const page = await pool.page(browser, AUTH.noAccess)
    const row = findCustomerComplaintBySubject(SUBJECT_WORK)

    const submit = await restPost(page, `/customerComplaints/${row.id}/submitForReview`, {})
    expect(
      submit.status(),
      `submitForReview is controller-gated (PERM-R2), so a zero-grant caller is still refused: ${await submit.text()}`,
    ).toBe(403)

    const complete = await restPost(page, `/customerComplaints/${row.id}/markComplete`, {})
    expect(
      complete.status(),
      `markComplete is controller-gated on complaint_management:close: ${await complete.text()}`,
    ).toBe(403)

    // The five engine-enforced step actions are NOT asserted as 403 here: they
    // carry no module permission by design, and their refusal (when it comes)
    // is a step-identity check that needs a live workflow instance to exercise.
    // Documented rather than tested, so this file does not encode a gate that
    // is not there.

    expect(
      findCustomerComplaintBySubject(SUBJECT_WORK).statusId,
      'and the refused calls left the ticket untouched',
    ).toBe('WAITING_CUSTOMER')
  })
})
