// PW-J10 · "Raise NC + linked 8D CAPA" lands a CAPA in a status that EXISTS.
//
// ── Why this file exists ─────────────────────────────────────────────────────
// `20260823100000-unified-record-statuses.js` collapsed the CAPA vocabulary to
// DRAFT / OPEN / CLOSED / CANCELLED. It did not merely stop using PENDING — it
// remapped the rows (`UPDATE capas SET status_id='OPEN' WHERE status_id='PENDING'`)
// and then DELETED the lookup row (`DELETE FROM capa_statuses WHERE id='PENDING'`).
//
// `raiseNcWithCapa` still writes the retired value:
//
//     backend/api/controllers/nonconformances.js:400
//     await capa.update({ statusId: 'PENDING', ... })
//
// TWO layers reject that, and the order matters for anyone debugging it. The
// status trigger fires first:
//
//     ERROR: Illegal CAPA status transition: OPEN -> PENDING.
//     HINT:  If this transition is legitimate, add it to
//            enforce_capa_status_transition().
//
// and behind it the foreign key would refuse too, since `capas.status_id`
// references `capa_statuses.id` (`20260513000500-create-capas.js`) and the
// PENDING row is gone. So this is not a cosmetic vocabulary mismatch showing a
// stale badge — the write cannot commit by either route. The whole raise runs in
// one transaction, so the CAPA takes the NC down with it and the user gets a 500
// having created nothing.
//
// ⚠️ THIS TEST IS EXPECTED TO FAIL until the controller is fixed. It is red
// because the defect is real and live on develop, not because the test is wrong.
// Verified 2026-08-28: the endpoint returns 500.
//
// Nothing caught this. The NC journeys all raise a plain NC (`createCapa` unset)
// and take the `else` branch two lines below the defect, so the entire suite
// stays green while the module's headline shortcut is dead.
//
// ── What this pins ───────────────────────────────────────────────────────────
// Deliberately asserted at the API rather than through the Raise dialog: the
// defect is a backend write, and a UI-driven test would fail identically if the
// toggle were merely renamed — which would send the next reader to the wrong
// layer. The status is then checked against `capa_statuses` itself rather than
// against the string 'OPEN' alone, so the next vocabulary change fails here with
// a message that names the cause instead of a bare assertion diff.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, SITES, DEPARTMENTS, USERS } from '../fixtures/cast.js'
import { uniqueTitle } from '../fixtures/nonconformances.js'
import { sqlValue, sqlRow, findNcByTitle } from '../fixtures/db.js'

// Looked up by workflow NAME rather than hardcoded: the seeded version ids are
// stable today, but a re-seed that bumps a version would otherwise fail here as
// a confusing 400 instead of pointing at the fixture.
function publishedVersionOf(workflowName) {
  // `workflow_versions` has no `version` column — it is (version_major,
  // version_minor) plus an `is_current` flag. Select the CURRENT PUBLISHED
  // version rather than the numerically highest: a workflow can carry a newer
  // DRAFT version, and instantiating against a draft is not what a raise does.
  return sqlValue(
    `SELECT wv.id FROM workflow_versions wv
       JOIN workflows w ON w.id = wv.workflow_id
      WHERE w.company_id = '${COMPANY_ID}' AND w.name = '${workflowName}'
        AND wv.status_id = 'PUBLISHED' AND wv.is_current = true
        AND wv.deleted_at IS NULL
      ORDER BY wv.version_major DESC, wv.version_minor DESC LIMIT 1`,
  )
}

test.describe('PW-J10 · raise an NC with a linked 8D CAPA', () => {
  test.use({ storageState: AUTH.author })

  test('the linked CAPA commits, and its status is a real capa_statuses row', async ({
    browser,
  }) => {
    test.setTimeout(60_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })

    const title = uniqueTitle('J10-raise-capa')
    const res = await ctx.request.post('/api/v1/services/nonconformances/raise', {
      data: {
        title,
        description: 'PW-J10 — raise with a linked 8D CAPA.',
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

    // A foreign-key violation surfaces as a 500, not a 4xx — the payload is
    // valid, the schema accepts it, and the write fails underneath. Surface the
    // body so a failure here reads as "capas_status_id_fkey" rather than "500".
    expect(res.status(), await res.text().catch(() => '')).toBe(200)

    const nc = findNcByTitle(title)
    expect(
      nc,
      'the NC committed — the raise is one transaction, so a CAPA FK violation rolls this back too',
    ).toBeTruthy()
    expect(nc.statusId).toBe('OPEN')

    // The CAPA is linked by sourceType/sourceId, not a dedicated column.
    // NB: sqlRow hands back psql stdout split on '|' — a string ARRAY, not an
    // object. findCapaByTitle is no use here because the CAPA's title is derived
    // ("8D for <ncNumber>"), so the link columns are the reliable way in.
    const capaRow = sqlRow(
      `SELECT id, status_id FROM capas
        WHERE company_id = '${COMPANY_ID}' AND source_type = 'NC' AND source_id = '${nc.id}'`,
    )
    expect(capaRow, 'a linked CAPA was created for the NC').toBeTruthy()

    const capaStatus = capaRow[1]

    // The invariant, stated as itself: whatever the vocabulary is, the value
    // written must exist in the lookup the FK points at. This is the assertion
    // that would have gone red the day PENDING was deleted.
    const statusExists = sqlValue(`SELECT count(*) FROM capa_statuses WHERE id = '${capaStatus}'`)
    expect(
      Number(statusExists),
      `capas.status_id = '${capaStatus}' but no such row exists in capa_statuses — the FK cannot hold`,
    ).toBe(1)

    // And specifically: OPEN is what PENDING became.
    expect(capaStatus).toBe('OPEN')

    await ctx.close()
  })
})
