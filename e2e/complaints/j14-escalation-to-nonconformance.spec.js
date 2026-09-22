// CMP-J14 · escalating a Quality Complaint into a nonconformance —
// OQ-06 TC-06-05 / URS-CMP-05.
//
// WHY THIS FILE EXISTS.  §9 scored URS-CMP-05 "Not automated — escalating an
// internal complaint to a nonconformance has no test".  The link between a
// complaint and the NC it raised is the single most inspected relationship in
// complaint handling: it is how a manufacturer shows that a complaint that
// indicated a product problem actually entered the corrective-action system,
// and 21 CFR 820.198(d) hangs off it.
//
// THREE THINGS THIS FILE PINS THAT THE PROTOCOL'S PROSE WARNS ABOUT:
//
//   1. THERE IS NO "CONVERTED" STATUS.  A converted complaint goes to CLOSED,
//      and the record of escalation lives in the `record_links` row, not in a
//      distinct status value.  A dedicated CONVERTED_TO_NC status existed and
//      was deliberately retired as a duplicate of that link.  A reader who
//      looks for one and records a failure is failing a design that was
//      changed on purpose — so this file asserts CLOSED + link, and asserts
//      the retired status is genuinely gone from the vocabulary.
//
//   2. CONVERSION IS ONE-WAY AND ONE-TIME, and the refusal NAMES the
//      complaint.  TC-06-05 describes this in a note but gives it no numbered
//      step, so the protocol never evidences it.  It is the control that stops
//      one complaint spawning several nonconformances.
//
//   3. SEVERAL COMPLAINTS CONVERT INTO ONE NC IN A SINGLE ACTION, with the
//      NC's description pre-filled from all of them.  That is the intended
//      route for "these complaints are one problem" — not converting one and
//      manually linking the rest.
//
// THE RELATION IS `CAUSED`, NOT `CONVERTED` OR `SIMILAR`.  Verified against
// the live `record_links` rows a real conversion writes, not inferred from
// `linkRecords`' default.  `SIMILAR` is what the separate duplicate-complaint
// feature writes; asserting the wrong one would let a regression that
// downgraded a conversion to a mere similarity link pass unnoticed.
import { test, expect } from '@playwright/test'
import { AUTH, USERS } from '../fixtures/cast.js'
import { sql, sqlRow, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import {
  createPersonaPool,
  errorMessage,
  findComplaint,
  restPost,
} from '../fixtures/complaints.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

const PREFIX = 'E2E J14'
const NC_PREFIX = 'E2E J14 NC'
const q = (s) => `'${String(s).replace(/'/g, "''")}'`

// The NC side of a conversion. Resolved from the live DB rather than
// hard-coded ids that a rebuild would invalidate — except the workflow
// version, which convertToNcSchema REQUIRES and which must be the tenant's
// published NCR template ('E2E NCR Review & Approval', e2e-seed.sql).
const COMPANY_ID = 'e2e00001-0000-4000-8000-000000000001'
const SITE_PRIMARY = 'e2e51000-0000-4000-8000-000000000001'
const DEPT_QUALITY = 'e2e7d000-0000-4000-8000-000000000001'

function ncWorkflowVersionId() {
  return sqlValue(
    `SELECT wv.id FROM workflows w JOIN workflow_versions wv ON wv.workflow_id = w.id
      WHERE w.company_id = ${q(COMPANY_ID)} AND w.name = 'E2E NCR Review & Approval'
        AND wv.status_id = 'PUBLISHED' AND wv.is_current = true LIMIT 1`,
  )
}

/**
 * Remove everything this file mints, links first.
 *
 * ORDER MATTERS AND THE REVERSE SILENTLY LEAKS. `record_links` is what carries
 * the conversion lineage, so it must go before either endpoint. And the NCs
 * are deleted by TITLE, not by following the links — a run that died between
 * creating the NC and writing the link would otherwise strand the NC forever.
 */
function purgeJ14() {
  const mine = `SELECT id FROM complaints WHERE subject LIKE ${q(`${PREFIX}%`)}`
  sql(`DELETE FROM record_links WHERE from_id IN (${mine}) OR to_id IN (${mine})`)
  sql(
    `DELETE FROM record_links WHERE to_id IN (SELECT id FROM nonconformances WHERE title LIKE ${q(`${NC_PREFIX}%`)})`,
  )
  sql(
    `DELETE FROM workflow_instances WHERE resource_type = 'Nonconformance'
       AND resource_id IN (SELECT id FROM nonconformances WHERE title LIKE ${q(`${NC_PREFIX}%`)})`,
  )
  sql(`DELETE FROM nonconformances WHERE title LIKE ${q(`${NC_PREFIX}%`)}`)
  sql(`DELETE FROM complaint_records WHERE complaint_id IN (${mine})`)
  sql(`DELETE FROM workflow_instances WHERE resource_type = 'Complaint' AND resource_id IN (${mine})`)
  sql(`DELETE FROM complaints WHERE subject LIKE ${q(`${PREFIX}%`)}`)
}

async function mint(page, subject) {
  const res = await restPost(page, '/complaints', {
    subject,
    description: 'CMP-J14 escalation arm.',
  })
  expect(res.status(), `arrange failed: ${await errorMessage(res)}`).toBe(201)
  return (await res.json()).complaint.id
}

/** The convertToNc body, with every field its zod schema requires. */
function convertBody(complaintIds, title) {
  return {
    complaintIds,
    title,
    siteId: SITE_PRIMARY,
    departmentId: DEPT_QUALITY,
    severityId: 'MINOR',
    detectedAt: '2026-09-22',
    ownerId: USERS.complaintOwner.id,
    workflowVersionId: ncWorkflowVersionId(),
  }
}

/** Conversion links for one complaint: [{ toType, toId, relation }]. */
function linksFrom(complaintId) {
  const out = sql(
    `SELECT to_type, to_id, relation FROM record_links
      WHERE from_type = 'Complaint' AND from_id = ${q(complaintId)} ORDER BY created_at`,
  )
  if (!out) return []
  return out.split('\n').map((l) => {
    const [toType, toId, relation] = l.split('|')
    return { toType, toId, relation }
  })
}

/**
 * One nonconformance's description, collapsed to a single line.
 *
 * `convertToNc` builds it as "Raised from complaint(s):\nCMP-x: subject\n…",
 * so it is genuinely MULTI-LINE — and `sqlValue` returns only psql's FIRST
 * line, which is the bare header with every complaint number stripped off.
 * Read straight, every assertion about which complaints the NC names passes
 * or fails on a string that never contained them.
 */
function ncDescription(ncId) {
  return sqlValue(
    `SELECT replace(coalesce(description, ''), E'\\n', ' ~ ') FROM nonconformances WHERE id = ${q(ncId)}`,
  )
}

test.describe('CMP-J14 · escalation to a nonconformance', () => {
  test.beforeAll(() => purgeJ14())
  test.afterAll(() => purgeJ14())

  test('TC-06-05 steps 1-5 · converting one complaint creates the NC, links it both ways, and CLOSES the complaint', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const page = await pool.page(browser, AUTH.complaintOwner)
    const complaintId = await mint(page, `${PREFIX} single conversion`)
    const before = findComplaint(complaintId)
    expect(before.statusId, 'precondition: the complaint starts OPEN').toBe('OPEN')

    const res = await restPost(
      page,
      '/complaints/convertToNc',
      convertBody([complaintId], `${NC_PREFIX} single`),
    )
    expect(res.status(), `conversion failed: ${await errorMessage(res)}`).toBe(201)
    const nc = (await res.json()).nonconformance

    // Step 2 — the NC is real, and pre-filled from the complaint rather than
    // from the caller's own text (no `description` was sent).
    expect(nc.ncNumber, 'a real NC number was minted').toMatch(/^NC-\d+/)
    expect(nc.statusId, 'the NC lands in DRAFT for the NC owner to open').toBe('DRAFT')
    expect(nc.sourceId, 'and it is stamped as complaint-sourced').toBe('CUSTOMER_COMPLAINT')
    expect(
      ncDescription(nc.id),
      "the NC description is pre-filled from the complaint's number and subject",
    ).toContain(before.complaintNumber)

    // Steps 3 and 4 — the link IS the record of escalation, and it is a single
    // row readable from either end.
    const links = linksFrom(complaintId)
    expect(links, 'exactly one lineage link, not one per direction').toHaveLength(1)
    expect(links[0].toType).toBe('Nonconformance')
    expect(links[0].toId, 'the complaint points at the NC it raised').toBe(nc.id)
    expect(
      links[0].relation,
      "the relation is CAUSED — a conversion, not the separate SIMILAR duplicate-complaint link",
    ).toBe('CAUSED')
    expect(
      sqlValue(
        `SELECT count(*) FROM record_links WHERE to_type = 'Nonconformance' AND to_id = ${q(nc.id)}
            AND from_type = 'Complaint' AND from_id = ${q(complaintId)}`,
      ),
      'and the NC end of the same row names the originating complaint',
    ).toBe('1')

    // Step 5 as reworded by the protocol — the complaint is CLOSED, and there
    // is no "Converted" status to look for.
    const after = findComplaint(complaintId)
    expect(after.statusId, 'converting a complaint closes it').toBe('CLOSED')
    expect(
      sqlValue(`SELECT closed_at IS NOT NULL FROM complaints WHERE id = ${q(complaintId)}`),
      'and stamps the closure date',
    ).toBe('t')
  })

  test('the retired CONVERTED_TO_NC status is genuinely gone from the vocabulary', () => {
    // The protocol's strongest warning: "Do not expect a status such as
    // 'Converted' or 'Escalated'; if you look for one and record a failure,
    // the failure is against a design that was changed on purpose." Pinned
    // here so that re-introducing the status turns this red and forces the
    // protocol note to be revisited, rather than leaving the prose to rot.
    expect(
      sqlValue(`SELECT string_agg(id, ',' ORDER BY id) FROM complaint_statuses`),
      'the vocabulary is the unified four — CONVERTED_TO_NC is not among them',
    ).toBe('CANCELLED,CLOSED,DRAFT,OPEN')
    expect(
      sqlValue(`SELECT count(*) FROM complaints WHERE status_id = 'CONVERTED_TO_NC'`),
      'and no live row still carries it',
    ).toBe('0')
  })

  test('TC-06-05 step 6 · several complaints convert into ONE nonconformance in a single action', async ({
    browser,
  }) => {
    test.setTimeout(150_000)
    const page = await pool.page(browser, AUTH.complaintOwner)
    const first = await mint(page, `${PREFIX} multi A`)
    const second = await mint(page, `${PREFIX} multi B`)
    const firstNumber = findComplaint(first).complaintNumber
    const secondNumber = findComplaint(second).complaintNumber

    const res = await restPost(
      page,
      '/complaints/convertToNc',
      convertBody([first, second], `${NC_PREFIX} multi`),
    )
    expect(res.status(), `multi-conversion failed: ${await errorMessage(res)}`).toBe(201)
    const nc = (await res.json()).nonconformance

    // One NC, two links — "these complaints are one problem".
    expect(
      sqlValue(
        `SELECT count(*) FROM record_links WHERE to_type = 'Nonconformance' AND to_id = ${q(nc.id)}
            AND from_type = 'Complaint'`,
      ),
      'both complaints appear on the same nonconformance',
    ).toBe('2')

    // Each one closed. Asserted per-complaint rather than as a count, so a
    // half-applied transaction is localisable.
    expect(findComplaint(first).statusId, 'the first complaint closed').toBe('CLOSED')
    expect(findComplaint(second).statusId, 'the second closed too').toBe('CLOSED')

    const description = ncDescription(nc.id)
    expect(description, "the NC description is pre-filled from the FIRST complaint").toContain(
      firstNumber,
    )
    expect(description, '…and from the SECOND — from all of them, not just the first').toContain(
      secondNumber,
    )
  })

  test('the one-time conversion guard: an already-escalated complaint is refused, and the refusal names it', async ({
    browser,
  }) => {
    test.setTimeout(150_000)
    const page = await pool.page(browser, AUTH.complaintOwner)
    const complaintId = await mint(page, `${PREFIX} one-time guard`)
    const number = findComplaint(complaintId).complaintNumber

    const first = await restPost(
      page,
      '/complaints/convertToNc',
      convertBody([complaintId], `${NC_PREFIX} guard first`),
    )
    expect(first.status(), `arrange failed: ${await errorMessage(first)}`).toBe(201)
    const ncBefore = Number(
      sqlValue(`SELECT count(*) FROM nonconformances WHERE title LIKE ${q(`${NC_PREFIX}%`)}`),
    )

    const second = await restPost(
      page,
      '/complaints/convertToNc',
      convertBody([complaintId], `${NC_PREFIX} guard second`),
    )
    expect(
      second.status(),
      'a second conversion of the same complaint is refused — one complaint, one nonconformance',
    ).toBe(409)
    expect(
      await errorMessage(second),
      'and the refusal NAMES the complaint, so the user knows which one to look at',
    ).toContain(number)

    // The refusal is atomic: the whole convertToNc body runs in one
    // transaction and the guard fires before the NC is minted, so a refused
    // second attempt must leave no orphan NC behind.
    expect(
      Number(
        sqlValue(`SELECT count(*) FROM nonconformances WHERE title LIKE ${q(`${NC_PREFIX}%`)}`),
      ),
      'the refused attempt minted no nonconformance at all',
    ).toBe(ncBefore)
    expect(
      linksFrom(complaintId),
      'and the complaint still carries exactly one lineage link',
    ).toHaveLength(1)
  })

  test('TC-06-05 step 7 · the escalation is recorded in the audit trail, attributed and with the NC named', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const page = await pool.page(browser, AUTH.complaintOwner)
    const complaintId = await mint(page, `${PREFIX} audit trail`)
    const res = await restPost(
      page,
      '/complaints/convertToNc',
      convertBody([complaintId], `${NC_PREFIX} audit`),
    )
    expect(res.status(), `conversion failed: ${await errorMessage(res)}`).toBe(201)
    const nc = (await res.json()).nonconformance

    // CONTROLLER-written, therefore SYNCHRONOUS and ATTRIBUTED: convertToNc
    // calls db.AuditLog.create inside its own transaction, so the row exists
    // by the time the 201 returns and carries a real performed_by. (The
    // TRIGGER-written twin under entity_type 'Complaints' is the async
    // graphile_worker one — never assert a performer on those. J16 covers it
    // behind a barrier.)
    const row = sqlRow(
      `SELECT action, coalesce(performed_by::text,'NULL'), new_value_json::text
         FROM audit_logs
        WHERE entity_type = 'Complaint' AND entity_id = ${q(complaintId)}
          AND action = 'CONVERT_TO_NC' ORDER BY performed_at DESC LIMIT 1`,
    )
    expect(row, 'the escalation left an entry on the complaint').not.toBeNull()
    expect(row[1], 'attributed to the person who escalated it').toBe(USERS.complaintOwner.id)

    // Postgres renders jsonb WITH a space after the colon, so never
    // string-match serialised jsonb — parse it.
    const payload = JSON.parse(row[2])
    expect(payload.ncId, 'the entry names the nonconformance it raised').toBe(nc.id)
    expect(payload.ncNumber, 'by number as well as by id').toBe(nc.ncNumber)

    // The NC end of the same escalation carries its own CREATE entry naming
    // where it came from — so the lineage is recoverable from the trail alone
    // even if `record_links` were lost.
    await waitForSqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'Nonconformance'
          AND entity_id = ${q(nc.id)} AND action = 'CREATE'`,
      { timeoutMs: 30_000, label: 'the NC CREATE audit entry' },
    )
    const ncEntry = sqlValue(
      `SELECT new_value_json::text FROM audit_logs
        WHERE entity_type = 'Nonconformance' AND entity_id = ${q(nc.id)} AND action = 'CREATE'
        ORDER BY performed_at DESC LIMIT 1`,
    )
    const ncPayload = JSON.parse(ncEntry)
    expect(
      ncPayload.convertedFrom?.map((c) => c.complaintId),
      "the NC's own creation entry names the complaint it was converted from",
    ).toContain(complaintId)
  })

  test('escalation needs complaints:update — a read-only zero-grant persona is refused at the route', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const owner = await pool.page(browser, AUTH.complaintOwner)
    const complaintId = await mint(owner, `${PREFIX} denial target`)

    const denied = await pool.page(browser, AUTH.noAccess)
    const res = await restPost(
      denied,
      '/complaints/convertToNc',
      convertBody([complaintId], `${NC_PREFIX} denied`),
    )
    expect(
      res.status(),
      'convertToNc is gated on complaints:update — a zero-grant persona never reaches the controller',
    ).toBe(403)
    expect(findComplaint(complaintId).statusId, 'and the complaint stayed OPEN').toBe('OPEN')
    expect(linksFrom(complaintId), 'with no link written').toHaveLength(0)
  })
})
