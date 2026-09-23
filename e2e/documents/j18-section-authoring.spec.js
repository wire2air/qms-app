// PW-J18 · OQ-01 TC-01-03 (URS-DOC-03) — "Section authoring."
//
// THE GAP THIS CLOSES. The documents suite could author section *content*
// (`fillAllSections` types into every body editor so the submit gate clears)
// and nothing else. TC-01-03's other five steps — sequential numbering, INSERT
// BETWEEN with renumbering, an attachment section, a byte-identical download,
// and a second permitted reader seeing the same thing — had no coverage at all.
//
// HOW THE DRAFT GETS HERE. This spec mints its own DRAFT at the data layer with
// `seedDraftDocument()` below — a LOCAL helper, deliberately not added to
// e2e/fixtures — rather than driving `createSopDocument`.
//
// That is a fixture, not a shortcut past a control. Nothing in TC-01-03 is
// about creation (that is TC-01-01, covered by PW-J1 and PW-J12), the row is
// written column-for-column the way DocumentsCreate writes one, and every
// assertion below is against the real UI and the real database. What it buys is
// independence: this file has five UI-heavy tests, and routing each of them
// through the full create form would make section authoring fail whenever the
// create form, the seeded template or its inherited approval flow moved — which
// is exactly what happened to the whole documents suite mid-2026-09-22, when a
// missing `document_templates.workflow_id` took PW-J1 and everything downstream
// of `createSopDocument` red. Titles start 'E2E ' so documents.setup.js purges
// them on the next run.
//
// WHAT IS ASSERTED AT WHICH LAYER. Section numbering is a DISPLAY property in
// this product — DocumentVersionSection renders `index + 1` over a list sorted
// by `document_sections.order`, and nothing writes a number to a column. So the
// numbering steps are asserted on screen AND against the `order` column that
// produces them; a control that exists only in the UI is recorded as such.
import { test, expect } from '@playwright/test'
import { AUTH, USERS, COMPANY_ID, FIXTURES } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import { uniqueTitle } from '../fixtures/documents.js'

// The seeded approval workflow version, from qms/database/e2e-seed.sql §9
// ('E2E Document Approval', one PUBLISHED current version). Referenced by id
// rather than resolved by name: the tenant carries more than one APPROVAL
// workflow and their names have drifted from cast.js before, while an id
// written by the seed cannot.
const SEED_WORKFLOW_VERSION_ID = 'e2ef0002-0000-4000-8000-000000000001'
const SEED_SOP_TEMPLATE_ID = 'e2e50000-0000-4000-8000-000000000001'

// A small, distinctive payload. PDF because `application/pdf` is in
// uploadService's ALLOWED_FILE_TYPES and `text/plain` is not — a text file
// comes back as a 400 that reads like an authorization failure. The filler
// makes a truncated or re-encoded round trip visible as a length mismatch
// rather than a coincidence.
const PDF_BYTES = Buffer.from(
  `%PDF-1.4\n% PW-J18 attachment round-trip payload\n% ${'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.repeat(4)}\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
  'utf8',
)

/**
 * Mint a DRAFT v1.0 with two text sections, straight into Postgres.
 *
 * Column-for-column what `DocumentsCreate.createDocument` writes: ACTIVE
 * document, DRAFT is_latest version, cloned sections with `is_add_on` false.
 * `doc_number` is left NULL because numbering is deferred to first submission
 * (TC-01-01 step 6 / TC-01-02).
 *
 * Runs as the superuser psql connection on purpose — this is arranging a
 * fixture, not exercising a control, and RLS is exercised where it matters by
 * the cross-persona read at the end of this file.
 *
 * @returns {{documentId: string, versionId: string, title: string}}
 */
function seedDraftDocument(tag, sections = ['Purpose', 'Procedure']) {
  const title = uniqueTitle(tag)
  const rows = sections.map((t, i) => `('${t.replace(/'/g, "''")}', ${i})`).join(', ')
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
      SELECT gen_random_uuid(), '${COMPANY_ID}', v.document_id, v.id, x.t, 'text', '', x.o,
             '${USERS.author.id}', '${USERS.author.id}', false, now(), now()
        FROM v, (VALUES ${rows}) AS x(t, o)
      RETURNING 1
    )
    SELECT v.document_id || '|' || v.id FROM v;
  `)
  const [documentId, versionId] = out.trim().split('|')
  expect(documentId, 'the draft fixture really was written').toMatch(/^[0-9a-f-]{36}$/)
  const sectionIds = sectionsOf(versionId).map((x) => x.id)
  expect(sectionIds, 'with one row per requested section').toHaveLength(sections.length)
  return { documentId, versionId, title, sectionIds }
}

/** `[{id, title, order, sectionType}]` in stored order — the data-layer oracle. */
function sectionsOf(versionId) {
  const out = sql(
    `SELECT id, title, "order", section_type FROM document_sections
      WHERE document_version_id = '${versionId}' AND deleted_at IS NULL
      ORDER BY "order", created_at`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [id, title, order, sectionType] = line.split('|')
    return { id, title, order: Number(order), sectionType }
  })
}

/**
 * The <section> element for one document section.
 *
 * Addressed by id, because DocumentVersionSectionsList renders
 * `<section :id="section.id">` and the page contains OTHER <section> elements
 * (the approval strip, the rails). `page.locator('section').first()` therefore
 * resolves to whichever of those comes first in the DOM, not to section 1 —
 * which is how the first run of this file spent 25s waiting for a
 * contenteditable inside the approval strip.
 */
function sectionEl(page, sectionId) {
  return page.locator(`section[id="${sectionId}"]`)
}

/**
 * Open a document and wait for its section list to actually render.
 *
 * Reloads between attempts rather than waiting once. A context created by
 * `browser.newContext()` bootstraps every synced model into a cold IndexedDB
 * before the detail page can render anything but skeletons, and a Document /
 * DocumentVersion / DocumentSection trio written a second earlier can be missed
 * by the in-flight bootstrap page entirely — the socket push arrives before the
 * page is listening. A reload re-pulls via delta-sync and picks it up; a longer
 * single wait does not, and that is how step 6 first failed here (60s against a
 * page whose IDB simply never learned about the document).
 *
 * If it never renders, the usual cause is that this persona has no RLS read
 * path to the record (see `documents_sel`), not a slow page.
 */
async function openDocument(page, documentId, firstSectionId) {
  await expect(async () => {
    await page.goto(`/documents/${documentId}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await expect(
      sectionEl(page, firstSectionId),
      'the document body rendered (not a wall of skeletons, and this persona can read it)',
    ).toBeVisible({ timeout: 30_000 })
  }).toPass({ timeout: 120_000 })
}

/**
 * The numbered section list as the reader sees it, read from the Table of
 * Contents rail: ["1. Purpose", "2. Procedure", …].
 *
 * THE TOC, NOT THE BODY HEADINGS, and the reason is a real product behaviour
 * rather than selector convenience. DocumentVersionSection renders a section's
 * title as an `<h2>` ONLY when it is inherited from the template; a user-added
 * (`is_add_on`) section renders an editable `<input>` instead, with its number
 * in a sibling `<span>` — and an attachment-only section shows the FILE name in
 * the body, not the section title at all. So body headings cannot give a
 * uniform list across mixed section types, and the first run of this file
 * failed on exactly that: the appended "Responsibilities" section was present
 * and correctly numbered, but as a textbox.
 *
 * The TOC is also an INDEPENDENT rendering of the same numbering — a separate
 * `index + 1` over its own `orderBy('order')` query in
 * DocumentsMainContentRight — so asserting it is not asserting the same line of
 * code twice. `bodyHeadings()` below still checks the body for the template
 * sections, so both renderings are covered.
 */
async function tocEntries(page) {
  // Every TOC row is `<a :href="'#' + section.id">`; nothing else on the
  // document page links to a fragment, so the href prefix is enough to scope
  // it without depending on the rail card's own markup.
  const toc = page.locator('a[href^="#"]')
  await expect(toc.first(), 'the Table of Contents rendered').toBeVisible({ timeout: 40_000 })
  const raw = await toc.allInnerTexts()
  return raw.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

/** Body `<h2>` headings — template sections only, by the rule above. */
async function bodyHeadings(page) {
  const raw = await page.locator('section[id] h2').filter({ hasText: /\S/ }).allInnerTexts()
  return raw.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

/**
 * Add a section through the real dialog. Always APPENDS — see the renumbering
 * test for why that matters.
 *
 * The dialog's own `role="dialog"` root is a zero-size positioning wrapper and
 * reads as hidden to Playwright, so everything is scoped to the headlessui
 * portal instead (same idiom as `submitForReview`'s collaborator gate).
 */
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

test.describe.serial('PW-J18 · TC-01-03 · section authoring', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Steps 1 + 2 — author content, and confirm sequential numbering.
  // ─────────────────────────────────────────────────────────────────────────

  test('TC-01-03 steps 1-2 · a heading, a list and a table save and render as entered, and sections are numbered sequentially', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    const { documentId, versionId, sectionIds } = seedDraftDocument('J18-content')
    await openDocument(page, documentId, sectionIds[0])

    // Step 2 first, because it is a property of the page as it already stands:
    // two sections, numbered 1 and 2, in stored order.
    expect(
      await tocEntries(page),
      'sections are numbered sequentially from 1, in stored order',
    ).toEqual(['1. Purpose', '2. Procedure'])
    expect(
      await bodyHeadings(page),
      'and the body renders the same numbers over the same titles',
    ).toEqual(['1. Purpose', '2. Procedure'])
    expect(
      sectionsOf(versionId).map((s) => s.order),
      'and the `order` column those numbers are derived from is 0-based and gapless',
    ).toEqual([0, 1])

    // Step 1 — rich content into section 1. Driven through the real toolbar
    // (persistent buttons carrying `title=`), not the selection bubble menu,
    // which only appears over a selection and is flaky to summon.
    // Scope the toolbar to THIS section's own wrapper. Every editable section
    // renders its own EditorToolbar, so a page-wide `getByTitle('Bullet List')`
    // would resolve to whichever one happens to be first in the DOM rather than
    // the one whose editor has the caret — a silent no-op if they ever diverge.
    const section1 = sectionEl(page, sectionIds[0])
    const toolbar = (label) => section1.getByTitle(label).first()
    const editor = section1.locator('.section-content [contenteditable="true"]').first()

    // ORDER MATTERS, AND SO DOES THE RE-CLICK. A toolbar button is a real
    // <button>, so pressing it moves focus out of the contenteditable; the
    // NEXT `keyboard.insertText` then lands nowhere. So: set the block type
    // FIRST, click back into the editor, and only then type.
    //
    // Typing first and formatting after was the obvious order and it is wrong
    // here — it produced `<ul><li><p>Sterilisation steps</p></li></ul>`,
    // i.e. the "heading" silently became the first bullet, because the H3
    // toggle never reached a focused editor and the later Bullet List toggle
    // did.
    await editor.click()
    await toolbar('Sub-section (N.1)').click()
    await editor.click()
    await page.keyboard.insertText('Sterilisation steps')
    await page.keyboard.press('Enter')

    await toolbar('Bullet List').click()
    await editor.click()
    await page.keyboard.insertText('Gown before entry')
    await page.keyboard.press('Enter')
    await page.keyboard.insertText('Log the cycle number')
    // Two Enters leave the list: the first opens an empty item, the second
    // lifts out of it. Toggling Bullet List off instead un-lists the whole
    // block, taking both items with it.
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')

    await toolbar('Insert Table').click()

    // Blur so the debounced section save (500ms) fires, then confirm the write
    // landed in Postgres rather than only in the editor's memory.
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    const contentIs = (pattern) =>
      sqlValue(
        `SELECT count(*) FROM document_sections
          WHERE document_version_id = '${versionId}' AND "order" = 0
            AND content ~ '${pattern}'`,
      )
    await expect(async () => {
      expect(contentIs('<h3'), 'the heading persisted as a real heading node').not.toBe('0')
      expect(contentIs('<ul'), 'the list persisted as a real list node').not.toBe('0')
      expect(contentIs('<table'), 'the table persisted as a real table node').not.toBe('0')
    }).toPass({ timeout: 30_000 })

    // …and renders back as entered after a reload (the round trip through
    // storage, which is what "renders as entered" actually claims).
    await page.reload({ waitUntil: 'domcontentloaded' })
    const reloaded = sectionEl(page, sectionIds[0])
    await expect(reloaded.locator('h3')).toContainText('Sterilisation steps', { timeout: 60_000 })
    await expect(reloaded.locator('ul li').first()).toContainText('Gown before entry')
    await expect(reloaded.locator('table').first()).toBeVisible()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3 — insert BETWEEN, and renumber. This is the defect.
  // ─────────────────────────────────────────────────────────────────────────

  test('TC-01-03 step 3 · KNOWN DEFECT DOC-SEC-01: a new section can only be APPENDED — there is no insert-between control, so the step is not executable', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    // KNOWN DEFECT (name: DOC-SEC-01).
    //
    // WHAT THE PROTOCOL DEMANDS — step 3: "Insert a new section between the two
    // existing sections → The new section takes the correct position and the
    // following sections renumber."
    //
    // WHAT THE PRODUCT DOES: there is exactly one way to add a section, the
    // "Add Section" button at the foot of the list, and
    // DocumentsAddSectionDialog writes `order: props.currentSectionCount` —
    // i.e. always one past the last, always an append. DocumentVersionSectionsList
    // renders no per-section "insert above/below" affordance, no drag handle
    // and no move control, and no component in src/components/documents writes
    // `order` for an existing section. So a new section cannot be placed
    // between two existing ones through the interface at all.
    //
    // The consequence is narrower than it sounds, and the next test measures
    // it: numbering IS derived from position, so renumbering is automatic
    // whenever the order changes. What is missing is the ability to change it.
    //
    // This test pins the ACTUAL behaviour — append — rather than failing on a
    // control that does not exist.
    const { documentId, versionId, sectionIds } = seedDraftDocument('J18-insert')
    await openDocument(page, documentId, sectionIds[0])
    expect(await tocEntries(page)).toEqual(['1. Purpose', '2. Procedure'])

    // There is no insert-between affordance anywhere on the page.
    await expect(
      page.getByRole('button', { name: /insert (section )?(above|below|between)/i }),
      'no insert-above / insert-below control exists',
    ).toHaveCount(0)
    const addButtons = page.getByRole('button', { name: /^add section$/i })
    expect(
      await addButtons.count(),
      'exactly one Add Section control exists, and it sits below the whole list',
    ).toBe(1)

    await addSection(page, 'Responsibilities', 'Attachments')

    // It landed LAST, not between. Asserted on screen…
    await expect(async () => {
      expect(await tocEntries(page)).toEqual([
        '1. Purpose',
        '2. Procedure',
        '3. Responsibilities',
      ])
    }).toPass({ timeout: 40_000 })

    // …and in the column that decides it: order 2, past the existing 0 and 1.
    const stored = sectionsOf(versionId)
    expect(
      stored.map((s) => [s.title, s.order]),
      'the new section is appended at the end, not inserted between',
    ).toEqual([
      ['Purpose', 0],
      ['Procedure', 1],
      ['Responsibilities', 2],
    ])
    expect(
      stored.find((s) => s.title === 'Procedure').order,
      'and nothing renumbered, because nothing moved',
    ).toBe(1)
  })

  test('TC-01-03 step 3 (second half) · numbering IS positional — a section placed between two others renumbers the ones after it', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    // The half of step 3 that the product DOES satisfy, separated from the half
    // it does not (DOC-SEC-01 above) so the two are not confused.
    //
    // Numbering is never stored: DocumentVersionSection renders `{{ index + 1 }}`
    // over a list `.orderBy('order', 'asc')`, so the displayed number of every
    // section after an insertion point is a function of position alone. This
    // test forces the insertion the interface cannot perform — writing `order`
    // directly — and then asserts the RENDERED numbers shift.
    //
    // Recorded plainly: the renumbering half of step 3 is an INTERFACE
    // behaviour, derived at render time. No trigger, constraint or column
    // maintains a section number, so nothing renumbers anything at the data
    // layer, and a writer that produces duplicate or gapped `order` values is
    // not refused.
    const { documentId, versionId, sectionIds } = seedDraftDocument('J18-renumber')
    await openDocument(page, documentId, sectionIds[0])
    expect(await tocEntries(page)).toEqual(['1. Purpose', '2. Procedure'])

    // Make room at position 1 and drop a section in, the way an insert-between
    // control would have to.
    sql(
      `UPDATE document_sections SET "order" = "order" + 1
        WHERE document_version_id = '${versionId}' AND "order" >= 1 AND deleted_at IS NULL`,
    )
    sql(`
      INSERT INTO document_sections (
        id, company_id, document_id, document_version_id, title, section_type, content, "order",
        created_by, updated_by, is_add_on, created_at, updated_at)
      SELECT gen_random_uuid(), '${COMPANY_ID}', document_id, '${versionId}', 'Scope', 'text', '', 1,
             '${USERS.author.id}', '${USERS.author.id}', true, now(), now()
        FROM document_versions WHERE id = '${versionId}';`)

    expect(
      sectionsOf(versionId).map((s) => [s.title, s.order]),
      'stored order now puts Scope between Purpose and Procedure',
    ).toEqual([
      ['Purpose', 0],
      ['Scope', 1],
      ['Procedure', 2],
    ])

    // The rendered numbers followed: Procedure was 2, it is now 3.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(async () => {
      expect(
        await tocEntries(page),
        'the inserted section takes position 2 and Procedure renumbers to 3',
      ).toEqual(['1. Purpose', '2. Scope', '3. Procedure'])
    }).toPass({ timeout: 60_000 })

    // The recorded caveat: nothing at the data layer maintains these numbers.
    // Duplicate `order` values are accepted, so two sections can render with
    // the same number and the tie is broken by an unspecified secondary sort.
    expect(
      sqlValue(
        `SELECT count(*) FROM pg_indexes
          WHERE tablename = 'document_sections'
            AND indexdef ILIKE '%UNIQUE%'
            AND indexdef ILIKE '%order%'
            AND indexdef ILIKE '%document_version_id%'`,
      ),
      'there is NO unique index on (document_version_id, order) — numbering is display-only',
    ).toBe('0')
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Steps 4 + 5 — attachment section, upload, and a byte-identical download.
  // ─────────────────────────────────────────────────────────────────────────

  test('TC-01-03 steps 4-5 · an attachment section uploads a file, links it to the section, and downloads byte-for-byte unchanged', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    const { documentId, versionId, sectionIds } = seedDraftDocument('J18-attach')
    await openDocument(page, documentId, sectionIds[0])

    await addSection(page, 'Evidence', 'Attachments')

    // The attachment section renders a real <input type=file> (BaseUploader's
    // dropzone), so setInputFiles works — no file-chooser interception needed.
    const fileInput = page.locator('input[type=file]')
    await expect(fileInput, 'the attachment section exposes an upload control').toHaveCount(1, {
      timeout: 40_000,
    })
    await fileInput.setInputFiles({
      name: 'j18-evidence.pdf',
      mimeType: 'application/pdf',
      buffer: PDF_BYTES,
    })
    // BaseUploader queues the file and only POSTs on "Finalize Upload".
    await page.getByRole('button', { name: /finalize upload/i }).click()

    // Step 4's "retrievable from the section" is a DATA claim, so it is read
    // from the column the section owns — `document_sections.attachments` — not
    // from the fact that a filename appeared on screen.
    const readAttachmentUrl = () =>
      sqlValue(
        `SELECT attachments->0->>'url' FROM document_sections
          WHERE document_version_id = '${versionId}' AND section_type = 'attachment'
            AND deleted_at IS NULL`,
      )
    await expect
      .poll(readAttachmentUrl, {
        timeout: 60_000,
        message: 'the upload is linked to the attachment section',
      })
      .toMatch(/^\/api\/v1\/files\//)
    const attachmentUrl = readAttachmentUrl()

    // The asset row behind it: right size, right type, attributed to the
    // uploading author, and stored (not an `is_external` link — see the demo
    // seed's image trick, which this must not be).
    const asset = sql(
      `SELECT original_filename, mime_type, file_size, uploaded_by, is_external
         FROM assets WHERE url = '${attachmentUrl}' AND deleted_at IS NULL
         ORDER BY created_at DESC LIMIT 1`,
    ).split('|')
    expect(asset[0], 'the original filename is preserved').toBe('j18-evidence.pdf')
    expect(asset[1]).toBe('application/pdf')
    expect(Number(asset[2]), 'the stored size matches the source byte count').toBe(PDF_BYTES.length)
    expect(asset[3], 'and the upload is attributed to the author who made it').toBe(USERS.author.id)
    expect(asset[4], 'the file is really stored, not an external link').toBe('f')

    await expect(
      page.getByText('j18-evidence.pdf').first(),
      'and the section shows the file to the author',
    ).toBeVisible({ timeout: 30_000 })

    // Step 5 — download and compare CONTENT, not existence. `page.request`
    // carries the persona's cookies, so this is the same fetch the browser
    // would make when the user clicks the file.
    const res = await page.request.get(attachmentUrl)
    expect(res.status(), `download failed: ${await res.text().catch(() => '')}`).toBe(200)
    const downloaded = await res.body()
    expect(downloaded.length, 'the downloaded file is the same length as the source').toBe(
      PDF_BYTES.length,
    )
    expect(
      downloaded.equals(PDF_BYTES),
      'the downloaded bytes are IDENTICAL to the uploaded bytes',
    ).toBe(true)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Step 6 — a different permitted user sees the same thing.
  // ─────────────────────────────────────────────────────────────────────────

  test('TC-01-03 step 6 · a different permitted user sees every section and the attachment, identical', async ({
    browser,
  }) => {
    test.setTimeout(420_000)
    const { documentId, versionId, sectionIds } = seedDraftDocument('J18-share')

    // Author adds one attachment section with a file.
    const authorCtx = await browser.newContext({ storageState: AUTH.author })
    const authorPage = await authorCtx.newPage()
    try {
      await openDocument(authorPage, documentId, sectionIds[0])
      await addSection(authorPage, 'Evidence', 'Attachments')
      const fileInput = authorPage.locator('input[type=file]')
      await expect(fileInput).toHaveCount(1, { timeout: 40_000 })
      await fileInput.setInputFiles({
        name: 'j18-shared.pdf',
        mimeType: 'application/pdf',
        buffer: PDF_BYTES,
      })
      await authorPage.getByRole('button', { name: /finalize upload/i }).click()
      await expect
        .poll(
          () =>
            sqlValue(
              `SELECT count(*) FROM document_sections
                WHERE document_version_id = '${versionId}' AND section_type = 'attachment'
                  AND jsonb_array_length(coalesce(attachments, '[]'::jsonb)) > 0`,
            ),
          { timeout: 60_000, message: 'the author’s upload landed before the second reader opens it' },
        )
        .toBe('1')
    } finally {
      await authorCtx.close()
    }

    // WHO "a different permitted user" HAS TO BE, AND WHY IT IS NOT JUST ANYONE
    // WITH READ. `documents_sel`'s permission branch requires an EFFECTIVE
    // version to exist — drafts are deliberately private, which PW-J9 already
    // records ("a freshly-created document sits at a DRAFT version, which the
    // RLS read gate keeps private to its author/collaborators/owner by design").
    // So a tenant-scope reader is NOT permitted on this draft, and using one
    // here would be testing the denial, not step 6.
    //
    // The route that IS open on a draft is `is_document_collaborator_or_owner`,
    // so the Controller is made a collaborator — the same row
    // DocumentsCollaborationCard writes when a user is added on screen. The
    // Controller already holds document_control:read, which the page guard
    // needs before RLS is ever consulted.
    sql(
      `INSERT INTO users_on_documents (id, user_id, document_id, company_id, created_at, updated_at)
       VALUES (gen_random_uuid(), '${USERS.controller.id}', '${documentId}', '${COMPANY_ID}', now(), now())`,
    )
    const readerCtx = await browser.newContext({ storageState: AUTH.controller })
    const readerPage = await readerCtx.newPage()
    try {
      await openDocument(readerPage, documentId, sectionIds[0])

      expect(
        await tocEntries(readerPage),
        'the second reader sees the same sections, in the same order, with the same numbers',
      ).toEqual(['1. Purpose', '2. Procedure', '3. Evidence'])

      await expect(
        readerPage.getByText('j18-shared.pdf').first(),
        'and the attachment is present for them too',
      ).toBeVisible({ timeout: 40_000 })

      // "Identical" checked at the byte level, from the second persona's own
      // session — a permitted reader must get the same file, not a placeholder.
      const url = sqlValue(
        `SELECT attachments->0->>'url' FROM document_sections
          WHERE document_version_id = '${versionId}' AND section_type = 'attachment'
            AND deleted_at IS NULL`,
      )
      const res = await readerPage.request.get(url)
      expect(res.status(), 'the second reader can fetch the attachment').toBe(200)
      expect(
        (await res.body()).equals(PDF_BYTES),
        'and receives byte-for-byte the file the author uploaded',
      ).toBe(true)
    } finally {
      await readerCtx.close()
    }
  })
})
