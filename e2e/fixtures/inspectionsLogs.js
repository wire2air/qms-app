// Shared UI flows + DB assertions for the Inspections & Log Books journeys.
//
// Fixtures live in qms/database/e2e-seed.sql §34 and are mirrored in cast.js as
// `INSPECTIONS_LOGS`. Four facts about this module shape everything below.
//
// 1. THERE IS NO ENTRY DETAIL ROUTE. A log entry is only ever reachable as an
//    overlay above the Logs list (`FieldRecordPreview`, teleported to body).
//    The supported deep link is `?tab=logs&recordId=<id>` — FieldRecordsList
//    reads it in `onMounted` and opens the panel. That is a product affordance
//    (the flagged-entry task links to it), not a test shortcut.
//
// 2. FILLING IS A SEPARATE PAGE. `/inspections-logs/fill?logBookId=…` mounts
//    AddRecordDialog with the picker skipped. On success `fill.vue` routes
//    straight back to /logging without showing the "Record Created" screen, so
//    a submit is confirmed against Postgres, never against the UI.
//
// 3. EVERY WRITE IS REST, EVERY READ IS SYNCENGINE. Submit / edit / amend /
//    void / review / flag all POST to /v1/services/…; the panel then reads the
//    result back out of IndexedDB after `refetchSyncRecord`. So: assert hard
//    facts in SQL, and let the UI assertions retry.
//
// 4. THE FORM IS FILLED BY LABEL AND ASSERTED BY NAME. A log book's schema
//    field carries both (`{ name: 'reading', label: 'Reading' }`) and the
//    payload is keyed by `name`. cast.js carries both halves so no spec has to
//    guess which one a given surface wants.
import { expect } from '@playwright/test'
import { COMPANY_ID, INSPECTIONS_LOGS } from './cast.js'
import { sql, sqlRow, sqlValue, waitForSqlValue } from './db.js'
import { signWithPin } from './esign.js'
import { clickWhenReady } from './documents.js'

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`

// Every entry this suite files carries this marker in a text field, so the
// setup project can purge exactly its own rows and nothing else.
export const E2E_MARKER = 'E2E-IL'

/** Unique, greppable value for one test run. */
export function uniqueTag(tag) {
  return `${E2E_MARKER}-${tag}-${Date.now()}`
}

// ─── DB reads ───────────────────────────────────────────────────────────────

/** Field record by id. */
export function findRecord(id) {
  const row = sqlRow(
    `SELECT id, record_number, status_id, log_book_id, submitted_by_user_id,
            lock_at, lock_reason, current_revision_id, assignment_instance_id,
            voided_at, void_reason, record_classification, log_book_version
       FROM field_records WHERE id = ${quote(id)}`,
  )
  if (!row) return null
  return {
    id: row[0],
    recordNumber: row[1] || null,
    statusId: row[2],
    logBookId: row[3],
    submittedByUserId: row[4],
    lockAt: row[5] || null,
    lockReason: row[6] || null,
    currentRevisionId: row[7] || null,
    assignmentInstanceId: row[8] || null,
    voidedAt: row[9] || null,
    voidReason: row[10] || null,
    recordClassification: row[11],
    logBookVersion: Number(row[12]),
  }
}

/**
 * The newest entry a given user filed against a book. `submitEntry` uses this
 * to find what it just created: the REST response never reaches the test (the
 * page consumes it and navigates away), so the row is identified by
 * (book, submitter, newest) instead.
 */
export function findLatestRecord(logBookId, submittedByUserId) {
  const id = sqlValue(
    `SELECT id FROM field_records
      WHERE log_book_id = ${quote(logBookId)}
        AND submitted_by_user_id = ${quote(submittedByUserId)}
        AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
  )
  return id ? findRecord(id) : null
}

/**
 * How many fields the record froze at submit. The snapshot is what an auditor
 * reads a three-year-old entry against, so "it is not empty" is a real claim:
 * FieldRecordPreview falls back to the LIVE book schema when the snapshot is
 * missing or `[]`, which would quietly show today's form over yesterday's data.
 */
export function snapshotFieldCount(recordId) {
  return Number(
    sqlValue(
      `SELECT jsonb_array_length(log_book_schema_snapshot) FROM field_records WHERE id = ${quote(recordId)}`,
    ),
  )
}

/** Full revision history for a record, oldest first. */
export function revisionsOf(recordId) {
  const out = sql(
    `SELECT revision_number, revision_type, coalesce(review_outcome, ''),
            coalesce(comment, ''), (signature_id IS NOT NULL), author_user_id,
            payload::text
       FROM field_record_revisions
      WHERE field_record_id = ${quote(recordId)}
      ORDER BY revision_number`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [n, type, outcome, comment, signed, author, payload] = line.split('|')
    return {
      revisionNumber: Number(n),
      revisionType: type,
      reviewOutcome: outcome || null,
      comment: comment || null,
      signed: signed === 't',
      authorUserId: author,
      payload: JSON.parse(payload),
    }
  })
}

/** The payload of the record's CURRENT revision — what the UI renders. */
export function currentPayload(recordId) {
  const raw = sqlValue(
    `SELECT r.payload::text FROM field_records f
       JOIN field_record_revisions r ON r.id = f.current_revision_id
      WHERE f.id = ${quote(recordId)}`,
  )
  return raw ? JSON.parse(raw) : null
}

/** Part-11 signature rows tied to any revision of this record, oldest first. */
export function signaturesOf(recordId) {
  const out = sql(
    `SELECT s.meaning, s.user_id FROM signatures s
       JOIN field_record_revisions r ON r.id = s.field_record_revision_id
      WHERE r.field_record_id = ${quote(recordId)}
      ORDER BY s.created_at`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [meaning, userId] = line.split('|')
    return { meaning, userId }
  })
}

/** Flags on a record, newest first. */
export function flagsOf(recordId) {
  const out = sql(
    `SELECT id, severity, notes, (resolved_at IS NOT NULL),
            coalesce(resolved_by_user_id::text, ''), coalesce(resolution_notes, ''),
            flagged_by_user_id
       FROM field_record_flags WHERE field_record_id = ${quote(recordId)}
      ORDER BY flagged_at DESC`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [id, severity, notes, resolved, resolvedBy, resolutionNotes, flaggedBy] = line.split('|')
    return {
      id,
      severity,
      notes,
      resolved: resolved === 't',
      resolvedByUserId: resolvedBy || null,
      resolutionNotes: resolutionNotes || null,
      flaggedByUserId: flaggedBy,
    }
  })
}

/** Assignment instance by id. */
export function findInstance(id) {
  const row = sqlRow(
    `SELECT id, status_id, assigned_to_user_id, coalesce(completed_record_id::text, ''),
            coalesce(completed_at::text, ''), form_assignment_id
       FROM assignment_instances WHERE id = ${quote(id)}`,
  )
  if (!row) return null
  return {
    id: row[0],
    statusId: row[1],
    assignedToUserId: row[2],
    completedRecordId: row[3] || null,
    completedAt: row[4] || null,
    formAssignmentId: row[5],
  }
}

/**
 * Mint a DUE assignment instance under one of the seeded ad-hoc plans.
 *
 * Why SQL rather than a product call: instances are materialised by the worker
 * (`generate_assignment_instances`, a 5-minute cron over a cron schedule), and
 * there is no endpoint that creates one — `/v1/services/assignmentInstances`
 * exposes list / get / skip only. Waiting for the worker would mean seeding a
 * recurring plan and sleeping through a cron tick per test. An instance is also
 * consumed the first time it is filled, so it cannot be a static seed row.
 *
 * The row is written exactly as the worker writes it (window open now, grace an
 * hour out) so the service's DUE/OVERDUE precondition sees the real shape.
 */
export function createDueInstance({ book = INSPECTIONS_LOGS.operations, userId }) {
  const id = sqlValue(
    `INSERT INTO assignment_instances
       (company_id, form_assignment_id, assigned_to_user_id, due_at, window_opens_at,
        window_closes_at, grace_until, status_id, created_at, updated_at)
     VALUES (${quote(COMPANY_ID)}, ${quote(book.assignmentId)}, ${quote(userId)},
             NOW(), NOW() - INTERVAL '5 minutes', NOW() + INTERVAL '2 hours',
             NOW() + INTERVAL '3 hours', 'DUE', NOW(), NOW())
     RETURNING id`,
  )
  return findInstance(id)
}

/** Unified-inbox tasks raised for a record / flag, newest first. */
export function tasksFor({ entityId = null, sourceId = null }) {
  const where = entityId ? `entity_id = ${quote(entityId)}` : `source_id = ${quote(sourceId)}`
  const out = sql(
    `SELECT task_kind_id, status_id, assigned_to, entity_type
       FROM task_instances WHERE ${where} AND deleted_at IS NULL
      ORDER BY created_at DESC`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [kind, statusId, assignedTo, entityType] = line.split('|')
    return { kind, statusId, assignedTo, entityType }
  })
}

/** Queued notifications addressed to a user about a record. */
export function notificationsFor(recordId) {
  const out = sql(
    `SELECT notification_type_id, user_id FROM notifications
      WHERE resource_type = 'FieldRecord' AND resource_id = ${quote(recordId)}
      ORDER BY created_at`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [typeId, userId] = line.split('|')
    return { typeId, userId }
  })
}

// ─── UI flows ───────────────────────────────────────────────────────────────

/**
 * The flag dialog's severity <select>.
 *
 * Anchored on 'escalates now' rather than a field label: the severity control
 * carries no <label>, and the surface behind the dialog — the Logs table's Form
 * and Status filters — holds native selects of its own, so a bare
 * `locator('select')` is ambiguous in exactly the situation this is used in.
 */
function severitySelect(page) {
  return page.locator('select').filter({ hasText: 'escalates now' }).first()
}

/**
 * One browser context per persona, shared by every test in a spec file.
 *
 * A fresh context is not free here: it is a brand new IndexedDB, and nothing in
 * this module is readable until the syncEngine has bootstrapped the LogBook /
 * FieldRecord / FormAssignment models into it — ~17s idle, more under recording.
 * Opening one per test per persona spent most of the suite's runtime waiting for
 * the same data to arrive again, and turned any slow moment into a timeout.
 *
 * Reuse is also closer to how the product is actually used: a supervisor keeps a
 * tab open. The one thing it costs is that a row changed BEHIND the browser's
 * back stays stale — but every write these journeys make goes through the audit
 * trigger, so the sync service broadcasts it and the page catches up on its own.
 * `expireEditWindow` is a raw SQL write and is covered by the same trigger.
 *
 *   const pool = createPersonaPool()
 *   test.afterAll(() => pool.close())
 *   const operator = await pool.page(browser, AUTH.logOperator)
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

/**
 * Open one entry's detail overlay and wait for it to be genuinely interactive.
 *
 * `?tab=logs&recordId=<id>` is the product's own deep link — FieldRecordsList
 * reads it in `onMounted` and opens the panel — and it is the ONLY way in: a log
 * entry has no detail route of its own.
 */
export async function openEntry(page, recordId, { firstWaitMs = 60_000, retryWaitMs = 45_000 } = {}) {
  // Anchor on the entry's own number, never on the panel's chrome.
  //
  // The panel renders its shell — 'Record content', and the Amend/Void buttons —
  // BEFORE the record arrives from IndexedDB, because every gate it reads is
  // written to fail open on a null record (`isLockedForEdit` returns true when
  // there is no status; `statusId !== 'VOIDED'` is true of `undefined`). So an
  // empty panel shows exactly the privileged controls a loaded one might hide,
  // and a test that waited on the heading would assert against a record that had
  // not loaded — and pass or fail for reasons that have nothing to do with it.
  const recordNumber = sqlValue(
    `SELECT record_number FROM field_records WHERE id = ${quote(recordId)}`,
  )
  const anchor = recordNumber
    ? page.getByText(recordNumber, { exact: false }).first()
    : page.getByRole('heading', { name: 'Record content' })

  // WAIT LONG, RELOAD ONCE. A reload restarts the syncEngine bootstrap from
  // zero, so an impatient retry loop is actively counter-productive: measured on
  // an idle machine, a fresh context needs ~17s before the first log book is in
  // IndexedDB, and every reload throws that progress away. One generous wait
  // beats four short ones.
  for (const budget of [firstWaitMs, retryWaitMs]) {
    await page.goto(`/inspections-logs?tab=logs&recordId=${recordId}`)
    const ok = await anchor
      .waitFor({ state: 'visible', timeout: budget })
      .then(() => true)
      .catch(() => false)
    if (ok) return
  }
  throw new Error(
    `openEntry: entry ${recordId} (${recordNumber}) never hydrated its detail panel — ` +
      'the shell renders, the record never arrived from IndexedDB',
  )
}

/**
 * Fill and submit a log entry through the real fill page.
 *
 * @param {object} opts
 * @param {object} [opts.book]   one of INSPECTIONS_LOGS.{operations,controlled}
 * @param {object} opts.values   { [fieldLabel]: string } — filled BY LABEL
 * @param {string} opts.submitterId  used to find the created row in SQL
 * @param {string} [opts.assignmentInstanceId]  links + completes a scheduled instance
 * @returns {object} the created field_records row
 *
 * NOT covered here: the "Flag this entry for supervisor review" block on the
 * fill form, which raises a flag in the same breath as the submission. Its
 * notes field is a RichTextAttachments contenteditable rather than a textarea,
 * so driving it needs a different approach than everything else in this file;
 * IL-J5 exercises the same endpoint from the detail panel instead.
 */
export async function submitEntry(
  page,
  { book = INSPECTIONS_LOGS.operations, values, submitterId, assignmentInstanceId = null },
) {
  const before = Number(
    sqlValue(
      `SELECT count(*) FROM field_records
        WHERE log_book_id = ${quote(book.id)} AND submitted_by_user_id = ${quote(submitterId)}`,
    ),
  )

  const query = new URLSearchParams({ logBookId: book.id })
  if (assignmentInstanceId) query.set('assignmentInstanceId', assignmentInstanceId)

  // The dialog auto-selects the book only once it is in IndexedDB, so the first
  // labelled input is the readiness signal, not the page load.
  // Same rule as openEntry: wait long, reload once. The dialog auto-selects the
  // book only once `db.LogBook.where('statusId','ACTIVE')` can see it, which
  // means the bootstrap has to have reached the LogBook model — ~17s on an idle
  // machine, longer while trace and video are recording. Reloading restarts that
  // from scratch, so a short retry loop can spin forever on a page that would
  // have been ready had it been left alone.
  const firstLabel = Object.keys(values)[0]
  let ready = false
  for (const budget of [60_000, 45_000]) {
    await page.goto(`/inspections-logs/fill?${query.toString()}`)
    ready = await page
      .getByLabel(firstLabel)
      .first()
      .waitFor({ state: 'visible', timeout: budget })
      .then(() => true)
      .catch(() => false)
    if (ready) break
  }
  expect(
    ready,
    `fill form for "${book.title}" never rendered — the log book never reached IndexedDB`,
  ).toBeTruthy()

  for (const [label, value] of Object.entries(values)) {
    await page.getByLabel(label).first().fill(String(value))
  }

  // CONTROLLED_RECORD books always require a signature at submit; the operations
  // book never does. The button label is the product's own statement of which.
  const controlled = book.classification === 'CONTROLLED_RECORD'
  await page
    .getByRole('button', { name: controlled ? 'Sign & Submit' : 'Save Record' })
    .click()
  if (controlled) await signWithPin(page)

  await waitForSqlValue(
    `SELECT count(*) > ${before} FROM field_records
      WHERE log_book_id = ${quote(book.id)} AND submitted_by_user_id = ${quote(submitterId)}`,
    { timeoutMs: 30_000, label: 'log entry submitted' },
  )
  return findLatestRecord(book.id, submitterId)
}

/**
 * In-window edit by the record's own submitter (cheap path — no e-signature).
 * Values are keyed by field LABEL, like submitEntry.
 */
export async function editEntry(page, recordId, values) {
  await openEntry(page, recordId)
  await clickWhenReady(page, page.getByRole('button', { name: 'Edit', exact: true }), {
    until: page.getByRole('button', { name: 'Save changes' }),
  })
  for (const [label, value] of Object.entries(values)) {
    await page.getByLabel(label).first().fill(String(value))
  }
  const before = Number(
    sqlValue(`SELECT count(*) FROM field_record_revisions WHERE field_record_id = ${quote(recordId)}`),
  )
  await page.getByRole('button', { name: 'Save changes' }).click()
  await waitForSqlValue(
    `SELECT count(*) > ${before} FROM field_record_revisions WHERE field_record_id = ${quote(recordId)}`,
    { timeoutMs: 30_000, label: 'USER_EDIT revision written' },
  )
}

/**
 * Reviewer decision on an UNDER_REVIEW entry: Approve / Reject → comment →
 * "Continue to sign" → PIN. Both outcomes require a signature server-side.
 */
export async function reviewEntry(page, recordId, outcome, { comment = '' } = {}) {
  const label = outcome === 'APPROVED' ? 'Approve' : 'Reject'
  await openEntry(page, recordId)
  await clickWhenReady(page, page.getByRole('button', { name: label, exact: true }), {
    until: page.getByRole('button', { name: 'Continue to sign' }),
  })
  if (comment) {
    await page.getByPlaceholder('Optional comment for the audit trail').fill(comment)
  }
  await page.getByRole('button', { name: 'Continue to sign' }).click()
  await signWithPin(page)
  await waitForSqlValue(
    `SELECT status_id = ${quote(outcome)} FROM field_records WHERE id = ${quote(recordId)}`,
    { timeoutMs: 30_000, label: `entry ${outcome}` },
  )
}

/** Post-lock amendment: new values + a mandatory reason + a signature. */
export async function amendEntry(page, recordId, { values = {}, comment }) {
  await openEntry(page, recordId)
  await clickWhenReady(page, page.getByRole('button', { name: 'Amend', exact: true }), {
    until: page.getByRole('heading', { name: 'Amend entry' }),
  })
  for (const [label, value] of Object.entries(values)) {
    await page.getByLabel(label).first().fill(String(value))
  }
  await page.getByPlaceholder('Why is this entry being changed? (audit trail)').fill(comment)
  await page.getByRole('button', { name: 'Continue to sign' }).click()
  await signWithPin(page)
  await waitForSqlValue(
    `SELECT count(*) FROM field_record_revisions
      WHERE field_record_id = ${quote(recordId)} AND revision_type = 'ADMIN_AMENDMENT'`,
    { timeoutMs: 30_000, label: 'ADMIN_AMENDMENT revision written' },
  )
}

/** Void: reason + signature. The record stays queryable, status VOIDED. */
export async function voidEntry(page, recordId, reason) {
  await openEntry(page, recordId)
  await clickWhenReady(page, page.getByRole('button', { name: 'Void', exact: true }), {
    until: page.getByRole('heading', { name: 'Void entry' }),
  })
  await page.getByPlaceholder('Why is this entry being voided?').fill(reason)
  await page.getByRole('button', { name: 'Continue to sign' }).click()
  await signWithPin(page)
  await waitForSqlValue(
    `SELECT status_id = 'VOIDED' FROM field_records WHERE id = ${quote(recordId)}`,
    { timeoutMs: 30_000, label: 'entry VOIDED' },
  )
}

/** Raise a flag from the detail panel. Open to any user in the tenant. */
export async function raiseFlag(page, recordId, { severity = 'WARN', notes }) {
  const before = Number(
    sqlValue(`SELECT count(*) FROM field_record_flags WHERE field_record_id = ${quote(recordId)}`),
  )
  await openEntry(page, recordId)
  await clickWhenReady(page, page.getByRole('button', { name: 'Flag', exact: true }), {
    until: page.getByRole('heading', { name: 'Flag this entry' }),
  })
  await severitySelect(page).selectOption(severity)
  await page.getByPlaceholder(/What's wrong with this entry/).fill(notes)
  await page.getByRole('button', { name: 'Raise flag' }).click()
  await waitForSqlValue(
    `SELECT count(*) > ${before} FROM field_record_flags WHERE field_record_id = ${quote(recordId)}`,
    { timeoutMs: 30_000, label: 'flag raised' },
  )
  return flagsOf(recordId)[0]
}

// NO `resolveFlag` HELPER. There is nothing for one to drive: resolving a flag
// on a log book that has a supervisor always fails (IL-D1 — the service closes
// the flag's task with a `RESOLVED` status that is not in
// `task_instance_statuses`, the FK rejects it and the transaction rolls back).
// The Resolve button and its dialog work perfectly; the write behind them does
// not. IL-J5 asserts that refusal at the endpoint instead, and carries the full
// diagnosis. When it is fixed, the helper to add here is: openEntry → Resolve →
// fill 'What action did you take?' → 'Mark resolved' → wait for resolved_at.

/**
 * Close a record's edit window, as the passage of time would.
 *
 * Lock arithmetic is entirely server-side, and the only product path that closes
 * a TIME_WINDOW is the worker's `finalize_field_record_locks` cron — a
 * minute-cadence job that flips SUBMITTED rows whose `lock_at` has passed to
 * LOCKED with reason TIMER (`fieldRecordLockService.finalizeTimeWindowLocks`).
 * Rather than sleep out a two-hour window, this performs the same write, with
 * the same WHERE, and lets the product's own `isLockedForEdit` do the refusing.
 * Nothing about the guard is bypassed — only the clock.
 *
 * BOTH halves matter. Back-dating `lock_at` alone leaves the row SUBMITTED, and
 * the cron then flips it to LOCKED at some point in the next sixty seconds —
 * mid-test, non-deterministically. A journey that asserted the status would
 * pass or fail on where the minute boundary happened to fall. Doing the whole
 * write here settles it up front.
 */
export function expireEditWindow(recordId) {
  // `updated_at` is bumped as well, and not cosmetically: the syncEngine pulls
  // by `updatedAt`, so a row changed behind its back would otherwise never
  // reach a browser that already holds the stale copy.
  sql(
    `UPDATE field_records
        SET lock_at = NOW() - INTERVAL '1 minute',
            lock_reason = 'TIMER',
            status_id = 'LOCKED',
            updated_at = NOW()
      WHERE id = ${quote(recordId)} AND status_id = 'SUBMITTED'`,
  )
}

// ─── REST probes ────────────────────────────────────────────────────────────
//
// Used where the question is whether the SERVER refuses something, not whether
// the interface hides it. `page.request` carries the persona's session cookie.

export async function restPatchRecord(page, recordId, body) {
  return page.request.patch(`/api/v1/services/fieldRecords/${recordId}`, { data: body })
}

export async function restPost(page, path, body) {
  return page.request.post(`/api/v1/services${path}`, { data: body })
}

export async function restPatch(page, path, body) {
  return page.request.patch(`/api/v1/services${path}`, { data: body })
}

/**
 * How many rows an `UPDATE … RETURNING` actually touched, read off psql's
 * command tag.
 *
 * `sqlAsAppUser` reports `ok: false` only when the statement RAISED. An UPDATE
 * that RLS filtered out raises nothing — it succeeds against zero rows — so
 * without this the two very different outcomes "the database refused you" and
 * "the database could not see the row" are indistinguishable, and a probe that
 * only checked `ok` would read a silent no-op as a passing guard.
 */
export function affectedRows(res) {
  const tag = (res.output || '').trim().split('\n').pop() || ''
  const m = tag.match(/^UPDATE (\d+)$/)
  return m ? Number(m[1]) : null
}

/**
 * The message an API error carried.
 *
 * The API's global handler wraps everything as `{ error: { message, code } }`
 * (utils/response.js `sendError`), while a handful of older routes answer with a
 * bare `{ message }`. Returning `json.error` unconditionally hands back an
 * OBJECT for the common case, and `expect(...).toMatch()` then fails with
 * "received value must be a string" instead of the assertion under test — so
 * both shapes are unwrapped down to the string here.
 *
 * MUST be awaited BEFORE the browser context that made the request is closed:
 * closing disposes the response and `res.text()` throws "Response has been
 * disposed".
 */
export async function errorMessage(res) {
  const body = await res.text()
  try {
    const json = JSON.parse(body)
    return json?.error?.message ?? json?.message ?? json?.error ?? body
  } catch {
    return body
  }
}
