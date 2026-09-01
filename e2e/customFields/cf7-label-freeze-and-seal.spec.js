// CF-7 — the seal: what a record's custom fields SAID when they were answered
// survives the admin later rewording them.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE MECHANISM, AND WHY THE PACK CALLS IT THE MODULE'S MOST SOPHISTICATED PART
//
// A custom-field answer is stored twice over:
//
//   payload                  the raw values, keyed by field name
//   payload._optionLabels    the DISPLAY TEXT of every option-set-backed answer,
//                            written at save time by `freezeOptionLabels()` at
//                            the same value scope as the answer itself
//   form_schema              a snapshot of the whole field definition array as
//                            it read at save time
//
// and `CustomFieldsCard` renders the two differently depending on who is
// looking: `DynamicForm` off the LIVE schema when the record is editable,
// `FormSchemaReadonlyView` off the SEALED `form_schema` when it is not.
//
// The point is regulatory rather than cosmetic. An admin renaming "Batch
// reference" to "Lot identifier", or renaming an option, must not retroactively
// change what a closed record appears to say. `22-hardening-2026-09-01.md`
// records `freezeOptionLabels` as "the module's most sophisticated mechanism"
// with, before that cycle, ZERO coverage in either direction.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠ A REAL FINDING THIS FILE RECORDS RATHER THAN HIDES
//
// **`freezeOptionLabels`'s option-label guarantee is currently unobservable for
// every option set the product can actually author.**
//
// `option_sets.options` is a JSON array of PLAIN STRINGS — that is what
// `OptionSetsPageId.vue` writes (it pushes `''` and binds
// `v-model="optionSet.options[idx]"`), what `database/seeder-local.sql` seeds,
// and what `bootstrapCompanyDefaults.seedOptionSets` would seed. For a string
// option the stored VALUE *is* the label. So after a rename:
//
//   frozen path    `_optionLabels.route` -> "Rework"          (the old label)
//   unfrozen path  `resolveOptionLabel` finds no match in the renamed set and
//                  falls back to `String(value)` -> "Rework"  (the same string)
//
// Identical. The freeze changes nothing that a user can see, because the thing
// it protects — a stable id whose label may drift — does not exist in this
// shape. All three readers (`OptionSetSelect`, `freezeFormPayloadLabels`'s
// `resolveLabel`, `FormSchemaReadonlyView`'s `resolveOptionLabel`) explicitly
// support `{id,name}` / `{value,label}` objects, which is the shape the
// mechanism is designed for — but NOTHING in the product writes them.
//
// So this file asserts the option half at the DATABASE (the frozen labels are
// written, and they do not move when the option is renamed), and takes the
// BROWSER-observable half from the `form_schema` seal — the FIELD LABEL — which
// is genuinely different between the sealed and live renderings. Both are real;
// only one is currently visible, and that is the finding.
//
// ─────────────────────────────────────────────────────────────────────────────
// AN ORDERING CONSTRAINT THAT IS ALSO A MEASUREMENT
//
// `CustomFieldsCard`'s seeding watcher assigns `formData.value = row.payload`
// (or `{}`), and its deep `watch(formData, …)` then fires — with
// `seededEntityId` already set — and calls `debouncedSave()`. So **merely
// OPENING an editable host record re-saves the custom fields**, which
// re-snapshots `form_schema` from the LIVE schema and re-freezes the labels.
//
// That is not incidental to this journey, it is the thing that decides its
// order: the sealed reading must be taken by a READ-ONLY persona (whose
// `editable=false` makes the watcher return early) and the DB assertions must be
// taken BEFORE any editable persona opens the record. The last test opens it as
// an editable persona on purpose and pins what that does.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT WAS MEASURED TO JUSTIFY THE ASSERTIONS (app-db, 2026-09-01)
//
// `resolveLabel(['Rework','Scrap'], 'Rework')` -> 'Rework' (string branch), so a
// string-backed select freezes to its own value. `option_sets` rows carry string
// arrays in both seeders and in every row the detail page can produce.
// `entity_field_values.payload` and `.form_schema` are both tracked by the audit
// registry, so every write below is also visible in the trail (CF-6).
import { test, expect } from '@playwright/test'
import { AUTH } from '../fixtures/cast.js'
import { waitForSqlValue } from '../fixtures/db.js'
import { selectOption } from '../fixtures/documents.js'
import { raiseNc, uniqueTitle } from '../fixtures/nonconformances.js'
import {
  CARD_TITLE,
  clearSchema,
  installCustomFieldPersonas,
  openNcAs,
  optionsOf,
  removeOptionSet,
  renameOption,
  resolveEditableNc,
  seedOptionSet,
  seedSchema,
  valueRowFor,
} from '../fixtures/customFields.js'

const HOST_TYPE = 'Nonconformance'

const TEXT = { name: 'cf7Batch', sealedLabel: 'CF-7 batch reference' }
const SELECT = { name: 'cf7Route', sealedLabel: 'CF-7 disposition route' }

const RENAMED_TEXT_LABEL = 'CF-7 lot identifier (renamed)'
const OPTION_BEFORE = 'Rework'
const OPTION_AFTER = 'Rework (revised 2026)'

const TYPED = `CF7-${Date.now()}`

let ncId = null
let optionSetId = null

function schemaWith(textLabel) {
  return [
    {
      type: 'input',
      name: TEXT.name,
      label: textLabel,
      placeholder: '',
      hint: '',
      required: false,
      readonly: false,
      disabled: false,
      width: 'full',
      hidden: false,
    },
    {
      type: 'select',
      name: SELECT.name,
      label: SELECT.sealedLabel,
      optionSetId,
      placeholder: 'Select...',
      hint: '',
      required: false,
      readonly: false,
      disabled: false,
      width: 'full',
      hidden: false,
    },
  ]
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ browser }) => {
  installCustomFieldPersonas()

  // Host resolved BEFORE the schema exists — see the note in CF-5: the fallback
  // drives the create wizard, which renders `CustomFieldsCreateSection` once a
  // schema is present, and a fixture must not depend on the feature under test.
  const ctx = await browser.newContext({ storageState: AUTH.author })
  const page = await ctx.newPage()
  try {
    ncId = await resolveEditableNc(page, raiseNc, uniqueTitle)
  } finally {
    await ctx.close()
  }

  // Plain strings, because that is the ONLY shape the product writes — see the
  // finding in the header.
  optionSetId = seedOptionSet({
    name: `CF-7 disposition routes ${Date.now()}`,
    options: [OPTION_BEFORE, 'Scrap', 'Use as is'],
  })
  seedSchema(HOST_TYPE, schemaWith(TEXT.sealedLabel))
})

test.afterAll(() => {
  clearSchema(HOST_TYPE)
  if (optionSetId) removeOptionSet(optionSetId)
})

test.describe('CF-7 — the sealed reading survives the admin editing the definitions', () => {
  test('answering seals the schema snapshot AND freezes the option label', async ({ browser }) => {
    const { ctx, page } = await openNcAs(browser, AUTH.author, ncId)
    try {
      await expect(page.getByRole('heading', { name: CARD_TITLE })).toBeVisible({ timeout: 90_000 })

      await page.getByLabel(TEXT.sealedLabel).first().fill(TYPED)

      // The select is an `OptionSetSelect` resolving its options from the bound
      // OptionSet through a live query — so this click also proves the binding
      // reached the browser, not just the database.
      await selectOption(page, SELECT.sealedLabel, OPTION_BEFORE)

      await waitForSqlValue(
        `SELECT count(*) FROM entity_field_values
          WHERE entity_type = '${HOST_TYPE}' AND entity_id = '${ncId}'
            AND payload->>'${TEXT.name}' = '${TYPED}'
            AND payload->>'${SELECT.name}' = '${OPTION_BEFORE}'`,
        { timeoutMs: 45_000, label: 'CF-7 answers autosaved' },
      )
    } finally {
      await ctx.close()
    }

    const row = valueRowFor(HOST_TYPE, ncId)

    // 1. The frozen labels. This is PW-J4's first assertion verbatim, and the
    //    thing that had no coverage in either direction before this cycle.
    expect(
      row.payload._optionLabels,
      'freezeOptionLabels stamped the display text alongside the answer',
    ).toEqual({ [SELECT.name]: OPTION_BEFORE })

    // 2. The schema seal, at the value scope the readonly view reads from.
    expect(
      row.formSchema.map((f) => f.label),
      'the whole definition array was snapshotted as it read at save time',
    ).toEqual([TEXT.sealedLabel, SELECT.sealedLabel])
    expect(
      row.formSchema.find((f) => f.name === SELECT.name).optionSetId,
      'including the option-set binding, so the snapshot can resolve on its own',
    ).toBe(optionSetId)
  })

  test('the admin rewrites the definitions — and the stored seal does not move', () => {
    // The admin's two edits, both through the tables the real UIs write:
    // `CustomFieldsHome.saveSet` rewrites `entity_field_sets.schema`;
    // `OptionSetsPageId`'s inline edit rewrites one string in
    // `option_sets.options`.
    seedSchema(HOST_TYPE, schemaWith(RENAMED_TEXT_LABEL))
    renameOption(optionSetId, OPTION_BEFORE, OPTION_AFTER)

    expect(optionsOf(optionSetId), 'the live option set now reads differently').toContain(
      OPTION_AFTER,
    )
    expect(optionsOf(optionSetId), 'and the old label is gone from it entirely').not.toContain(
      OPTION_BEFORE,
    )

    // The record's own copy is untouched by either edit. Both halves matter:
    // the snapshot is what the readonly view renders questions from, and the
    // frozen labels are what it renders option ANSWERS from.
    const row = valueRowFor(HOST_TYPE, ncId)
    expect(
      row.formSchema.map((f) => f.label),
      'the sealed questions still read as they did when they were answered',
    ).toEqual([TEXT.sealedLabel, SELECT.sealedLabel])
    expect(
      row.payload._optionLabels[SELECT.name],
      'and the frozen answer label still names the option as it was chosen',
    ).toBe(OPTION_BEFORE)

    // The raw value is deliberately NOT rewritten — the seal is additive. This
    // is also, precisely, why the option half of the guarantee is invisible in
    // the UI today: for a string-shaped option set the raw value and the frozen
    // label are the same string, so `FormSchemaReadonlyView`'s unfrozen fallback
    // (`String(value)`) produces the identical text. See the header.
    expect(row.payload[SELECT.name], 'the stored answer is still the value that was picked').toBe(
      OPTION_BEFORE,
    )
  })

  test('a reader sees the SEALED questions; an editor sees the LIVE ones', async ({ browser }) => {
    // The read-only leg runs first by convention now, not by necessity. It used
    // to be load-bearing: opening the record as an EDITABLE persona triggered an
    // autosave on mount that re-snapshotted `form_schema` and destroyed the seal
    // this leg reads. That is fixed — `CustomFieldsCard` compares against the
    // content it seeded and saves only a genuine change — and the next test is
    // now the guard that keeps it fixed.

    // ── Leg 1: the reader. `auditor` holds ncr:read and not ncr:update, so
    // `isEditable` is false, the card renders `FormSchemaReadonlyView`, and the
    // questions come from `form_schema` — the snapshot, not the definitions.
    const reader = await openNcAs(browser, AUTH.auditor, ncId)
    try {
      await expect(reader.page.getByRole('heading', { name: CARD_TITLE })).toBeVisible({
        timeout: 90_000,
      })
      await expect(
        reader.page.getByText(TEXT.sealedLabel, { exact: false }).first(),
        'the sealed question text is what the reader is shown',
      ).toBeVisible({ timeout: 30_000 })
      await expect(
        reader.page.getByText(RENAMED_TEXT_LABEL, { exact: false }),
        'and the admin’s rename is NOT retroactively applied to this record',
      ).toHaveCount(0)

      // The answers themselves, so the leg above is not satisfied by a card that
      // rendered its questions and lost its values.
      await expect(reader.page.getByText(TYPED, { exact: false }).first()).toBeVisible()
      await expect(
        reader.page.getByText(OPTION_BEFORE, { exact: false }).first(),
        'the option answer reads as it was chosen',
      ).toBeVisible()
    } finally {
      await reader.ctx.close()
    }

    // The seal is still intact in storage — a reader's visit changes nothing.
    // Asserted here rather than assumed, because `editable=false` returning early
    // in the autosave watcher is the ONLY thing that makes leg 1 repeatable.
    expect(
      valueRowFor(HOST_TYPE, ncId).formSchema.map((f) => f.label),
      'a read-only visit did not re-snapshot the schema',
    ).toEqual([TEXT.sealedLabel, SELECT.sealedLabel])

    // ── Leg 2: the editor. `author` holds ncr:update and owns the record, so
    // `isEditable` is true, the card renders `DynamicForm` off the LIVE schema,
    // and the SAME record now shows the renamed question. This is the contrast
    // PW-J4 is about — one record, two readings, decided by whether the viewer
    // may still change the answer.
    const editor = await openNcAs(browser, AUTH.author, ncId)
    try {
      await expect(editor.page.getByRole('heading', { name: CARD_TITLE })).toBeVisible({
        timeout: 90_000,
      })
      await expect(
        editor.page.getByLabel(RENAMED_TEXT_LABEL).first(),
        'an editor is asked the CURRENT question, not the sealed one',
      ).toBeVisible({ timeout: 30_000 })
      await expect(
        editor.page.getByLabel(RENAMED_TEXT_LABEL).first(),
        'and the answer carried over to it — the rename did not orphan the value',
      ).toHaveValue(TYPED)

      // SETTLE, then prove the negative. This wait used to be a barrier that
      // waited FOR an unrequested re-seal; that autosave is fixed, so there is
      // nothing to wait for and the assertion is the opposite one. The pause has
      // to outlast what the save would have taken (600 ms debounce + a
      // pessimistic round-trip), or "it did not happen" only means "not yet".
      await editor.page.waitForTimeout(4000)
    } finally {
      await editor.ctx.close()
    }
  })

  test('opening an editable record does NOT re-seal it — the seal survives a visit', async () => {
    // This test was written the other way round, as a live-defect observation:
    // `CustomFieldsCard` seeded its edit buffer from the loaded row and its deep
    // watcher on `formData` then fired with `seededEntityId` already set, so
    // nothing stopped `debouncedSave()`. A save ran ~600 ms after the card
    // mounted, on a page nobody had touched, re-snapshotting `form_schema` from
    // the LIVE definitions and re-running `freezeOptionLabels` against the
    // CURRENT option set.
    //
    // The consequence was the one the seal exists to prevent: an admin renames a
    // field, an editor merely OPENS the record, and the record's own account of
    // what it asked is overwritten. The re-freeze on amend is intended
    // (`freezeFormPayloadLabels.js`: "an amended payload should reflect labels as
    // they read at the moment of amend"); an amend without an amendment is not.
    //
    // Fixed by comparing the buffer against the content that was seeded, so only
    // a real edit writes. Asserted forwards now: the previous test opened this
    // record as an editor and waited out the debounce, and the seal below is
    // still the one the answers were given under.
    const row = valueRowFor(HOST_TYPE, ncId)
    expect(
      row.formSchema.map((f) => f.label),
      'an editor merely opening the record did not re-snapshot the schema',
    ).toEqual([TEXT.sealedLabel, SELECT.sealedLabel])
    expect(
      row.formSchema.map((f) => f.label),
      'and specifically the admin rename did not leak into the seal',
    ).not.toContain(RENAMED_TEXT_LABEL)

    // The frozen option label and the raw answer are equally untouched — the
    // whole row is as the answering user left it.
    expect(
      row.payload._optionLabels[SELECT.name],
      'the frozen option label still reads as it did when chosen',
    ).toBe(OPTION_BEFORE)
    expect(row.payload[SELECT.name], 'and the raw answer is untouched, as it is throughout').toBe(
      OPTION_BEFORE,
    )
  })
})
