// PW-J21 · OQ-01 TC-01-03 (URS-DOC-03) — the half of "attachments" PW-J18
// does not reach: DOES AN ATTACHMENT SURVIVE A VERSION CHANGE?
//
// ── WHAT PW-J18 ALREADY COVERS ───────────────────────────────────────────────
//
// PW-J18 is the section-authoring spec and it is thorough on the two questions
// it asks. Read in full before writing this file; for the record, it closes:
//
//   • RENUMBERING — covered, and covered honestly, in TWO tests. One pins
//     KNOWN DEFECT DOC-SEC-01 (there is no insert-between control at all;
//     `DocumentsAddSectionDialog` writes `order: props.currentSectionCount`, so
//     every add is an append) and the other forces the insertion at the data
//     layer and proves the RENDERED numbers shift, recording that numbering is
//     display-only — `{{ index + 1 }}` over an `orderBy('order')` list, with no
//     unique index on (document_version_id, order) to back it. Nothing about
//     renumbering is missing; this file does not revisit it.
//
//   • ATTACHMENTS — covered for UPLOAD and RETRIEVAL. Steps 4-5 add an
//     attachment section, upload a PDF, assert `document_sections.attachments->0->>'url'`,
//     assert the `assets` row (filename, mime, byte size, uploader, is_external
//     false), and download it back byte-for-byte. Step 6 repeats the download
//     from a SECOND permitted persona's session.
//
// ── THE GAP ──────────────────────────────────────────────────────────────────
//
// The requirement is "upload + retrieval + THAT THE ATTACHMENT SURVIVES A
// VERSION CHANGE." Every PW-J18 arm lives inside ONE version. Not one of its
// tests creates a second version, and `versionsOf()` is never called in the
// file. So the third clause — the one that is actually about document CONTROL
// rather than file storage — has no coverage at all.
//
// It is also the clause most likely to break silently, and this product has the
// scar to prove it. `DocumentsPageId.handleNewVersionConfirm` clones the prior
// version's sections field by field, and its own in-code comment records that
// `instructions` and `isAddOn` were each omitted from that list once — "the same
// class of bug as `instructions`: omitted here, so it fell back to the model
// default of false and every section the AUTHOR added came back locked on the
// next version." `attachments: section.attachments` sits in that same literal.
// A future edit dropping that one line loses every attachment on every revision
// of every controlled document, with no error, no empty state and nothing in
// the interface to suggest a file was ever there.
//
// THE CLONE IS ALSO CLIENT-SIDE. It is a `useLiveMutation` running in the
// browser — there is no server-side "create next version" endpoint that carries
// sections forward (the API's POSTs under routes/documents are setEffective /
// submitForReview / cancelReview / delete / snapshot-verify / verifyIdentity /
// reviews, all verbs on an existing version). So the carry-forward is performed
// by the client, which means it must be tested THROUGH the client. This file
// drives the real "Create New Draft" → "Create New Revision" dialog rather than
// writing the new version at the data layer, because a data-layer fixture would
// skip the very code under test.
//
// ── WHAT IS ASSERTED, AND AT WHICH LAYER ─────────────────────────────────────
//
//   1. The new version really is a new row (v2.0, DRAFT, is_latest) — otherwise
//      "survived" is a claim about one version compared with itself.
//   2. The attachment section was carried forward, and its `attachments` JSONB
//      is byte-identical to the previous version's.
//   3. The URL still resolves and returns THE SAME BYTES — the file, not just
//      the reference. A dangling reference that renders a filename and 404s on
//      click is the realistic failure mode and looks fine on screen.
//   4. The asset row is SHARED, not duplicated — both versions point at one
//      `assets` row. Asserted because the opposite (a copy per revision) would
//      also "survive" while quietly multiplying storage on every revision.
//   5. The ORIGINAL version's attachment is untouched — a superseded revision
//      must still show what it actually contained, which is the whole point of
//      version control over a controlled document.
//
// ── HOW THE FIXTURE GETS HERE ────────────────────────────────────────────────
// "Create New Draft" is gated on the latest version being APPROVED or EFFECTIVE
// (`handleNewVersionConfirm`'s own guard, and `visible: !!canCreate` in
// documentDetailConfig.js). This file mints v1.0 and walks it to EFFECTIVE at
// the data layer through the trusted trigger's LEGAL edges only
// (DRAFT→IN_REVIEW→APPROVED→EFFECTIVE), for the reason PW-J18 gives for its own
// fixture: driving the full approval workflow would make section-attachment
// coverage hostage to the seeded template's approval flow, which PW-J13 records
// going missing mid-2026-09-22 and taking the whole suite red. The upload, the
// revision and every assertion still go through the real product.
//
// Titles start 'E2E ' so documents.setup.js purges them.
// Measured 2026-09-23 against the live local stack (app-db + api :4000).
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, COMPANY_ID, FIXTURES } from '../fixtures/cast.js'
import { uniqueTitle, createNewRevision } from '../fixtures/documents.js'
import { sql, sqlValue, versionsOf } from '../fixtures/db.js'

const SEED_SOP_TEMPLATE_ID = 'e2e50000-0000-4000-8000-000000000001'
const SEED_WORKFLOW_VERSION_ID = 'e2ef0002-0000-4000-8000-000000000001'

// A distinctive payload, for PW-J18's reason: `application/pdf` is in
// uploadService's ALLOWED_FILE_TYPES and `text/plain` is not (a text file comes
// back as a 400 that reads like an authorization failure). The filler makes a
// truncated or re-encoded round trip visible as a length mismatch rather than a
// coincidence — which matters more here than in J18, since the whole question
// is whether the SAME bytes come back after a version change.
const PDF_BYTES = Buffer.from(
  `%PDF-1.4\n% PW-J21 attachment version-carry payload\n% ${'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.repeat(6)}\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
  'utf8',
)

/**
 * Mint a document whose v1.0 is EFFECTIVE, with two text sections.
 *
 * LOCAL helper (this task may not touch shared fixtures). Column-for-column
 * what `DocumentsCreate.createDocument` writes, then walked to EFFECTIVE
 * through the trusted guard's LEGAL edges one at a time — never by inserting
 * an already-effective row, which `enforce_document_version_transition()` would
 * refuse on the untrusted path and which would skip the guard on the trusted
 * one. `auto_effective_on_approval` is left true to match the seeded template.
 */
function seedEffectiveDocument(tag) {
  const title = uniqueTitle(tag)
  const out = sql(`
    WITH d AS (
      INSERT INTO documents (
        id, company_id, title, status_id, author_id, user_id, department_id, site_id, prefix,
        document_template_id, workflow_version_id, periodic_review_months,
        auto_effective_on_approval, applies_all_sites, created_at, updated_at)
      SELECT gen_random_uuid(), '${COMPANY_ID}', '${title}', 'ACTIVE',
             '${USERS.author.id}', '${USERS.author.id}', u.department_id, u.site_id,
             '${FIXTURES.sopTemplatePrefix}', '${SEED_SOP_TEMPLATE_ID}',
             '${SEED_WORKFLOW_VERSION_ID}', 12, true, true, now(), now()
        FROM users u WHERE u.id = '${USERS.author.id}'
      RETURNING id
    ), v AS (
      INSERT INTO document_versions (
        id, company_id, document_id, version_major, version_minor, status_id, is_latest,
        created_at, updated_at)
      SELECT gen_random_uuid(), '${COMPANY_ID}', d.id, 1, 0, 'DRAFT', true, now(), now() FROM d
      RETURNING id, document_id
    ), s AS (
      INSERT INTO document_sections (
        id, company_id, document_id, document_version_id, title, section_type, content, "order",
        created_by, updated_by, is_add_on, created_at, updated_at)
      SELECT gen_random_uuid(), '${COMPANY_ID}', v.document_id, v.id, x.t, 'text', '<p>E2E</p>', x.o,
             '${USERS.author.id}', '${USERS.author.id}', false, now(), now()
        FROM v, (VALUES ('Purpose', 0), ('Procedure', 1)) AS x(t, o)
      RETURNING 1
    )
    SELECT v.document_id || '|' || v.id FROM v;
  `)
  const [documentId, versionId] = out.trim().split('|')
  expect(documentId, 'the fixture document really was written').toMatch(/^[0-9a-f-]{36}$/)
  return { documentId, versionId, title }
}

/** Walk one version DRAFT → IN_REVIEW → APPROVED → EFFECTIVE, legal edge by legal edge. */
function walkToEffective(versionId) {
  for (const status of ['IN_REVIEW', 'APPROVED', 'EFFECTIVE']) {
    sql(`UPDATE document_versions SET status_id = '${status}' WHERE id = '${versionId}'`)
  }
  expect(
    sqlValue(`SELECT status_id FROM document_versions WHERE id = '${versionId}'`),
    'the fixture version reached EFFECTIVE, so Create New Draft is offered',
  ).toBe('EFFECTIVE')
}

/** The attachment section of one version: `{ id, title, attachments }` or null. */
function attachmentSectionOf(versionId) {
  const out = sql(
    `SELECT id, title, coalesce(attachments::text, 'null') FROM document_sections
      WHERE document_version_id = '${versionId}' AND section_type = 'attachment'
        AND deleted_at IS NULL
      ORDER BY "order" LIMIT 1`,
  )
  if (!out) return null
  const [id, title, attachments] = out.split('|')
  return { id, title, attachments }
}

/** The first attachment URL on one version's attachment section. */
function attachmentUrlOf(versionId) {
  return sqlValue(
    `SELECT attachments->0->>'url' FROM document_sections
      WHERE document_version_id = '${versionId}' AND section_type = 'attachment'
        AND deleted_at IS NULL
      ORDER BY "order" LIMIT 1`,
  )
}

/** `section[id=…]` — the page has other <section> elements (rails, strips). */
function sectionEl(page, sectionId) {
  return page.locator(`section[id="${sectionId}"]`)
}

/**
 * Open a document and wait for its section list to render, reloading between
 * attempts. PW-J18's reasoning applies unchanged: a cold context bootstraps
 * every synced model into IndexedDB before the detail page renders anything but
 * skeletons, and a row written a second earlier can be missed by the in-flight
 * bootstrap entirely — a reload re-pulls via delta-sync, a longer single wait
 * does not.
 */
async function openDocument(page, documentId, anchorSectionId) {
  await expect(async () => {
    await page.goto(`/documents/${documentId}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await expect(
      sectionEl(page, anchorSectionId),
      'the document body rendered (not skeletons, and this persona can read it)',
    ).toBeVisible({ timeout: 30_000 })
  }).toPass({ timeout: 120_000 })
}

/** Add a section through the real dialog (PW-J18's portal idiom). */
async function addSection(page, title, type) {
  await page.getByRole('button', { name: /^add section$/i }).click()
  const portal = page.locator('#headlessui-portal-root')
  await expect(portal.getByText('Add New Section')).toBeVisible({ timeout: 20_000 })
  await portal.getByRole('textbox').first().fill(title)
  if (type !== 'text') {
    await portal.getByRole('button', { name: type }).first().click()
  }
  await portal.getByRole('button', { name: /^add section$/i }).click()
  await expect(portal.getByText('Add New Section')).toBeHidden({ timeout: 20_000 })
}

test.use({ storageState: AUTH.author })

test.describe.serial('PW-J21 · TC-01-03 · an attachment survives a version change', () => {
  let documentId
  let v1Id
  let v2Id
  let v1SectionIds
  let uploadedUrl

  test.afterAll(() => {
    // Leave the tenant as found — the fixture is a real document, not a
    // rolled-back probe. Sections first (FK), then versions, then the document.
    // The uploaded asset is deliberately LEFT: it is referenced by nothing once
    // the sections are gone, and deleting storage rows is outside this spec's
    // remit.
    if (documentId) {
      sql(`DELETE FROM document_sections WHERE document_id = '${documentId}'`)
      sql(`DELETE FROM document_versions WHERE document_id = '${documentId}'`)
      sql(`DELETE FROM documents WHERE id = '${documentId}'`)
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Arrange — an EFFECTIVE v1.0 carrying a real uploaded attachment.
  // ─────────────────────────────────────────────────────────────────────────

  test('ARRANGE · v1.0 carries an attachment section with a real uploaded file, and is EFFECTIVE', async ({
    page,
  }) => {
    test.setTimeout(300_000)
    ;({ documentId, versionId: v1Id } = seedEffectiveDocument('J21-carry'))
    v1SectionIds = sql(
      `SELECT id FROM document_sections WHERE document_version_id = '${v1Id}'
        AND deleted_at IS NULL ORDER BY "order"`,
    )
      .split('\n')
      .filter(Boolean)
    expect(v1SectionIds, 'the fixture has its two text sections').toHaveLength(2)

    // The upload has to happen while v1.0 is still editable — an EFFECTIVE
    // version is read-only, so the file goes on first and the walk to EFFECTIVE
    // follows. That ordering is the product's, not a convenience.
    await openDocument(page, documentId, v1SectionIds[0])
    await addSection(page, 'Evidence', 'Attachments')

    const fileInput = page.locator('input[type=file]')
    await expect(fileInput, 'the attachment section exposes an upload control').toHaveCount(1, {
      timeout: 40_000,
    })
    await fileInput.setInputFiles({
      name: 'j21-evidence.pdf',
      mimeType: 'application/pdf',
      buffer: PDF_BYTES,
    })
    // BaseUploader queues the file and only POSTs on "Finalize Upload".
    await page.getByRole('button', { name: /finalize upload/i }).click()

    await expect
      .poll(() => attachmentUrlOf(v1Id), {
        timeout: 60_000,
        message: 'the upload is linked to v1.0’s attachment section',
      })
      .toMatch(/^\/api\/v1\/files\//)
    uploadedUrl = attachmentUrlOf(v1Id)

    // Pin the source bytes at the source, before any version change, so the
    // comparison after the revision is against a measured value rather than
    // against the same row read twice.
    const res = await page.request.get(uploadedUrl)
    expect(res.status(), `v1.0's attachment downloads: ${await res.text().catch(() => '')}`).toBe(
      200,
    )
    expect(
      (await res.body()).equals(PDF_BYTES),
      'and v1.0 serves byte-for-byte what was uploaded',
    ).toBe(true)

    walkToEffective(v1Id)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Act + Assert — the revision, driven through the real dialog.
  // ─────────────────────────────────────────────────────────────────────────

  test('TC-01-03 · creating a new version carries the attachment section forward, with an identical attachments payload', async ({
    page,
  }) => {
    test.setTimeout(300_000)
    expect(uploadedUrl, 'the ARRANGE step produced an upload').toBeTruthy()
    const v1Attachment = attachmentSectionOf(v1Id)
    expect(v1Attachment, 'v1.0 has an attachment section to carry forward').toBeTruthy()

    // THE REAL DIALOG, not a data-layer insert. The carry-forward lives in
    // `DocumentsPageId.handleNewVersionConfirm` — a client-side useLiveMutation —
    // so writing v2.0 in SQL would create the row this test is meant to inspect
    // and skip the code that is actually under test.
    await createNewRevision(page, documentId, {
      reason: 'E2E J21 — revision to prove the attachment carries forward.',
      changeType: 'Minor',
    })

    // A genuinely NEW version row, and not v1.0 read twice.
    await expect
      .poll(() => versionsOf(documentId).length, {
        timeout: 60_000,
        message: 'the revision dialog created a second version',
      })
      .toBe(2)
    const versions = versionsOf(documentId)
    const v2 = versions.find((v) => v.id !== v1Id)
    expect(v2, 'the new version is a distinct row').toBeTruthy()
    v2Id = v2.id
    expect(v2.label, 'the new version is 2.0').toBe('2.0')
    expect(v2.statusId, 'and it opens in DRAFT').toBe('DRAFT')
    expect(v2.isLatest, 'and it is now the latest version').toBe(true)

    // THE CLAIM: the attachment section came with it.
    await expect
      .poll(() => (attachmentSectionOf(v2Id) ? 'present' : 'missing'), {
        timeout: 60_000,
        message:
          'the attachment SECTION was cloned onto v2.0 (handleNewVersionConfirm’s section loop)',
      })
      .toBe('present')
    const v2Attachment = attachmentSectionOf(v2Id)
    expect(v2Attachment.title, 'with the same section title').toBe(v1Attachment.title)
    expect(
      v2Attachment.id,
      'as a NEW section row — the clone copies, it does not re-point v1.0’s row',
    ).not.toBe(v1Attachment.id)

    // …and the FILE reference came with it, byte-identically as JSONB. This is
    // the single line (`attachments: section.attachments`) whose loss would be
    // invisible on screen, so it is asserted as an exact payload match rather
    // than merely "not empty".
    expect(
      v2Attachment.attachments,
      'the attachments payload is carried forward unchanged — not emptied, not rewritten',
    ).toBe(v1Attachment.attachments)
    expect(attachmentUrlOf(v2Id), 'and resolves to the same stored file').toBe(uploadedUrl)

    // CONTROL — the clone is not simply copying everything because nothing was
    // asked of it. The change-control fields the dialog captured are NEW on
    // v2.0 and absent from v1.0, so the row really was constructed by the
    // revision path and is not a duplicate of v1.0 under a different id.
    expect(
      sqlValue(`SELECT change_reason FROM document_versions WHERE id = '${v2Id}'`),
      'CONTROL: v2.0 carries the change reason the dialog captured',
    ).toContain('E2E J21')
    expect(
      sqlValue(`SELECT coalesce(change_reason, '') FROM document_versions WHERE id = '${v1Id}'`),
      'CONTROL: and v1.0 does not — the two rows are genuinely different versions',
    ).not.toContain('E2E J21')
  })

  test('TC-01-03 · the carried-forward attachment still DOWNLOADS, byte-for-byte, from the new version', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    expect(v2Id, 'the revision step produced v2.0').toBeTruthy()

    // A CARRIED REFERENCE IS NOT A CARRIED FILE. The realistic failure mode is
    // a section whose `attachments` JSONB survives while the asset behind it
    // does not — the filename renders, the page looks correct, and the link
    // 404s the first time an auditor clicks it. So the bytes are fetched, from
    // the v2.0 reference specifically, and compared to the source.
    const v2Url = attachmentUrlOf(v2Id)
    expect(v2Url, 'v2.0 has an attachment URL to fetch').toBeTruthy()

    const res = await page.request.get(v2Url)
    expect(
      res.status(),
      `the carried-forward attachment is still served: ${await res.text().catch(() => '')}`,
    ).toBe(200)
    const body = await res.body()
    expect(body.length, 'the downloaded file is the same length as the source').toBe(
      PDF_BYTES.length,
    )
    expect(
      body.equals(PDF_BYTES),
      'and the bytes are IDENTICAL to what was uploaded against v1.0',
    ).toBe(true)

    // The asset row is SHARED, not duplicated. Asserted because a clone that
    // copied the FILE per revision would also pass every check above while
    // multiplying storage on every revision of every document — a different
    // defect wearing the same green.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM assets
            WHERE company_id = '${COMPANY_ID}' AND original_filename = 'j21-evidence.pdf'
              AND deleted_at IS NULL`,
        ),
      ),
      'exactly ONE asset row backs both versions — the reference is shared, the file is not copied',
    ).toBe(1)

    // And it is a real stored file, not an external link (the demo seed's
    // `is_external` trick, which this must not be).
    const asset = sql(
      `SELECT mime_type, file_size, uploaded_by, is_external FROM assets
        WHERE url = '${uploadedUrl}' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    ).split('|')
    expect(asset[0], 'stored with the right type').toBe('application/pdf')
    expect(Number(asset[1]), 'and the right byte count').toBe(PDF_BYTES.length)
    expect(asset[2], 'attributed to the uploading author').toBe(USERS.author.id)
    expect(asset[3], 'and really stored, not an external link').toBe('f')
  })

  test('TC-01-03 · the SUPERSEDED version keeps its own attachment — a revision does not rewrite history', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    expect(v2Id, 'the revision step produced v2.0').toBeTruthy()

    // The other direction, and the one that makes this a DOCUMENT CONTROL test
    // rather than a file-storage test. "Survives a version change" is only
    // meaningful if the OLD version still shows what it actually contained: a
    // clone that moved (rather than copied) the reference would leave v1.0
    // blank, and an auditor reading the superseded revision would see an
    // evidence section with no evidence in it.
    const v1After = attachmentSectionOf(v1Id)
    expect(v1After, 'v1.0 still has its attachment section after the revision').toBeTruthy()
    expect(
      attachmentUrlOf(v1Id),
      'and it still points at the same stored file',
    ).toBe(uploadedUrl)

    const res = await page.request.get(attachmentUrlOf(v1Id))
    expect(res.status(), 'the superseded version’s attachment still downloads').toBe(200)
    expect(
      (await res.body()).equals(PDF_BYTES),
      'byte-for-byte, unchanged by the revision',
    ).toBe(true)

    // Both versions, one file, two independent section rows — stated as one
    // assertion so the shape of the correct outcome is legible at a glance.
    const rows = sql(
      `SELECT ds.document_version_id, ds.attachments->0->>'url'
         FROM document_sections ds
        WHERE ds.document_id = '${documentId}' AND ds.section_type = 'attachment'
          AND ds.deleted_at IS NULL
        ORDER BY ds.created_at`,
    )
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split('|'))
    expect(rows, 'exactly two attachment sections exist — one per version').toHaveLength(2)
    expect(
      new Set(rows.map((r) => r[0])),
      'and they belong to the two different versions',
    ).toEqual(new Set([v1Id, v2Id]))
    expect(
      new Set(rows.map((r) => r[1])),
      'both pointing at the one shared file',
    ).toEqual(new Set([uploadedUrl]))

    // CONTROL — the reader is really seeing v1.0's own row and not v2.0's under
    // a stale id. The two section rows are distinct primary keys, which the
    // earlier test asserted at creation; re-asserted here against the live
    // table so a later merge of the two rows cannot slip through.
    expect(
      Number(
        sqlValue(
          `SELECT count(DISTINCT id) FROM document_sections
            WHERE document_id = '${documentId}' AND section_type = 'attachment'
              AND deleted_at IS NULL`,
        ),
      ),
      'CONTROL: two distinct section rows, so the comparison above is between two real versions',
    ).toBe(2)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // The regression this file exists to catch, stated in one machine-checkable
  // line so a reviewer reading only the last test still learns the risk.
  // ─────────────────────────────────────────────────────────────────────────

  test('REGRESSION GUARD · every section field the revision path is supposed to carry is present on the new version', async () => {
    expect(v2Id, 'the revision step produced v2.0').toBeTruthy()
    // `handleNewVersionConfirm` clones a fixed list of columns, and this
    // codebase has already shipped TWO bugs of the form "a field was left out of
    // that literal" — `instructions` and `isAddOn`, both recorded in the
    // function's own comments. `attachments` is the third entry in the same
    // list and the one with the least visible failure: a dropped attachment
    // leaves a correctly-titled, entirely empty section.
    //
    // Compared field by field against v1.0 rather than against constants, so
    // the guard cannot drift from the fixture.
    const compare = sql(
      `SELECT v1.title = v2.title,
              v1.section_type = v2.section_type,
              v1.content IS NOT DISTINCT FROM v2.content,
              v1.instructions IS NOT DISTINCT FROM v2.instructions,
              v1.attachments IS NOT DISTINCT FROM v2.attachments,
              v1.is_add_on = v2.is_add_on,
              v1."order" = v2."order"
         FROM document_sections v1
         JOIN document_sections v2
           ON v2.document_version_id = '${v2Id}' AND v2."order" = v1."order"
        WHERE v1.document_version_id = '${v1Id}' AND v1.section_type = 'attachment'
          AND v1.deleted_at IS NULL AND v2.deleted_at IS NULL`,
    )
    expect(compare, 'the attachment section pairs across the two versions').toBeTruthy()
    const [title, type, content, instructions, attachments, isAddOn, order] = compare.split('|')
    expect(title, 'title carried forward').toBe('t')
    expect(type, 'section_type carried forward').toBe('t')
    expect(content, 'content carried forward').toBe('t')
    expect(instructions, 'instructions carried forward (the first bug of this class)').toBe('t')
    expect(attachments, 'attachments carried forward (the field this file guards)').toBe('t')
    expect(isAddOn, 'is_add_on carried forward (the second bug of this class)').toBe('t')
    expect(order, 'order carried forward').toBe('t')
  })
})
