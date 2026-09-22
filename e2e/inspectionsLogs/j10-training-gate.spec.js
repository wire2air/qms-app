// IL-J10 — The training gate: only a competent operator may record.
//
// URS-LOG-05 / TC-10-05. The coverage matrix scored this "Not automated" with
// an accurate reason: "Server-side training block exists but seeded books bind
// no training, so nothing arms it." This file arms it.
//
// WHAT ARMING IT TAKES, and why every piece is necessary. `findUntrainedLinkedDocs`
// (backend/shared/utils/logBookTraining.js) walks five hops, and a gate that
// misses ANY of them is a gate that never fires:
//
//   log_book_document_links   the book must LINK a controlling document
//        ↓                    (any relationship_type — IMPLEMENTS / REFERENCES /
//                              EVIDENCE_OF all count equally)
//   trainings (ACTIVE)        that document must carry a bound ACTIVE training,
//        ↓                    either its own (`source_document_id`) or a library
//                              one via `training_document_links`
//   training_instances        the training must have been launched
//        ↓
//   training_assignees        and the user must hold a row whose status is
//                             EXACTLY 'VERIFIED'
//
// The last hop is the one the OQ protocol writes a whole note about, and it is
// the one this file tests hardest: `TRAINED_STATUSES = ['VERIFIED']`. A trainee
// who read the SOP, sat the assessment and PASSED it is still blocked until a
// manager verifies the competency. That is not a quirk to work around — it is
// the control — so the middle test walks an operator through COMPLETED and
// proves the gate is still shut, then flips one column to VERIFIED and proves
// it opens.
//
// THE FIXTURE IS BUILT AND TORN DOWN PER TEST, NOT PER FILE. The gate is armed
// by attaching a document link to E2E Operations Log — the book every other
// journey in this suite files entries against. A link left behind would block
// IL-J1's operator from submitting anything at all, so each test arms it,
// asserts, and disarms it in a finally. That also survives the worker being
// discarded after a failure: the finally still runs, and the next test rebuilds
// from nothing rather than inheriting a half-state.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, INSPECTIONS_LOGS, USERS } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import {
  createPersonaPool,
  errorMessage,
  findLatestRecord,
  restPost,
  uniqueTag,
} from '../fixtures/inspectionsLogs.js'

const OPS = INSPECTIONS_LOGS.operations

// One fixed id namespace, so a run that died mid-test is cleaned by the next
// run's arm() rather than colliding with it.
const IDS = {
  document: 'e2e9a000-0000-4000-8000-0000000010a1',
  training: 'e2e9a000-0000-4000-8000-0000000010a2',
  instance: 'e2e9a000-0000-4000-8000-0000000010a3',
  link: 'e2e9a000-0000-4000-8000-0000000010a4',
}
const DOC_TITLE = 'E2E IL-J10 Cold Chain Handling SOP'

const pool = createPersonaPool()

/**
 * Tear the whole fixture down, in FK order.
 *
 * Deliberately unconditional and idempotent: it is the first thing arm() does
 * and the last thing every test does, so neither a leftover from a crashed run
 * nor a double-call can leave the gate armed on a book eight other spec files
 * depend on.
 *
 * Note what is NOT here: `audit_logs`. The link, the training and the document
 * all carry audit triggers, so this teardown writes CREATE and DELETE rows into
 * an append-only table. That is correct and must stay — audit_logs is immutable
 * and nothing, including fixture teardown, may delete from it.
 */
function disarm() {
  sql(`
    DELETE FROM training_assignees WHERE training_instance_id = '${IDS.instance}';
    DELETE FROM training_instances WHERE id = '${IDS.instance}';
    DELETE FROM log_book_document_links WHERE id = '${IDS.link}';
    DELETE FROM trainings WHERE id = '${IDS.training}';
    DELETE FROM documents WHERE id = '${IDS.document}';
  `)
}

/**
 * Arm the gate on E2E Operations Log: a linked controlling document that
 * carries a launched, ACTIVE training.
 *
 * @param {object} [opts]
 * @param {string} [opts.relationshipType] IMPLEMENTS | REFERENCES | EVIDENCE_OF
 * @param {string} [opts.trainingStatus]   ACTIVE arms the gate; anything else
 *   leaves the document linked but harmless, which is the negative case.
 */
function arm({ relationshipType = 'IMPLEMENTS', trainingStatus = 'ACTIVE' } = {}) {
  disarm()
  sql(`
    INSERT INTO documents (id, company_id, title, status_id, created_at, updated_at)
    VALUES ('${IDS.document}', '${COMPANY_ID}', '${DOC_TITLE}', 'ACTIVE', NOW(), NOW());

    INSERT INTO trainings (id, company_id, title, status, source_document_id, created_at, updated_at)
    VALUES ('${IDS.training}', '${COMPANY_ID}', 'E2E IL-J10 Cold Chain Training',
            '${trainingStatus}', '${IDS.document}', NOW(), NOW());

    INSERT INTO training_instances (id, company_id, training_id, status, created_at, updated_at)
    VALUES ('${IDS.instance}', '${COMPANY_ID}', '${IDS.training}', 'ACTIVE', NOW(), NOW());

    INSERT INTO log_book_document_links
      (id, company_id, log_book_id, document_id, relationship_type, created_at, updated_at)
    VALUES ('${IDS.link}', '${COMPANY_ID}', '${OPS.id}', '${IDS.document}',
            '${relationshipType}', NOW(), NOW());
  `)
}

/** Give a user a training-assignee row at the named status. */
function setTrainingStatus(userId, status) {
  sql(`
    DELETE FROM training_assignees
     WHERE training_instance_id = '${IDS.instance}' AND user_id = '${userId}';
    INSERT INTO training_assignees
      (company_id, training_instance_id, user_id, status, completed_at, created_at, updated_at)
    VALUES ('${COMPANY_ID}', '${IDS.instance}', '${userId}', '${status}',
            ${status === 'ASSIGNED' ? 'NULL' : 'NOW()'}, NOW(), NOW());
  `)
}

/** How many entries this operator has in the book — the "nothing landed" check. */
function entryCount(userId) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM field_records
        WHERE log_book_id = '${OPS.id}' AND submitted_by_user_id = '${userId}'`,
    ),
  )
}

/**
 * Submit an entry the way the gate sees it — straight at the endpoint.
 *
 * Not the fill page. A blocked submission has no UI to assert against: the gate
 * throws from `fieldRecordService.submitFieldRecord` and the dialog surfaces a
 * toast, so the interesting fact — WHICH refusal, naming WHICH document — is
 * only legible in the response body. The positive cases go through the same
 * endpoint for symmetry, so a pass and a refusal differ by one column in the
 * database and nothing else.
 */
function submitPayload(tag) {
  return {
    logBookId: OPS.id,
    payload: {
      [OPS.fields.operator.name]: tag,
      [OPS.fields.reading.name]: '21.0',
      [OPS.fields.note.name]: 'Training-gate probe',
    },
  }
}

test.afterAll(async () => {
  disarm()
  await pool.close()
})

test.describe('IL-J10 — only a trained operator may record', () => {
  test('an untrained operator is refused, and the refusal names the document they owe', async ({
    browser,
  }) => {
    // TC-10-05 steps 1 and 2.
    const page = await pool.page(browser, AUTH.logOperator)
    arm()
    try {
      const before = entryCount(USERS.logOperator.id)

      const res = await restPost(page, '/fieldRecords', submitPayload(uniqueTag('J10U')))
      const status = res.status()
      const message = await errorMessage(res)

      // 403, not 400. The distinction is not pedantry: the neighbouring gate in
      // the same function — an inactive book — is a 400, because that is a
      // problem with the BOOK. This one is 403 because the problem is with the
      // PERSON, and a client that wanted to tell the operator "you may not do
      // this" from "this cannot be done" has to be able to tell them apart.
      expect(status, 'an untrained operator is forbidden, not merely refused').toBe(403)
      expect(message).toMatch(/USER_NOT_TRAINED/)
      expect(
        message,
        'the block states WHICH training is missing — a bare denial is not actionable on the floor',
      ).toContain(DOC_TITLE)

      // Step 2: no override exists for the operator. The block is not a warning
      // they can dismiss and not a flag they can force — the endpoint is the
      // only way to file an entry and it refuses, so there is nothing to
      // override. Proved by the row count, which is the only thing that matters.
      expect(entryCount(USERS.logOperator.id), 'and nothing was written').toBe(before)
    } finally {
      disarm()
    }
  })

  test('passing the assessment is not enough — the gate opens only on manager verification', async ({
    browser,
  }) => {
    // TC-10-05 steps 3 and 4, and the note the protocol attaches to them:
    // "A passed assessment is not enough — competency must be manager-verified."
    //
    // `TRAINED_STATUSES = ['VERIFIED']`, a one-element list, so every other
    // status in the assignee vocabulary is a block. Three are walked here
    // because they are three different-looking states an operator could
    // reasonably believe means "I am trained", and all three refuse.
    const page = await pool.page(browser, AUTH.logOperator)
    arm()
    try {
      for (const status of ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED']) {
        setTrainingStatus(USERS.logOperator.id, status)
        const before = entryCount(USERS.logOperator.id)
        const res = await restPost(page, '/fieldRecords', submitPayload(uniqueTag(`J10${status}`)))
        const code = res.status()
        const message = await errorMessage(res)
        expect(code, `a ${status} training record does not clear the operator to log`).toBe(403)
        expect(message).toMatch(/USER_NOT_TRAINED/)
        expect(entryCount(USERS.logOperator.id), `nothing written at ${status}`).toBe(before)
      }

      // COMPLETED is the interesting one and deserves saying out loud: the
      // trainee has read the document and passed the assessment. Everything
      // they can do themselves is done. The record still does not clear them,
      // because the last step belongs to their manager.

      // ── Step 3: the manager verifies ───────────────────────────────────
      setTrainingStatus(USERS.logOperator.id, 'VERIFIED')
      const before = entryCount(USERS.logOperator.id)

      // ── Step 4: the same submission, unchanged ─────────────────────────
      const tag = uniqueTag('J10V')
      const ok = await restPost(page, '/fieldRecords', submitPayload(tag))
      expect(ok.status(), await errorMessage(ok)).toBe(201)

      expect(entryCount(USERS.logOperator.id), 'the entry now lands').toBe(before + 1)
      const record = findLatestRecord(OPS.id, USERS.logOperator.id)
      expect(record.statusId, 'and it is an ordinary entry, not a conditional one').toBe(
        'SUBMITTED',
      )
      expect(record.submittedByUserId).toBe(USERS.logOperator.id)
    } finally {
      disarm()
    }
  })

  test('a linked document with no active training gates nobody', async ({ browser }) => {
    // The protocol's other note: "A linked document only gates entries if it
    // carries a training." This is the false-positive guard for the whole
    // file — without it, a gate that had silently become "any linked document
    // blocks everyone" would read as a pass on the first test and would be a
    // serious over-block in production.
    //
    // Same link, same document, same untrained operator. The single difference
    // is the training's status, so the assertion isolates exactly the hop the
    // resolver filters on (`status: 'ACTIVE'`).
    const page = await pool.page(browser, AUTH.logOperator)
    arm({ trainingStatus: 'DRAFT' })
    try {
      expect(
        sqlValue(
          `SELECT count(*) FROM log_book_document_links
            WHERE log_book_id = '${OPS.id}' AND document_id = '${IDS.document}'`,
        ),
        'the document IS linked — the difference is only the training status',
      ).toBe('1')

      const before = entryCount(USERS.logOperator.id)
      const res = await restPost(page, '/fieldRecords', submitPayload(uniqueTag('J10N')))
      expect(res.status(), await errorMessage(res)).toBe(201)
      expect(entryCount(USERS.logOperator.id), 'an inert document blocks nobody').toBe(before + 1)
    } finally {
      disarm()
    }
  })

  test('how the document is linked makes no difference — a REFERENCES link gates too', async ({
    browser,
  }) => {
    // The third clause of the same note: "How the document is linked
    // (implements / references / evidence of) makes no difference; all three
    // count." Worth an assertion of its own because it is the obvious place to
    // put an optimisation that would quietly open a hole — gating only on
    // IMPLEMENTS would leave every REFERENCES-linked SOP unenforced, and the
    // symptom would be silence.
    const page = await pool.page(browser, AUTH.logOperator)
    arm({ relationshipType: 'REFERENCES' })
    try {
      const before = entryCount(USERS.logOperator.id)
      const res = await restPost(page, '/fieldRecords', submitPayload(uniqueTag('J10R')))
      const status = res.status()
      const message = await errorMessage(res)
      expect(status, 'a REFERENCES link gates exactly as an IMPLEMENTS link does').toBe(403)
      expect(message).toMatch(/USER_NOT_TRAINED/)
      expect(entryCount(USERS.logOperator.id)).toBe(before)
    } finally {
      disarm()
    }
  })

  test('the gate is personal — one operator’s verification does not clear another', async ({
    browser,
  }) => {
    // The service's own comment: "Hard block — competency is personal, so there
    // is no override here (managers may override at ASSIGNMENT time, never at
    // entry time)."
    //
    // The supervisor is the second persona rather than a third operator because
    // it makes the point sharper: they hold `field_records:review` and
    // `read_all`, they are the named supervisor of this very book, and none of
    // that is competency. Permission and training are orthogonal, and this is
    // the only place in the suite that says so.
    const opPage = await pool.page(browser, AUTH.logOperator)
    const supPage = await pool.page(browser, AUTH.logSupervisor)
    arm()
    try {
      setTrainingStatus(USERS.logOperator.id, 'VERIFIED')

      const opBefore = entryCount(USERS.logOperator.id)
      const ok = await restPost(opPage, '/fieldRecords', submitPayload(uniqueTag('J10P')))
      expect(ok.status(), await errorMessage(ok)).toBe(201)
      expect(entryCount(USERS.logOperator.id), 'the verified operator is through').toBe(
        opBefore + 1,
      )

      const supBefore = Number(
        sqlValue(
          `SELECT count(*) FROM field_records
            WHERE log_book_id = '${OPS.id}' AND submitted_by_user_id = '${USERS.logSupervisor.id}'`,
        ),
      )
      const refused = await restPost(supPage, '/fieldRecords', submitPayload(uniqueTag('J10S')))
      const status = refused.status()
      const message = await errorMessage(refused)
      expect(
        status,
        'the book supervisor holds review and read_all, and is still not trained to RECORD',
      ).toBe(403)
      expect(message).toMatch(/USER_NOT_TRAINED/)
      expect(
        Number(
          sqlValue(
            `SELECT count(*) FROM field_records
              WHERE log_book_id = '${OPS.id}' AND submitted_by_user_id = '${USERS.logSupervisor.id}'`,
          ),
        ),
        'no entry from the untrained supervisor',
      ).toBe(supBefore)
    } finally {
      disarm()
    }
  })

  test('a book that is not ACTIVE refuses entries outright, trained or not', async ({ browser }) => {
    // The sibling gate, listed in the protocol's "Controls this protocol does
    // not test": "A book must be active to accept entries — a draft, inactive
    // or obsolete book refuses them. TC-10-02 activates a book but never tests
    // the negative."
    //
    // It belongs beside the training gate because the two sit three lines apart
    // in `submitFieldRecord` and are easy to conflate: this one is a 400 about
    // the BOOK, the other a 403 about the PERSON. Running both against the same
    // operator on the same book is what separates them.
    const page = await pool.page(browser, AUTH.logOperator)

    // ACTIVE -> INACTIVE is a legal edge on the trusted path, and the seeded
    // book is restored in the finally regardless of how the test ends. The
    // pause is what a supervisor does through the product when a line goes down.
    sql(
      `UPDATE log_books SET status_id = 'INACTIVE', updated_at = NOW() WHERE id = '${OPS.id}'`,
    )
    try {
      const before = entryCount(USERS.logOperator.id)
      const res = await restPost(page, '/fieldRecords', submitPayload(uniqueTag('J10I')))
      const status = res.status()
      const message = await errorMessage(res)

      expect(status, 'a paused book is a problem with the book — 400, not 403').toBe(400)
      expect(message).toMatch(/LOG_BOOK_NOT_ACTIVE/)
      expect(entryCount(USERS.logOperator.id), 'and no entry was recorded against it').toBe(before)
    } finally {
      sql(
        `UPDATE log_books SET status_id = 'ACTIVE', updated_at = NOW() WHERE id = '${OPS.id}'`,
      )
      expect(
        sqlValue(`SELECT status_id FROM log_books WHERE id = '${OPS.id}'`),
        'the seeded book is back in service for every journey after this one',
      ).toBe('ACTIVE')
    }
  })
})
