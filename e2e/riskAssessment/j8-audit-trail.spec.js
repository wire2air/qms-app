// RA-J8 — TC-08-06 (URS-RSK-06): the audit trail of the assessment.
//
// WHY THIS FILE EXISTS. §11 of the coverage doc scores URS-RSK-06 "Not
// automated — No audit-trail assertion exists for this module." It is the only
// row in the section with NO automated evidence at all, and it is the row that
// three other test cases lean on: TC-08-03 step 7 and TC-08-05 steps 4 and 5
// each answer "what stops a tamper?" with "the audit trail captures it". If
// that claim is untested, those notes are assertions about nothing. This file
// is the evidence they rest on.
//
// ── THE CLAIM WAS ONCE FALSE, WHICH IS THE POINT ───────────────────────────
// backend/worker/services/audit/registry/modules/riskAssessment.js exists
// because it was. Before that file, `risk_assessments` fell through to
// DEFAULT_CONFIG, whose trackFields are
// ['statusId','stateId','name','title','code'] — and `risk_assessments` has
// NONE of those five columns. So hasRelevantChanges() discarded every UPDATE
// before an audit_logs row was written, and INSERT/DELETE recorded a bare
// {id}. Its header says so in as many words: docs/modules/risk-assessment/
// 11-security-review.md §2 leaned on "the change is captured by the audit
// trigger (TBL-02 has full row-level coverage)" and "there was no coverage of
// any kind for UPDATE, full or otherwise."
//
// A silent regression of that registry file would put the module straight back
// there, with every mitigation note in OQ-08 still reading as if it held. That
// is what this file guards.
//
// ── THE CHAIN IS ASYNCHRONOUS, WHICH SHAPES EVERY ASSERTION ────────────────
// `risk_assessments_audit_trigger` (AFTER INSERT OR UPDATE OR DELETE) does NOT
// write audit_logs. It builds a payload and calls
// graphile_worker.add_job('audit_event', …); backend/worker/tasks/
// audit_event.js is what INSERTs the row. So every assertion here is a POLL
// barrier, never a bare read — the discipline products/j10 and complaints/j9
// established, for the same reason: a straight read races the queue and fails
// intermittently, which is worse than not testing it.
//
// And the trigger fills user_id from current_setting('app.current_user_id'),
// which is NULL on any connection that never set the GUC — the documented
// shape for a trigger-written row, and the reason audit_event.js's G-03 note
// establishes NULL as this codebase's non-user actor.
//
// MEASURED, THIS TABLE IS BETTER THAN THAT, and step 3 asserts the better
// behaviour: the derivation runs inside the REST request's transaction, whose
// connection `requireCompanyAccess` has already stamped with the GUC, so
// CREATE and UPDATE rows here are FULLY ATTRIBUTED to the assessor. (The
// PURGE deletes this suite's own cleanup performs are the unattributed ones —
// they run as the superuser from psql — which is why step 3 asserts the
// performer on the CREATE row specifically rather than on every row.)
//
// ── TWO SPELLINGS, FOLDED THROUGH THE CANONICAL FUNCTION ───────────────────
// Trigger rows get entity_type from toPascalCase(table) -> 'RiskAssessments'
// (PLURAL). Migration 20260918020740 seeds the alias
// ('RiskAssessments','RiskAssessment','TRIGGER') precisely because both
// spellings occur across the platform, and audit_canonical_entity_type() folds
// one onto the other. Matching through that function rather than pinning one
// literal keeps this file honest if the spelling is ever consolidated.
//
// ── audit_logs IS IMMUTABLE — INCLUDING FOR THIS FILE'S CLEANUP ────────────
// `audit_logs_immutable` refuses UPDATE and DELETE. Nothing below deletes or
// rewrites an audit row, in a test or in cleanup; the CAPAs these journeys
// mint are swept by the project's own purge step, and their audit rows stay
// where they belong. TC-08-06 step 4 asserts that refusal rather than working
// around it.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, RISK_ASSESSMENT, USERS } from '../fixtures/cast.js'
import { findCapaByTitle, sql, sqlAsAppUser, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import { createCapa, uniqueTitle, openCapa } from '../fixtures/capas.js'
import { clickWhenReady } from '../fixtures/documents.js'
import {
  waitForRiskAssessment,
  purgeRiskAssessment,
  LOW_CELL,
} from '../fixtures/riskAssessment.js'

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`

/**
 * The cell these journeys score. High x Severe = 9, band High — the
 * highest-risk corner of the seeded 3x3 matrix (e2e-seed.sql §44b).
 *
 * Named locally rather than imported as HIGH_CELL because the shared helper
 * that consumes HIGH_CELL does not actually select it. See
 * `driveRiskReviewToApproved` below for the row-locator defect and why this
 * file drives the widget itself.
 */
const SCORED_CELL = { likelihood: 'High', severity: 'Severe', riskLevel: 'High', rpn: 9 }

/**
 * Audit rows for one risk assessment, newest first, matched through
 * audit_canonical_entity_type() so BOTH spellings count. See the header.
 *
 * `old_value_json` / `new_value_json` are fetched by a SEPARATE call
 * (auditPayload below) because a justification can contain a newline and
 * sqlRow() reads only out.split('\n')[0] — a multi-line value would silently
 * truncate the row parse. This query returns single-line columns only.
 */
function auditRows(raId, { since = null } = {}) {
  const out = sql(
    `SELECT id, action, COALESCE(performed_by::text, ''), performed_at
       FROM audit_logs
      WHERE audit_canonical_entity_type(entity_type) = audit_canonical_entity_type('RiskAssessments')
        AND entity_id = ${quote(raId)}
        ${since ? `AND performed_at >= ${quote(since)}` : ''}
      ORDER BY performed_at DESC, created_at DESC`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [id, action, performedBy, performedAt] = line.split('|')
    // `sqlValue` returns '' for SQL NULL, so normalise it to null here rather
    // than letting an empty string read as a real (falsy-but-present) actor.
    return { id, action, performedBy: performedBy || null, performedAt }
  })
}

/**
 * One audit row's before/after payloads, parsed.
 *
 * Postgres renders jsonb WITH a space after ':' and ',', so these are PARSED,
 * never string-matched against a serialized form.
 */
function auditPayload(auditId) {
  const out = sql(
    `SELECT COALESCE(old_value_json, 'null'::jsonb)::text || E'\\n---\\n' ||
            COALESCE(new_value_json, 'null'::jsonb)::text
       FROM audit_logs WHERE id = ${quote(auditId)}`,
  )
  if (!out) return { old: null, new: null }
  const [oldRaw, newRaw] = out.split('\n---\n')
  const parse = (s) => {
    try {
      return JSON.parse(s)
    } catch {
      return null
    }
  }
  return { old: parse(oldRaw), new: parse(newRaw) }
}

/** `NOW()` as a psql-castable string — the barrier every audit poll starts from. */
function now() {
  return sqlValue('SELECT NOW()::text')
}

/**
 * A CAPA on the dedicated Risk Assessment workflow with a derived
 * risk_assessments row.
 *
 * Arranged per test, never shared: Playwright discards the worker after a
 * failing test and runs its pending afterAll, so a file-level fixture turns
 * one failure into a cascade of missing-precondition failures.
 */
async function arrangeAssessment(browser, tag, cell = SCORED_CELL) {
  const ctxAuthor = await browser.newContext({ storageState: AUTH.author })
  const authorPage = await ctxAuthor.newPage()
  const title = uniqueTitle(tag)
  await createCapa(authorPage, title, { workflowName: RISK_ASSESSMENT.workflowName })
  const capa = findCapaByTitle(title)
  expect(capa, 'the CAPA landed in Postgres').not.toBeNull()
  purgeRiskAssessment(capa.id)
  await openCapa(authorPage, capa.id)
  await ctxAuthor.close()

  const ra = await driveRiskReviewToApproved(browser, capa.id, cell)
  expect(ra, 'a risk_assessments row was derived').not.toBeNull()
  return { capaId: capa.id, ra }
}

/**
 * Drive the reviewer's Risk Review step to APPROVED, and WAIT for it.
 *
 * ── WHY NOT fixtures/riskAssessment.js#completeRiskReviewStep ─────────────
 * That helper clicks "Mark Complete" and then immediately calls
 * `ctx.close()`. Closing a browser context ABORTS whatever request is still
 * in flight, and COMPLETE_AND_ADVANCE is a slow one — it runs the derivation
 * service, the approval chain and the notification enqueue inside a single
 * transaction. Under a loaded stack (measured here with five other Playwright
 * projects running) the close consistently won that race:
 *
 *     task_instances.status_id = ASSIGNED   (never actioned)
 *     capa_records.payload…computedScore = 6   (the draft DID save)
 *
 * i.e. the cell was scored and finalized correctly, the form was persisted,
 * and the step was simply never completed — so rcaRaDerivationService never
 * ran and no risk_assessments row was ever going to appear. Waiting longer
 * for the row cannot fix that, and neither can re-driving it the same way;
 * both were tried and both timed out at 90s.
 *
 * So this version keeps the page OPEN until the task is observably APPROVED,
 * and only then closes the context. Same clicks, same product path — the
 * difference is purely that it does not hang up mid-request.
 *
 * Also uses a row-label-anchored cell selector, because the shared
 * `selectMatrixCell` matches the likelihood row by any text in the row and
 * every cell renders a band label from the same vocabulary — see RA-J6's
 * header for the full write-up. Both are reported, not patched: the fixture
 * is in concurrent use by j1-j5 and by other agents.
 */
async function driveRiskReviewToApproved(browser, capaId, cell) {
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE entity_type = 'Capa' AND entity_id = ${quote(capaId)}
        AND assigned_to = ${quote(USERS.reviewer.id)} AND status_id IN ('ASSIGNED','FORM_SUBMITTED')`,
    { timeoutMs: 60_000, label: 'reviewer task assigned' },
  )
  const ctx = await browser.newContext({ storageState: AUTH.reviewer })
  const page = await ctx.newPage()
  try {
    await page.goto(`/capas/${capaId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})

    // Pick the cell by its ROW LABEL cell, not by "a row containing this text".
    const table = page
      .locator('table')
      .filter({ has: page.getByText('Likelihood', { exact: false }) })
      .first()
    // RiskAssessmentField reads the template's `config` out of IndexedDB via
    // useLiveQueryWithDeps, so the widget renders its header (and even the
    // Matrix picker, already showing the template NAME) before the grid
    // exists. Under a loaded stack that bootstrap can outlast a single 30s
    // wait — measured here as a bare "element(s) not found" on the table
    // while the rest of the step card was fully drawn. A reload re-runs the
    // query against whatever has since synced, which is cheaper and far more
    // reliable than one longer wait.
    await expect(async () => {
      if (!(await table.isVisible().catch(() => false))) {
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
      }
      await expect(table).toBeVisible({ timeout: 30_000 })
    }).toPass({ timeout: 120_000 })
    const rows = table.locator('tbody tr')
    let rowIndex = -1
    for (let i = 0, n = await rows.count(); i < n; i += 1) {
      const label = (await rows.nth(i).locator('td').first().innerText()).trim()
      if (new RegExp(`^${cell.likelihood}\\b`).test(label)) {
        rowIndex = i
        break
      }
    }
    expect(rowIndex, `likelihood row "${cell.likelihood}" exists`).toBeGreaterThanOrEqual(0)
    const headers = table.locator('thead th')
    let colIndex = -1
    for (let i = 1, n = await headers.count(); i < n; i += 1) {
      if (new RegExp(`^${cell.severity}\\b`).test((await headers.nth(i).innerText()).trim())) {
        colIndex = i
        break
      }
    }
    expect(colIndex, `severity column "${cell.severity}" exists`).toBeGreaterThan(0)
    await rows.nth(rowIndex).locator('td').nth(colIndex).click()
    await expect(
      page.getByText(new RegExp(`${cell.likelihood}\\s*×\\s*${cell.severity}`)),
      `the widget confirms ${cell.likelihood} × ${cell.severity} is selected`,
    ).toBeVisible({ timeout: 15_000 })

    // Mark Complete saves, submits AND completes (autoApprove step).
    await clickWhenReady(page, page.getByRole('button', { name: 'Mark Complete' }))

    // THE BARRIER the shared helper is missing: stay on the page until the
    // server has actually actioned the task.
    //
    // Scoped to the NEWEST task on the step, not "any APPROVED task on it".
    // A send-back re-opens the step with a FRESH task while the previously
    // approved one stays APPROVED, so an unscoped count would be satisfied by
    // the stale row and let the re-score race ahead of its own approval.
    await waitForSqlValue(
      `SELECT (status_id = 'APPROVED')::int FROM task_instances ti
        WHERE ti.source_type = 'WorkflowInstanceStep'
          AND ti.source_id = (
            SELECT wis.id FROM workflow_instance_steps wis
              JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
             WHERE wi.resource_type = 'Capa' AND wi.resource_id = ${quote(capaId)}
               AND wis.name = ${quote(RISK_ASSESSMENT.step1Name)}
             ORDER BY wis.created_at DESC LIMIT 1)
          AND ti.deleted_at IS NULL AND ti.status_id <> 'CANCELLED'
        ORDER BY ti.created_at DESC LIMIT 1`,
      { timeoutMs: 120_000, label: 'risk review step APPROVED' },
    )
  } finally {
    await ctx.close()
  }
  return waitForRiskAssessment(capaId, { timeoutMs: 60_000 })
}

test.describe('RA-J8 · TC-08-06 audit trail of the risk assessment', () => {
  test('step 1 — creating the assessment writes an audit entry carrying the SCORES, not a bare {id}', async ({
    browser,
  }) => {
    test.setTimeout(300_000)
    const { ra } = await arrangeAssessment(browser, 'RA-J8-create')

    await expect
      .poll(() => auditRows(ra.id).length, {
        timeout: 60_000,
        message: 'the async audit_event job wrote a CREATE row for the derived assessment',
      })
      .toBeGreaterThan(0)

    const rows = auditRows(ra.id)
    const created = rows.find((r) => r.action === 'CREATE')
    expect(created, 'the derivation is recorded as a CREATE').toBeTruthy()
    expect(created.performedAt, 'with a timestamp').toBeTruthy()

    // The regression this whole file guards: DEFAULT_CONFIG would record a
    // bare {id} here, because risk_assessments has none of its five
    // trackFields. The module registry's trackFields are what put the
    // calculation in the trail.
    const { new: after } = auditPayload(created.id)
    expect(after, 'the CREATE row carries a payload').toBeTruthy()
    expect(
      Object.keys(after).length,
      'NOT a bare {id} — the pre-registry defect recorded exactly that',
    ).toBeGreaterThan(1)
    expect(after.computedRiskLevelLabel, 'the VERDICT is in the trail').toBe(SCORED_CELL.riskLevel)
    expect(after.computedScore, 'and so is the RPN').toBe(SCORED_CELL.rpn)
    expect(after.likelihoodLabel, 'and the INPUTS that must reproduce it').toBe(SCORED_CELL.likelihood)
    expect(after.severityLabel).toBe(SCORED_CELL.severity)
    expect(after.likelihoodScore * after.severityScore, 'which do reproduce it').toBe(
      after.computedScore,
    )
    expect(after.assessmentType, 'the FRAME — initial vs residual').toBe('INITIAL')
    expect(after.riskAssessmentTemplateId, 'which matrix was in force').toBe(
      RISK_ASSESSMENT.template.id,
    )
    expect(after.resourceId, 'and the LINKAGE to the assessed record').toBeTruthy()
    expect(after.createdBy, 'the assessor is recorded ON THE ROW, tracked as a field').toBe(
      USERS.reviewer.id,
    )

    // hazardCategoryColor is deliberately NOT tracked (presentational — a
    // re-theme must not generate rows in a GxP trail). Pin the exclusion so a
    // future widening of trackFields is a deliberate decision, not a drift.
    expect(
      Object.prototype.hasOwnProperty.call(after, 'hazardCategoryColor'),
      'the presentational swatch stays OUT of the trail, by design',
    ).toBe(false)
  })

  test('step 2 — a score change records BOTH the previous and the new value', async ({
    browser,
  }) => {
    test.setTimeout(300_000)
    const { ra } = await arrangeAssessment(browser, 'RA-J8-change', LOW_CELL)
    expect(ra.computedScore, 'arranged at the Low cell').toBe(LOW_CELL.rpn)

    // Wait for the CREATE row first, so the UPDATE poll below cannot latch
    // onto it and pass for the wrong reason.
    await expect
      .poll(() => auditRows(ra.id).some((r) => r.action === 'CREATE'), { timeout: 60_000 })
      .toBe(true)

    const since = now()

    // The change is made through the SAME path TC-08-05 step 4's note
    // describes — a capa:update holder rewriting the row outside the
    // interface. That is the exact tamper 11-security-review.md §2 names
    // ("change a HIGH-risk CAPA to read LOW", here in reverse), and the whole
    // reason the trail has to carry before-and-after.
    const res = sqlAsAppUser(
      `UPDATE public.risk_assessments
          SET computed_risk_level_label = ${quote(SCORED_CELL.riskLevel)},
              computed_score = ${SCORED_CELL.rpn},
              likelihood_label = ${quote(SCORED_CELL.likelihood)},
              likelihood_score = 3
        WHERE id = ${quote(ra.id)};`,
      { userId: USERS.reviewer.id, companyId: COMPANY_ID },
    )
    expect(res.ok, `the capa:update holder's write succeeded: ${res.error}`).toBe(true)

    await expect
      .poll(() => auditRows(ra.id, { since }).some((r) => r.action === 'UPDATE'), {
        timeout: 60_000,
        message:
          'an UPDATE audit row exists — this is the assertion the pre-registry defect would fail, because hasRelevantChanges() discarded every update to this table',
      })
      .toBe(true)

    const updated = auditRows(ra.id, { since }).find((r) => r.action === 'UPDATE')
    const { old: before, new: after } = auditPayload(updated.id)

    expect(before, 'the PREVIOUS value is recorded').toBeTruthy()
    expect(after, 'and the NEW value alongside it').toBeTruthy()
    expect(before.computedScore, 'previous RPN').toBe(LOW_CELL.rpn)
    expect(after.computedScore, 'new RPN').toBe(SCORED_CELL.rpn)
    expect(before.computedRiskLevelLabel, 'previous band').toBe(LOW_CELL.riskLevel)
    expect(after.computedRiskLevelLabel, 'new band').toBe(SCORED_CELL.riskLevel)
    expect(before.likelihoodLabel, 'previous input label').toBe(LOW_CELL.likelihood)
    expect(after.likelihoodLabel, 'new input label').toBe(SCORED_CELL.likelihood)

    // An UPDATE row carries ONLY the changed tracked fields (buildAuditValues
    // filters to changedKeys), so the untouched severity must be absent from
    // both halves — that is what makes the diff readable rather than a
    // full-row dump an executor has to compare by eye.
    expect(
      Object.prototype.hasOwnProperty.call(after, 'severityLabel'),
      'the untouched axis is NOT in the diff — an UPDATE row is a diff, not a snapshot',
    ).toBe(false)
    expect(
      Object.keys(before).sort(),
      'both halves describe the SAME field set, so every "previous" has its "new"',
    ).toEqual(Object.keys(after).sort())
  })

  test('step 3 — every entry carries a timestamp, and the performer is recorded where the product carries it', async ({
    browser,
  }) => {
    test.setTimeout(300_000)
    const { capaId, ra } = await arrangeAssessment(browser, 'RA-J8-performer')

    await expect
      .poll(() => auditRows(ra.id).some((r) => r.action === 'CREATE'), { timeout: 60_000 })
      .toBe(true)

    for (const row of auditRows(ra.id)) {
      expect(row.performedAt, `every entry is timestamped (${row.action})`).toBeTruthy()
    }

    // THE PERFORMER. This file was first written expecting performed_by =
    // NULL here — the documented shape for a trigger-written row, because
    // `audit_trigger()` reads current_setting('app.current_user_id') and a
    // connection that never set the GUC yields NULL (audit_event.js's G-03
    // note, which establishes NULL as this codebase's non-user actor).
    //
    // MEASURED, IT IS BETTER THAN THAT. The derivation runs inside the
    // REST request's transaction, and `requireCompanyAccess` sets the GUC on
    // that connection — so the enqueued payload carries the real user and the
    // CREATE row is fully attributed. Asserted as the product actually
    // behaves, which is also the stronger claim TC-08-06 step 3 asks for.
    const created = auditRows(ra.id).find((r) => r.action === 'CREATE')
    expect(
      created.performedBy,
      'the CREATE entry names the assessor who scored it — performed_by is populated, not NULL',
    ).toBe(USERS.reviewer.id)

    // Belt and braces: `createdBy` is ALSO a tracked field on the payload, so
    // the entry stays attributable even if the GUC were ever lost on this
    // path. Both halves are asserted because they have independent failure
    // modes — the GUC is request plumbing, the column is registry config.
    const { new: after } = auditPayload(created.id)
    expect(
      after.createdBy,
      'and the assessor is independently recorded in the audit payload as a tracked field',
    ).toBe(USERS.reviewer.id)

    // And the assessed record's own trail — where the protocol tells the
    // executor to look ("the Risk Assessment entries appear in the audit trail
    // of the assessed record") — is attributed normally, because the CAPA's
    // own writes go through the request path that DOES set the GUC.
    await expect
      .poll(
        () =>
          sqlValue(
            `SELECT count(*) FROM audit_logs
              WHERE audit_canonical_entity_type(entity_type) = audit_canonical_entity_type('Capas')
                AND entity_id = ${quote(capaId)} AND performed_by IS NOT NULL`,
          ),
        { timeout: 60_000, message: 'the assessed record carries attributed entries' },
      )
      .not.toBe('0')
  })

  test('step 4 — no audit entry can be edited or deleted, at the database itself', async ({
    browser,
  }) => {
    test.setTimeout(300_000)
    const { ra } = await arrangeAssessment(browser, 'RA-J8-immutable')

    await expect
      .poll(() => auditRows(ra.id).some((r) => r.action === 'CREATE'), { timeout: 60_000 })
      .toBe(true)
    const created = auditRows(ra.id).find((r) => r.action === 'CREATE')

    // The seal is a trigger, so it binds the superuser too — not merely a
    // revoked grant that a privileged connection would sail past. Assert its
    // presence AND its effect; the presence alone would pass against a
    // trigger whose body had been emptied.
    expect(
      sqlValue(
        `SELECT count(*) FROM pg_trigger
          WHERE tgrelid = 'audit_logs'::regclass AND NOT tgisinternal
            AND tgname = 'audit_logs_immutable'`,
      ),
      'the immutability trigger is attached',
    ).toBe('1')

    // UPDATE, as the untrusted app_user role PostGraphile runs every GraphQL
    // request at.
    const upd = sqlAsAppUser(
      `UPDATE public.audit_logs SET action = 'CREATE_BUT_NICER' WHERE id = ${quote(created.id)};`,
      { userId: USERS.reviewer.id, companyId: COMPANY_ID },
    )
    expect(upd.ok, 'editing an audit entry is REJECTED, not silently filtered').toBe(false)
    expect(upd.error).toMatch(/immutab|permission denied|cannot be (modified|updated)/i)

    // DELETE.
    const del = sqlAsAppUser(`DELETE FROM public.audit_logs WHERE id = ${quote(created.id)};`, {
      userId: USERS.reviewer.id,
      companyId: COMPANY_ID,
    })
    expect(del.ok, 'deleting an audit entry is REJECTED too').toBe(false)
    expect(del.error).toMatch(/immutab|permission denied|cannot be deleted/i)

    // And the row is still there, unchanged — the assertion that actually
    // proves it, since a refused statement could in principle have been a
    // partial write.
    const still = auditRows(ra.id).find((r) => r.id === created.id)
    expect(still, 'the entry survives both attempts').toBeTruthy()
    expect(still.action, 'with its action untouched').toBe('CREATE')
  })

  test('the registry that makes all of the above possible is still wired — risk_assessments is NOT on DEFAULT_CONFIG', async ({
    browser,
  }) => {
    test.setTimeout(300_000)
    // A behavioural check, not a file read: the distinguishing symptom of the
    // pre-registry defect is that an UPDATE touching only untracked columns
    // produces NO row while an UPDATE touching a tracked one DOES. Under
    // DEFAULT_CONFIG *every* update to this table produced nothing, because
    // none of its five trackFields exist here. So one tracked-column update
    // that yields a row is the discriminator — and `justification` is the
    // right column to use: it is named explicitly in 11-security-review.md §2
    // as tamperable and is in no other module's default list.
    const { ra } = await arrangeAssessment(browser, 'RA-J8-registry')
    await expect
      .poll(() => auditRows(ra.id).some((r) => r.action === 'CREATE'), { timeout: 60_000 })
      .toBe(true)

    const since = now()
    const reworded = `E2E RA-J8 reworded justification ${Date.now()}`
    const res = sqlAsAppUser(
      `UPDATE public.risk_assessments SET justification = ${quote(reworded)} WHERE id = ${quote(ra.id)};`,
      { userId: USERS.reviewer.id, companyId: COMPANY_ID },
    )
    expect(res.ok, `the write succeeded: ${res.error}`).toBe(true)

    await expect
      .poll(() => auditRows(ra.id, { since }).some((r) => r.action === 'UPDATE'), {
        timeout: 60_000,
        message:
          'rewording the justification alone produces an audit row — under DEFAULT_CONFIG it would produce none, which is the defect the registry module closed',
      })
      .toBe(true)

    const row = auditRows(ra.id, { since }).find((r) => r.action === 'UPDATE')
    const { new: after } = auditPayload(row.id)
    expect(after.justification, 'the reworded text itself is in the trail').toBe(reworded)
  })
})
