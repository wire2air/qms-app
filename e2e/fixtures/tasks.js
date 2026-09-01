// Shared fixtures for the `tasks` project — the assignee inbox.
//
// ── WHY THIS FILE IS MOSTLY ABOUT OTHER MODULES ──────────────────────────────
//
// A task is not a page. There is no `/task-instances/:id` route (see
// `src/utils/taskRoute.js`, which deep-links every row to its HOST entity
// instead), and the inbox is hard-scoped to the signed-in user:
// `taskInstancesTable.vue:24` reads `db.TaskInstance.where('assignedTo', userId)`
// with no "all tasks" toggle and no assignee filter anywhere in the module.
//
// So nothing in this suite can begin with a task. Every journey has to create a
// real host record and drive its workflow far enough to MINT one, then sign in
// as the assignee. That is the whole fixture cost of the module, and it is why
// the helpers below are thin wrappers over `capas.js` and `documents.js` rather
// than anything task-shaped: reproducing those flows here would be a second,
// worse copy of two suites that already work.
//
// Two producers are used, chosen because between them they cover both halves of
// every control this pass changed:
//
//   mintCapaTask()                → entity_type 'Capa',    source_type
//                                   'WorkflowInstanceStep', task_kind 'APPROVAL'
//     The ENGINE's own task. The lifecycle trigger's untrusted clause is drawn
//     exactly around this shape, and the Doc Controller persona holds no `capa`
//     grant at all — which is what makes it the row the read leak released.
//
//   mintCollaboratorTask()        → entity_type 'Document', source_type
//                                   'DocumentCollaborator', task_kind 'REVIEW'
//     The ONE client-writable task left in the product
//     (`DocumentCollaboratorTaskCard.vue`), and the UPDATE policy's single
//     deliberate carve-out. Without it every write probe in t5 would be a
//     refusal, and a policy that had simply been slammed shut would read as a
//     pass.
//
// Both are cheap: the CAPA needs create + Start, the collaborator task needs a
// document and one click. Neither needs `fillAllSections` / `submitForReview`.
import { expect } from '@playwright/test'
import { COMPANY_ID, USERS } from './cast.js'
import { sql, sqlAsAppUser, sqlValue, sqlRow, waitForSqlValue, findCapaByTitle } from './db.js'
import { createCapa, openCapa } from './capas.js'
import { createSopDocument } from './documents.js'

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

/** Unique, greppable tag for one test run. */
export function uniqueTag(prefix) {
  return `${prefix} ${Date.now()}`
}

/**
 * One browser context per persona, reused across the tests in a file.
 *
 * The inbox reads IndexedDB, so every fresh context pays a full syncEngine
 * bootstrap before a single row is readable — and this suite needs three or four
 * personas per file. Pooling keeps that to one bootstrap per persona per file.
 * (Same helper as `inspectionsLogs.js`; kept local so the `tasks` project does
 * not import another module's fixture file for twelve generic lines.)
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

// ── Producers ────────────────────────────────────────────────────────────────

/**
 * Author creates a CAPA and Starts it; the workflow raises step 1's APPROVAL
 * task for the Reviewer (Rita).
 *
 * Returns the CAPA and the task, both read back from the database rather than
 * inferred — the task id is needed by every DB-level probe and by the API-02
 * IDOR journey, and there is no UI that shows it.
 *
 * @param {import('@playwright/test').Page} page  signed in as `author`
 */
export async function mintCapaTask(page, tag) {
  const title = `E2E CAPA ${tag}`
  await createCapa(page, title)
  const capa = findCapaByTitle(title)
  expect(capa, `the CAPA "${title}" must exist before its workflow can raise a task`).toBeTruthy()
  await openCapa(page, capa.id)

  const taskId = await waitForSqlValue(
    `SELECT id FROM task_instances
      WHERE entity_type = 'Capa' AND entity_id = ${q(capa.id)}
        AND assigned_to = ${q(USERS.reviewer.id)}
        AND source_type = 'WorkflowInstanceStep'
        AND status_id IN ('ASSIGNED','FORM_SUBMITTED') AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    { timeoutMs: 60_000, label: `step-1 APPROVAL task on "${title}"` },
  )

  // Pin the shape the trigger's untrusted clause keys on. If a future workflow
  // change stops routing step 1 through WorkflowInstanceStep/APPROVAL, t5's
  // refusals would start passing for the wrong reason — they would be
  // asserting that a guard which no longer applies did not fire.
  const row = taskRow(taskId)
  expect(row.sourceType, 'the engine clause keys on this').toBe('WorkflowInstanceStep')
  expect(row.taskKindId, 'and on this').toBe('APPROVAL')

  return { capaId: capa.id, capaNumber: capa.capaNumber, title, taskId }
}

/**
 * Author creates a document from the seeded SOP template and adds collaborators;
 * the worker raises a REVIEW task per collaborator (JOB-18).
 *
 * This is the whole flow — no section filling, no submit-for-review — because a
 * collaboration task is minted by the join row, not by the approval workflow.
 *
 * @param {import('@playwright/test').Page} page  signed in as `author`
 * @param {{ tag: string, collaborators?: Array<{id: string, name: string}> }} opts
 * @returns {Promise<{ documentId: string, title: string, tasks: Record<string,string> }>}
 *   `tasks` maps a user id to the task id raised for them.
 */
export async function mintCollaboratorTask(page, { tag, collaborators = [USERS.reviewer] }) {
  const title = `E2E TASKDOC ${tag}`
  await createSopDocument(page, title)
  const documentId = sqlValue(
    `SELECT id FROM documents WHERE title = ${q(title)} ORDER BY created_at DESC LIMIT 1`,
  )
  expect(documentId, `the document "${title}" must exist`).toBeTruthy()

  await page.goto(`/documents/${documentId}`)
  const tasks = {}
  for (const user of collaborators) {
    await addCollaborator(page, user.name)
    // The join row is written synchronously by the mutation…
    await waitForSqlValue(
      `SELECT 1 FROM users_on_documents
        WHERE document_id = ${q(documentId)} AND user_id = ${q(user.id)}`,
      { timeoutMs: 20_000, label: `collaborator row for ${user.name}` },
    )
    // …and the worker raises the REVIEW task behind it.
    tasks[user.id] = await waitForSqlValue(
      `SELECT id FROM task_instances
        WHERE entity_type = 'Document' AND entity_id = ${q(documentId)}
          AND assigned_to = ${q(user.id)} AND task_kind_id = 'REVIEW'
          AND source_type = 'DocumentCollaborator' AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
      { timeoutMs: 60_000, label: `collaboration REVIEW task for ${user.name}` },
    )
  }
  return { documentId, title, tasks }
}

/**
 * Open the Collaboration rail card's picker and add one user by display name.
 *
 * The picker is a BasePopover whose rows are plain buttons labelled
 * "First Last" over the email, and clicking one TOGGLES membership — so the
 * popover is reopened for each addition rather than assumed to have stayed open.
 */
export async function addCollaborator(page, name) {
  const trigger = page.getByRole('button', { name: 'Add collaborator' })
  await expect(trigger).toBeVisible({ timeout: 30_000 })
  const option = page.getByRole('button', { name: new RegExp(name, 'i') })
  await expect(async () => {
    if (!(await option.first().isVisible().catch(() => false))) {
      await trigger.click({ timeout: 3_000 })
    }
    await option.first().click({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await page.keyboard.press('Escape').catch(() => {})
}

// ── Database reads (superuser — the record as the regulator would see it) ─────

/** One task row, by id, read past RLS. `null` when it does not exist. */
export function taskRow(taskId) {
  const row = sqlRow(
    `SELECT status_id, completed_at, entity_type, entity_id, source_type, task_kind_id,
            assigned_to, due_date, comment
       FROM task_instances WHERE id = ${q(taskId)}`,
  )
  if (!row) return null
  return {
    statusId: row[0],
    completedAt: row[1] || null,
    entityType: row[2],
    entityId: row[3],
    sourceType: row[4] || null,
    taskKindId: row[5],
    assignedTo: row[6],
    dueDate: row[7] || null,
    comment: row[8] || null,
  }
}

/** Every seeded task status, as the lookup table has them (F-12's denominator). */
export function seededStatuses() {
  const out = sql(`SELECT id, name FROM task_instance_statuses ORDER BY id`)
  if (!out) return []
  return out.split('\n').map((line) => {
    const [id, name] = line.split('|')
    return { id, name }
  })
}

/** Every task row in the E2E tenant, past RLS — the denominator for a leak probe. */
export function tenantTaskCount() {
  return Number(sqlValue(`SELECT count(*) FROM task_instances WHERE company_id = ${q(COMPANY_ID)}`))
}

// ── Database probes (as `app_user` — the untrusted GraphQL role) ──────────────

/**
 * How many task rows this persona can SELECT, optionally narrowed to a set of ids.
 *
 * ⚠ A zero here is a SUCCESSFUL, silent RLS refusal, not an error — which is
 * exactly why no caller of this may assert a zero on its own. Every probe in
 * this suite pairs it with a persona the policy admits, against the same rows,
 * in the same run.
 */
export function visibleTaskCount(user, ids = null) {
  const scope = ids
    ? `AND id IN (${ids.map(q).join(',')})`
    : ''
  const res = sqlAsAppUser(
    `SELECT count(*) FROM task_instances WHERE company_id = ${q(COMPANY_ID)} ${scope};`,
    { userId: user.id, companyId: COMPANY_ID },
  )
  if (!res.ok) throw new Error(`visibleTaskCount failed for ${user.email}: ${res.error}`)
  return Number(res.output.trim().split('\n').pop())
}

/** Can this persona SELECT this one task? */
export function canSee(user, taskId) {
  return visibleTaskCount(user, [taskId]) === 1
}

/**
 * Attempt a write against `task_instances` as the untrusted `app_user` role and
 * report what the database did about it.
 *
 * This is the exact path a hand-rolled GraphQL mutation takes, and it is the
 * only shape that can tell this module's three outcomes apart. A bare row count
 * cannot: RLS denies by affecting ZERO rows, so "0" is equally consistent with
 * "the policy hid the row", "the guard refused" and "the WHERE matched nothing",
 * and only one of those is a fix working. psql also hides the SQLSTATE at the
 * default verbosity, so a test that wants to assert `QMSTI` could otherwise only
 * match on prose a future edit is free to reword.
 *
 * So the statement runs inside a DO block that catches its own failure, records
 * SQLSTATE and ROW_COUNT, and then raises unconditionally. That final raise is
 * load-bearing twice: it is how the two values reach stdout, and it ROLLS THE
 * BLOCK BACK — so a probe that unexpectedly succeeds still leaves the fixture
 * untouched for every assertion after it, and a whole file's worth of write
 * probes can run against one minted task.
 *
 * @returns {{ sqlstate: string, rows: number }}
 *   `NO_ERROR` / 1 — accepted (the row was reachable and every layer allowed it)
 *   `NO_ERROR` / 0 — silent RLS refusal (the row was never admitted)
 *   `QMSTI`    / 0 — the lifecycle trigger refused it
 *   `42501`    / 0 — the UPDATE policy's WITH CHECK refused the resulting row
 */
export function attemptTaskWriteAs(user, statement) {
  const res = sqlAsAppUser(probeBlock(statement), { userId: user.id, companyId: COMPANY_ID })
  return readProbeMarker(`${res.error}${res.output}`, 'attemptTaskWriteAs')
}

/** The self-reporting, self-rolling-back wrapper both probes below run inside. */
function probeBlock(statement) {
  return `DO $probe$
       DECLARE v_state text := 'NO_ERROR'; v_rows int := 0;
       BEGIN
         BEGIN
           ${statement};
           GET DIAGNOSTICS v_rows = ROW_COUNT;
         EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
         END;
         RAISE EXCEPTION 'TI_PROBE state=% rows=%', v_state, v_rows;
       END $probe$;`
}

function readProbeMarker(text, label) {
  const marker = /TI_PROBE state=(\S+) rows=(\d+)/.exec(text)
  if (!marker) {
    throw new Error(`${label} could not read its own probe marker. output=${JSON.stringify(text)}`)
  }
  return { sqlstate: marker[1], rows: Number(marker[2]) }
}

/**
 * The same probe, run as the SUPERUSER — i.e. down the TRUSTED path, the one
 * every REST controller, workflow service and graphile-worker task uses.
 *
 * This is not a convenience. `enforce_task_instance_lifecycle` gates two of its
 * three rules on `v_trusted` (the engine clause and the identity pinning) and
 * deliberately does NOT gate the third: the closed-status graph runs for every
 * caller, because a decision already recorded is not the server's to rewrite
 * either. That distinction is invisible from `app_user`, where the UPDATE
 * policy's USING refuses a closed row before the trigger is ever consulted — so
 * an untrusted probe of "APPROVED cannot go back to ASSIGNED" reports a silent
 * zero and proves only that RLS held. Only this runner reaches the trigger's own
 * answer, and it is the runner that can tell the graph apart from a blanket
 * freeze (APPROVED -> CANCELLED is legal and has happened 50 times in the live
 * trail; APPROVED -> ASSIGNED never has).
 *
 * Rolls back for the same reason and by the same mechanism as
 * `attemptTaskWriteAs` — the unconditional RAISE — which matters more here,
 * since a trusted write that unexpectedly succeeded would otherwise COMMIT.
 */
export function attemptTaskWriteTrusted(statement) {
  // The block always raises, so psql always exits non-zero and `sql` always
  // throws — the marker arrives on stderr. `execFileSync` echoes a child's
  // stderr to the parent, so a PASSING run of a spec that uses this prints
  // `ERROR: TI_PROBE state=… rows=…` lines. That is the probe reporting itself,
  // not a failure. The try is still written both ways
  // rather than as a bare catch: a future change that stopped the block raising
  // would otherwise turn every probe here into a thrown fixture error instead of
  // a readable assertion failure.
  let text
  try {
    text = sql(probeBlock(statement))
  } catch (err) {
    text = `${err.stderr ?? ''}${err.stdout ?? ''}${err.message ?? ''}`
  }
  return readProbeMarker(text, 'attemptTaskWriteTrusted')
}

/**
 * One task id in a given status, assigned to a given user, in the E2E tenant.
 *
 * The write probes need a CLOSED task and there is no cheap way to mint one —
 * closing a task legitimately means driving an e-signed workflow outcome. The
 * tenant has thousands, so a probe reads an existing one instead; `null` when
 * there is none, which every caller asserts against rather than skipping past.
 */
export function findTaskFor(user, statusId) {
  return sqlValue(
    `SELECT id FROM task_instances
      WHERE company_id = ${q(COMPANY_ID)} AND assigned_to = ${q(user.id)}
        AND status_id = ${q(statusId)} AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
  )
}

/**
 * The message the database raised, for the probes that assert on its prose.
 *
 * Wrapped in BEGIN/ROLLBACK rather than run bare. `attemptTaskWriteAs` above
 * gets its rollback for free from its own unconditional RAISE; this one has to
 * ask for it, because a probe that unexpectedly SUCCEEDS would otherwise commit
 * — and the write it is probing is, by construction, the one the module exists
 * to prevent. An explicit transaction keeps a failing assertion from also
 * corrupting the fixture the next assertion reads.
 *
 * Returns '' when nothing was refused, which is itself a failure for every
 * caller here.
 */
export function attemptTaskWriteMessageAs(user, statement) {
  const res = sqlAsAppUser(`BEGIN;\n${statement};\nROLLBACK;`, {
    userId: user.id,
    companyId: COMPANY_ID,
  })
  return res.ok ? '' : res.error
}

// ── UI helpers ───────────────────────────────────────────────────────────────

/**
 * Open the inbox and wait for it to have finished its first IndexedDB read.
 *
 * The list is a live query, not an API response, so an empty table is the
 * legitimate first frame of a loading page AND the failure mode every assertion
 * in this suite is trying to distinguish. Anchoring on the page's own heading is
 * the readiness signal that does not beg the question.
 */
export async function gotoInbox(page) {
  await page.goto('/task-instances')
  await expect(page.getByRole('heading', { name: 'My Tasks' })).toBeVisible({ timeout: 45_000 })
}

/**
 * The inbox's own search box.
 *
 * It is TELEPORTED into the app header (`#main-header-search`), which is why it
 * is located by placeholder and not by proximity to the filter bar — and why
 * F-19/F-20 was invisible for so long. The teleport target has always existed
 * and three other toolbars use it successfully; this one shipped with an EMPTY
 * BODY, so `filters.search` was plumbed through three files to a control that
 * did not exist. The header also hosts GlobalSearch, hence the specific
 * placeholder rather than a generic search locator.
 */
export function inboxSearch(page) {
  return page.getByPlaceholder(/Search tasks by item name or number/i)
}

/**
 * The status filter's combobox trigger.
 *
 * The only eagerly-rendered `role="combobox"` on this page: DataTable's own
 * column filters live inside a closed BasePopover and use menuitemcheckbox, and
 * the layout renders no BaseSelect at all. Callers assert the count so a future
 * toolbar addition fails here rather than silently driving the wrong control.
 */
export function statusFilter(page) {
  return page.getByRole('combobox')
}

/** Open the status filter and pick one option by its rendered label. */
export async function pickStatus(page, label) {
  const combo = statusFilter(page).first()
  const option = page.getByRole('listbox').getByRole('option', { name: label, exact: true })
  await expect(async () => {
    if (!(await option.isVisible().catch(() => false))) {
      await combo.click({ timeout: 3_000 })
    }
    await option.click({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
}

/** Every option label the status filter currently offers. */
export async function statusFilterOptions(page) {
  const combo = statusFilter(page).first()
  const listbox = page.getByRole('listbox')
  await expect(async () => {
    if (!(await listbox.isVisible().catch(() => false))) await combo.click({ timeout: 3_000 })
    await expect(listbox.getByRole('option').first()).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 30_000 })
  const labels = (await listbox.getByRole('option').allTextContents()).map((t) =>
    t.replace(/\s+/g, ' ').trim(),
  )
  await page.keyboard.press('Escape')
  return labels
}

/**
 * The desktop table's row whose TITLE CELL resolves to `title`.
 *
 * ⚠ `hasText` is the wrong filter here, and this is not a style preference — it
 * is the trap this suite walked into on its first run. The title cell renders
 * `getDocument(row)?.title || '—'`, but the SAME link also renders
 * `row.comment` as a subline (taskInstancesTable.vue:1234), and a producer's
 * comment routinely quotes the record's title verbatim — the collaboration task's
 * is "You've been added as a collaborator on <TITLE>. Please review…". So a
 * `hasText` row for a task whose host record the viewer CANNOT READ still
 * matches, on the comment, while the title cell beside it says "—". T3's
 * baseline passed that way and the search assertion four lines later failed,
 * because `filteredInstances` resolves the record properly and drops the row.
 *
 * Matching on an EXACT text node instead means this locator answers the question
 * the assertions think they are asking: did the row resolve its host record?
 * `getByText(title, { exact: true })` matches the title span and not the longer
 * comment sentence that contains it.
 *
 * Use `inboxRowAnywhere` when the row is deliberately being located in spite of
 * an unresolved title — T3's defect probe is the only caller.
 */
export function inboxRow(page, title) {
  return page.getByRole('link').filter({ has: page.getByText(title, { exact: true }) })
}

/**
 * The row matched ANYWHERE in its rendered text — title cell, subtitle or the
 * producer's comment. Deliberately weak: it exists to find a row whose title
 * cell is empty, which is a thing this product does (see T3's DOC-COLLAB-RLS
 * probe). Never use it for an "is the row here" assertion.
 */
export function inboxRowAnywhere(page, text) {
  return page.getByRole('link').filter({ hasText: text })
}

/**
 * Can this persona SELECT this document as the untrusted `app_user` role?
 *
 * The task row's title, its deep link's usefulness and its searchability all
 * depend on the assignee being able to read the HOST record, and `documents_sel`
 * has no `users_on_documents` arm — so a collaboration task is raised for someone
 * the document is invisible to. Probing it here keeps that claim measured rather
 * than asserted, and gives the defect probe its second side (the author, whom the
 * same policy admits, reading the same row in the same run).
 */
export function canReadDocument(user, documentId) {
  const res = sqlAsAppUser(`SELECT count(*) FROM documents WHERE id = ${q(documentId)};`, {
    userId: user.id,
    companyId: COMPANY_ID,
  })
  if (!res.ok) throw new Error(`canReadDocument failed for ${user.email}: ${res.error}`)
  return Number(res.output.trim().split('\n').pop()) === 1
}
