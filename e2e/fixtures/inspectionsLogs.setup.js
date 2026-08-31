// Inspections & Log Books pre-flight: purge what previous runs of this project
// left in the two seeded books.
//
// WHY THIS EXISTS — the same reason qc.setup.js does. Every journey here mints
// at least one field record, most mint a revision or three, and FieldRecord /
// FieldRecordRevision / FieldRecordFlag / AssignmentInstance are all synced
// models. The syncEngine bootstraps them into IndexedDB on every fresh browser
// context, and this project opens several per file, so the per-context
// hydration cost climbs with the accumulated data until UI steps start timing
// out. That failure looks like flake and is not.
//
// The purge is scoped hard: only rows belonging to the two log books and two
// form-assignment plans that e2e-seed.sql §34 created for this project. It
// cannot reach demo data, customer data, or the OTHER E2E suites' fixtures —
// including §15c's 'E2E Sites Log Book', which the sites project owns.
import { test as setup, expect } from '@playwright/test'
import { INSPECTIONS_LOGS } from './cast.js'
import { sql, sqlValue } from './db.js'

const BOOKS = `('${INSPECTIONS_LOGS.operations.id}','${INSPECTIONS_LOGS.controlled.id}')`
const PLANS = `('${INSPECTIONS_LOGS.operations.assignmentId}','${INSPECTIONS_LOGS.controlled.assignmentId}')`

setup('purge log entries from previous Inspections & Logs runs', async () => {
  const before = Number(
    sqlValue(`SELECT count(*) FROM field_records WHERE log_book_id IN ${BOOKS}`),
  )

  // `session_replication_role = replica` — the same escape hatch
  // database/seeder-local.sql uses, and here it is not optional.
  //
  // A signed revision cannot be unwound by ANY caller, superuser included, and
  // that is correct:
  //   - `signatures_field_record_revision_id_fkey` is ON DELETE RESTRICT, so the
  //     revision cannot go while its signature is there;
  //   - `field_record_revisions_signature_id_fkey` is ON DELETE SET NULL, so
  //     deleting the signature tries to null `signature_id` on the revision;
  //   - `enforce_field_record_revision_immutable` refuses exactly that write —
  //     "The e-signature on a revision is permanent and cannot be detached or
  //     repointed" — on the TRUSTED path too, deliberately.
  // Together they make a signed log entry genuinely undeletable, which is the
  // right production semantic and a hard stop for fixture teardown. Suppressing
  // triggers for the length of this one statement is the honest way through: it
  // is scoped to this psql session, touches only rows this project created, and
  // does not weaken the guarantee it steps around — IL-J8 asserts that same
  // guarantee still refuses an ordinary caller.
  //
  // Order still matters for the rest:
  //   - field_record_revisions and field_record_flags CASCADE off field_records,
  //     so they need no statement of their own once the signatures are gone.
  //   - task_instances reference records and flags by (entity_type, entity_id)
  //     with no FK at all, so they would otherwise outlive their subject and
  //     pile up in the supervisor's inbox forever.
  sql(`
    SET session_replication_role = replica;

    DELETE FROM signatures WHERE field_record_revision_id IN (
      SELECT r.id FROM field_record_revisions r
        JOIN field_records f ON f.id = r.field_record_id
       WHERE f.log_book_id IN ${BOOKS});

    DELETE FROM task_instances WHERE source_type = 'FieldRecordFlag' AND source_id IN (
      SELECT fl.id FROM field_record_flags fl
        JOIN field_records f ON f.id = fl.field_record_id
       WHERE f.log_book_id IN ${BOOKS});
    DELETE FROM task_instances WHERE entity_type = 'FieldRecord' AND entity_id IN (
      SELECT id FROM field_records WHERE log_book_id IN ${BOOKS});
    DELETE FROM task_instances WHERE entity_type = 'AssignmentInstance' AND entity_id IN (
      SELECT id FROM assignment_instances WHERE form_assignment_id IN ${PLANS});

    DELETE FROM notifications WHERE resource_type = 'FieldRecord' AND resource_id IN (
      SELECT id FROM field_records WHERE log_book_id IN ${BOOKS});

    DELETE FROM field_records WHERE log_book_id IN ${BOOKS};
    DELETE FROM assignment_instances WHERE form_assignment_id IN ${PLANS};

    -- The per-book entry counter is what makes record numbers unique and
    -- monotonic. Reset it so numbering restarts at 0001 each run; leaving it
    -- would make the "the entry got the next number in the book" assertion a
    -- moving target that only holds on a fresh database.
    DELETE FROM field_record_counters WHERE log_book_id IN ${BOOKS};

    SET session_replication_role = DEFAULT;
  `)

  expect(
    Number(sqlValue(`SELECT count(*) FROM field_records WHERE log_book_id IN ${BOOKS}`)),
    `purged ${before} leftover E2E log entries`,
  ).toBe(0)

  // The seeded fixtures must survive the purge — if one is missing the whole
  // project fails in confusing ways, so fail loudly and specifically here.
  for (const book of [INSPECTIONS_LOGS.operations, INSPECTIONS_LOGS.controlled]) {
    expect(
      sqlValue(`SELECT status_id FROM log_books WHERE id = '${book.id}'`),
      `seeded log book ${book.code} is ACTIVE (entries can only be filed against an active book)`,
    ).toBe('ACTIVE')
    expect(
      Number(sqlValue(`SELECT jsonb_array_length(schema) FROM log_books WHERE id = '${book.id}'`)),
      `seeded log book ${book.code} has a form schema`,
    ).toBeGreaterThan(0)
    expect(
      sqlValue(`SELECT count(*) FROM form_assignments WHERE id = '${book.assignmentId}' AND active`),
      `seeded assignment plan for ${book.code} is active — it is what makes the book visible to the operator`,
    ).toBe('1')
  }
})
