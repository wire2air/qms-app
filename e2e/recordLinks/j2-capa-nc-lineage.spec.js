// PW-J2 · URS-CAP-09 / OQ-04 TC-04-09 — NC ↔ CAPA lineage, both directions and
// MANY-to-one.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE EXISTS, AND WHAT `j1` DOES NOT COVER.
//
// §7 scored URS-CAP-09 *Partial* against `j1-related-records.spec.js`. `j1` is a
// test of the GENERIC picker: a person selecting any two records and saying they
// are RELATED. TC-04-09 asks about something structurally different, and the
// difference is not cosmetic — it is a different RELATION written by a different
// code path:
//
//   RELATED  written by `POST /record-links` with no relation, UNDIRECTED, one
//            row, rendered identically on both ends as "Related". This is `j1`.
//   CAUSED   written by the CREATION FLOWS, DIRECTIONAL — `from` is the cause,
//            `to` is the effect — and rendered as ▲ Caused by / ▼ Led to
//            (`RecordLineagePanel.vue:7-8`). This is what TC-04-09 is about, and
//            nothing asserted it before this file.
//
// The two clauses §7 named as UNTESTED map onto the two ways a CAUSED link is
// born, and this file takes them in the order TC-04-09 does:
//
//   STEP 1-2  THE RAISE-WITH-CAPA PATH — "From an existing nonconformance,
//             create a CAPA | The CAPA is created pre-linked to that NC", and
//             "Confirm the link is visible from both records".
//   STEP 3-5  MANY-TO-ONE — "From the CAPA, link a second, existing
//             nonconformance", "Confirm both nonconformances now show on the
//             CAPA", and "Confirm an already-linked NC is not offered again".
//
// ─────────────────────────────────────────────────────────────────────────────
// WHERE THE SYSTEM LINEAGE ACTUALLY COMES FROM — read at the source, because
// the obvious guess is wrong.
//
// `nonconformances/j10-raise-with-capa.spec.js` already drives
// `POST /nonconformances/raise` with `createCapa: true`, and asserts the CAPA
// commits with a status that exists in `capa_statuses`. It asserts the link by
// the CAPA's OWN COLUMNS — `source_type = 'NC' AND source_id = nc.id` — and
// stops there. That is a different claim from the one TC-04-09 makes: those
// columns are the CAPA's provenance field, not the lineage row the "Related
// records" panel reads.
//
// The row is written one layer down, and it is easy to miss because the raise
// controller never mentions it. `createCapaRecord`
// (backend/api/services/ncCapaCreateService.js:374-387) ends with:
//
//     const fromType = CAPA_SOURCE_TO_ENTITY[sourceType]   // NC → 'Nonconformance'
//     if (fromType && sourceId) {
//       await linkRecords({ companyId, fromType, fromId: sourceId,
//                           toType: 'Capa', toId: capa.id, userId, transaction })
//     }
//
// and `linkRecords` (services/recordLinkService.js) defaults `relation` to
// **CAUSED**. So the raise shortcut writes a SYSTEM lineage row as a side effect
// of building the CAPA, inside the SAME transaction as the NC and the CAPA. That
// last part is what makes it worth asserting rather than assuming: the whole
// raise is one transaction, so if the link write ever threw, the NC and the CAPA
// would both roll back with it — and `j10`'s column-level assertion would
// notice, but it would report the wrong cause.
//
// NOT every CAPA source produces one, deliberately, and the service says why:
// `CAPA_SOURCE_TO_ENTITY` maps NC / NONCONFORMANCE / CUSTOMER_COMPLAINT and
// nothing else, "Codes not mapped here (e.g. INTERNAL_AUDIT, which points at an
// audit instance) don't produce a record_links row — audit lineage is captured
// per finding instead." Asserted below so the absence reads as design.
//
// ─────────────────────────────────────────────────────────────────────────────
// MANY-TO-ONE IS THE REAL SHAPE, AND THE DIALOG THAT DOES IT HAD NEVER WORKED.
//
// `CapaLinkNcDialog.vue` exists because until 2026-08-17 the NC→CAPA link could
// only be made one way — by raising the CAPA *from* an NC. A CAPA opened first,
// or a second NC found later to share a root cause, had no way to say so. Its
// own header states the intent: "MANY NCs to one CAPA, deliberately. That is the
// real shape (many complaints feed one NC; many NCs feed one CAPA)."
//
// It writes the SAME shape the raise path writes — `Nonconformance → Capa`,
// relation CAUSED — so both routes produce lineage that reads identically. That
// is precisely why this file asserts the two together: a regression that made
// one of them write RELATED instead would leave both links present and the
// panel would silently move an entry out of "Caused by" into "Related", which no
// count-based test would catch.
//
// AND IT GOES THROUGH REST, NOT THE SYNCENGINE. `app_user` holds SELECT and
// nothing more on `record_links`, because authorizing the write means checking
// BOTH records — a cross-module question no single RLS policy on that table can
// answer. The dialog originally wrote through the SyncEngine and had therefore
// NEVER worked ("permission denied for table record_links", found 2026-08-29).
// `j1`'s last test pins that refusal; this file exercises the endpoint that
// replaced it, from the page that motivated it.
//
// ─────────────────────────────────────────────────────────────────────────────
// STEP 5 — "an already-linked NC is not offered again" — is a CLIENT-side
// exclusion AND a DATABASE constraint, and both are asserted, because either one
// alone would be silently load-bearing:
//
//   · the dialog filters the candidate pool by the links it already holds
//     (`linkedNcIds`), so a linked NC is never rendered as a checkbox.
//   · `record_links_unique` — UNIQUE (from_type, from_id, to_type, to_id,
//     relation) — makes a duplicate impossible underneath, and `linkRecords`
//     uses `findOrCreate`, so a second attempt is an idempotent no-op rather
//     than an error. Asserted as "still exactly one row", which is the
//     observable consequence.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID, SITES, DEPARTMENTS, USERS } from '../fixtures/cast.js'
import { raiseNc, uniqueTitle } from '../fixtures/nonconformances.js'
import { findNcByTitle, sql, sqlRow, sqlValue } from '../fixtures/db.js'

const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const PREFIX = 'E2E NC J2LINK'

/**
 * The published CURRENT version of a workflow, by NAME.
 *
 * Looked up rather than hardcoded for the reason `nonconformances/j10` gives:
 * the seeded version ids are stable today, but a re-seed that bumps a version
 * would otherwise fail here as a confusing 400 instead of pointing at the
 * fixture. `workflow_versions` has no `version` column — it is (version_major,
 * version_minor) plus an `is_current` flag — and the CURRENT PUBLISHED version
 * is what a raise instantiates, not the numerically highest (a workflow may
 * carry a newer DRAFT).
 */
function publishedVersionOf(workflowName) {
  return sqlValue(
    `SELECT wv.id FROM workflow_versions wv
       JOIN workflows w ON w.id = wv.workflow_id
      WHERE w.company_id = ${q(COMPANY_ID)} AND w.name = ${q(workflowName)}
        AND wv.status_id = 'PUBLISHED' AND wv.is_current = true
        AND wv.deleted_at IS NULL
      ORDER BY wv.version_major DESC, wv.version_minor DESC LIMIT 1`,
  )
}

/** The lineage row as `relation/alive`, or null when there is none. */
function lineage(fromId, toId) {
  return sqlValue(
    `SELECT relation || '/' || (deleted_at IS NULL)::text FROM record_links
      WHERE from_id = ${q(fromId)} AND to_id = ${q(toId)}`,
  )
}

/** Every NC linked into this CAPA, newest first. */
function ncsLinkedTo(capaId) {
  const out = sql(
    `SELECT rl.from_id, rl.relation, n.nc_number FROM record_links rl
       JOIN nonconformances n ON n.id = rl.from_id
      WHERE rl.to_type = 'Capa' AND rl.to_id = ${q(capaId)}
        AND rl.from_type = 'Nonconformance' AND rl.deleted_at IS NULL
      ORDER BY rl.created_at`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [ncId, relation, ncNumber] = line.split('|')
    return { ncId, relation, ncNumber }
  })
}

/**
 * Remove every link and record this file created.
 *
 * Runs before AND after. `record_links` is hard-deleted here rather than
 * soft-deleted because a soft-deleted row still occupies `record_links_unique`
 * (the index has no partial predicate), so a leftover from a failed run would
 * make the NEXT run's link a resurrect-not-insert and quietly change what the
 * duplicate arm is measuring.
 */
function purge() {
  const mineNcs = `SELECT id FROM nonconformances WHERE title LIKE ${q(`${PREFIX}%`)}`
  // Both shapes: the 8D CAPAs the raise path derives (titled '8D for NC-nnn',
  // so they are found through their source NC) and the standalone CAPA the
  // CONTROL arm creates (found by its own title prefix).
  const mineCapas = `SELECT id FROM capas
     WHERE (source_type = 'NC' AND source_id IN (${mineNcs}))
        OR title LIKE ${q(`${PREFIX}%`)}`
  sql(
    `DELETE FROM record_links
      WHERE from_id IN (${mineNcs}) OR to_id IN (${mineNcs})
         OR from_id IN (${mineCapas}) OR to_id IN (${mineCapas})`,
  )
}

test.describe('PW-J2 · URS-CAP-09 — NC → CAPA lineage, and many NCs to one CAPA', () => {
  test.beforeAll(() => purge())
  test.afterAll(() => purge())

  test('TC-04-09 steps 1-2 · raising an NC WITH a CAPA writes a SYSTEM lineage row, visible from both records', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const title = `${PREFIX} raise-with-capa ${Date.now()}`

    // The raise shortcut, driven at the API for the reason j10 gives: the write
    // under test is a BACKEND side effect, and a UI-driven probe would fail
    // identically if the create-form toggle were merely renamed — sending the
    // next reader to the wrong layer.
    const res = await ctx.request.post('/api/v1/services/nonconformances/raise', {
      data: {
        title,
        description: 'PW-J2 — raise with a linked 8D CAPA, to pin the record_links lineage row.',
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
    // A FK or trigger failure in this path surfaces as a 500, not a 4xx — the
    // payload is valid and the write fails underneath. Surface the body so a
    // failure reads as its cause rather than as a bare "500".
    expect(res.status(), await res.text().catch(() => '')).toBe(200)

    const nc = findNcByTitle(title)
    expect(nc?.id, 'the NC committed').toBeTruthy()
    const capa = sqlRow(
      `SELECT id, capa_number FROM capas
        WHERE company_id = ${q(COMPANY_ID)} AND source_type = 'NC' AND source_id = ${q(nc.id)}`,
    )
    expect(capa, 'and the linked 8D CAPA was created for it').not.toBeNull()
    const [capaId, capaNumber] = capa

    // ── THE ASSERTION TC-04-09 STEP 1 ACTUALLY MAKES. "Pre-linked" is a
    // lineage claim, not a provenance-column claim. j10 already covers
    // source_type/source_id; this is the record_links row the "Related records"
    // panel reads, written by createCapaRecord → linkRecords.
    expect(
      lineage(nc.id, capaId),
      'the raise wrote a live CAUSED lineage row — Nonconformance → Capa',
    ).toBe('CAUSED/true')

    // DIRECTIONAL, and only one row. CAUSED renders as ▲ Caused by on the CAPA
    // and ▼ Led to on the NC, off the SAME row — the panel reads both
    // directions, so a mirrored reverse row would double every lineage entry.
    expect(
      sqlValue(
        `SELECT count(*) FROM record_links WHERE from_id = ${q(capaId)} AND to_id = ${q(nc.id)}`,
      ),
      'and no reverse row — direction is carried by the single row, not by a pair',
    ).toBe('0')

    // Attributed to the person who raised it, and inside the same company. A
    // system lineage row is still an actor-attributable act.
    const meta = sqlRow(
      `SELECT coalesce(created_by::text,'NULL'), company_id::text, from_type, to_type
         FROM record_links WHERE from_id = ${q(nc.id)} AND to_id = ${q(capaId)}`,
    )
    expect(meta[0], 'attributed to the raiser').toBe(USERS.author.id)
    expect(meta[1], 'and scoped to the tenant').toBe(COMPANY_ID)
    expect([meta[2], meta[3]], 'with the canonical entity types the FE registry uses').toEqual([
      'Nonconformance',
      'Capa',
    ])

    // ── STEP 2, "visible from BOTH records" — asserted in the UI, because that
    // is the claim. The panel resolves each end's chip out of IndexedDB, so a
    // link row that existed but whose counterpart never synced would render an
    // empty panel and still satisfy every SQL assertion above.
    const page = await ctx.newPage()
    await page.goto(`/nonconformances/${nc.id}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Related records', { exact: true })).toBeVisible({
      timeout: 90_000,
    })
    await expect(
      page.getByText(capaNumber, { exact: false }).first(),
      'the NC page shows the CAPA it led to, by NUMBER — so the chip resolved the entity rather than printing a raw id',
    ).toBeVisible({ timeout: 60_000 })

    const capaPage = await ctx.newPage()
    await capaPage.goto(`/capas/${capaId}`, { waitUntil: 'domcontentloaded' })
    await expect(capaPage.getByText('Related records', { exact: true })).toBeVisible({
      timeout: 90_000,
    })
    await expect(
      capaPage.getByText(nc.ncNumber, { exact: false }).first(),
      'and the CAPA page shows the NC that caused it — the same row, read from the other end',
    ).toBeVisible({ timeout: 60_000 })

    await ctx.close()
  })

  test('TC-04-09 steps 3-5 · a SECOND existing NC links to the same CAPA, both show, and neither can be linked twice', async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()

    // ── ARRANGE. One CAPA raised from NC #1 (which gives it its first CAUSED
    // link for free), plus a SECOND, independent NC raised on its own. The
    // second NC is raised through the create form rather than the API on
    // purpose: the dialog's candidate pool is fed from IndexedDB
    // (`db.Nonconformance.where()`), so an NC that exists only in Postgres
    // would not be offered and the UI arm would fail for a reason that has
    // nothing to do with linking.
    const firstTitle = `${PREFIX} cause A ${Date.now()}`
    const raised = await ctx.request.post('/api/v1/services/nonconformances/raise', {
      data: {
        title: firstTitle,
        description: 'PW-J2 — the NC the CAPA was raised from.',
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
    expect(raised.status(), await raised.text().catch(() => '')).toBe(200)
    const ncA = findNcByTitle(firstTitle)
    const capaId = sqlValue(
      `SELECT id FROM capas WHERE company_id = ${q(COMPANY_ID)} AND source_type = 'NC' AND source_id = ${q(ncA.id)}`,
    )
    expect(capaId, 'arrange: the CAPA exists').toBeTruthy()

    const secondTitle = `${PREFIX} cause B ${Date.now()}`
    await raiseNc(page, secondTitle)
    const ncB = findNcByTitle(secondTitle)
    expect(ncB?.id, 'arrange: the second, independent NC exists').toBeTruthy()
    expect(
      lineage(ncB.id, capaId),
      'precondition: the second NC is NOT yet linked — otherwise step 3 would prove nothing',
    ).toBeNull()

    // ── STEP 3. Link the second NC from the CAPA's own page, through the dialog
    // that exists for exactly this. Driven in the UI rather than at the API
    // because the client half is half the requirement: the dialog is what a
    // person uses, and its candidate exclusion is what step 5 asks about.
    await page.goto(`/capas/${capaId}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Related records', { exact: true })).toBeVisible({
      timeout: 90_000,
    })

    // `DetailActionBar` promotes actions to inline buttons and spills the rest
    // into a ⋯ menu, so 'Link Nonconformance' may be either — matched as both,
    // the same way `auditLogMenuItem` handles the identical problem for History.
    const linkAction = page
      .getByRole('menuitem', { name: 'Link Nonconformance', exact: true })
      .or(page.getByRole('button', { name: 'Link Nonconformance', exact: true }))
    const overflow = page.getByRole('button', { name: 'More actions' })
    if (!(await linkAction.count())) {
      // `BaseMenu` hard-codes aria-label="More actions" on EVERY trigger it
      // renders, so a bare locator is a strict-mode violation on a page that
      // also shows a workflow step card. The header's is first in DOM order.
      await overflow.first().click()
    }
    await expect(linkAction.first(), 'the Link Nonconformance action is offered').toBeVisible({
      timeout: 20_000,
    })
    await linkAction.first().click()

    // Anchor on the dialog's own copy, not role=dialog — HeadlessUI puts the
    // role on a zero-box positioning wrapper that always resolves hidden.
    await expect(
      page.getByText('Pick the nonconformances this CAPA addresses', { exact: false }),
      'the link dialog opened',
    ).toBeVisible({ timeout: 20_000 })

    // Search narrows the pool — the shared tenant accumulates NCs across every
    // project in this suite and the list is capped at 50, so an unfiltered scan
    // is not guaranteed to contain ours.
    const search = page.getByPlaceholder('Search by NC number or title…')
    await search.fill(ncB.ncNumber)

    // ── STEP 5, FIRST HALF — asserted HERE, while both NCs are in view, because
    // this is the only moment the exclusion is observable. NC #1 is already
    // linked (the raise wrote its CAUSED row), so the dialog must not offer it;
    // NC #2 is not, so it must. Searching for the CAPA's shared title prefix
    // brings both into the same filtered list, which is what makes the pair
    // meaningful rather than two separate empty results.
    await search.fill(PREFIX)
    const candidate = (ncNumber) =>
      page.getByText(ncNumber, { exact: true }).or(page.getByText(ncNumber, { exact: false }))
    await expect(
      candidate(ncB.ncNumber).first(),
      'the UNLINKED NC is offered as a candidate',
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByText(ncA.ncNumber, { exact: true }),
      'TC-04-09 step 5: the ALREADY-LINKED NC is excluded from the pool — it cannot be offered a second time',
    ).toHaveCount(0)

    // Tick the second NC and submit.
    await candidate(ncB.ncNumber).first().click()
    const submit = page.getByRole('button', { name: /^Link \d+ selected$/ })
    await expect(submit, 'the footer counts the selection').toBeVisible({ timeout: 15_000 })
    await submit.click()

    // ── STEP 3, ASSERTED AT THE DATABASE. The same shape the raise path wrote —
    // and asserting the RELATION, not merely the row's existence, is the point:
    // a regression that wrote RELATED here would leave the link present and
    // silently move it out of "Caused by" in the panel, which a count could not
    // see.
    await expect
      .poll(() => lineage(ncB.id, capaId), {
        timeout: 60_000,
        message: 'the dialog writes Nonconformance → Capa with relation CAUSED, over REST',
      })
      .toBe('CAUSED/true')

    // ── STEP 4. MANY-TO-ONE: both NCs now hang off the one CAPA, both as
    // causes, and the two routes produced lineage that reads identically.
    const linked = ncsLinkedTo(capaId)
    expect(linked.map((l) => l.ncId).sort(), 'both nonconformances are linked to the CAPA').toEqual(
      [ncA.id, ncB.id].sort(),
    )
    expect(
      [...new Set(linked.map((l) => l.relation))],
      'and BOTH carry CAUSED — the raise path and the dialog write the same shape, so the panel reads them as one group',
    ).toEqual(['CAUSED'])

    // And it shows. The CAPA page was open across the write, so this also proves
    // the sync broadcast reached IndexedDB — the link was written over REST and
    // nothing else would have told the open page about it.
    for (const ncNumber of [ncA.ncNumber, ncB.ncNumber]) {
      await expect(
        page.getByText(ncNumber, { exact: false }).first(),
        `TC-04-09 step 4: ${ncNumber} shows on the CAPA without a reload`,
      ).toBeVisible({ timeout: 60_000 })
    }

    // ── STEP 5, SECOND HALF — the constraint underneath the exclusion. The
    // client filter is an affordance; a replayed request skips it entirely. A
    // duplicate is impossible at the database (`record_links_unique` over
    // from/to/relation) and `linkRecords` uses findOrCreate, so the second
    // attempt is an idempotent no-op rather than an error — which is why the
    // observable assertion is "still exactly one row", not "the call failed".
    const duplicate = await ctx.request.post('/api/v1/services/record-links', {
      data: {
        fromType: 'Nonconformance',
        fromId: ncB.id,
        toType: 'Capa',
        toId: capaId,
        relation: 'CAUSED',
      },
    })
    expect(
      duplicate.status(),
      `the replayed link is answered, not rejected — ${await duplicate.text().catch(() => '')}`,
    ).toBe(201)
    expect(
      sqlValue(
        `SELECT count(*) FROM record_links
          WHERE from_id = ${q(ncB.id)} AND to_id = ${q(capaId)} AND relation = 'CAUSED'`,
      ),
      'TC-04-09 step 5: still exactly ONE lineage row — the unique index makes a duplicate link unrepresentable',
    ).toBe('1')
    expect(
      sqlValue(
        `SELECT count(*) FROM pg_indexes WHERE tablename = 'record_links'
          AND indexname = 'record_links_unique'`,
      ),
      'and that guarantee is a real UNIQUE index, not an application convention',
    ).toBe('1')

    await ctx.close()
  })

  test('CONTROL · a CAPA whose source is NOT a mapped lineage type writes no link — the absence above would otherwise be unreadable', async ({
    browser,
  }) => {
    // WHY THIS ARM. The two tests above assert that a lineage row APPEARS. Taken
    // alone they support a wrong reading: that `record_links` is written for
    // every CAPA, so its presence says nothing in particular. It is not.
    // `CAPA_SOURCE_TO_ENTITY` (services/ncCapaCreateService.js:8-12) maps exactly
    // three source codes — NC, NONCONFORMANCE, CUSTOMER_COMPLAINT — and the
    // service's own comment explains the omission: "Codes not mapped here (e.g.
    // INTERNAL_AUDIT, which points at an audit instance) don't produce a
    // record_links row — audit lineage is captured per finding instead."
    //
    // So a standalone CAPA — created from the CAPA module itself, with no source
    // record at all — must carry NO lineage row. That is what makes the CAUSED
    // rows above evidence of the raise path rather than of a blanket write.
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    await page.goto('/')

    // Driven rather than inferred. A tenant-wide count would be the weaker
    // probe: nothing stops a PERSON manually CAUSED-linking a source-less CAPA
    // through the dialog, so a nonzero count would not be a defect and a zero
    // count would be luck. Creating the CAPA here is what isolates the SYSTEM
    // write — this request has no NC in it at all, so any lineage row that
    // appeared could only have come from createCapaRecord.
    //
    // NB `created_by` does NOT separate the two routes: the raise path passes
    // `userId: user.id` into `linkRecords`, so a system-written lineage row is
    // attributed to the raiser exactly as a dialog-written one is. Source-less
    // creation is the only clean discriminator.
    const title = `${PREFIX} standalone ${Date.now()}`
    const created = await ctx.request.post('/api/v1/services/capas', {
      data: {
        title,
        description: 'PW-J2 — a CAPA with no source record, to pin that lineage is not blanket.',
        siteId: SITES.primary.id,
        departmentId: DEPARTMENTS.quality.id,
        typeId: 'CORRECTIVE',
        // INTERNAL_OBSERVATION, deliberately. `sourceType` is REQUIRED by
        // createCapaSchema, so "no source" cannot mean an absent field — it
        // means a source code that `CAPA_SOURCE_TO_ENTITY` does not map, with no
        // `sourceId` behind it. This is a real `capa_sources` row, and it is the
        // same class as the INTERNAL_AUDIT case the service's comment names.
        sourceType: 'INTERNAL_OBSERVATION',
        priorityId: 'MEDIUM',
        initiatedAt: new Date().toISOString().slice(0, 10),
        ownerId: USERS.author.id,
        workflowVersionId: publishedVersionOf('E2E CAPA Review & Approval'),
      },
    })
    expect(
      created.ok(),
      `arrange: a source-less CAPA is creatable — ${created.status()} ${await created.text().catch(() => '')}`,
    ).toBe(true)
    const standaloneId = sqlValue(`SELECT id FROM capas WHERE title = ${q(title)} LIMIT 1`)
    expect(standaloneId, 'arrange: the standalone CAPA exists').toBeTruthy()
    expect(
      sqlValue(`SELECT coalesce(source_id::text,'NULL') FROM capas WHERE id = ${q(standaloneId)}`),
      'and it genuinely has no source record',
    ).toBe('NULL')

    expect(
      sqlValue(
        `SELECT count(*) FROM record_links
          WHERE to_type = 'Capa' AND to_id = ${q(standaloneId)} AND deleted_at IS NULL`,
      ),
      'a CAPA created with no source record carries NO lineage row — so the CAUSED rows above are evidence of the raise path, not of a blanket write',
    ).toBe('0')

    // The mapping itself, stated as observable behaviour: every live
    // NC-caused link points at a CAPA whose own source columns agree with it.
    // A lineage row that disagreed with the CAPA's provenance would mean the two
    // records of the same fact had drifted — which is the failure mode worth
    // catching, and the one nothing else in the suite looks for.
    const disagreeing = sqlValue(
      `SELECT count(*) FROM record_links rl
         JOIN capas c ON c.id = rl.to_id
        WHERE rl.to_type = 'Capa' AND rl.from_type = 'Nonconformance'
          AND rl.relation = 'CAUSED' AND rl.deleted_at IS NULL
          AND c.company_id = ${q(COMPANY_ID)} AND c.source_type = 'NC'
          AND c.source_id IS DISTINCT FROM rl.from_id`,
    )
    expect(
      Number(disagreeing),
      "every NC-sourced CAPA's lineage row names the same NC its own source_id does",
    ).toBe(0)

    await ctx.close()
  })
})
