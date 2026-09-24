// PW-J22 · OQ-01 TC-01-01 (URS-DOC-01) — the SERVER-SIDE arm of "required
// fields are enforced at creation."
//
// ── WHY THIS FILE EXISTS, AND WHAT PW-J12 ALREADY DID ────────────────────────
//
// PW-J12 closed TC-01-01 at the form, and probed FOUR columns at the data layer
// (`title`, `site_id`, `department_id`, `user_id`). Its header states the
// protocol's position plainly: "Interface refusal only; no REST create route
// exists to test server-side."
//
// THAT CLAIM IS TRUE, AND THIS FILE VERIFIES IT RATHER THAN REPEATING IT.
// Measured against ../qms on 2026-09-23:
//
//   backend/api/routes/documents.js mounts five sub-routers. `documents/crud.js`
//   declares exactly TWO routes, both GET (`/v1/services/documents` and
//   `/v1/services/documents/:id`) — there is no `router.post` in it at all.
//   Across every file under `routes/documents/`, the POSTs are
//   setEffective / snapshot-verify / submitForReview / cancelReview / delete /
//   the two verifyIdentity routes and reviews — all VERB routes against an
//   EXISTING document. The only other document-creating POSTs in the API are
//   `documentImports/:batchId/process` and `…/retry-failed`, which queue a
//   WORKER; neither takes a document payload.
//
// So document creation is GraphQL/SyncEngine-only. `DocumentsCreate.vue` builds
// the row with `db.Document.create(...)` + `.save()`, which the SyncEngine's
// `directSaveStrategy` turns into a PostGraphile mutation — and PostGraphile
// runs every mutation as the `app_user` role (see
// backend/api/config/postgraphile.js).
//
// `sqlAsAppUser` IS that layer. Same role, same session GUCs, RLS live and every
// trigger armed. A probe through it is not a substitute for a server-side test —
// it is the server-side test, reaching precisely the state a hand-rolled GraphQL
// mutation, a future integration or a rogue script would reach.
//
// ── WHAT THIS FILE ADDS OVER PW-J12 ──────────────────────────────────────────
//
// 1. THE EMPTY-STRING HOLE. PW-J12 asserts `documents.title` is NOT NULL and
//    that a NULL title is refused, and records the protocol's reading that
//    "Title is required by both the form and the database." Measured here,
//    THAT IS ONLY HALF TRUE: there is no CHECK constraint on `documents` other
//    than `documents_obsoletion_reason_required`, so `title = ''` and
//    `title = '   '` are both ACCEPTED by Postgres. NOT NULL refuses the
//    absence of a value; it does not refuse a value that is empty. For a
//    controlled-document title that is the difference that matters — an
//    untitled document is indistinguishable in a listing from one whose title
//    is a space.
//
// 2. THE FOUR COLUMNS PW-J12 NEVER PROBED. The client model
//    (qms-app/models/document.js) declares `siteId`, `workflowVersionId`,
//    `prefix`, `periodicReviewMonths` and `companyId` as `required: true`.
//    PW-J12 probed `site_id` only. `workflow_version_id`, `prefix`,
//    `document_template_id` and `author_id` are all nullable at the data layer
//    and are accepted empty here — i.e. the "required" in the model is a
//    BROWSER-SIDE assertion in `BaseModel.validate()`, enforced by the very
//    client that a server-side control exists to distrust.
//
// 3. WHAT IS GENUINELY SEALED. An honest negative result is only credible
//    beside the positives, so the same helper drives the columns the data layer
//    DOES refuse — `company_id` (NOT NULL), `status_id` (NOT NULL + FK to
//    `document_statuses`) and a cross-tenant `site_id` FK — proving the probe
//    can produce a refusal and is not simply incapable of failing.
//
// ── CONTROL ARM ──────────────────────────────────────────────────────────────
// Every negative result in this file is paired with a positive one in the SAME
// test (an accepted insert reports `INSERT 0 1`, a refused one reports a named
// Postgres error), and the file opens with a premise test that proves the probe
// harness itself is live: `sqlAsAppUser` really drops to `app_user`, really
// carries this tenant's GUCs, and a statement it runs really can be refused.
// Without that, "the data layer accepted it" and "my probe never ran" look
// identical.
//
// Every write is wrapped in BEGIN … ROLLBACK, so this file leaves no rows.
// Measured 2026-09-23 against the live local stack (app-db).
import { test, expect } from '../../video/fixtures/videoTest.js'
import { USERS, COMPANY_ID, ALT_COMPANY_ID } from '../fixtures/cast.js'
import { sql, sqlValue, sqlAsAppUser } from '../fixtures/db.js'

const AUTHOR = { userId: USERS.author.id, companyId: COMPANY_ID }

/** Is this column declared nullable? The schema fact behind each arm below. */
function isNullable(column) {
  return sqlValue(
    `SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'documents' AND column_name = '${column}'`,
  )
}

/**
 * One INSERT into `documents` as the untrusted `app_user` role, rolled back.
 *
 * Shaped like PW-J12's helper of the same intent, and deliberately NOT imported
 * from it: that file owns its literals, this file owns its own, and a shared
 * helper would couple two protocol arms that must be able to disagree about
 * what a "complete" row is. The base column set here is the MINIMUM Postgres
 * will take — id, company_id, status_id, created_at, updated_at — so each arm
 * adds only the column it is actually testing and nothing masks anything else.
 *
 * Values are interpolated rather than bound because `psql -tA` takes no bind
 * parameters. Every literal below is owned by this file.
 */
function insertAsAuthor(columns, values, { companyId = COMPANY_ID } = {}) {
  const cols = ['id', 'company_id', 'status_id', 'created_at', 'updated_at', ...columns]
  const vals = [
    'gen_random_uuid()',
    `'${companyId}'`,
    "'ACTIVE'",
    'now()',
    'now()',
    ...values,
  ]
  return sqlAsAppUser(
    `BEGIN;\nINSERT INTO documents (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING id;\nROLLBACK;`,
    AUTHOR,
  )
}

/** A complete-enough row with exactly one field varied — the shared shape. */
function insertWithTitle(titleLiteral, extraCols = [], extraVals = []) {
  return insertAsAuthor(
    ['title', 'author_id', 'user_id', ...extraCols],
    [titleLiteral, `'${USERS.author.id}'`, `'${USERS.author.id}'`, ...extraVals],
  )
}

test.describe('PW-J22 · TC-01-01 · document creation at the server (GraphQL/app_user) layer', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // PREMISE — the claim under verification, and the probe's own soundness.
  // ─────────────────────────────────────────────────────────────────────────

  test('PREMISE · the protocol\'s claim holds: no REST route creates a document, so the data layer IS the server-side surface', async ({
    request,
  }) => {
    // Asserted against the running API rather than by reading the router, so
    // that a route ADDED later fails here — which is the whole point of pinning
    // a negative. `/v1/services/documents` is the collection path a REST create
    // would live at; Express answers an unrouted method on a routed path with
    // 404, and a routed-but-unauthenticated one with 401/403. Anything in the
    // 2xx range means a create route appeared and this file's premise (and
    // PW-J12's header) need revisiting.
    const res = await request.post('http://e2elab.localhost:4000/v1/services/documents', {
      data: { title: 'J22 probe — should reach no create route' },
      failOnStatusCode: false,
    })
    expect(
      res.status(),
      `POST /v1/services/documents must not be a create route (got ${res.status()})`,
    ).toBeGreaterThanOrEqual(400)
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM documents WHERE title = 'J22 probe — should reach no create route'`,
        ),
      ),
      'and nothing was written by the attempt',
    ).toBe(0)
  })

  test('CONTROL · the app_user probe is live — it runs as app_user, carries this tenant, and a bad write really is refused', () => {
    // WITHOUT THIS TEST every "the data layer ACCEPTED it" result below is
    // unfalsifiable: a probe that silently never reached Postgres, or reached it
    // as the superuser, would report exactly the same shape of success. So:
    // three facts, each cheap, each fatal to the file's conclusions if false.

    // (a) the session really is the untrusted role PostGraphile uses…
    const who = sqlAsAppUser('SELECT current_user;', AUTHOR)
    expect(who.ok, who.error).toBe(true)
    expect(
      who.output.trim().split('\n').pop(),
      'the probe runs as app_user — the role every GraphQL mutation runs as',
    ).toBe('app_user')

    // (b) …carrying this tenant's GUCs, so RLS can match rather than fail shut…
    const guc = sqlAsAppUser("SELECT current_setting('app.current_company_id', true);", AUTHOR)
    expect(guc.output.trim().split('\n').pop(), 'the tenant GUC is set').toBe(COMPANY_ID)

    // (c) …and a genuinely invalid write IS refused, so "accepted" means
    // something. A NULL company_id can never pass: NOT NULL fires first, and
    // `documents_ins` could not match a null tenant even if it did not.
    const refused = insertAsAuthor(['title'], ["'J22 control — must be refused'"], {
      companyId: 'NULL',
    })
    expect(
      refused.ok,
      'a NULL-tenant insert is REFUSED — the probe is capable of producing a failure',
    ).toBe(false)
    expect(refused.error).toMatch(/company_id|not-null|violates/i)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // FINDING 1 — NOT NULL is not "required". The empty-string hole.
  // ─────────────────────────────────────────────────────────────────────────

  test('KNOWN DEFECT DOC-REQ-02 · title is NOT NULL but an EMPTY-STRING title is ACCEPTED at the data layer', () => {
    // KNOWN DEFECT DOC-REQ-02 — an honest negative, pinned rather than softened.
    //
    // WHAT THE REQUIREMENT DEMANDS. URS-DOC-01 / TC-01-01 step 2: the Title is a
    // mandatory field. PW-J12 evidences that at the form, and evidences that a
    // NULL title is refused by Postgres — and concludes title is "required by
    // both the form and the database."
    //
    // WHAT THE PRODUCT DOES. `documents` carries exactly one CHECK constraint
    // (`documents_obsoletion_reason_required`); there is NO length check, no
    // `char_length(btrim(title)) > 0`, and no BEFORE trigger that normalises or
    // rejects a blank. NOT NULL refuses the ABSENCE of a value. It does not
    // refuse a value that is empty. So the second half of "required by both"
    // holds only against `NULL`, and a writer that is not this create form can
    // produce a document with no readable title at all.
    //
    // Pinned as ACCEPTANCE, per the honesty rule: the test asserts what the
    // product actually does. If this arm ever goes RED, a non-empty constraint
    // landed and TC-01-01 step 2 can be upgraded from "NULL is refused" to
    // "a blank title is refused", which is what the requirement actually wants.
    const empty = insertWithTitle("''")
    expect(
      empty.ok,
      `the data layer ACCEPTS an empty-string title. stderr: ${empty.error}`,
    ).toBe(true)
    expect(empty.output, 'the INSERT reported one affected row before the rollback').toMatch(
      /INSERT 0 1/,
    )

    // Whitespace too — so "trim it and check" is not happening anywhere either.
    const blank = insertWithTitle("'   '")
    expect(
      blank.ok,
      `the data layer ACCEPTS a whitespace-only title. stderr: ${blank.error}`,
    ).toBe(true)
    expect(blank.output).toMatch(/INSERT 0 1/)

    // The schema fact behind both, asserted directly so that ADDING a check
    // fails here loudly rather than quietly turning the arms above into tests
    // of something else.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM pg_constraint
            WHERE conrelid = 'documents'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%title%'`,
        ),
      ),
      'there is NO CHECK constraint mentioning title — emptiness is unguarded',
    ).toBe(0)

    // CONTROL, in the same test so the acceptance cannot be read as the probe
    // being broken: the one title value the column DOES refuse.
    const nullTitle = insertWithTitle('NULL')
    expect(nullTitle.ok, 'a NULL title IS refused — NOT NULL is real, it is just narrow').toBe(
      false,
    )
    expect(nullTitle.error).toMatch(/null value in column "title".*not-null/is)
    expect(isNullable('title'), 'documents.title is declared NOT NULL').toBe('NO')

    // Nothing survived any of it.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM documents
            WHERE company_id = '${COMPANY_ID}' AND btrim(coalesce(title, 'x')) = ''`,
        ),
      ),
      'the rollbacks held — no blank-titled document exists in the tenant',
    ).toBe(0)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // FINDING 2 — the four "required" model fields PW-J12 never reached.
  // ─────────────────────────────────────────────────────────────────────────

  test('KNOWN DEFECT DOC-REQ-03 · workflow_version_id, prefix, document_template_id and author_id are all nullable and ACCEPTED empty', () => {
    // KNOWN DEFECT DOC-REQ-03 — the model's `required: true` is client-side only.
    //
    // qms-app/models/document.js declares `workflowVersionId`, `prefix`,
    // `siteId`, `periodicReviewMonths` and `companyId` as `required: true`, and
    // `BaseModel` validates them on `save()`. But that validation runs IN THE
    // BROWSER, in the very client a server-side control exists to distrust. Of
    // those, only `company_id` and `periodic_review_months` are actually sealed
    // at the data layer (NOT NULL); the rest are nullable columns.
    //
    // PW-J12 probed `site_id` and recorded it. These three were never probed,
    // and `author_id` — the originator, which the audit trail attributes the
    // creation to — was never probed either.
    //
    // WHAT IT MEANS. A document written by any path other than this create form
    // can have no approval workflow bound to it, no document-number prefix, no
    // template lineage and no recorded author. The first three make the document
    // unroutable through document control; the fourth leaves a controlled record
    // with no originator.
    //
    // Pinned as ACCEPTANCE. All four in one test, because the finding is the
    // SET — any one of them alone reads like an oversight, the four together
    // are the shape of the control (form-only) that TC-01-01 exists to
    // distinguish.
    const bare = insertAsAuthor(
      ['title', 'workflow_version_id', 'prefix', 'document_template_id', 'author_id', 'user_id'],
      ["'J22 bare document'", 'NULL', 'NULL', 'NULL', 'NULL', 'NULL'],
    )
    expect(
      bare.ok,
      `the data layer ACCEPTS a document with no workflow, prefix, template, author or owner. stderr: ${bare.error}`,
    ).toBe(true)
    expect(bare.output, 'one row was written before the rollback').toMatch(/INSERT 0 1/)

    // The schema facts behind it, column by column, so a migration that seals
    // any ONE of them fails precisely here and names which.
    expect(isNullable('workflow_version_id'), 'documents.workflow_version_id is nullable').toBe(
      'YES',
    )
    expect(isNullable('prefix'), 'documents.prefix is nullable').toBe('YES')
    expect(
      isNullable('document_template_id'),
      'documents.document_template_id is nullable',
    ).toBe('YES')
    expect(isNullable('author_id'), 'documents.author_id is nullable').toBe('YES')

    // CONTROL — the two the model calls required that ARE sealed, proving the
    // list above is a real gap and not a blanket "nothing is enforced".
    expect(isNullable('company_id'), 'documents.company_id IS NOT NULL — this one is sealed').toBe(
      'NO',
    )
    expect(
      isNullable('periodic_review_months'),
      'documents.periodic_review_months IS NOT NULL — sealed, with a default of 12',
    ).toBe('NO')
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM documents
            WHERE company_id = '${COMPANY_ID}' AND title = 'J22 bare document'`,
        ),
      ),
      'the rollback held — this probe leaves nothing behind',
    ).toBe(0)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // FINDING 3 — what the data layer DOES seal. The positives.
  // ─────────────────────────────────────────────────────────────────────────

  test('CONTROL · status_id is sealed on both sides — NOT NULL, and an unknown status is refused by its FK', () => {
    // The status field is the one piece of creation metadata that is genuinely a
    // data-integrity control rather than a usability one, and it matters to
    // TC-01-01 because it is what makes "the document opens in Draft" a claim
    // about the record rather than about the screen. Both halves asserted: the
    // column cannot be absent, and it cannot hold a value that is not a real
    // lifecycle state.
    const nullStatus = sqlAsAppUser(
      `BEGIN;
       INSERT INTO documents (id, company_id, title, status_id, created_at, updated_at)
       VALUES (gen_random_uuid(), '${COMPANY_ID}', 'J22 null status', NULL, now(), now());
       ROLLBACK;`,
      AUTHOR,
    )
    expect(nullStatus.ok, 'a NULL status is refused').toBe(false)
    expect(nullStatus.error).toMatch(/null value in column "status_id".*not-null/is)

    const badStatus = sqlAsAppUser(
      `BEGIN;
       INSERT INTO documents (id, company_id, title, status_id, created_at, updated_at)
       VALUES (gen_random_uuid(), '${COMPANY_ID}', 'J22 bad status', 'NOT_A_STATUS', now(), now());
       ROLLBACK;`,
      AUTHOR,
    )
    expect(badStatus.ok, 'an unknown status is refused by the FK, not silently stored').toBe(false)
    expect(badStatus.error).toMatch(/documents_status_id_fkey|foreign key/i)

    // And the accepted case in the same test, so the two refusals above cannot
    // be read as "app_user simply cannot insert documents".
    const good = insertWithTitle("'J22 good status'")
    expect(good.ok, `a well-formed document IS accepted. stderr: ${good.error}`).toBe(true)
    expect(good.output).toMatch(/INSERT 0 1/)
  })

  test('KNOWN DEFECT DOC-REQ-04 · site_id accepts a site belonging to ANOTHER tenant — the FK is unsealed', () => {
    // KNOWN DEFECT DOC-REQ-04 — measured, not assumed.
    //
    // This arm was written expecting a refusal, and the product answered
    // otherwise. `documents_site_id_fkey` references `sites(id)` with no tenant
    // predicate, and `documents_ins` checks the DOCUMENT's own `company_id`, not
    // the tenant of the site it points at. So an E2ELAB author can create an
    // E2ELAB document whose `site_id` is an E2EALT site, and both layers accept
    // it. (This is one instance of the repo-wide unsealed-FK class: most FKs in
    // this schema carry no composite tenant key.)
    //
    // WHY IT MATTERS HERE rather than only in a tenancy test: TC-01-01 step 3
    // is about the SITE a document applies to. PW-J12 records that site capture
    // is a form-only control because the column is nullable. This arm shows the
    // weaker second half — the column is not merely optional, it is also
    // unconstrained as to WHICH site, so "site applicability" carries no
    // data-layer meaning at creation at all.
    //
    // Pinned as ACCEPTANCE. If this goes RED, a composite-FK tenant seal landed
    // and the finding is closed.
    const altSiteId = sqlValue(
      `SELECT id FROM sites WHERE company_id = '${ALT_COMPANY_ID}' AND deleted_at IS NULL LIMIT 1`,
    )
    test.skip(!altSiteId, 'no E2EALT site seeded — nothing to probe cross-tenant against')

    const res = insertWithTitle("'J22 cross-tenant site'", ['site_id'], [`'${altSiteId}'`])
    expect(
      res.ok,
      `the data layer ACCEPTS a cross-tenant site_id — the FK carries no tenant predicate. stderr: ${res.error}`,
    ).toBe(true)
    expect(res.output, 'one row was written before the rollback').toMatch(/INSERT 0 1/)

    // The schema fact: a plain single-column FK, no composite tenant key.
    expect(
      sqlValue(
        `SELECT pg_get_constraintdef(oid) FROM pg_constraint
          WHERE conrelid = 'documents'::regclass AND conname = 'documents_site_id_fkey'`,
      ),
      'documents_site_id_fkey references sites(id) alone — no (id, company_id) seal',
    ).toMatch(/FOREIGN KEY \(site_id\) REFERENCES sites\(id\)/)

    // CONTROL — the probe is not simply accepting everything in this column: a
    // site id that does not exist AT ALL is refused by the FK, so the acceptance
    // above is specifically about tenancy, not about the column being ignored.
    const ghost = insertWithTitle(
      "'J22 ghost site'",
      ['site_id'],
      ["'00000000-0000-4000-8000-0000000000ff'"],
    )
    expect(ghost.ok, 'a non-existent site IS refused — the FK itself is live').toBe(false)
    expect(ghost.error).toMatch(/documents_site_id_fkey|foreign key/i)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // FINDING 4 — the number, which IS sealed, and is the counter-example that
  // makes the rest of this file credible.
  // ─────────────────────────────────────────────────────────────────────────

  test('CONTROL · doc_number uniqueness IS enforced at the data layer — the one creation-metadata rule that is not form-only', () => {
    // Everything above is a gap. This is not, and saying so is what stops this
    // file reading as an indiscriminate complaint. `documents_doc_number_company_id_key`
    // is a real UNIQUE (doc_number, company_id) constraint, so two documents in
    // one tenant can never share a controlled number — the property TC-01-02
    // depends on, enforced where it has to be rather than in the form.
    const existing = sqlValue(
      `SELECT doc_number FROM documents
        WHERE company_id = '${COMPANY_ID}' AND doc_number IS NOT NULL AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
    )
    test.skip(
      !existing,
      'no numbered document in the tenant yet — run PW-J1 first; nothing to collide with',
    )

    const dup = insertWithTitle("'J22 duplicate number'", ['doc_number'], [`'${existing}'`])
    expect(dup.ok, `re-using an existing document number is REFUSED. stderr: ${dup.error}`).toBe(
      false,
    )
    expect(dup.error).toMatch(/doc_number|unique|duplicate key/i)

    // The constraint itself, so dropping it fails here rather than silently
    // making the arm above depend on an accident of the data.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM pg_constraint
            WHERE conrelid = 'documents'::regclass AND contype = 'u'
              AND pg_get_constraintdef(oid) ILIKE '%doc_number%'
              AND pg_get_constraintdef(oid) ILIKE '%company_id%'`,
        ),
      ),
      'UNIQUE (doc_number, company_id) exists — numbering is a data-integrity control',
    ).toBe(1)

    // CONTROL: a DIFFERENT number in the same shape is accepted, so the refusal
    // above is the uniqueness rule and not the column rejecting writes.
    const fresh = insertWithTitle("'J22 fresh number'", ['doc_number'], ["'J22-UNIQUE-PROBE'"])
    expect(fresh.ok, `a previously-unused number IS accepted. stderr: ${fresh.error}`).toBe(true)
    expect(fresh.output).toMatch(/INSERT 0 1/)
    expect(
      sqlValue(`SELECT count(*) FROM documents WHERE doc_number = 'J22-UNIQUE-PROBE'`),
      'and the rollback held',
    ).toBe('0')
  })

  // ─────────────────────────────────────────────────────────────────────────
  // The tenant-wide oracle — none of the above is hypothetical.
  // ─────────────────────────────────────────────────────────────────────────

  test('the gap is reachable, not theoretical — the columns above are unsealed on the LIVE table, and this run left no residue', () => {
    // A closing sanity arm with two jobs.
    //
    // (a) Restate the finding as one machine-checkable sentence, so a reviewer
    //     reading only the last test still learns which columns TC-01-01 treats
    //     as mandatory but the data layer does not.
    const unsealed = sql(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'documents'
          AND column_name IN ('site_id','department_id','user_id','author_id',
                              'workflow_version_id','prefix','document_template_id')
          AND is_nullable = 'YES'
        ORDER BY column_name`,
    )
      .split('\n')
      .filter(Boolean)
    expect(
      unsealed,
      'every creation field the interface treats as mandatory is nullable at the data layer',
    ).toEqual([
      'author_id',
      'department_id',
      'document_template_id',
      'prefix',
      'site_id',
      'user_id',
      'workflow_version_id',
    ])

    // (b) Prove this spec was a read-only probe. Every arm rolled back, so no
    //     J22 row may exist — if one does, a BEGIN…ROLLBACK leaked and every
    //     "accepted" result above was also a WRITE to a validation database.
    expect(
      Number(
        sqlValue(`SELECT count(*) FROM documents WHERE title LIKE 'J22 %' OR title LIKE 'J22-%'`),
      ),
      'no probe row survived — every arm rolled back',
    ).toBe(0)
  })
})
