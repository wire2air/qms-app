// PW-J15 · URS-NCR-07 — the CAPA-required gate cleared by LINKING A CAPA,
// not by unsetting the flag.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE EXISTS.
//
// §6 scored URS-NCR-07 *Partial* against `j3-approve-close-gates-esign.spec.js`
// with the note "gate clears by unsetting the flag; linking an actual CAPA is
// untested". That is an accurate description of j3, and it is a real hole: j3
// sets `capaRequired = true`, watches the gate refuse, then sets it back to
// `false` and moves on. Every assertion it makes is about the flag. The
// requirement is about the CAPA.
//
// The difference is not pedantic. The gate's whole job is to stop an NC closing
// with an unfulfilled corrective action, and "turn the requirement off" is the
// one way of satisfying it that leaves the corrective action unfulfilled. A
// suite that only ever exercises that path would stay green if the linked-CAPA
// branch were deleted outright.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT "LINKED" MEANS HERE, AND WHY IT IS NOT `record_links`.
//
// This is the thing to get right before writing any assertion, and reading the
// gate rather than the docs is what settles it —
// backend/api/controllers/nonconformances.js, gate 4 of markNcComplete:
//
//     if (nc.capaRequired === true) {
//       const linkedCapas = await db.Capa.count({
//         where: { sourceType: 'NC', sourceId: ncId, companyId },
//       })
//       if (linkedCapas === 0) throw new ConflictError(
//         'CAPA required is set to Yes — create at least one linked CAPA first.')
//     }
//
// The link is the `capas.source_type` / `capas.source_id` column PAIR. It is
// NOT `record_links`, NOT a `capas.nonconformance_id` column and NOT a
// `nonconformances.spawned_capa_id` column — neither of the latter two exists
// (verified with \d). The frontend agrees, keying the same live query on
// `[sourceType+sourceId]` (NonconformancesPageId.vue:130).
//
// That matters because `record_links` ALSO carries NC→CAPA lineage:
// `createCapaRecord` (services/ncCapaCreateService.js) writes the source
// columns AND calls `linkRecords({ fromType: 'Nonconformance', … })`. Two
// stores, one relationship, and only one of them is load-bearing for the gate.
// The last test pins exactly that divergence, because it is the kind of thing
// that reads as redundancy until the day the two disagree.
//
// ─────────────────────────────────────────────────────────────────────────────
// TWO PATHS TO A LINKED CAPA, AND BOTH ARE COVERED.
//
//   • the ATOMIC one — `POST /v1/services/nonconformances/raise` with
//     `createCapa: true`, which mints NC + 8D CAPA in one transaction and sets
//     `capaRequired` from the same flag (controllers/nonconformances.js:319).
//     `j10` already pins that the CAPA commits with a real status; what it does
//     NOT ask is whether the CAPA it created actually satisfies the gate. It
//     does, and that is asserted here.
//   • the SEPARATE one — raise a plain NC, set `capaRequired = true`, then
//     create a CAPA carrying `sourceType: 'NC'` / `sourceId`. This is the path
//     the NC detail page's "Create CAPA" button drives (it pushes
//     `/capas/create?ncId=<id>`, which CapasCreate.vue reads into those two
//     fields), and it is the one a person actually walks when a CAPA turns out
//     to be needed after the fact.
//
// Both arms assert the gate at the SERVER, not at the tooltip. The UI computed
// mirrors the check and disables the button, but a disabled button is not a
// control — `expectMarkCompleteRejected` posts the real endpoint and demands
// the 409.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID, DEPARTMENTS, ESIGN_PIN, FIXTURES, SITES, USERS } from '../fixtures/cast.js'
import {
  raiseNc,
  fillDisposition,
  expectMarkCompleteRejected,
  uniqueTitle,
} from '../fixtures/nonconformances.js'
import { findNcByTitle, sql, sqlRow, sqlValue, waitForSqlValue } from '../fixtures/db.js'

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

function publishedVersionOf(workflowName) {
  return sqlValue(
    `SELECT wv.id FROM workflow_versions wv
       JOIN workflows w ON w.id = wv.workflow_id
      WHERE w.company_id = ${q(COMPANY_ID)} AND w.name = ${q(workflowName)}
        AND wv.status_id = 'PUBLISHED' AND wv.is_current = true AND wv.deleted_at IS NULL
      ORDER BY wv.version_major DESC, wv.version_minor DESC LIMIT 1`,
  )
}

/** CAPAs the gate would count for this NC — the source-column pair, nothing else. */
function gateCountFor(ncId) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM capas
        WHERE company_id = ${q(COMPANY_ID)} AND source_type = 'NC' AND source_id = ${q(ncId)}
          AND deleted_at IS NULL`,
    ),
  )
}

/**
 * Clear the NC's workflow so GATE 4 is the gate under test.
 *
 * THE GATES ARE ORDERED, AND THE ORDER IS THE WHOLE REASON THIS HELPER EXISTS.
 * `markNcComplete` evaluates open-steps → disposition → notes → CAPA → cost and
 * returns on the FIRST failure. A fresh NC has two open steps, so every probe
 * against it comes back "2 workflow steps still open" whatever the CAPA flag
 * says — a CAPA-gate test written without this would be asserting the
 * open-steps gate while believing it had proven something about CAPAs. That is
 * not hypothetical: the first draft of this file did exactly that.
 *
 * WHY cancelStep AND NOT "complete the steps like j3 does". `raiseNc` drives
 * the create wizard's reviewer-picker dialog, whose auto-selection routes BOTH
 * steps of `E2E NCR Review & Approval` to the CREATOR in this tenant — measured,
 * not assumed: the step-1 task lands on `author@e2e.test`, not on Rita. So
 * `completeReviewerStep`, which waits for a task assigned to `USERS.reviewer`,
 * waits forever. (The REST `/raise` shortcut takes the role-expansion path
 * instead and DOES route to Rita, which is why the second test in this file
 * needs none of this.)
 *
 * `cancelStep` is a real owner-side product route, it is the cheapest honest way
 * to make every step terminal, and it is arrange rather than assertion — j2 and
 * j3 own the "steps are completed properly" journeys. The same reasoning and
 * the same route are used by `complaints/j15`'s `reachApprovalGate`.
 */
async function clearWorkflowSteps(page, ncId) {
  const instanceId = sqlValue(
    `SELECT id FROM workflow_instances
      WHERE resource_type = 'Nonconformance' AND resource_id = ${q(ncId)}
      ORDER BY created_at DESC LIMIT 1`,
  )
  expect(instanceId, 'the NC workflow instantiated').toBeTruthy()

  const stepIds = (
    sqlValue(
      `SELECT string_agg(id::text, ',' ORDER BY step_number)
         FROM workflow_instance_steps
        WHERE workflow_instance_id = ${q(instanceId)}
          AND status_id NOT IN ('APPROVED','SKIPPED','CANCELLED')`,
    ) || ''
  )
    .split(',')
    .filter(Boolean)

  for (const stepId of stepIds) {
    const res = await page.request.post(
      `/api/v1/services/nonconformances/${ncId}/cancelStep`,
      { data: { workflowInstanceStepId: stepId } },
    )
    expect(
      res.status(),
      `arrange: cancelStep ${stepId} — ${await res.text().catch(() => '')}`,
    ).toBe(200)
  }

  await waitForSqlValue(
    `SELECT (count(*) = 0)::text FROM workflow_instance_steps
      WHERE workflow_instance_id = ${q(instanceId)}
        AND status_id NOT IN ('APPROVED','SKIPPED','CANCELLED')`,
    { timeoutMs: 30_000, label: 'every NC workflow step is terminal' },
  )
}

test.describe('PW-J15 · URS-NCR-07 — the CAPA-required gate and a REAL linked CAPA', () => {
  test.use({ storageState: AUTH.author })

  test('the gate refuses while capaRequired is Yes with nothing linked, and CREATING A LINKED CAPA clears it — the flag is never touched', async ({ page }) => {
    test.setTimeout(300_000)

    // ── ARRANGE. A plain NC, no CAPA, flag off.
    const title = uniqueTitle('J15-link')
    await raiseNc(page, title)
    const nc = findNcByTitle(title)
    expect(nc.statusId).toBe('OPEN')
    expect(gateCountFor(nc.id), 'precondition: nothing is linked yet').toBe(0)

    // Clear gate 1 so the CAPA gate is the one that answers (see the helper).
    await clearWorkflowSteps(page, nc.id)
    await page.reload({ waitUntil: 'domcontentloaded' })

    // Satisfy the gates that sit AHEAD of gate 4 in the controller's order
    // (disposition, then notes), so the 409 this test reads back is
    // unambiguously the CAPA one and not a disposition one wearing its clothes.
    // `Use As Is` is picked deliberately: it does NOT track cost, so gate 5
    // stays satisfied and cannot mask gate 4's clearing at the end.
    await fillDisposition(page, nc.id, { disposition: FIXTURES.ncrDispositionNoCost })
    await fillDisposition(page, nc.id, {
      notes: 'E2E J15 — dispositioned so the CAPA gate is the only one left.',
    })

    // ── THE GATE ARMS. Flip capaRequired on through the same inline autosave a
    // person uses, and wait for it to land before probing.
    await fillDisposition(page, nc.id, { capaRequired: true })
    await waitForSqlValue(
      `SELECT count(*) FROM nonconformances WHERE id = ${q(nc.id)} AND capa_required = true`,
      { timeoutMs: 15_000, label: 'capaRequired=true persisted' },
    )

    await expectMarkCompleteRejected(
      page,
      nc.id,
      /capa required is set to yes.*create at least one linked capa/i,
    )
    expect(
      sqlValue(`SELECT status_id FROM nonconformances WHERE id = ${q(nc.id)}`),
      'the refused close moved nothing',
    ).toBe('OPEN')

    // ── A DECOY, and it is the point of this test. A CAPA that exists, belongs
    // to the tenant and is perfectly real — but whose source columns do not
    // name this NC — must NOT satisfy the gate. Without this arm, an assertion
    // that "the gate cleared after a CAPA was created" would pass against a
    // gate that merely counted CAPAs.
    const decoy = await page.request.post('/api/v1/services/capas', {
      data: {
        title: `E2E J15 decoy CAPA ${Date.now()}`,
        description: 'PW-J15 — a real CAPA that is NOT linked to the NC under test.',
        siteId: SITES.primary.id,
        departmentId: DEPARTMENTS.quality.id,
        typeId: 'CORRECTIVE',
        // `sourceType` is REQUIRED by createCapaSchema and FK'd to
        // `capa_sources`. INTERNAL_OBSERVATION is the deliberate choice: the
        // decoy must be a real CAPA that is NOT NC-sourced, and picking 'NC'
        // with a null sourceId would make it a near-miss whose failure mode is
        // harder to read.
        sourceType: 'INTERNAL_OBSERVATION',
        priorityId: 'MEDIUM',
        initiatedAt: new Date().toISOString(),
        ownerId: USERS.author.id,
        workflowVersionId: publishedVersionOf('E2E CAPA Review & Approval'),
      },
    })
    expect(decoy.status(), `decoy CAPA create — ${await decoy.text().catch(() => '')}`).toBe(200)
    expect(gateCountFor(nc.id), 'an unlinked CAPA is invisible to the gate').toBe(0)
    await expectMarkCompleteRejected(page, nc.id, /capa required is set to yes/i)

    // ── THE REAL LINK. Exactly the payload `/capas/create?ncId=<id>` submits:
    // CapasCreate.vue reads the query param into `sourceType: 'NC'` +
    // `sourceId`, which is the column pair gate 4 counts.
    const linked = await page.request.post('/api/v1/services/capas', {
      data: {
        title: `E2E J15 linked CAPA ${Date.now()}`,
        description: 'PW-J15 — the corrective action the NC requires.',
        siteId: SITES.primary.id,
        departmentId: DEPARTMENTS.quality.id,
        typeId: 'CORRECTIVE',
        priorityId: 'MEDIUM',
        initiatedAt: new Date().toISOString(),
        ownerId: USERS.author.id,
        sourceType: 'NC',
        sourceId: nc.id,
        workflowVersionId: publishedVersionOf('E2E CAPA Review & Approval'),
      },
    })
    expect(linked.status(), `linked CAPA create — ${await linked.text().catch(() => '')}`).toBe(200)

    const capaId = sqlValue(
      `SELECT id FROM capas WHERE company_id = ${q(COMPANY_ID)}
        AND source_type = 'NC' AND source_id = ${q(nc.id)} AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
    )
    expect(capaId, 'the CAPA carries the NC in its source columns').toBeTruthy()
    expect(gateCountFor(nc.id), 'and the gate can now see exactly one').toBe(1)

    // ── THE ASSERTION THE REQUIREMENT IS ACTUALLY ABOUT. The flag is STILL
    // true — nothing was turned off — and the same endpoint that refused twice
    // above no longer refuses for this reason. Asserted as "the CAPA gate is
    // gone", not as "the call succeeded": the NC's workflow steps are still
    // open, so the honest expectation is a DIFFERENT 409, and demanding a 200
    // here would be asserting something the product never promised at this
    // point in the journey.
    expect(
      sqlValue(`SELECT capa_required FROM nonconformances WHERE id = ${q(nc.id)}`),
      'the flag was NEVER unset — this is the half j3 could not reach',
    ).toBe('t')

    // Every other gate is already satisfied — steps cleared, disposition set,
    // notes written, and `Use As Is` does not track cost — so the CAPA gate was
    // the LAST one standing. The close therefore SUCCEEDS, and that is a
    // stronger assertion than "the message changed": it shows the linked CAPA
    // did not merely move the refusal along, it opened the door.
    const res = await page.request.post(`/api/v1/services/nonconformances/${nc.id}/markComplete`, {
      data: { method: 'PIN', token: ESIGN_PIN, provider: null, comments: 'E2E J15 — closed with a real linked CAPA.' },
    })
    expect(
      res.status(),
      `the close succeeds with capaRequired STILL true — ${await res.text().catch(() => '')}`,
    ).toBe(200)

    await waitForSqlValue(
      `SELECT count(*) FROM nonconformances WHERE id = ${q(nc.id)} AND status_id = 'CLOSED'`,
      { timeoutMs: 30_000, label: 'NC CLOSED' },
    )
    expect(
      sqlValue(`SELECT capa_required FROM nonconformances WHERE id = ${q(nc.id)}`),
      'and it closed with the requirement still ON — satisfied, not waived',
    ).toBe('t')

    // ── AND THE GATE COUNTS THROUGH THE PARANOID DEFAULT. A withdrawn
    // corrective action stops satisfying the requirement it was created for —
    // asserted on the COUNT rather than by re-probing the endpoint, because the
    // NC is CLOSED now and `markComplete` would answer "already closed" first,
    // which would tell us nothing about the CAPA gate.
    //
    // The opposite behaviour — a soft-deleted CAPA still holding the gate open
    // — is the failure mode that would let an NC close with nothing behind it,
    // so it is worth an explicit assertion even without an endpoint probe.
    sql(`UPDATE capas SET deleted_at = now() WHERE id = ${q(capaId)}`)
    expect(gateCountFor(nc.id), 'a soft-deleted CAPA no longer counts toward the gate').toBe(0)
    sql(`UPDATE capas SET deleted_at = NULL WHERE id = ${q(capaId)}`)
    expect(gateCountFor(nc.id), 'and restoring it brings it back').toBe(1)
  })

  test('the atomic raise-with-CAPA shortcut arms the flag AND satisfies it in one transaction', async ({
    page,
  }) => {
    test.setTimeout(120_000)

    // `j10` proves this endpoint commits a CAPA with a status that exists in
    // `capa_statuses`. It does not ask the question URS-NCR-07 asks: does the
    // CAPA it creates actually satisfy the gate the same call turned on? Those
    // are two writes in one transaction (`capaRequired` from the `createCapa`
    // flag at controllers/nonconformances.js:319; the CAPA's source columns in
    // `createCapaRecord`), and nothing but this assertion ties them together.
    const title = uniqueTitle('J15-raise')
    const res = await page.request.post('/api/v1/services/nonconformances/raise', {
      data: {
        title,
        description: 'PW-J15 — raise with a linked 8D CAPA, then read the gate.',
        siteId: SITES.primary.id,
        departmentId: DEPARTMENTS.quality.id,
        typeId: 'PROCESS',
        sourceId: 'IN_PROCESS',
        severityId: 'MAJOR',
        detectedAt: new Date().toISOString(),
        ownerId: USERS.author.id,
        workflowVersionId: publishedVersionOf('E2E NCR Review & Approval'),
        createCapa: true,
        capaWorkflowVersionId: publishedVersionOf('E2E CAPA Review & Approval'),
      },
    })
    expect(res.status(), await res.text().catch(() => '')).toBe(200)

    const nc = findNcByTitle(title)
    expect(nc, 'the NC committed').toBeTruthy()

    expect(
      sqlValue(`SELECT capa_required FROM nonconformances WHERE id = ${q(nc.id)}`),
      'the shortcut ARMED the gate — capaRequired mirrors the createCapa flag',
    ).toBe('t')
    expect(
      gateCountFor(nc.id),
      'and SATISFIED it in the same transaction — the gate can never be left armed-and-unsatisfiable by this path',
    ).toBe(1)

    // The derived CAPA is the 8D one, named after the NC — proof the count
    // above is the shortcut's own CAPA and not something a parallel spec left
    // behind on this id.
    const capa = sqlRow(
      `SELECT id, title, type_id FROM capas
        WHERE company_id = ${q(COMPANY_ID)} AND source_type = 'NC' AND source_id = ${q(nc.id)}
          AND deleted_at IS NULL LIMIT 1`,
    )
    expect(capa[1], 'titled after the NC it answers').toBe(`8D for ${nc.ncNumber}`)
  })

  test('the gate reads the source COLUMNS, not record_links — and the two stores can disagree', async ({ page }) => {
    test.setTimeout(300_000)

    // WHY PIN THIS. The same relationship is recorded twice: `createCapaRecord`
    // writes `capas.source_type/source_id` AND calls `linkRecords()` to write a
    // `record_links` row. Reading the code casually, either looks like "the
    // link". Only the columns are load-bearing, and a future refactor that
    // moved the gate onto `record_links` — the more general store, and the one
    // the Related-records panel reads — would look like a tidy-up and would
    // silently change which CAPAs satisfy the requirement.
    //
    // This is not hypothetical drift: the two stores are ALREADY out of step in
    // this database (NC-sourced CAPAs exist with no corresponding
    // `record_links` row), because the `linkRecords` call is newer than the
    // column pair. So the divergence is measured, not imagined.
    const title = uniqueTitle('J15-stores')
    await raiseNc(page, title)
    const nc = findNcByTitle(title)

    await clearWorkflowSteps(page, nc.id)
    await page.reload({ waitUntil: 'domcontentloaded' })

    await fillDisposition(page, nc.id, { disposition: FIXTURES.ncrDispositionNoCost })
    await fillDisposition(page, nc.id, { notes: 'E2E J15 — stores divergence probe.' })
    await fillDisposition(page, nc.id, { capaRequired: true })
    await waitForSqlValue(
      `SELECT count(*) FROM nonconformances WHERE id = ${q(nc.id)} AND capa_required = true`,
      { timeoutMs: 15_000, label: 'capaRequired=true persisted' },
    )

    // A CAPA linked ONLY in record_links — the manual "Related records" link,
    // which is what a person adds from the rail. It is a legitimate link by
    // every visible measure: it renders on both records' Related panels.
    const otherCapa = sqlValue(
      `SELECT id FROM capas WHERE company_id = ${q(COMPANY_ID)} AND deleted_at IS NULL
        AND (source_type <> 'NC' OR source_id IS DISTINCT FROM ${q(nc.id)})
        ORDER BY created_at DESC LIMIT 1`,
    )
    expect(otherCapa, 'the tenant has a CAPA to link manually').toBeTruthy()

    const link = await page.request.post('/api/v1/services/record-links', {
      data: {
        fromType: 'Nonconformance',
        fromId: nc.id,
        toType: 'Capa',
        toId: otherCapa,
        relation: 'RELATED',
      },
    })
    expect(link.status(), `manual link — ${await link.text().catch(() => '')}`).toBe(201)
    expect(
      sqlValue(
        `SELECT count(*) FROM record_links
          WHERE from_id = ${q(nc.id)} AND to_id = ${q(otherCapa)} AND deleted_at IS NULL`,
      ),
      'the record_links row exists and is live',
    ).toBe('1')

    // …and the gate is unmoved. A CAPA that a reader would call "linked" —
    // visible on the NC's Related records panel, resolvable in both directions
    // — does not satisfy URS-NCR-07. Whether that is right is a design
    // question; that it is TRUE is what this assertion nails down, so nobody
    // has to guess which store the requirement means.
    expect(gateCountFor(nc.id), 'a record_links link does not satisfy the gate').toBe(0)
    await expectMarkCompleteRejected(
      page,
      nc.id,
      /capa required is set to yes.*create at least one linked capa/i,
    )

    sql(
      `DELETE FROM record_links WHERE from_id = ${q(nc.id)} AND to_id = ${q(otherCapa)}`,
    )
  })
})
