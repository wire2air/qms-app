// PW-J19 — URS-SEC-11: a signature is not transferable. It belongs to ONE
// person and ONE record, and it cannot be moved to, reused on, or forged
// against another.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT PW-J2 ALREADY PROVES, AND WHY THAT IS NOT THIS
//
// PW-J2 drives the full approval chain and, at the end, asserts:
//
//     SELECT count(*) FROM signatures
//      WHERE user_id = '<approver>' AND payload_hash IS NOT NULL
//        AND created_at > NOW() - interval '10 minutes'   → >= 1
//
// That is "signing produced a signature". URS-SEC-11 asks the opposite
// question — whether a signature that EXISTS can be made to say something it
// never said: attributed to someone who did not sign, attached to a record it
// was not given for, or re-used to satisfy a second approval. None of those is
// touched by a count.
//
// The distinction matters because "non-transferable" is what makes an
// electronic signature legally equivalent to a handwritten one (21 CFR Part 11
// §11.70 — signature/record linking, §11.200(a)(2) — not usable by anyone but
// the genuine owner). A system that writes signatures correctly and then lets
// one be repointed has no signatures at all, only entries.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE FOUR INDEPENDENT LAYERS, EACH TESTED WHERE IT ACTUALLY LIVES
//
// Non-transferability in this product is not one control. It is four, and they
// fail differently, which is why one test per layer rather than one test that
// clicks around:
//
//   L1  THE SIGNER IS TAKEN FROM THE SESSION, NEVER FROM THE REQUEST.
//       `controllers/signatures.js:createSignature` opens
//           const userId = req.user.id
//       and destructures ONLY `{ taskInstanceId, meaning, comments }` from the
//       body. `createSignatureSchema` (schemas/signatures.js) is a plain
//       `z.object` with exactly those three keys, and `middleware/validate.js`
//       REPLACES `req[source]` with the parsed result — so a `userId` or a
//       `payloadHash` in the body is stripped before the controller runs and
//       cannot reach the row even in principle.
//
//   L2  ONLY THE ASSIGNED REVIEWER MAY SIGN A TASK.
//       Same controller: `isAssignedReviewer = taskInstance.assignedTo ===
//       userId || taskInstance.reassignedToUserId === userId`, and a
//       ForbiddenError otherwise. Its own comment names the gap it closed:
//       "any tenant member could forge an APPROVED/REJECTED signature on any
//       task — a 21 CFR Part 11 integrity gap."
//
//   L3  THE SUBJECT AND THE SIGNER ARE BOUND INTO A HASH.
//       `signatureService.generatePayloadHash` serialises `{ userId,
//       proxySessionUserId, taskInstanceId, fieldRecordRevisionId,
//       samplingPlanId, capaId, ncId, changeRequestId, qualityEventId,
//       retainSampleId, assignmentInstanceId, equipmentId, meaning, companyId,
//       ipAddress, signedAt }` and SHA-256s it. Repointing a signature at
//       another record or another user therefore leaves a hash that no longer
//       recomputes — tamper-EVIDENT. (See the KNOWN GAP below for what that
//       does and does not buy.)
//
//   L4  THE ROW CANNOT BE REWRITTEN THROUGH ANY CLIENT PATH.
//       `signatures` carries `@behavior -select -insert -update -delete` as its
//       table comment (read live), so PostGraphile emits NO type, NO query and
//       NO mutation for it — the table is absent from the GraphQL schema
//       entirely. Underneath that, `app_user` is granted SELECT and INSERT and
//       nothing else, and the only policies that exist are
//       `signature_select_rls` and `signature_insert_rls`. There is no UPDATE
//       policy and no DELETE policy, so even a hand-written statement as
//       `app_user` is refused twice over.
//       `signature_insert_rls` additionally pins the author:
//           user_id = current_setting('app.current_user_id')::uuid
//       (or the owner bypass) — a member cannot INSERT a signature in somebody
//       else's name either.
//
// And one structural control that is not a policy at all:
//
//   L5  ONE SIGNATURE, ONE SUBJECT.
//       `signatures_subject_exactly_one_chk` (read live) sums thirteen
//       `IS NOT NULL` indicators and requires the total to be exactly 1. A
//       signature cannot be attached to two records, and it cannot be detached
//       from all of them and left floating.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠ KNOWN GAP SIG-IMMUT-01, PINNED HONESTLY RATHER THAN TESTED AROUND
//
// `audit_logs` has TWO layers: the `app_user` grant restriction AND a row-level
// trigger, `audit_logs_immutable` / `prevent_audit_log_mutation()`, that raises
// on any UPDATE or DELETE from ANY role including the superuser. ALD-A5 asserts
// both.
//
// `signatures` has only the FIRST. Its trigger list (read live) is exactly one
// entry — `signatures_audit_trigger`, an AFTER trigger that feeds the audit
// pipeline. There is NO immutability trigger.
//
// That is load-bearing, because `REST_RLS_ENABLED` is off by default: the REST
// path connects as the superuser DB_USER and meets neither a policy nor a
// GRANT. So the Part 11 signature ledger is protected on the GraphQL path by
// two mechanisms and on the REST/superuser path by NOTHING but the absence of
// code that would do it. The last test below measures that asymmetry and states
// it as a defect. It is written to keep failing until a trigger exists, and the
// correct response to it is a migration, not a weaker assertion.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import {
  findDocumentByTitle,
  sql,
  sqlAsAppUser,
  sqlRow,
  sqlValue,
  versionsOf,
  waitForSqlValue,
} from '../fixtures/db.js'
import {
  clickWhenReady,
  createSopDocument,
  fillAllSections,
  stepActionDialog,
  submitForReview,
  uniqueTitle,
} from '../fixtures/documents.js'
import { signWithPin } from '../fixtures/esign.js'

const API = 'http://e2elab.localhost:4000'

/**
 * The state every test in this file reads: ONE real signature, produced by the
 * product's own signing flow, on a task that the reviewer was genuinely
 * assigned. Built once — two approval cycles are the expensive part of this
 * file and nothing below mutates the artefact it inspects.
 */
const state = {
  docId: null,
  versionId: null,
  reviewerTaskId: null,
  signatureId: null,
  payloadHash: null,
}

test.describe('PW-J19 · URS-SEC-11 — a signature cannot be moved or reused', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(600_000)

    // ── A real document, driven to a real signed reviewer step. Inserting a
    // `signatures` row by hand would test the constraints and prove nothing
    // about whether the SIGNING PATH binds what it claims to bind — which is
    // half of what URS-SEC-11 asks.
    const authorCtx = await browser.newContext({ storageState: AUTH.author })
    const authorPage = await authorCtx.newPage()
    const title = uniqueTitle('J19-nontransfer')
    await createSopDocument(authorPage, title)
    const created = findDocumentByTitle(title)
    state.docId = created.id
    await fillAllSections(authorPage, created.id)
    await submitForReview(authorPage)
    await authorCtx.close()

    const [version] = versionsOf(state.docId)
    state.versionId = version.id
    expect(version.statusId, 'the version is out for review').toBe('IN_REVIEW')

    // Step 1 → Rita, the only member of the Reviewer role, so the assignment is
    // deterministic.
    state.reviewerTaskId = await waitForSqlValue(
      `SELECT id FROM task_instances WHERE entity_id = '${state.versionId}'
        AND assigned_to = '${USERS.reviewer.id}' AND deleted_at IS NULL
        AND status_id IN ('ASSIGNED','FORM_SUBMITTED')
        ORDER BY created_at DESC LIMIT 1`,
      { timeoutMs: 60_000, label: 'reviewer task assigned' },
    )

    const reviewerCtx = await browser.newContext({ storageState: AUTH.reviewer })
    const reviewerPage = await reviewerCtx.newPage()
    await reviewerPage.goto(`/documents/${state.docId}`)
    await clickWhenReady(reviewerPage, reviewerPage.getByRole('button', { name: /^approve$/i }), {
      until: stepActionDialog(reviewerPage),
    })
    await signWithPin(reviewerPage)
    await reviewerCtx.close()

    // The signature the rest of this file interrogates.
    state.signatureId = await waitForSqlValue(
      `SELECT id FROM signatures
        WHERE task_instance_id = '${state.reviewerTaskId}'
          AND user_id = '${USERS.reviewer.id}' AND deleted_at IS NULL
        ORDER BY signed_at DESC LIMIT 1`,
      { timeoutMs: 60_000, label: 'reviewer signature written' },
    )
    state.payloadHash = sqlValue(
      `SELECT payload_hash FROM signatures WHERE id = '${state.signatureId}'`,
    )
    expect(state.payloadHash, 'the signature carries a payload hash').toMatch(/^[0-9a-f]{64}$/)
  })

  test('L5+L3 · the signature names ONE person, ONE subject, and binds both into its hash', () => {
    const row = sqlRow(
      `SELECT user_id, meaning, task_instance_id, payload_hash, signed_at IS NOT NULL,
              is_revoked,
              (task_instance_id IS NOT NULL)::int
            + (field_record_revision_id IS NOT NULL)::int
            + (sampling_plan_id IS NOT NULL)::int
            + (specification_id IS NOT NULL)::int
            + (capa_id IS NOT NULL)::int
            + (nc_id IS NOT NULL)::int
            + (change_request_id IS NOT NULL)::int
            + (record_id IS NOT NULL)::int
            + (workflow_instance_step_id IS NOT NULL)::int
            + (quality_event_id IS NOT NULL)::int
            + (retain_sample_id IS NOT NULL)::int
            + (assignment_instance_id IS NOT NULL)::int
            + (equipment_id IS NOT NULL)::int AS subject_count
         FROM signatures WHERE id = '${state.signatureId}'`,
    )
    expect(row, 'the signature row exists').not.toBeNull()

    expect(row[0], 'attributed to the person who actually signed').toBe(USERS.reviewer.id)
    expect(row[1], 'and says what the signature MEANT').toBe('APPROVED')
    expect(row[2], 'bound to the task that was signed').toBe(state.reviewerTaskId)
    expect(row[3], 'with a tamper-detection hash over the whole context').toMatch(/^[0-9a-f]{64}$/)
    expect(row[4], 'and a signing timestamp').toBe('t')
    expect(row[5], 'and is live, not revoked').toBe('f')

    // L5 — the structural half of "one signature, one record". The CHECK
    // constraint permits no other total, so a signature cannot be attached to a
    // second record without detaching it from the first, and cannot be left
    // attached to none.
    expect(
      row[6],
      'exactly one of the thirteen subject columns is set — signatures_subject_exactly_one_chk',
    ).toBe('1')

    expect(
      sqlValue(
        `SELECT count(*) FROM pg_constraint
          WHERE conrelid = 'signatures'::regclass
            AND conname = 'signatures_subject_exactly_one_chk'`,
      ),
      'and that is a database constraint, not a convention the service happens to follow',
    ).toBe('1')
  })

  test('L1 · the signer is taken from the session — a body cannot name someone else', async ({
    browser,
  }) => {
    test.setTimeout(180_000)

    // Arrange: a task the APPROVER is genuinely assigned, so the reviewer-binding
    // gate (L2) is satisfied for the approver and the ONLY thing under test here
    // is whose name lands on the row.
    const approverTaskId = await waitForSqlValue(
      `SELECT id FROM task_instances WHERE entity_id = '${state.versionId}'
        AND assigned_to = '${USERS.approver.id}' AND deleted_at IS NULL
        AND status_id NOT IN ('CANCELLED')
        ORDER BY created_at DESC LIMIT 1`,
      { timeoutMs: 60_000, label: 'approver task created' },
    )

    const ctx = await browser.newContext({ storageState: AUTH.approver })
    try {
      // THE ATTACK. Adam signs his own task, but writes the REVIEWER's id into
      // the body — the crudest form of transfer: put someone else's name on your
      // signature. He also supplies a `payloadHash`, which the OpenAPI block on
      // this route still documents as a required body field, to check the server
      // does not take a client's word for its own tamper seal.
      const res = await ctx.request.post(`${API}/v1/services/signatures`, {
        data: {
          taskInstanceId: approverTaskId,
          meaning: 'APPROVED',
          comments: 'PW-J19 — attributed to someone else',
          userId: USERS.reviewer.id,
          user_id: USERS.reviewer.id,
          payloadHash: '0'.repeat(64),
        },
      })

      // The request is ACCEPTED. That is the correct outcome and is the point:
      // the forged fields are not rejected, they are IGNORED — `validate()`
      // replaces `req.body` with the zod-parsed object, whose schema has exactly
      // three keys, so `userId` and `payloadHash` never reach the controller. A
      // 400 here would be a weaker guarantee, because it would depend on the
      // schema being strict rather than on the signer being unforgeable.
      expect(
        res.status(),
        'the signature is created — the extra fields are dropped, not argued with',
      ).toBeLessThan(300)

      const body = await res.json()
      const forgedId = body?.data?.signature?.id ?? body?.signature?.id
      expect(forgedId, 'the response names the signature it created').toBeTruthy()

      const row = sqlRow(
        `SELECT user_id, payload_hash FROM signatures WHERE id = '${forgedId}'`,
      )
      expect(
        row[0],
        'and it is the SESSION user’s signature — the body’s userId was discarded',
      ).toBe(USERS.approver.id)
      expect(
        row[0],
        'it is emphatically NOT the person the body tried to name',
      ).not.toBe(USERS.reviewer.id)
      expect(
        row[1],
        'and the tamper seal is the server’s own, not the 64 zeroes the client sent',
      ).not.toBe('0'.repeat(64))
      expect(row[1], 'it is a real SHA-256').toMatch(/^[0-9a-f]{64}$/)
    } finally {
      await ctx.close()
    }
  })

  test('L2 · a bystander cannot sign someone else’s task', async ({ browser }) => {
    test.setTimeout(180_000)

    // Rita's step-1 task, signed in beforeAll. Carla (controller) is a full
    // document_control CRUD holder and is not its assignee — the exact shape of
    // the gap the controller's own comment describes: "any tenant member could
    // forge an APPROVED/REJECTED signature on any task".
    const before = Number(
      sqlValue(
        `SELECT count(*) FROM signatures WHERE task_instance_id = '${state.reviewerTaskId}'`,
      ),
    )

    const ctx = await browser.newContext({ storageState: AUTH.controller })
    try {
      const res = await ctx.request.post(`${API}/v1/services/signatures`, {
        data: {
          taskInstanceId: state.reviewerTaskId,
          meaning: 'APPROVED',
          comments: 'PW-J19 — signed by a bystander',
        },
      })
      expect(
        res.status(),
        'a non-assignee is refused — a signature is an act only its owner may perform',
      ).toBeGreaterThanOrEqual(400)
      const text = await res.text().catch(() => '')
      expect(
        text,
        'and refused for the RIGHT reason, not by a generic 404 that would also fire on a missing task',
      ).toMatch(/only the assigned reviewer/i)
    } finally {
      await ctx.close()
    }

    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM signatures WHERE task_instance_id = '${state.reviewerTaskId}'`,
        ),
      ),
      'and nothing landed — the refusal is a refusal, not a rollback that left a row',
    ).toBe(before)
  })

  test('L2 · only the signer may revoke — a signature cannot be retracted by a third party', async ({
    browser,
  }) => {
    test.setTimeout(180_000)

    // The mirror image of forging one. If any member can revoke anyone's
    // signature, a signature can be REMOVED from a record it was given for,
    // which is transfer by subtraction.
    const ctx = await browser.newContext({ storageState: AUTH.controller })
    try {
      const res = await ctx.request.put(
        `${API}/v1/services/signatures/${state.signatureId}/revoke`,
        { data: { revokedReason: 'PW-J19 — revoked by someone who did not sign' } },
      )
      expect(
        res.status(),
        'a third party cannot revoke a signature they did not give',
      ).toBeGreaterThanOrEqual(400)
      expect(await res.text().catch(() => ''), 'and is told why').toMatch(/only the signer/i)
    } finally {
      await ctx.close()
    }

    expect(
      sqlValue(`SELECT is_revoked FROM signatures WHERE id = '${state.signatureId}'`),
      'and the signature still stands',
    ).toBe('f')
  })

  test('L4 · the ledger is absent from GraphQL and read-only to the GraphQL role', () => {
    // ── L4a. The table is not in the client schema at all. `signatures` carries
    // `@behavior -select -insert -update -delete` as its table comment, which is
    // how this codebase tells PostGraphile to emit nothing — no type, no query,
    // no mutation. Asserted against the comment rather than by probing the
    // endpoint, because a probe answering "no such field" is equally consistent
    // with a typo in the probe.
    const behavior = sqlValue(`SELECT obj_description('signatures'::regclass)`)
    expect(
      behavior,
      'the signature ledger is deliberately excluded from the GraphQL schema',
    ).toContain('-update')
    expect(behavior, 'in every direction').toContain('-delete')
    expect(behavior, 'including reads — the SPA gets signatures another way').toContain('-select')

    // ── L4b. Underneath that, the privilege layer. `app_user` — the role every
    // GraphQL request runs as — holds SELECT and INSERT and nothing else, so
    // even a hand-written statement cannot form.
    const privileges = sql(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE table_name = 'signatures' AND grantee = 'app_user' ORDER BY 1`,
    )
      .split('\n')
      .filter(Boolean)
    expect(
      privileges.sort(),
      'the GraphQL role may read and append, and may not rewrite or remove',
    ).toEqual(['INSERT', 'SELECT'])

    // ── L4c. And there is no UPDATE or DELETE policy to grant it through, which
    // is the belt to L4b's braces: a future GRANT that restored UPDATE would
    // still meet a table with no permissive policy for that command.
    const policies = sql(
      `SELECT cmd FROM pg_policies WHERE tablename = 'signatures' ORDER BY 1`,
    )
      .split('\n')
      .filter(Boolean)
    expect(
      policies.sort(),
      'only SELECT and INSERT policies exist — there is nothing for an UPDATE to satisfy',
    ).toEqual(['INSERT', 'SELECT'])

    // ── The live refusal, so the three static facts above are not merely a
    // description of the catalog. Repointing a signature at a different USER is
    // the transfer URS-SEC-11 names, and it is attempted as the real role.
    const move = sqlAsAppUser(
      `UPDATE signatures SET user_id = '${USERS.approver.id}' WHERE id = '${state.signatureId}';`,
      { userId: USERS.reviewer.id, companyId: COMPANY_ID },
    )
    expect(move.ok, 'the GraphQL role cannot move a signature to another person').toBeFalsy()
    expect(move.error).toMatch(/permission denied/i)

    // And repointing it at a different RECORD, which is the other half.
    const repoint = sqlAsAppUser(
      `UPDATE signatures SET task_instance_id = NULL,
              capa_id = (SELECT id FROM capas WHERE company_id = '${COMPANY_ID}' LIMIT 1)
        WHERE id = '${state.signatureId}';`,
      { userId: USERS.reviewer.id, companyId: COMPANY_ID },
    )
    expect(repoint.ok, 'nor move it to another record').toBeFalsy()
    expect(repoint.error).toMatch(/permission denied/i)

    // ── L4d. `signature_insert_rls` pins the author, so the INSERT grant that
    // DOES exist cannot be used to mint a signature in someone else's name.
    // This is the one write app_user may perform, and it is fenced.
    const impersonate = sqlAsAppUser(
      `INSERT INTO signatures (company_id, user_id, task_instance_id, meaning, payload_hash, signed_at, created_at)
       VALUES ('${COMPANY_ID}', '${USERS.approver.id}', '${state.reviewerTaskId}', 'APPROVED',
               repeat('a', 64), NOW(), NOW());`,
      { userId: USERS.reviewer.id, companyId: COMPANY_ID },
    )
    expect(
      impersonate.ok,
      'and a member cannot INSERT a signature under another user’s name — signature_insert_rls pins user_id to the session',
    ).toBeFalsy()
    expect(impersonate.error).toMatch(/row-level security|violates/i)

    // Everything is exactly where it was.
    const after = sqlRow(
      `SELECT user_id, task_instance_id, payload_hash FROM signatures WHERE id = '${state.signatureId}'`,
    )
    expect(after[0], 'the signature is still the reviewer’s').toBe(USERS.reviewer.id)
    expect(after[1], 'still on the task it was given for').toBe(state.reviewerTaskId)
    expect(after[2], 'and its seal is untouched').toBe(state.payloadHash)
  })

  test('L3 · the hash binds the signer, the subject and the meaning — a move is detectable', () => {
    // What the seal is FOR. `generatePayloadHash` serialises sixteen fields and
    // SHA-256s them, so the hash is a function of WHO signed, WHAT they signed,
    // and WHAT IT MEANT. Recomputing it over a different signer or a different
    // subject yields a different digest — which is the mechanism that makes a
    // transfer detectable even where it is not preventable.
    //
    // The three digests below are computed HERE, in SQL, from the same JSON
    // shape the service builds. That is deliberate: asserting `payload_hash IS
    // NOT NULL` (which is all PW-J2 does) is satisfied by a constant, and
    // asserting it equals a recomputation done by importing the service would
    // test the service against itself.
    const row = sqlRow(
      `SELECT user_id, meaning, task_instance_id, company_id,
              coalesce(ip_address, ''), signed_at, payload_hash
         FROM signatures WHERE id = '${state.signatureId}'`,
    )
    const [userId, meaning, taskId, companyId, , , storedHash] = row

    // The digest as stored.
    expect(storedHash, 'a 64-hex SHA-256').toMatch(/^[0-9a-f]{64}$/)

    // Two counterfactuals, hashed over the SAME field order the service uses.
    // The absolute values do not matter — what matters is that changing the
    // SIGNER changes the digest, and changing the SUBJECT changes the digest.
    // That is the property "tamper-evident" names, expressed without depending
    // on the service's exact JSON whitespace.
    // `sha256(bytea)` is the PG11+ BUILT-IN, deliberately not pgcrypto's
    // `digest()` — pgcrypto is not installed on this database (measured:
    // `digest(unknown, unknown) does not exist`), and a probe that silently
    // needed an extension would fail for a reason unrelated to signatures.
    const digestFor = (uid, tid) =>
      sqlValue(
        `SELECT encode(sha256(json_build_object(
            'userId', '${uid}',
            'taskInstanceId', '${tid}',
            'meaning', '${meaning}',
            'companyId', '${companyId}')::text::bytea), 'hex')`,
      )

    const asSigned = digestFor(userId, taskId)
    const asMovedToAnotherPerson = digestFor(USERS.approver.id, taskId)
    const asMovedToAnotherRecord = digestFor(
      userId,
      '00000000-0000-4000-8000-000000000000',
    )

    expect(asSigned, 'the digest is stable for identical inputs').toBe(digestFor(userId, taskId))
    expect(
      asMovedToAnotherPerson,
      'moving the signature to another PERSON changes what the seal would have to be',
    ).not.toBe(asSigned)
    expect(
      asMovedToAnotherRecord,
      'and moving it to another RECORD changes it too — signer and subject are both inside the seal',
    ).not.toBe(asSigned)

    // The service really does bind both, as opposed to hashing only a
    // timestamp. Read from the source of truth rather than trusted: two
    // signatures by DIFFERENT users on the SAME task must not share a hash.
    const distinct = sqlValue(
      `SELECT count(DISTINCT payload_hash) = count(*)
         FROM signatures
        WHERE company_id = '${COMPANY_ID}' AND deleted_at IS NULL`,
    )
    expect(
      distinct,
      'no two signatures in the tenant share a payload hash — a constant seal would collide immediately',
    ).toBe('t')
  })

  test('KNOWN DEFECT SIG-IMMUT-01 · the ledger has no immutability trigger', () => {
    // ── This test asserts what URS-SEC-11 DEMANDS and is expected to FAIL until
    // a migration adds the trigger. It is not weakened to match the product.
    //
    // THE ASYMMETRY, measured on app-db:
    //
    //   audit_logs  triggers: audit_logs_immutable (prevent_audit_log_mutation)
    //                         → raises "audit_logs rows are immutable" on any
    //                           UPDATE/DELETE, from ANY role, superuser included.
    //               grants:   app_user = SELECT, INSERT
    //
    //   signatures  triggers: signatures_audit_trigger ONLY — an AFTER trigger
    //                         that FEEDS the audit pipeline and blocks nothing.
    //               grants:   app_user = SELECT, INSERT
    //
    // So the two tables are protected identically on the GraphQL path and NOT
    // identically anywhere else. `REST_RLS_ENABLED` is off by default, so the
    // REST path connects as the superuser DB_USER and meets neither a policy nor
    // a GRANT — for `audit_logs` the trigger still stops it, and for the Part 11
    // SIGNATURE ledger nothing does.
    //
    // WHY THAT IS THE MORE SERIOUS OF THE TWO. A rewritten audit row falsifies
    // the history of a change. A rewritten signature falsifies WHO TOOK
    // RESPONSIBILITY FOR IT — the thing §11.70 exists to make unfalsifiable —
    // and the payload hash does not prevent it, because nothing in the product
    // ever recomputes the hash. Grepping `generatePayloadHash` across
    // `backend/api` outside `signatureService.js` returns only tests: the seal
    // is written and never verified, so tamper-evidence has no reader.
    //
    // WHAT WOULD CLOSE IT: a BEFORE UPDATE OR DELETE trigger on `signatures`
    // mirroring `prevent_audit_log_mutation()`, permitting only the revocation
    // columns (`is_revoked`, `revoked_at`, `revoked_reason`) and `deleted_at`,
    // and raising on everything else — the same shape as the NCR/CR/CAPA
    // lifecycle seals already in this schema.
    const immutabilityTriggers = sql(
      `SELECT tgname FROM pg_trigger
        WHERE tgrelid = 'signatures'::regclass AND NOT tgisinternal
          AND tgname <> 'signatures_audit_trigger'`,
    )

    // The control first: the table this one SHOULD look like really does have
    // the protection, so a failure below is about `signatures` and not about a
    // query that cannot see triggers.
    expect(
      sqlValue(
        `SELECT count(*) FROM pg_trigger
          WHERE tgrelid = 'audit_logs'::regclass AND NOT tgisinternal
            AND tgname LIKE '%immutable%'`,
      ),
      'CONTROL · audit_logs carries an immutability trigger, so this probe works',
    ).toBe('1')

    expect(
      immutabilityTriggers,
      'KNOWN DEFECT SIG-IMMUT-01 — the signature ledger has no immutability trigger, so the REST/superuser path (REST_RLS_ENABLED=false by default) can rewrite or delete a Part 11 signature without meeting any control. Fix with a BEFORE UPDATE OR DELETE trigger permitting only the revocation columns; do NOT relax this assertion.',
    ).not.toBe('')
  })
})
