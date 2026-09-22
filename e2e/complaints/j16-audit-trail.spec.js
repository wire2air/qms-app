// CMP-J16 · the internal Quality Complaint's audit trail —
// OQ-06 TC-06-08 / URS-CMP-08.
//
// WHY THIS FILE EXISTS.  §9 scored URS-CMP-08 "Not automated — the internal
// complaint's audit history has no test", and the coverage document's own
// summary names the audit trail as the weakest family in the product's
// evidence: the mechanism is well covered, but only for two record types.
// This is a third.
//
// TWO WRITERS, TWO CONTRACTS — GETTING THIS WRONG IS THE WHOLE TRAP.
// `complaints` produces audit rows under TWO entity_type spellings, and they
// behave differently:
//
//   • 'Complaint'  (SINGULAR) — written by the CONTROLLERS with
//     db.AuditLog.create inside the request's own transaction. SYNCHRONOUS
//     (the row exists the moment the 2xx returns) and ATTRIBUTED
//     (performed_by is the caller). These carry the SEMANTIC actions —
//     CREATE, ACCEPT, CLOSE, CONVERT_TO_NC, CANCEL.
//   • 'Complaints' (PLURAL) — written by the `complaints_audit_trigger`, which
//     enqueues a graphile_worker `audit_event` job. ASYNCHRONOUS, so it needs
//     a barrier, and it is the only writer that carries OLD vs NEW values.
//
// So TC-06-08 step 2 ("inspect an update entry — old and new values shown")
// can only be satisfied by the PLURAL rows, and step 4 ("each entry carries
// performer and timestamp") has to be read against both. Never assert a
// performer on a trigger row without first checking the run actually set the
// GUC — this file asserts the timestamp unconditionally and the performer only
// where the writer guarantees one.
//
// THE PER-RECORD DIALOG READS BOTH SPELLINGS, AND THAT MATTERS.  CAPA carries
// an open defect (D9, URS-CAP-10) where the per-record dialog omits entries
// written under the other spelling — the trail is complete but the UI view of
// it is not. QaComplaintsPageId.vue queries BOTH 'Complaint' and 'Complaints',
// so complaints do not have CAPA's defect. That is asserted here so a
// regression that dropped one query would be caught as the same class of bug.
//
// `audit_logs` IS IMMUTABLE (trigger `audit_logs_immutable`) — nothing in this
// file deletes or updates a row in it, including in cleanup. The complaints
// this file mints are purged; their trail entries stay, which is the point.
import { test, expect } from '@playwright/test'
import { AUTH, USERS } from '../fixtures/cast.js'
import { sql, sqlValue, sqlAsAppUser, waitForSqlValue } from '../fixtures/db.js'
import { createPersonaPool, errorMessage, findComplaint, restPost } from '../fixtures/complaints.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

const PREFIX = 'E2E J16'
const COMPANY_ID = 'e2e00001-0000-4000-8000-000000000001'
const q = (s) => `'${String(s).replace(/'/g, "''")}'`

function purgeJ16() {
  const mine = `SELECT id FROM complaints WHERE subject LIKE ${q(`${PREFIX}%`)}`
  sql(`DELETE FROM record_links WHERE from_id IN (${mine}) OR to_id IN (${mine})`)
  sql(`DELETE FROM complaint_records WHERE complaint_id IN (${mine})`)
  sql(`DELETE FROM workflow_instances WHERE resource_type = 'Complaint' AND resource_id IN (${mine})`)
  sql(`DELETE FROM complaints WHERE subject LIKE ${q(`${PREFIX}%`)}`)
  // audit_logs is deliberately untouched — see this file's header.
}

async function mint(page, subject, body = {}) {
  const res = await restPost(page, '/complaints', { subject, ...body })
  expect(res.status(), `arrange failed: ${await errorMessage(res)}`).toBe(201)
  return (await res.json()).complaint.id
}

/**
 * Trail entries for one complaint under BOTH entity_type spellings.
 *
 * `new_value_json` is fetched as text and parsed by the caller — Postgres
 * renders jsonb WITH a space after each colon, so string-matching a
 * serialised payload is a trap. Multi-line values would break the
 * newline-per-row parsing, so the json is collapsed with a regex-safe
 * replacement of newlines before it leaves psql.
 */
function trail(complaintId) {
  const out = sql(
    `SELECT entity_type, action, coalesce(performed_by::text,''),
            performed_at IS NOT NULL,
            replace(coalesce(new_value_json::text,'{}'), E'\\n', ' '),
            replace(coalesce(old_value_json::text,'{}'), E'\\n', ' ')
       FROM audit_logs WHERE entity_id = ${q(complaintId)}
        AND entity_type IN ('Complaint','Complaints')
      ORDER BY performed_at, id`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [entityType, action, performedBy, hasTimestamp, newJson, oldJson] = line.split('|')
    return {
      entityType,
      action,
      performedBy: performedBy || null,
      hasTimestamp: hasTimestamp === 't',
      newValue: JSON.parse(newJson),
      oldValue: JSON.parse(oldJson),
    }
  })
}

test.describe('CMP-J16 · the complaint audit trail', () => {
  test.beforeAll(() => purgeJ16())
  test.afterAll(() => purgeJ16())

  test('TC-06-08 step 1 · intake is recorded — by the controller, attributed, naming the complaint number', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const page = await pool.page(browser, AUTH.complaintOwner)
    const subject = `${PREFIX} intake`
    const id = await mint(page, subject, { batchLotSerial: 'LOT-J16-0001' })
    const number = findComplaint(id).complaintNumber

    // The CONTROLLER row is synchronous — inside createComplaint's own
    // transaction — so no barrier is needed and an attribution assertion is
    // legitimate here.
    const controllerRow = trail(id).find((e) => e.entityType === 'Complaint' && e.action === 'CREATE')
    expect(controllerRow, 'intake left a CREATE entry on the complaint').toBeTruthy()
    expect(controllerRow.performedBy, 'attributed to the person who logged it').toBe(
      USERS.complaintOwner.id,
    )
    expect(controllerRow.hasTimestamp, 'and carries a timestamp').toBeTruthy()
    expect(
      controllerRow.newValue.complaintNumber,
      'the entry names the number the complaint was issued',
    ).toBe(number)

    // The TRIGGER row is ASYNCHRONOUS (graphile_worker `audit_event`) — it
    // needs a barrier, and reading it straight after the 201 is
    // indistinguishable from "the worker has not caught up yet".
    await waitForSqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'Complaints'
          AND entity_id = ${q(id)} AND action = 'CREATE'`,
      { timeoutMs: 60_000, label: 'the trigger-written CREATE row' },
    )
    const triggerRow = trail(id).find((e) => e.entityType === 'Complaints' && e.action === 'CREATE')
    expect(
      triggerRow.newValue.subject,
      'the trigger row carries the field-level snapshot the controller row does not',
    ).toBe(subject)
    expect(
      triggerRow.newValue.statusId,
      'including the status the complaint was born in',
    ).toBe('OPEN')
    expect(
      triggerRow.newValue.reportabilityStatus !== undefined,
      'and the regulatory decision fields — the ones an inspector reads first',
    ).toBeTruthy()
    expect(triggerRow.hasTimestamp, 'trigger rows carry a timestamp too').toBeTruthy()

    // KNOWN GAP — the trail is FIELD-SCOPED, and the scope is narrower than
    // the record. `worker/services/audit/registry/modules/complaints.js`
    // enumerates 22 tracked fields, deliberately, and the product/customer
    // identifiers are not among them: the lot reference, the product, the
    // quantity affected and the complainant's name and contact detail all
    // change WITHOUT leaving a trail entry. Those are exactly the fields
    // 21 CFR 820.198(e)(2) and (e)(3) require a complaint record to hold, so
    // a late correction to a lot number or a complainant's name is not
    // traceable. The registry file's own header records that this module had
    // no owning registry at all until 2026-09-08 and tracked only status;
    // this is the remainder of that gap.
    //
    // Pinned as current behaviour, not asserted as a control: if the registry
    // is widened, this turns red and URS-CMP-08 can be re-scored.
    for (const field of [
      'batchLotSerial',
      'productId',
      'quantityAffected',
      'customerName',
      'customerEmail',
    ]) {
      expect(
        triggerRow.newValue[field],
        `KNOWN GAP: ${field} is not an audit-tracked field on complaints — changes to it leave no trail entry`,
      ).toBeUndefined()
    }
  })

  test('TC-06-08 step 2 · an update entry shows OLD and NEW values, field by field', async ({
    browser,
  }) => {
    test.setTimeout(150_000)
    const page = await pool.page(browser, AUTH.complaintOwner)
    const id = await mint(page, `${PREFIX} field diff`, { disposition: 'Under review' })
    await waitForSqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'Complaints' AND entity_id = ${q(id)} AND action = 'CREATE'`,
      { timeoutMs: 60_000, label: 'the CREATE trigger row, so the UPDATE below is unambiguous' },
    )

    // Written over the SyncEngine path (app_user), which is how a QA reviewer
    // actually edits a complaint's classification — the REST surface has no
    // update route at all, only action RPCs.
    const write = sqlAsAppUser(
      `UPDATE complaints SET disposition = 'Replace and credit', safety_issue = true
         WHERE id = ${q(id)} RETURNING id;`,
      { userId: USERS.complaintOwner.id, companyId: COMPANY_ID },
    )
    expect(write.ok, `arrange failed: ${write.error}`).toBeTruthy()
    expect(write.output, 'the edit really landed').toContain(id)

    await waitForSqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'Complaints'
          AND entity_id = ${q(id)} AND action = 'UPDATE'`,
      { timeoutMs: 60_000, label: 'the trigger-written UPDATE row' },
    )
    const update = trail(id).find((e) => e.entityType === 'Complaints' && e.action === 'UPDATE')
    expect(update, 'the edit left an UPDATE entry').toBeTruthy()

    // The diff is field-scoped: only what CHANGED appears, on both sides.
    expect(update.oldValue.disposition, 'the entry shows the value before the change').toBe(
      'Under review',
    )
    expect(update.newValue.disposition, 'and the value after it').toBe('Replace and credit')
    expect(update.oldValue.safetyIssue, 'the safety flag before').toBe(false)
    expect(update.newValue.safetyIssue, 'and after').toBe(true)
    expect(
      Object.keys(update.newValue).sort(),
      'and nothing else — the diff carries only the columns that actually moved',
    ).toEqual(['disposition', 'safetyIssue'])
  })

  test('TC-06-08 steps 1+3 · the QA review, the investigation decision and its justification are traceable in the trail', async ({
    browser,
  }) => {
    test.setTimeout(150_000)
    const page = await pool.page(browser, AUTH.complaintOwner)
    const id = await mint(page, `${PREFIX} review traceability`)
    await waitForSqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'Complaints' AND entity_id = ${q(id)} AND action = 'CREATE'`,
      { timeoutMs: 60_000, label: 'the CREATE trigger row' },
    )

    const write = sqlAsAppUser(
      `UPDATE complaints
          SET investigation_required = false,
              investigation_waived_reason = 'J16 — isolated cosmetic issue, no product impact',
              review_summary = 'J16 — QA reviewed, no investigation warranted'
        WHERE id = ${q(id)} RETURNING id;`,
      { userId: USERS.complaintOwner.id, companyId: COMPANY_ID },
    )
    expect(write.ok, `arrange failed: ${write.error}`).toBeTruthy()

    await waitForSqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'Complaints'
          AND entity_id = ${q(id)} AND action = 'UPDATE'
          AND new_value_json ? 'investigationWaivedReason'`,
      { timeoutMs: 60_000, label: 'the waiver decision reaching the trail' },
    )
    const entry = trail(id)
      .filter((e) => e.entityType === 'Complaints' && e.action === 'UPDATE')
      .find((e) => 'investigationWaivedReason' in e.newValue)

    // Both halves of the regulated decision — the decision itself AND the
    // reason — are in one entry, so a reviewer reading the trail can see not
    // only that an investigation was declined but why.
    expect(entry.newValue.investigationRequired, 'the decision is traceable').toBe(false)
    expect(entry.newValue.investigationWaivedReason, 'and so is its justification').toContain(
      'no product impact',
    )
    expect(
      entry.oldValue.investigationWaivedReason,
      'with the prior (absent) value shown alongside, so a late justification is visible as a late change',
    ).toBeNull()
  })

  test('TC-06-08 step 1 · escalation and closure both appear, with the trail attributing every controller entry', async ({
    browser,
  }) => {
    test.setTimeout(150_000)
    const page = await pool.page(browser, AUTH.complaintOwner)
    const id = await mint(page, `${PREFIX} lifecycle events`)

    // Escalation is the cheapest lifecycle event that both writes a semantic
    // CONTROLLER entry and closes the complaint — one call exercises the two
    // lifecycle moments TC-06-08 step 1 asks for.
    const ncVersion = sqlValue(
      `SELECT wv.id FROM workflows w JOIN workflow_versions wv ON wv.workflow_id = w.id
        WHERE w.company_id = ${q(COMPANY_ID)} AND w.name = 'E2E NCR Review & Approval'
          AND wv.status_id = 'PUBLISHED' AND wv.is_current = true LIMIT 1`,
    )
    const res = await restPost(page, '/complaints/convertToNc', {
      complaintIds: [id],
      title: `${PREFIX} NC for the trail`,
      siteId: 'e2e51000-0000-4000-8000-000000000001',
      departmentId: 'e2e7d000-0000-4000-8000-000000000001',
      severityId: 'MINOR',
      detectedAt: '2026-09-22',
      ownerId: USERS.complaintOwner.id,
      workflowVersionId: ncVersion,
    })
    expect(res.status(), `arrange failed: ${await errorMessage(res)}`).toBe(201)
    const ncId = (await res.json()).nonconformance.id

    const entries = trail(id)
    const actions = entries.filter((e) => e.entityType === 'Complaint').map((e) => e.action)
    expect(actions, 'intake is in the trail').toContain('CREATE')
    expect(actions, 'and so is the escalation').toContain('CONVERT_TO_NC')

    // Step 4 — EVERY controller-written entry carries a performer and a
    // timestamp. Trigger entries are excluded from the performer half by
    // design (they are written by the worker, and a run that did not set the
    // GUC leaves them NULL); their timestamp is still asserted.
    for (const entry of entries.filter((e) => e.entityType === 'Complaint')) {
      expect(
        entry.performedBy,
        `the controller-written ${entry.action} entry names who did it`,
      ).toBe(USERS.complaintOwner.id)
      expect(entry.hasTimestamp, `and when — ${entry.action}`).toBeTruthy()
    }
    for (const entry of entries) {
      expect(entry.hasTimestamp, `every entry is timestamped — ${entry.entityType}/${entry.action}`)
        .toBeTruthy()
    }

    // Closure via escalation lands as CLOSED on the record, and the status
    // change itself is in the trigger-written diff — so the trail evidences
    // the closure independently of the semantic entry.
    expect(findComplaint(id).statusId).toBe('CLOSED')
    await waitForSqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'Complaints'
          AND entity_id = ${q(id)} AND action = 'UPDATE'
          AND new_value_json ->> 'statusId' = 'CLOSED'`,
      { timeoutMs: 60_000, label: 'the CLOSED status change reaching the trail' },
    )
    // Cleanup for this test's NC, so purgeJ16's title-based sweep is not the
    // only thing standing between a failed run and an orphan.
    sql(`DELETE FROM record_links WHERE to_id = ${q(ncId)}`)
    sql(`DELETE FROM nonconformances WHERE id = ${q(ncId)}`)
  })

  test('TC-06-08 step 5 · no audit entry can be edited or deleted — at the trigger and at the privilege layer', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const page = await pool.page(browser, AUTH.complaintOwner)
    const id = await mint(page, `${PREFIX} immutability`)
    const entryId = sqlValue(
      `SELECT id FROM audit_logs WHERE entity_type = 'Complaint' AND entity_id = ${q(id)} LIMIT 1`,
    )
    expect(entryId, 'the intake entry exists to try to tamper with').toBeTruthy()

    // The trigger, probed as the SUPERUSER — the strongest possible caller.
    // If even that is refused, no application path can succeed.
    const tamper = (statement) => {
      try {
        sql(statement)
        return { ok: true, error: '' }
      } catch (err) {
        return { ok: false, error: `${err.stderr ?? err.message ?? ''}` }
      }
    }
    const updated = tamper(
      `UPDATE audit_logs SET action = 'TAMPERED' WHERE id = ${q(entryId)}`,
    )
    expect(updated.ok, 'an audit entry cannot be edited, even by the superuser').toBeFalsy()
    const deleted = tamper(`DELETE FROM audit_logs WHERE id = ${q(entryId)}`)
    expect(deleted.ok, 'nor deleted').toBeFalsy()

    expect(
      sqlValue(`SELECT action FROM audit_logs WHERE id = ${q(entryId)}`),
      'and the entry is exactly as it was written',
    ).toBe('CREATE')

    // The same refusal on the untrusted (app_user) path, which is the one an
    // application caller actually has.
    const asAppUser = sqlAsAppUser(
      `DELETE FROM audit_logs WHERE id = ${q(entryId)};`,
      { userId: USERS.complaintOwner.id, companyId: COMPANY_ID },
    )
    expect(
      sqlValue(`SELECT count(*) FROM audit_logs WHERE id = ${q(entryId)}`),
      `app_user cannot delete the entry either (${asAppUser.error})`,
    ).toBe('1')
  })

  test('the trail BUTTON needs audit_trail:read, but the trail ROWS do not — the row-level policy has a module-read fallback', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const page = await pool.page(browser, AUTH.complaintOwner)
    const id = await mint(page, `${PREFIX} trail grant`)

    // OQ-06 §5 lists as untested: "Audit Trail read is a separate grant from
    // Complaints read. TC-06-08 assumes the reviewer can open the trail; a
    // complaints-only grant cannot." MEASURED, that claim is half right, and
    // the half that is wrong is the half an executor would rely on.
    //
    // The premise first: complaintOwner holds every complaints action at
    // TENANT scope and no audit_trail grant at all.
    expect(
      sqlValue(
        `SELECT count(*) FROM authz.role_module_permissions rmp
           JOIN roles_on_users ru ON ru.role_id = rmp.role_id
          WHERE ru.user_id = ${q(USERS.complaintOwner.id)} AND rmp.module_id = 'audit_trail'`,
      ),
      'the persona holding every complaints action holds no audit_trail grant',
    ).toBe('0')

    // THE ROWS ARE READABLE ANYWAY. `audit_log_select_rls` is a three-way OR:
    // company-owner bypass, OR authz.has_permission('audit_trail','read'), OR
    // the entity_type belongs to a module the caller may READ. Both complaint
    // spellings resolve through `audit_entity_types` / `_aliases` to the
    // `complaints` module, so complaints:read admits a complaint's own trail.
    const rows = sqlAsAppUser(`SELECT count(*) FROM audit_logs WHERE entity_id = ${q(id)};`, {
      userId: USERS.complaintOwner.id,
      companyId: COMPANY_ID,
    })
    expect(
      Number(rows.output.trim().split('\n').pop()),
      'a complaints:read holder CAN read this complaint’s trail rows — the module-read fallback admits them',
    ).toBeGreaterThan(0)

    // …and both spellings come through that fallback, which is what makes the
    // per-record view complete rather than half-blind.
    for (const spelling of ['Complaint', 'Complaints']) {
      const seen = sqlAsAppUser(
        `SELECT count(*) FROM audit_logs WHERE entity_id = ${q(id)} AND entity_type = ${q(spelling)};`,
        { userId: USERS.complaintOwner.id, companyId: COMPANY_ID },
      )
      expect(
        Number(seen.output.trim().split('\n').pop()),
        `the ${spelling} spelling resolves to the complaints module and is admitted`,
      ).toBeGreaterThan(0)
    }

    // The pair that stops the numbers above reading as "the policy is simply
    // open": a persona with NEITHER grant sees nothing at all.
    const stranger = sqlAsAppUser(`SELECT count(*) FROM audit_logs WHERE entity_id = ${q(id)};`, {
      userId: USERS.noAccess.id,
      companyId: COMPANY_ID,
    })
    expect(
      stranger.output.trim().split('\n').pop(),
      'a zero-grant persona sees none of it — the fallback is a module grant, not an open door',
    ).toBe('0')

    // THE BUTTON IS STILL GATED, and that is where OQ-06 §5's claim comes
    // from. QaComplaintsPageId.vue offers the "Audit log" action only to
    // `isAllowed(['audit_trail:read'])` — so a complaints-only reviewer is
    // never OFFERED the trail even though the policy would serve it. The
    // executor's observation ("I cannot open the trail") is correct; the
    // stated reason ("the policy refuses me") is not, and it matters because
    // it is the difference between a data control and an affordance.
    await page.goto(`/complaints/${id}`)
    await expect(
      page.getByLabel('Details').getByText(findComplaint(id).complaintNumber, { exact: false }).first(),
    ).toBeVisible({ timeout: 45_000 })
    await expect(
      page.getByRole('button', { name: 'Audit log', exact: true }),
      'the Audit log action is not offered to a complaints-only holder — the UI gate, not the policy',
    ).toHaveCount(0)

    // And the per-record dialog, when it IS offered, reads BOTH spellings —
    // so complaints do not carry CAPA's D9 (URS-CAP-10), where the dialog
    // omits entries written under the other spelling and the trail looks
    // incomplete while the table is fine. Asserted against the source,
    // because the claim is about which queries exist.
    const { execFileSync } = await import('node:child_process')
    const source = execFileSync(
      'git',
      ['show', 'HEAD:src/components/qaComplaints/QaComplaintsPageId.vue'],
      { cwd: process.cwd(), encoding: 'utf8' },
    )
    expect(
      source,
      "the per-record trail view reads the CONTROLLER spelling ('Complaint')",
    ).toContain("entityType: 'Complaint'")
    expect(
      source,
      "…and the TRIGGER spelling ('Complaints') too — no CAPA-D9-shaped omission here",
    ).toContain("entityType: 'Complaints'")
  })
})
