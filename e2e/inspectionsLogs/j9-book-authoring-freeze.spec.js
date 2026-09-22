// IL-J9 — Authoring a log book, and the moment its definition stops being
// editable.
//
// IL-J1…J8 all start from a book that is ALREADY active and already has a form
// schema, because e2e-seed.sql §34 hands them one. That left the two controls a
// regulator actually opens the module to inspect completely unexercised:
//
//   URS-LOG-01 / TC-10-01 — can an owner define a book and its entry form at
//     all, and does the product refuse a definition that is not yet fit to
//     approve (no fields, no reason, no approval route)?
//   URS-LOG-02 / TC-10-02 — once the book is live, is the CONTRACT frozen?
//     Not just "can you add a field", but the two settings the OQ protocol
//     calls "the most consequential configuration change in the module and no
//     test case attempts it": turning `signature_required` or `review_required`
//     OFF on a book that is already collecting entries.
//
// THE FREEZE IS TWO INDEPENDENT LAYERS AND THIS FILE PROBES BOTH.
//   layer 1 — `logBookService.updateLogBook` compares the patch against
//     FROZEN_ONCE_APPROVED and answers 400. That is the honest error a user
//     sees, and it is the only one the UI can produce.
//   layer 2 — `enforce_log_book_field_guard()`, a BEFORE UPDATE trigger, which
//     is what holds when the request does NOT come through that service: a raw
//     GraphQL mutation, a psql session, any future endpoint that forgets.
// A test that only checked layer 1 would pass against a build whose database
// guard had been dropped, which is the guard that matters for an ALCOA+ claim.
//
// There is deliberately NO test here that drives a book all the way to ACTIVE.
// There is no activate endpoint: ACTIVE is reachable only by submitting for
// approval and then completing the book's approval workflow through the
// generic task-action endpoint (logBookHandler.js sets it). Standing that up
// would be an approval-engine journey wearing a log-book costume. What this
// file asserts instead is the invariant that makes activation meaningful — a
// book is BORN DRAFT and cannot be born any other way — and then uses the
// seeded ACTIVE books, which are real approved books, for the freeze.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, INSPECTIONS_LOGS, USERS } from '../fixtures/cast.js'
import { sql, sqlAsAppUser, sqlValue } from '../fixtures/db.js'
import { createPersonaPool, errorMessage, restPost } from '../fixtures/inspectionsLogs.js'

const OPS = INSPECTIONS_LOGS.operations
const CTRL = INSPECTIONS_LOGS.controlled

// Books this file authors carry this in their code so the purge can find them
// without ever being able to reach §34's two fixtures or §15c's sites book.
const J9_CODE_PREFIX = 'E2EJ9'

const pool = createPersonaPool()

/**
 * Delete every book this file authored.
 *
 * Runs in beforeAll AND afterAll. The beforeAll half is not belt-and-braces: a
 * failing test makes Playwright discard the worker and fire this file's pending
 * afterAll, so a run that died mid-file can leave rows behind — and `code` is
 * unique per company, so the next run's create would 400 on a collision rather
 * than on anything to do with the assertion.
 *
 * Nothing else has to be unwound. These books are authored and left in DRAFT:
 * no entries, no revisions, no signatures, therefore none of the FK/trigger
 * knots that make e2e/fixtures/inspectionsLogs.setup.js reach for
 * `session_replication_role`.
 */
function purgeJ9Books() {
  sql(
    `DELETE FROM log_books
      WHERE company_id = '${COMPANY_ID}' AND code LIKE '${J9_CODE_PREFIX}%'`,
  )
}

test.beforeAll(() => purgeJ9Books())
test.afterAll(async () => {
  purgeJ9Books()
  await pool.close()
})

/** A code unique to this run, inside the namespace the purge owns. */
const j9Code = (tag) => `${J9_CODE_PREFIX}-${tag}-${Date.now()}`

/** The authored book row, read back from Postgres rather than the response. */
function findBookByCode(code) {
  const out = sql(
    `SELECT id, status_id, generation, schema_version, record_classification,
            edit_window_mode, coalesce(edit_window_minutes::text, ''),
            signature_required, review_required, require_independent_review,
            owner_user_id, coalesce(effective_at::text, ''),
            coalesce(workflow_instance_id::text, ''),
            coalesce(supersedes_log_book_id::text, '')
       FROM log_books
      WHERE company_id = '${COMPANY_ID}' AND code = '${code}' AND deleted_at IS NULL`,
  )
  if (!out) return null
  const c = out.split('\n')[0].split('|')
  return {
    id: c[0],
    statusId: c[1],
    generation: Number(c[2]),
    schemaVersion: Number(c[3]),
    recordClassification: c[4],
    editWindowMode: c[5],
    editWindowMinutes: c[6] ? Number(c[6]) : null,
    signatureRequired: c[7] === 't',
    reviewRequired: c[8] === 't',
    requireIndependentReview: c[9] === 't',
    ownerUserId: c[10],
    effectiveAt: c[11] || null,
    workflowInstanceId: c[12] || null,
    supersedesLogBookId: c[13] || null,
  }
}

/**
 * The book's form schema, parsed.
 *
 * Fetched on its own and JSON.parsed rather than pulled into findBookByCode:
 * Postgres renders jsonb with spaces after the colons and commas, so a
 * pipe-joined row would be parsed wrong the moment a field label contained one,
 * and a multi-line value would break the `split('\n')[0]` above outright.
 */
function schemaOf(bookId) {
  const raw = sqlValue(`SELECT schema::text FROM log_books WHERE id = '${bookId}'`)
  return raw ? JSON.parse(raw) : null
}

/** A four-field entry form: number, text, date and selection — TC-10-01 step 2. */
function entryForm() {
  return [
    { name: 'reading', type: 'number', label: 'Reading', required: true, min: 2, max: 8 },
    { name: 'operator_note', type: 'text', label: 'Operator Note', required: false },
    { name: 'activity_date', type: 'date', label: 'Activity Date', required: true },
    {
      name: 'shift',
      type: 'select',
      label: 'Shift',
      required: true,
      options: ['Day', 'Night'],
    },
  ]
}

test.describe('IL-J9 — defining a log book, and freezing it', () => {
  test('an owner authors a book with a four-type entry form, and it is born DRAFT at generation 1', async ({
    browser,
  }) => {
    // TC-10-01 (URS-LOG-01) steps 1-4, plus the supervisor assignment in step 6.
    const page = await pool.page(browser, AUTH.logAdmin)
    const code = j9Code('DEF')

    const res = await restPost(page, '/logBooks', {
      code,
      title: 'E2E J9 Cold Chain Log',
      description: 'Authored by IL-J9 to prove a book can be defined at all.',
      recordClassification: 'CONTROLLED_RECORD',
      logBookTypeId: INSPECTIONS_LOGS.logBookTypeId,
      supervisorUserId: USERS.logSupervisor.id,
      editWindowMode: 'TIME_WINDOW',
      editWindowMinutes: 45,
      signatureRequired: true,
      reviewRequired: true,
      schema: entryForm(),
    })
    expect(res.status(), await errorMessage(res)).toBe(201)

    const book = findBookByCode(code)
    expect(book, 'the book reached Postgres').toBeTruthy()

    // THE INVARIANT ACTIVATION RESTS ON. A book cannot be conjured into a state
    // where it already accepts entries — `enforce_log_book_transition` refuses
    // any INSERT that is not a generation-1 DRAFT, and the service never tries.
    // Everything downstream (the freeze, the approval workflow, the record's
    // frozen book generation) assumes this and nothing else asserts it.
    expect(book.statusId, 'a new book is born DRAFT — never ACTIVE').toBe('DRAFT')
    expect(book.generation, 'and at generation 1, with no lineage').toBe(1)
    expect(book.supersedesLogBookId).toBeNull()
    expect(book.effectiveAt, 'nothing is effective until the workflow says so').toBeNull()
    expect(book.workflowInstanceId).toBeNull()

    // The contract as authored, read back off the row rather than the response.
    expect(book.recordClassification).toBe('CONTROLLED_RECORD')
    expect(book.editWindowMode).toBe('TIME_WINDOW')
    expect(book.editWindowMinutes).toBe(45)
    expect(book.signatureRequired).toBe(true)
    expect(book.reviewRequired).toBe(true)
    expect(book.ownerUserId, 'ownership defaults to the author').toBe(USERS.logAdmin.id)

    // A CONTROLLED_RECORD derives independent review even though the request
    // never mentioned it: the classification promises a SECOND person signs,
    // and letting the author supply both signatures would defeat the half the
    // classification is named for. Asserted because it is invisible in the
    // request and is the kind of default a refactor drops silently.
    expect(
      book.requireIndependentReview,
      'CONTROLLED_RECORD derives independent review even when unasked',
    ).toBe(true)

    // TC-10-01 steps 2-4: the four field types, the required flags, and the
    // numeric limits — all persisted verbatim.
    const schema = schemaOf(book.id)
    expect(schema, 'the entry form saved').toHaveLength(4)
    expect(
      schema.map((f) => f.type),
      'a numeric, a text, a date and a selection field',
    ).toEqual(['number', 'text', 'date', 'select'])
    expect(
      schema.filter((f) => f.required).map((f) => f.name),
      'the required flags survive the round trip',
    ).toEqual(['reading', 'activity_date', 'shift'])

    // Step 4, "where supported": limits ARE stored. Whether they are ENFORCED
    // is a separate question and the OQ protocol answers it plainly — the entry
    // form applies them, the server validates nothing. IL-J1's comment on the
    // `validate-payload-here` seam is the other half of that finding; this only
    // claims the numbers persist.
    const numeric = schema.find((f) => f.name === 'reading')
    expect(numeric.min, 'numeric limits are stored on the field').toBe(2)
    expect(numeric.max).toBe(8)
    expect(
      schema.find((f) => f.name === 'shift').options,
      'and the selection field keeps its options',
    ).toEqual(['Day', 'Night'])

    expect(book.schemaVersion, 'the first definition is schema version 1').toBe(1)
  })

  test('a draft is still editable — the form can be reworked, and each rework bumps the schema version', async ({
    browser,
  }) => {
    // The other half of TC-10-02: the freeze only means something if the book
    // was genuinely open beforehand. A test that proved ACTIVE refuses an edit
    // without proving DRAFT accepts one would pass against a book nobody can
    // ever edit at all.
    const page = await pool.page(browser, AUTH.logAdmin)
    const code = j9Code('EDIT')

    const created = await restPost(page, '/logBooks', {
      code,
      title: 'E2E J9 Draft Rework',
      recordClassification: 'OPERATIONAL_LOG',
      logBookTypeId: INSPECTIONS_LOGS.logBookTypeId,
      editWindowMode: 'TIME_WINDOW',
      editWindowMinutes: 30,
      schema: entryForm(),
    })
    expect(created.status(), await errorMessage(created)).toBe(201)
    const book = findBookByCode(code)
    expect(book.schemaVersion).toBe(1)

    // Add a fifth field AND flip a required flag — both refused on a live book,
    // both fine here.
    const reworked = [
      ...entryForm().map((f) => (f.name === 'operator_note' ? { ...f, required: true } : f)),
      { name: 'batch', type: 'text', label: 'Batch', required: false },
    ]
    const patched = await page.request.patch(`/api/v1/services/logBooks/${book.id}`, {
      data: { schema: reworked, signatureRequired: true },
    })
    expect(patched.status(), await errorMessage(patched)).toBe(200)

    const after = findBookByCode(code)
    expect(schemaOf(after.id), 'the fifth field landed').toHaveLength(5)
    expect(
      schemaOf(after.id).find((f) => f.name === 'operator_note').required,
      'and a required flag can still be flipped while the book is a draft',
    ).toBe(true)
    expect(
      after.signatureRequired,
      'so can the signature policy — it is only frozen once approved',
    ).toBe(true)

    // The version bump is what a field record later pins as `log_book_version`,
    // so a rework that did not bump it would make two different forms share one
    // generation number and an old entry unreadable against the right schema.
    expect(after.schemaVersion, 'a real schema change bumps the version').toBe(2)

    // KNOWN DEFECT (IL-D3): the no-op guard on the version bump is dead code.
    //
    // `updateLogBook` intends to bump only on a real change, and says so:
    //     const same = JSON.stringify(patch.schema) === JSON.stringify(logBook.schema)
    //     if (!same) patch.schemaVersion = (logBook.schemaVersion ?? 1) + 1
    // But `logBook.schema` comes back out of a JSONB column, and Postgres
    // normalises jsonb by REORDERING every object's keys (shortest first, then
    // bytewise) and dropping whitespace. The client's `{name, type, label,
    // required, min, max}` is stored and returned as `{max, min, name, type,
    // label, required}`, so the two strings can never match for any schema
    // whose fields have more than one key — which is every schema. `same` is
    // effectively always false.
    //
    // The consequence is not cosmetic. `schemaVersion` is what a field record
    // pins as `log_book_version` (IL-J1 asserts it), so it is the number that
    // tells an auditor which generation of the form a three-year-old entry was
    // filed against. An editor that re-sends the schema on every autosave
    // inflates it without the form having changed, and the correspondence
    // between a version number and a distinct form is lost.
    //
    // Asserted as it IS — the re-send bumps. When the comparison is fixed
    // (normalise both sides, or diff the parsed objects), this flips to `.toBe(2)`.
    const noop = await page.request.patch(`/api/v1/services/logBooks/${book.id}`, {
      data: { schema: reworked },
    })
    expect(noop.status()).toBe(200)
    expect(
      findBookByCode(code).schemaVersion,
      'IL-D3 — a byte-identical re-send still bumps the version, because jsonb ' +
        'reorders keys and the service compares stringified JSON',
    ).toBe(3)
  })

  test('a draft cannot be submitted for approval until it is actually approvable', async ({
    browser,
  }) => {
    // TC-10-02 step 1 approaches activation. Activation itself runs through the
    // approval engine, but the gates in FRONT of it are this module's own and
    // each one is a real GMP control: you cannot put an empty form, an
    // unexplained change, or a book with no approval route in front of a QA
    // approver.
    const page = await pool.page(browser, AUTH.logAdmin)
    const code = j9Code('SUB')

    const created = await restPost(page, '/logBooks', {
      code,
      title: 'E2E J9 Premature Submit',
      recordClassification: 'OPERATIONAL_LOG',
      logBookTypeId: INSPECTIONS_LOGS.logBookTypeId,
      editWindowMode: 'TIME_WINDOW',
      editWindowMinutes: 30,
      schema: [], // deliberately empty
    })
    expect(created.status(), await errorMessage(created)).toBe(201)
    const book = findBookByCode(code)

    const empty = await restPost(page, `/logBooks/${book.id}/submit`, {
      changeSummary: 'Initial issue',
    })
    expect(empty.status(), 'an empty form cannot be approved').toBe(400)
    expect(await errorMessage(empty)).toMatch(/at least one field/i)

    // Give it a form; now the missing change summary is what stops it.
    const withForm = await page.request.patch(`/api/v1/services/logBooks/${book.id}`, {
      data: { schema: entryForm() },
    })
    expect(withForm.status(), await errorMessage(withForm)).toBe(200)

    const noSummary = await restPost(page, `/logBooks/${book.id}/submit`, { changeSummary: '   ' })
    expect(noSummary.status(), 'a blank change summary is not a change summary').toBe(400)
    expect(await errorMessage(noSummary)).toMatch(/change summary is required/i)

    // And with both in place, the approval ROUTE is still missing. This is the
    // gate that makes "approved" mean something: without a workflow attached
    // there is nobody for the book to go to, and the product refuses rather
    // than activating it by default.
    const noWorkflow = await restPost(page, `/logBooks/${book.id}/submit`, {
      changeSummary: 'Initial issue',
    })
    expect(noWorkflow.status(), 'and no approval route means no submission').toBe(400)
    expect(await errorMessage(noWorkflow)).toMatch(/approval workflow/i)

    expect(findBookByCode(code).statusId, 'the book never left DRAFT').toBe('DRAFT')
  })

  test('the app refuses to edit the form of a live book, and so does the database underneath it', async ({
    browser,
  }) => {
    // TC-10-02 steps 2-4 (URS-LOG-02), against E2E Operations Log — a genuinely
    // ACTIVE book, which is the only state in which this question is meaningful.
    const page = await pool.page(browser, AUTH.logAdmin)

    const before = schemaOf(OPS.id)
    expect(before, 'the seeded book has its three-field form').toHaveLength(3)

    // ── Layer 1: the service ─────────────────────────────────────────────
    // ADD a field. The response names the offending key, which is the only
    // reason a user can act on the refusal.
    const added = await page.request.patch(`/api/v1/services/logBooks/${OPS.id}`, {
      data: { schema: [...before, { name: 'smuggled', type: 'text', label: 'Smuggled' }] },
    })
    expect(added.status()).toBe(400)
    expect(await errorMessage(added)).toMatch(/schema is locked once the log book is approved/i)

    // REMOVE a field.
    const removed = await page.request.patch(`/api/v1/services/logBooks/${OPS.id}`, {
      data: { schema: before.slice(0, 2) },
    })
    expect(removed.status()).toBe(400)
    expect(await errorMessage(removed)).toMatch(/create a replacement/i)

    // RENAME a field, and flip its required flag. Both live inside `schema`, so
    // both are the same refusal — which is worth asserting explicitly, because
    // "renaming is prevented" is a separate line in the protocol and a reader
    // should not have to infer it from the add case.
    const renamed = await page.request.patch(`/api/v1/services/logBooks/${OPS.id}`, {
      data: {
        schema: before.map((f) =>
          f.name === OPS.fields.note.name ? { ...f, label: 'Remark', required: true } : f,
        ),
      },
    })
    expect(renamed.status()).toBe(400)
    expect(await errorMessage(renamed)).toMatch(/schema is locked/i)

    // ── Layer 2: the database ────────────────────────────────────────────
    // Same edit, straight at the row as `app_user`. logAdmin holds
    // `log_books:update` so RLS admits the write and the TRIGGER is what
    // refuses — which is the half that still holds when the request never
    // touches logBookService at all.
    const raw = sqlAsAppUser(
      `UPDATE log_books SET schema = '[]'::jsonb WHERE id = '${OPS.id}';`,
      { userId: USERS.logAdmin.id, companyId: COMPANY_ID },
    )
    expect(raw.ok, 'the trigger refuses the same edit with the service bypassed').toBeFalsy()
    expect(raw.error).toMatch(/contract is frozen once approved/i)

    expect(schemaOf(OPS.id), 'the form an auditor reads is exactly as it was').toEqual(before)
  })

  test('signature and review requirements cannot be switched off on a live book', async ({
    browser,
  }) => {
    // The OQ protocol names this omission explicitly: "Turning off signature or
    // review requirement on a live book is the most consequential configuration
    // change in the module and no test case attempts it."
    //
    // It is run against E2E Controlled Log, where both flags are TRUE. That is
    // load-bearing. The guard's condition is `IS DISTINCT FROM`, so the same
    // request against E2E Operations Log — where both are already false —
    // passes cleanly and proves nothing: the write is a no-op, not a refusal.
    // Probing the book where the value would actually CHANGE is the difference
    // between testing the guard and testing that nothing happened.
    const page = await pool.page(browser, AUTH.logAdmin)
    expect(
      sqlValue(
        `SELECT signature_required AND review_required FROM log_books WHERE id = '${CTRL.id}'`,
      ),
      'the probe needs a book where both flags are genuinely ON',
    ).toBe('t')

    const unsign = await page.request.patch(`/api/v1/services/logBooks/${CTRL.id}`, {
      data: { signatureRequired: false },
    })
    expect(unsign.status(), 'the Part-11 signature requirement is part of the contract').toBe(400)
    expect(await errorMessage(unsign)).toMatch(/signatureRequired is locked/i)

    const unreview = await page.request.patch(`/api/v1/services/logBooks/${CTRL.id}`, {
      data: { reviewRequired: false },
    })
    expect(unreview.status(), 'and so is the second-person review').toBe(400)
    expect(await errorMessage(unreview)).toMatch(/reviewRequired is locked/i)

    // The whole frozen contract, one raw write each, as the trigger sees it.
    // `code` is in this list for a reason that is easy to miss: every entry
    // already filed carries a record number minted from it, so a code change
    // would silently orphan the numbering of every historic record.
    for (const [column, value, why] of [
      ['signature_required', 'false', 'the signature requirement'],
      ['review_required', 'false', 'the review requirement'],
      ['edit_window_mode', `'NONE'`, 'the edit-window mode'],
      ['record_classification', `'OPERATIONAL_LOG'`, 'the record classification'],
      ['code', `'E2E-RENAMED'`, "the book's code, which every record number embeds"],
    ]) {
      const res = sqlAsAppUser(
        `UPDATE log_books SET ${column} = ${value} WHERE id = '${CTRL.id}';`,
        { userId: USERS.logAdmin.id, companyId: COMPANY_ID },
      )
      expect(res.ok, `${why} is frozen at the database too`).toBeFalsy()
      expect(res.error).toMatch(/contract is frozen once approved/i)
    }

    // KNOWN DEFECT (IL-D2): `over_the_shoulder_review` and
    // `require_independent_review` are in the SERVICE's FROZEN_ONCE_APPROVED
    // list but NOT in the trigger's frozen set, so the database accepts a
    // change to either on a live book. Both decide how a controlled entry may
    // be signed — over-the-shoulder review is the control TC-10-06 step 5 is
    // about — so the two layers disagree on part of the contract.
    //
    // Asserted as it IS rather than as it should be: the service refuses (so
    // the product is safe through its own API) and the trigger does not (so
    // the safety is single-layered, unlike every other frozen field above).
    const svc = await page.request.patch(`/api/v1/services/logBooks/${CTRL.id}`, {
      data: { overTheShoulderReview: true },
    })
    expect(svc.status(), 'the service does hold this one').toBe(400)
    expect(await errorMessage(svc)).toMatch(/overTheShoulderReview is locked/i)

    const dbGap = sqlAsAppUser(
      `UPDATE log_books SET over_the_shoulder_review = NOT over_the_shoulder_review
        WHERE id = '${CTRL.id}' RETURNING id;`,
      { userId: USERS.logAdmin.id, companyId: COMPANY_ID },
    )
    expect(
      dbGap.ok,
      'IL-D2 — the trigger does NOT freeze over_the_shoulder_review; if this starts ' +
        'failing the gap has been closed and this assertion should be flipped',
    ).toBeTruthy()
    // Put it back. This is the one write in the file that lands, and leaving it
    // would hand the next run — and IL-J3 — a book configured differently from
    // its seed.
    sql(
      `UPDATE log_books SET over_the_shoulder_review = false, updated_at = NOW()
        WHERE id = '${CTRL.id}'`,
    )
    expect(
      sqlValue(`SELECT over_the_shoulder_review FROM log_books WHERE id = '${CTRL.id}'`),
      'the fixture is restored for every journey after this one',
    ).toBe('f')

    // Nothing that was supposed to hold moved.
    expect(
      sqlValue(
        `SELECT signature_required AND review_required FROM log_books WHERE id = '${CTRL.id}'`,
      ),
      'the controlled book still demands a signature and a reviewer',
    ).toBe('t')
  })

  test('the supported route to a changed definition is a replacement, and the original stays readable', async ({
    browser,
  }) => {
    // TC-10-02 step 5. This is the answer the protocol asks the executor to
    // find: when the form genuinely must change, what does the product offer
    // instead of an edit?
    //
    // It is exercised against a throwaway book rather than either §34 fixture,
    // because `log_books_one_inflight_replacement_uniq` permits exactly one
    // open replacement per book — a replacement of E2E Operations Log left
    // behind by a failed run would make every later run's call 400.
    const page = await pool.page(browser, AUTH.logAdmin)
    const code = j9Code('REPL')

    const created = await restPost(page, '/logBooks', {
      code,
      title: 'E2E J9 Replaceable Book',
      recordClassification: 'OPERATIONAL_LOG',
      logBookTypeId: INSPECTIONS_LOGS.logBookTypeId,
      editWindowMode: 'TIME_WINDOW',
      editWindowMinutes: 30,
      schema: entryForm(),
    })
    expect(created.status(), await errorMessage(created)).toBe(201)
    const original = findBookByCode(code)

    // `/replace` requires an ACTIVE source, and activation belongs to the
    // approval engine. Rather than stand that engine up, the book is moved to
    // ACTIVE with the edge the trigger itself sanctions for exactly this —
    // DRAFT->ACTIVE, the bootstrap-seed activation, written as the superuser,
    // which is the same trusted path e2e-seed.sql §34c uses to create the two
    // fixture books. The guard is not bypassed: the DRAFT->ACTIVE edge is in
    // `enforce_log_book_transition`'s own legal-edge list.
    sql(
      `UPDATE log_books SET status_id = 'ACTIVE', effective_at = NOW(), updated_at = NOW()
        WHERE id = '${original.id}'`,
    )
    expect(findBookByCode(code).statusId).toBe('ACTIVE')

    // Now the edit is refused — and the refusal names the route.
    const refused = await page.request.patch(`/api/v1/services/logBooks/${original.id}`, {
      data: { schema: entryForm().slice(0, 2) },
    })
    expect(refused.status()).toBe(400)
    expect(
      await errorMessage(refused),
      'the refusal tells the user what to do instead — that is the whole control',
    ).toMatch(/create a replacement/i)

    const res = await restPost(page, `/logBooks/${original.id}/replace`, {})
    expect(res.status(), await errorMessage(res)).toBe(201)

    // The replacement, found by lineage rather than by parsing the response —
    // the code it mints (`<ROOT>-V2`) is the product's business and asserting
    // it here would couple this test to `lineageRootCode`.
    const replacementId = sqlValue(
      `SELECT id FROM log_books WHERE supersedes_log_book_id = '${original.id}' AND deleted_at IS NULL`,
    )
    expect(replacementId, 'a replacement draft exists').toBeTruthy()

    // Fetched as two separate scalars, not one pipe-joined string: `sqlValue`
    // hands back psql's unaligned output SPLIT ON '|', so a concatenated value
    // comes back truncated at the first separator and the second half reads as
    // undefined.
    expect(
      sqlValue(`SELECT status_id FROM log_books WHERE id = '${replacementId}'`),
      'the replacement is a DRAFT — it must be approved like any book',
    ).toBe('DRAFT')
    expect(
      Number(sqlValue(`SELECT generation FROM log_books WHERE id = '${replacementId}'`)),
      'and it is the next generation of the lineage',
    ).toBe(2)

    // Its form is editable, which is the point: the replacement is where the
    // change the user wanted actually happens.
    const rework = await page.request.patch(`/api/v1/services/logBooks/${replacementId}`, {
      data: { schema: entryForm().slice(0, 2) },
    })
    expect(rework.status(), await errorMessage(rework)).toBe(200)
    expect(schemaOf(replacementId), 'the replacement carries the new form').toHaveLength(2)

    // TC-10-02 step 5's second clause — "the superseded book remains readable".
    // It is still ACTIVE with its ORIGINAL form intact, because approval of the
    // replacement is what obsoletes it, and even then the row survives: the
    // entries filed against it have to stay readable against the form they
    // were filed under.
    const superseded = findBookByCode(code)
    expect(superseded.statusId, 'the original is untouched until the replacement is approved').toBe(
      'ACTIVE',
    )
    expect(schemaOf(original.id), 'and still carries the form its entries were filed under').toEqual(
      entryForm(),
    )
  })
})
