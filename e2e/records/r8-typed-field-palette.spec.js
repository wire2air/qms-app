// REC-J8 · URS-WFL-01 — the TYPED field palette, and field ORDER.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT r1 ALREADY PROVES, AND THE TWO HOLES IT LEAVES
//
// `r1-plain-submission.spec.js` drives one submission end to end and seals it.
// Its probe template has exactly TWO fields, both `type: 'text'`. So what r1
// actually demonstrates is that ONE field type round-trips. URS-WFL-01 claims
// something much larger — that a form author can build a form out of a palette
// of DIFFERENTLY-TYPED fields and arrange them in an order of their choosing —
// and neither half of that is reachable from a two-text-field probe.
//
// This file closes both, and keeps them in separate tests because they fail for
// completely different reasons: a type that does not render is a renderer bug,
// an order that does not persist is a builder/SyncEngine bug.
//
// ─────────────────────────────────────────────────────────────────────────────
// 1. THE PALETTE — WHAT IS ASSERTED, AND WHY IT IS ASSERTED THIS WAY
//
// The registry is `src/constants/formBuilderConfig.js` → `FIELD_TYPES`
// (Object.freeze, 31 entries, enumerated 2026-09-23). The renderer is
// `src/components/form/DynamicForm.js`, a render function whose
// `createFieldComponent` switch maps each type to a component.
//
// ⚠ `text` IS NOT A PALETTE TYPE. The first draft of this file probed one and
// counted it toward its total. DynamicForm has a `case 'text'` (line 353) and
// folds it into `input`, but `FIELD_TYPES` has no `text` key — it is a legacy
// alias the renderer still honours for old schemas, not something an author can
// place. `r1-plain-submission`'s two fields are declared `type: 'text'` for that
// historical reason, which is precisely why r1 proves less than it appears to.
// The split below is derived from the registry in the test body so this cannot
// drift again.
//
// A probe template is built carrying ONE field of each of the types a plain
// submission can actually round-trip, and the single submission is then read
// back from `records.payload` — key by key, value by value. That is the whole
// claim: a typed field is only "supported" if what the author declared, what
// the user typed and what Postgres stored are the same thing.
//
// WHICH TYPES, AND THE HONEST REASON FOR EVERY OMISSION. This is a coverage
// test, so a silently narrowed list would be the exact failure mode it exists
// to prevent. The 31 registry types split as follows (18 probed + 13 excluded,
// and the test body checks that arithmetic against FIELD_TYPES itself):
//
//   DRIVEN THROUGH THE UI (6) — every type DynamicForm renders through the
//   BaseTextInput family, i.e. every type with a real `<label for>` ↔
//   `<input id>` pair, which is what `getByLabel` needs, plus the dropdown:
//       input · password · number · email · phone · (select, via listbox)
//
//   ASSERTED AT THE PAYLOAD (12, the rest of the round-trippable set) — types
//   whose label is a hand-rolled `<div>` with no `for`/`id` association
//   (`fieldLabelRow`, DynamicForm.js:290) or a canvas/graphical control:
//       textarea · textEditor · richTextAttachment · datetime · checkbox ·
//       toggle · slider · rating · colorPicker · signature · optionGroup ·
//       lookup
//   These are declared in the schema and their values are submitted with the
//   record, so the round-trip claim is still measured end to end — just not
//   through a keystroke. Writing a fake `getByLabel` for them would not test
//   more, it would test nothing and pass.
//   (`richTextAttachment` round-trips its TEXT half only; its attachments live
//   at the sibling key `<path>_attachments` and need a real MinIO upload, which
//   is the same reason `file`/`photo` are excluded outright.)
//
//   STRUCTURALLY EXCLUDED, with the reason:
//     header / section / row / column / separator / instructions — LAYOUT. They
//       carry no payload key at all (DynamicForm.js:991-1073 renders them
//       before the value switch is ever reached). "Round-trips a value" is not
//       a claim that can be made about them.
//     repeater / inputTable / checklist — CONTAINER types whose payload is an
//       array of sub-rows keyed by a compound path. Real, and worth their own
//       journey; asserting them as a flat key here would misstate their shape.
//     file / photo — require a real upload to MinIO. Covered by the modules
//       that own that surface.
//     rca / riskAssessment — the two TOOL types, which do not store a value in
//       `payload` at all: they derive a `root_causes` / `risk_assessments` row
//       server-side when the enclosing workflow STEP reaches APPROVED. They are
//       meaningless outside a workflow step and are already covered end to end
//       by `e2e/rca/j1` and `e2e/riskAssessment/j1`.
//
// The count is asserted explicitly below so this list cannot silently shrink.
//
// ─────────────────────────────────────────────────────────────────────────────
// 2. FIELD ORDER — AND WHY THE KEYBOARD PATH IS THE RIGHT ONE TO DRIVE
//
// The builder offers no move-up/move-down buttons. Reordering is SortableJS
// drag, plus a keyboard path added for WCAG 2.1.1: the drag grip is a real
// `<button>` (FormCanvasField.vue:419) carrying
// `aria-label="Reorder <label>. Use arrow keys…"`, and FormCanvas.vue's
// `onCanvasKeydown` (lines 113-168) splices the array in place on ↑/↓/Home/End.
//
// Playwright CAN drive SortableJS, but `forceFallback: true` + `fallbackOnBody`
// means the drag runs on a cloned node on `<body>` and needs a hand-rolled
// mouse-move sequence whose reliability is a property of the machine, not of
// the product. The keyboard path reaches the SAME splice through the SAME
// component and is deterministic. It is also the path that was BROKEN — the
// grip was a `<button>` whose only handler was `@click.stop`, so it took focus,
// announced itself as an action and did nothing — which makes it the half with
// a regression history worth guarding.
//
// Order is asserted at `form_templates.schema` (the jsonb array order IS the
// order; there is no `position` field on a field object) and then again where
// it is actually consumed — the rendered fill form.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import { createPersonaPool, deleteProbeRecords, uniqueTag } from '../fixtures/records.js'

const pool = createPersonaPool()

// Own id namespace — nothing else in the suite uses `e2e6f800-…`.
const PALETTE = {
  templateId: 'e2e6f800-0000-4000-8000-000000000001',
  code: 'E2EPAL',
  title: 'E2E Records Palette Form',
}
const ORDER = {
  templateId: 'e2e6f800-0000-4000-8000-000000000002',
  code: 'E2EORD',
  title: 'E2E Records Order Form',
}

/**
 * One field per type, each with the value the submission will carry.
 *
 * `uiLabel` is set ONLY for the types DynamicForm renders through the
 * BaseTextInput family — those are the ones with a real label/input pairing, so
 * those are the ones the browser leg types into. Everything else is submitted
 * with the record and read back from `payload`, which is the same round trip
 * measured one layer down. See the header for why that split is honest rather
 * than convenient.
 */
const FIELDS = [
  { name: 'palInput', type: 'input', label: 'Palette Short Answer', ui: 'Palette Short Answer', value: 'a short answer' },
  // `password` is a REAL palette entry (FIELD_TYPES.password, "Password — a
  // masked text field for secrets"), and it renders through the same
  // BaseTextInput arm as `input` (DynamicForm.js:353-358), so it is driven by
  // keystroke like the rest of that family.
  { name: 'palPassword', type: 'password', label: 'Palette Password', ui: 'Palette Password', value: 'palette-secret-1' },
  { name: 'palNumber', type: 'number', label: 'Palette Number', ui: 'Palette Number', value: '42' },
  { name: 'palEmail', type: 'email', label: 'Palette Email', ui: 'Palette Email', value: 'palette@e2e.test' },
  { name: 'palPhone', type: 'phone', label: 'Palette Phone', ui: 'Palette Phone', value: '5551234567' },
  { name: 'palTextarea', type: 'textarea', label: 'Palette Paragraph', value: '<p>a paragraph</p>' },
  { name: 'palTextEditor', type: 'textEditor', label: 'Palette Rich Text', value: '<p><strong>rich</strong></p>' },
  // `richTextAttachment` is the palette's 4th input type and was missing from
  // the first draft of this list. Its TEXT half is an ordinary payload string;
  // its attachment half lives at the sibling key `<path>_attachments`
  // (DynamicForm.js:425) and needs a real MinIO upload, which is why only the
  // text half is round-tripped here. Labelled by `fieldLabelRow`, so it is
  // asserted at the payload rather than typed into.
  { name: 'palRichAttach', type: 'richTextAttachment', label: 'Palette Rich Text + Attachments', value: '<p>rich with attachments</p>' },
  { name: 'palDatetime', type: 'datetime', label: 'Palette Date', mode: 'date', value: '2026-03-04' },
  { name: 'palCheckbox', type: 'checkbox', label: 'Palette Checkbox', value: true },
  { name: 'palToggle', type: 'toggle', label: 'Palette Toggle', value: true },
  { name: 'palSlider', type: 'slider', label: 'Palette Slider', min: 0, max: 10, value: 7 },
  { name: 'palRating', type: 'rating', label: 'Palette Rating', max: 5, value: 4 },
  { name: 'palColor', type: 'colorPicker', label: 'Palette Colour', value: '#336699' },
  { name: 'palSignature', type: 'signature', label: 'Palette Signature', value: 'data:image/png;base64,iVBORw0KGgo=' },
  {
    name: 'palSelect',
    type: 'select',
    label: 'Palette Dropdown',
    options: [
      { label: 'Option Alpha', value: 'ALPHA' },
      { label: 'Option Beta', value: 'BETA' },
    ],
    value: 'BETA',
  },
  {
    name: 'palOptionGroup',
    type: 'optionGroup',
    groupType: 'radio',
    label: 'Palette Multiple Choice',
    options: [
      { label: 'Choice One', value: 'ONE' },
      { label: 'Choice Two', value: 'TWO' },
    ],
    value: 'TWO',
  },
  { name: 'palLookup', type: 'lookup', lookupEntity: 'product', label: 'Palette Lookup', value: null },
]

// The types typed into through the browser — a real label↔input pairing.
const UI_FIELDS = FIELDS.filter((f) => f.ui)

/** The schema jsonb for a field list, stripped of the test-only `value`/`ui`. */
function schemaJson(fields) {
  return JSON.stringify(
    fields.map(({ value: _v, ui: _u, ...field }) => ({ required: false, ...field })),
  ).replace(/'/g, "''")
}

function provisionTemplate({ templateId, code, title }, fields) {
  // `version` is NEVER forced back to 1 on the conflict path, and that is the
  // trigger's rule rather than a preference. `enforce_form_template_integrity`
  // raises QMSFT on any backwards version move —
  //   "A form template version cannot go backwards (2 -> 1)"
  // with the HINT that says why ("Submitted records freeze template_version").
  // A re-run of this file after the supersession test has left the fixture at
  // v2, so an `ON CONFLICT … SET version = 1` fixture reset is refused by the
  // product and the whole file fails in `beforeAll`. `GREATEST` keeps the reset
  // idempotent while staying on the legal side of the guard. (Measured
  // 2026-09-23: this is exactly how it failed.)
  sql(`
    INSERT INTO form_templates (id, company_id, title, code, kind, status_id, is_module,
                                internal_name, version, config, schema, document_type_id,
                                created_at, updated_at)
    VALUES ('${templateId}', '${COMPANY_ID}', '${title}', '${code}', 'FORM', 'ACTIVE', false,
            NULL, 1, '{"layout":"standard","allowDraft":true}'::jsonb,
            '${schemaJson(fields)}'::jsonb, 'FORM', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE
      SET schema = EXCLUDED.schema, status_id = 'ACTIVE', deleted_at = NULL,
          title = EXCLUDED.title, code = EXCLUDED.code,
          version = GREATEST(form_templates.version, 1);`)
}

/** Field `name`s in the order `form_templates.schema` holds them. */
function schemaOrder(templateId) {
  const out = sql(
    `SELECT string_agg(f->>'name', ',' ORDER BY ord)
       FROM form_templates t,
            LATERAL jsonb_array_elements(t.schema) WITH ORDINALITY AS a(f, ord)
      WHERE t.id = '${templateId}'`,
  )
  return out ? out.split(',') : []
}

function purge(templateId) {
  // ARCHIVE, do not DELETE. `form_templates_protect_referenced` refuses a
  // DELETE of any template that has ever been ACTIVE —
  //   "Form templates cannot be deleted once activated — archive them instead"
  // — which is the product's documented archive-only lifecycle
  // (`formTemplates.js`: "archived rows serve as the version history"). The
  // records and the counter CAN go, and do; the template is parked in ARCHIVED
  // so it leaves every picker without fighting the guard. Its id is reused on
  // the next run through provisionTemplate's ON CONFLICT path.
  sql(`
    DELETE FROM analytics_field_values WHERE record_id IN (SELECT id FROM records WHERE template_id = '${templateId}');
    DELETE FROM records WHERE template_id = '${templateId}';
    DELETE FROM record_counters WHERE template_id = '${templateId}';
    UPDATE form_templates SET status_id = 'ARCHIVED' WHERE id = '${templateId}';`)
}

test.beforeAll(() => {
  provisionTemplate(PALETTE, FIELDS)
  provisionTemplate(ORDER, FIELDS.slice(0, 4))
})
test.afterAll(async () => {
  await pool.close()
  purge(PALETTE.templateId)
  purge(ORDER.templateId)
})

test.describe('REC-J8 — the typed field palette and field order', () => {
  test('every declared field type renders in the fill dialog and round-trips its value into payload', async ({
    browser,
  }) => {
    // The guard against this file silently narrowing. If someone drops a type
    // from FIELDS to make a run go green, this fails first and says so.
    expect(FIELDS.length, 'the palette probe covers 18 distinct typed fields').toBe(18)
    expect(
      new Set(FIELDS.map((f) => f.type)).size,
      'and no type is counted twice',
    ).toBe(18)

    // ── The list is CHECKED AGAINST THE REGISTRY, not against itself. ────────
    // The first draft of this file asserted "17 types" against a list that
    // contained `text` — which is NOT in FIELD_TYPES at all. It is a renderer
    // alias that DynamicForm.js:353-358 folds into `input` ("field.type ===
    // 'input' || field.type === 'text' ? 'text' : field.type"), so no author
    // can ever place one. It also omitted two types that ARE in the palette:
    // `password` and `richTextAttachment`. A hand-maintained count can be
    // internally consistent and still describe a product that does not exist,
    // so the accounting is derived from the registry every run.
    //
    // FIELD_TYPES is `Object.freeze` in src/constants/formBuilderConfig.js.
    // Imported rather than transcribed: a type added to the palette that
    // belongs in neither bucket below turns this red instead of being covered
    // by nobody and noticed by nobody.
    const { FIELD_TYPES } = await import('../../src/constants/formBuilderConfig.js')
    const registry = Object.keys(FIELD_TYPES)
    expect(registry, 'the alias `text` is not a palette type').not.toContain('text')

    // Every registry type is either probed here or excluded for a stated
    // reason. The reasons are in the file header; this is their machine-checked
    // form.
    const EXCLUDED = {
      layout: ['header', 'section', 'row', 'column', 'separator', 'instructions'],
      container: ['repeater', 'inputTable', 'checklist'],
      upload: ['file', 'photo'],
      tool: ['rca', 'riskAssessment'],
    }
    const excluded = Object.values(EXCLUDED).flat()
    const probed = FIELDS.map((f) => f.type)
    expect(
      registry.filter((t) => !probed.includes(t) && !excluded.includes(t)),
      'every palette type is either round-tripped here or excluded with a reason — ' +
        'a newly added field type must be classified, not silently skipped',
    ).toEqual([])
    expect(
      probed.filter((t) => !registry.includes(t)),
      'and nothing is probed that the palette does not actually offer',
    ).toEqual([])

    const page = await pool.page(browser, AUTH.author)
    const tag = uniqueTag('REC-J8')

    // Open the App Builder Submissions tab. The readiness signal is the Add
    // Submission BUTTON, not the page load: the tab renders off the session
    // while everything it lists comes out of IndexedDB after a ~17s bootstrap.
    // One reload retry — a reload restarts the bootstrap from zero, so a tight
    // loop makes this worse rather than better. (Same shape as r1.)
    for (const budget of [60_000, 45_000]) {
      await page.goto('/records?tab=submissions').catch(() => {})
      const ready = await page
        .getByRole('button', { name: 'Add Submission' })
        .first()
        .waitFor({ state: 'visible', timeout: budget })
        .then(() => true)
        .catch(() => false)
      if (ready) break
    }

    await page.getByRole('button', { name: 'Add Submission' }).first().click()

    // Narrow by search before clicking: the picker unions log books and every
    // ACTIVE non-BLOCK template in the tenant, so clicking by title alone is a
    // different test on a machine where another suite added a template.
    await page.getByPlaceholder('Search templates...').fill(PALETTE.title)
    const card = page.getByLabel(`Select template ${PALETTE.title}`)
    await card.waitFor({ state: 'visible', timeout: 60_000 })
    await card.click()

    // ── Every typed control is actually ON SCREEN ──────────────────────────
    // Asserted for ALL 18, not just the ones typed into. This is the palette
    // claim: a type the renderer does not know falls through DynamicForm's
    // `default` arm and paints a red `Invalid Field.type "<type>"` instead of a
    // control — so a missing type is visible here even for the types whose
    // label is a hand-rolled div and which cannot be driven by keystroke.
    for (const f of FIELDS) {
      await expect(
        page.getByText(f.label, { exact: false }).first(),
        `the "${f.type}" field is rendered, labelled "${f.label}"`,
      ).toBeVisible({ timeout: 30_000 })
    }
    await expect(
      page.getByText(/Invalid Field\.type/),
      'no field fell through to the renderer’s unknown-type arm',
    ).toHaveCount(0)

    // ── The types with a real label↔input pairing are typed into ───────────
    // `BaseTextInput` computes `inputId = props.id || props.name || useId()`,
    // and DynamicForm passes `name = scope.path` — so the input's id IS the
    // payload key and `getByLabel` resolves. Only this family gets that; see
    // the header for the rest.
    for (const f of UI_FIELDS) {
      await page.getByLabel(f.ui, { exact: false }).first().fill(String(f.value))
    }

    // ── The dropdown, driven as a user drives it ───────────────────────────
    // `select` renders through OptionSetSelect — a listbox, not an input — so
    // it is picked rather than filled. It is included in the UI leg because it
    // is the one non-text type with a genuine role-based affordance.
    await page.getByText('Palette Dropdown', { exact: false }).first()
      .locator('xpath=following::*[@role="combobox"][1]')
      .click()
    const listbox = page.getByRole('listbox')
    await expect(listbox, 'the dropdown opened').toBeVisible({ timeout: 15_000 })
    await listbox.getByRole('option', { name: 'Option Beta', exact: true }).click()

    const [createResponse] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/v1/services/records') && r.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      page.getByRole('button', { name: 'Save Record' }).click(),
    ])
    expect(createResponse.status(), 'the submission was accepted').toBe(201)

    const id = await waitForSqlValue(
      `SELECT id FROM records WHERE template_id = '${PALETTE.templateId}'
         AND payload->>'palInput' = 'a short answer'`,
      { timeoutMs: 30_000, label: 'the palette submission reached the database' },
    )

    // ── The round trip, key by key, out of Postgres ────────────────────────
    // Each UI field is checked for the value that was TYPED. Reading them from
    // the row rather than the response is deliberate: the response is what the
    // server said, the row is what an auditor will later read.
    for (const f of UI_FIELDS) {
      expect(
        sqlValue(`SELECT payload->>'${f.name}' FROM records WHERE id = '${id}'`),
        `the "${f.type}" field stored what was typed into it`,
      ).toBe(String(f.value))
    }
    expect(
      sqlValue(`SELECT payload->>'palSelect' FROM records WHERE id = '${id}'`),
      'the dropdown stored the option VALUE, not its label',
    ).toBe('BETA')

    // The seal still holds with an 18-field schema — r1 proved it for two.
    expect(
      Number(sqlValue(`SELECT jsonb_array_length(form_schema) FROM records WHERE id = '${id}'`)),
      'form_schema froze the whole typed schema at submission, not a subset',
    ).toBe(FIELDS.length)

    // Every declared type is present in the FROZEN copy — which is what makes
    // the freeze worth anything. A freeze that dropped the types it did not
    // understand would be worse than no freeze.
    const frozen = sql(
      `SELECT string_agg(DISTINCT f->>'type', ',' ORDER BY f->>'type')
         FROM records r, LATERAL jsonb_array_elements(r.form_schema) f
        WHERE r.id = '${id}'`,
    ).split(',')
    expect(
      frozen.sort(),
      'the frozen schema carries every declared field type',
    ).toEqual([...new Set(FIELDS.map((f) => f.type))].sort())

    deleteProbeRecords([id])
  })

  test('reordering a field in the builder persists the new order to form_templates.schema and to the rendered form', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.author)

    // Premise: the seeded order, read from the database rather than assumed.
    const original = FIELDS.slice(0, 4).map((f) => f.name)
    expect(schemaOrder(ORDER.templateId), 'the fixture starts in declared order').toEqual(original)

    // The builder page for this template.
    //
    // THE ROUTE IS `/templates/:id?mode=schema`, NOT `/form-templates/:id`.
    // `/form-templates` is the LIST. The builder is mounted by App.vue:38-40 on
    // `route.name === '/templates/[[id]]' && route.query.mode === 'schema'`, so
    // the query string is load-bearing: without it the same path renders the
    // template's settings page, the canvas never exists, and the grip wait times
    // out with a message that sounds like a missing feature. (Measured
    // 2026-09-23 — that is exactly how this failed first.)
    for (const budget of [60_000, 45_000]) {
      await page.goto(`/templates/${ORDER.templateId}?mode=schema`).catch(() => {})
      const ok = await page
        .getByText(FIELDS[0].label, { exact: false })
        .first()
        .waitFor({ state: 'visible', timeout: budget })
        .then(() => true)
        .catch(() => false)
      if (ok) break
    }

    // ── Drive the KEYBOARD reorder path ────────────────────────────────────
    // The grip is `opacity-0` until hover / focus-visible / selected, so it is
    // focused explicitly — a control Playwright can find but not see is still
    // not clickable. `focus()` also satisfies `onCanvasKeydown`'s
    // `e.target.closest('.drag-handle')` gate, which is what distinguishes a
    // reorder keystroke from ordinary typing anywhere else on the canvas.
    const grip = page
      .getByRole('button', { name: new RegExp(`^Reorder ${FIELDS[0].label}\\.`) })
      .first()
    await grip.waitFor({ state: 'attached', timeout: 30_000 })
    await grip.focus()
    await grip.press('ArrowDown')

    // The first field moved one place down: [0,1,2,3] → [1,0,2,3].
    const expected = [original[1], original[0], original[2], original[3]]

    // ── Persisted to Postgres ──────────────────────────────────────────────
    // The splice happens in the browser; the save travels SyncEngine → GraphQL
    // → `form_templates.schema`. Polled, because that round trip is
    // asynchronous and a single read could beat it.
    await expect
      .poll(() => schemaOrder(ORDER.templateId).join(','), {
        timeout: 30_000,
        message: 'the new field order reached form_templates.schema',
      })
      .toBe(expected.join(','))

    // The array is REORDERED, not rewritten: same members, same count. Without
    // this, a save that dropped or duplicated a field would still satisfy the
    // order assertion above if it happened to land in the right sequence.
    expect(
      schemaOrder(ORDER.templateId).slice().sort(),
      'reordering moved the fields — it did not add, drop or duplicate any',
    ).toEqual(original.slice().sort())

    // ── …and consumed. The order in the jsonb IS the order on the form ─────
    // Asserted where it matters to a user rather than only in storage: the
    // schema array order is the render order (DynamicForm has no sort of its
    // own and no `position` field exists on a field object), so a persisted
    // order that did not repaint would be a half-working feature.
    // ⚠ `data-path` IS NOT THE FIELD NAME. `FormCanvas.vue:262` passes
    // `:path="String(index)"`, so `data-path` is the field's POSITION — "0",
    // "1", "2", … It is therefore identical before and after a reorder and can
    // never detect one. The first draft of this test read those values, took the
    // first two and asserted only `length > 0`, which any canvas that rendered
    // at all satisfies — a vacuous pass of exactly the shape fixtures/db.js
    // warns about.
    //
    // What IS positional and meaningful is the visible LABEL of each card. The
    // reorder moved field[0] below field[1], so the labels must now read in the
    // swapped order. Labels are unique within this 4-field fixture, which is
    // what makes them usable as identity here.
    const labelOf = Object.fromEntries(FIELDS.slice(0, 4).map((f) => [f.name, f.label]))
    const expectedLabels = expected.map((n) => labelOf[n])

    // Identity comes off the card's own `aria-label` — FormCanvasField.vue:406
    // renders `Select field ${field.label || field.name || field.type}` on the
    // SAME element that carries `data-path`, so one `evaluateAll` yields DOM
    // order and identity together, with no dependence on the card's inner
    // chrome (type chips, the grip's aria text) staying put.
    async function canvasLabelsInDomOrder() {
      const aria = await page
        .locator('[data-path]')
        .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''))
      return aria
        .map((a) => Object.values(labelOf).find((l) => a === `Select field ${l}`) ?? null)
        .filter(Boolean)
    }

    await expect
      .poll(async () => (await canvasLabelsInDomOrder()).join(','), {
        timeout: 30_000,
        message: 'the canvas repainted in the new order',
      })
      .toBe(expectedLabels.join(','))

    // CONTROL: the canvas really did carry every field of the fixture, so the
    // comparison above ran on a complete list rather than a prefix that happened
    // to match. Without this, a canvas that rendered only the first two cards
    // would satisfy the order assertion for the wrong reason.
    expect(
      (await canvasLabelsInDomOrder()).slice().sort(),
      'CONTROL: all four fixture fields are on the canvas',
    ).toEqual(Object.values(labelOf).slice().sort())
  })

  test('the frozen schema is what an auditor reads — a later template edit does not rewrite a sealed submission', () => {
    // The other half of URS-WFL-01's promise, and the reason `form_schema`
    // exists at all: an author may keep editing the palette after a submission
    // is filed, and that editing must not retroactively change what the
    // submission is deemed to have reported.
    //
    // Driven in SQL because the claim is about the SEALED COLUMN, and a browser
    // step would only be able to observe it through RecordPreview — which, as
    // REC-J9 pins, does not read the sealed column at all.
    const recordId = 'e2e6f800-0000-4000-8000-000000000101'
    sql(`
      DELETE FROM records WHERE id = '${recordId}';
      INSERT INTO records (id, company_id, template_id, module_key, record_number, status_id,
                           user_id, payload, form_schema, template_version, created_at, updated_at)
      SELECT '${recordId}', '${COMPANY_ID}', '${PALETTE.templateId}', NULL, '${PALETTE.code}-9001',
             'DRAFT', '${USERS.author.id}', '{"palInput":"sealed"}'::jsonb, t.schema, t.version,
             NOW(), NOW()
        FROM form_templates t WHERE t.id = '${PALETTE.templateId}';`)

    const sealedLength = Number(
      sqlValue(`SELECT jsonb_array_length(form_schema) FROM records WHERE id = '${recordId}'`),
    )
    const sealedVersion = Number(
      sqlValue(`SELECT template_version FROM records WHERE id = '${recordId}'`),
    )
    expect(sealedLength, 'the record sealed the full typed schema').toBe(FIELDS.length)

    // Now rewrite the template down to a single field — the destructive edit a
    // freeze is supposed to survive.
    sql(
      `UPDATE form_templates
          SET schema = '[{"name":"onlyField","type":"input","label":"Only Field"}]'::jsonb,
              version = version + 1
        WHERE id = '${PALETTE.templateId}'`,
    )
    expect(
      Number(sqlValue(`SELECT jsonb_array_length(schema) FROM form_templates WHERE id = '${PALETTE.templateId}'`)),
      'the live template really was cut down to one field',
    ).toBe(1)

    expect(
      Number(sqlValue(`SELECT jsonb_array_length(form_schema) FROM records WHERE id = '${recordId}'`)),
      'the sealed submission still carries all 18 fields — the edit did not reach back',
    ).toBe(sealedLength)
    expect(
      Number(sqlValue(`SELECT template_version FROM records WHERE id = '${recordId}'`)),
      'and it still names the version it was filed against',
    ).toBe(sealedVersion)

    // Restore the fixture for any retry of the earlier tests in this file.
    provisionTemplate(PALETTE, FIELDS)
    deleteProbeRecords([recordId])
  })
})
