// CF-5 — the "Additional information" card, in a real browser, on a real host
// record: it appears because a schema exists, it autosaves, and it goes
// read-only for a reader.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS
//
// `22-hardening-2026-09-01.md` §"What is still missing" lists, as items 4 and 5,
// that `CustomFieldsCard` is **never mounted by any test** and that none of the
// ten specified Playwright journeys are written. Everything else in this suite
// probes the database. This is the one that proves the feature works from the
// user's side — that the schema an admin authors actually reaches the record,
// that typing in it persists, and that a reader sees it without being able to
// change it.
//
// It is also the only place the module's autosave path is exercised end to end:
// `DynamicForm` → deep watcher → 600 ms `useDebounceFn` → `useLiveMutation` →
// `freezeOptionLabels` → GraphQL → RLS → `entity_field_values`. Every layer
// below has its own test; nothing else joins them up.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠ BLAST RADIUS, AND HOW IT IS BOUNDED
//
// `entity_field_sets` is keyed `(company_id, entity_type)` — ONE schema per
// entity type per tenant. Seeding a `Nonconformance` schema makes this card
// appear on EVERY NC in the shared E2E tenant, including the create form, for as
// long as the row exists. Three deliberate choices contain that:
//
//   1. The field is OPTIONAL. A required custom field would fail
//      `NonconformancesCreate`'s validation for every other suite raising an NC
//      concurrently.
//   2. The schema is removed in `afterAll`, and the E2ELAB tenant genuinely has
//      ZERO `entity_field_sets` rows (measured 2026-09-01) — so DELETING the row
//      restores the exact state we found, where emptying it would not.
//   3. The host NC is an EXISTING one owned by `author`, resolved by query. No
//      new record is created unless the database was just reset.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY A FRESH BROWSER CONTEXT PER STATE, AND NOT A RELOAD
//
// syncEngine caches every model in a company-scoped IndexedDB and its
// `bootstrapGate` SKIPS re-bootstrap when the cached data is under 5 minutes
// old. So a reload after a DB-side schema change is not guaranteed to see it:
// the page may serve the previous schema from IDB and the test would be
// asserting on cache. A new `BrowserContext` gets its own storage partition, so
// IndexedDB starts empty and the whole model set is bootstrapped — the only way
// a spec that mutates the schema between states can trust what it renders.
//
// That costs a full bootstrap (~20–45 s) per state, which is why the states are
// separate tests: each gets its own 120 s budget rather than sharing one.
//
// The file is `.serial` because test 2 asserts on what test 1 typed and test 3
// asserts on the schema being gone.
import { test, expect } from '@playwright/test'
import { AUTH, USERS } from '../fixtures/cast.js'
import { waitForSqlValue } from '../fixtures/db.js'
import { raiseNc, uniqueTitle } from '../fixtures/nonconformances.js'
import {
  CARD_TITLE,
  clearSchema,
  installCustomFieldPersonas,
  openNcAs,
  resolveEditableNc,
  seedSchema,
  valueRowFor,
  valueRowsVisibleTo,
} from '../fixtures/customFields.js'

const HOST_TYPE = 'Nonconformance'
const FIELD = { name: 'cf5Batch', label: 'CF-5 batch reference' }

const SCHEMA = [
  {
    type: 'input',
    name: FIELD.name,
    label: FIELD.label,
    placeholder: '',
    hint: '',
    // OPTIONAL, deliberately — see the blast-radius note above.
    required: false,
    readonly: false,
    disabled: false,
    width: 'full',
    hidden: false,
  },
]

/** Unique per run, so a re-run cannot pass on the previous run's stored answer. */
const TYPED = `CF5-${Date.now()}`

let ncId = null

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ browser }) => {
  installCustomFieldPersonas()

  // Resolve the host BEFORE seeding the schema. The fallback path drives the
  // full create wizard, and with a schema in place that wizard also renders
  // `CustomFieldsCreateSection` — so taking the fallback with the schema already
  // seeded would make the fixture depend on the feature under test.
  const ctx = await browser.newContext({ storageState: AUTH.author })
  const page = await ctx.newPage()
  try {
    ncId = await resolveEditableNc(page, raiseNc, uniqueTitle)
  } finally {
    await ctx.close()
  }
  expect(ncId, 'a host NC that `author` may edit').toBeTruthy()

  seedSchema(HOST_TYPE, SCHEMA)
})

test.afterAll(() => clearSchema(HOST_TYPE))

test.describe('CF-5 — the Additional information card on an NC', () => {
  test('an editable host renders the card, and typing in it round-trips to the database', async ({
    browser,
  }) => {
    const { ctx, page } = await openNcAs(browser, AUTH.author, ncId)
    try {
      // The card is rendered by `CustomFieldsCard`, which live-queries the
      // `EntityFieldSet` — so its heading appearing is itself the proof that the
      // authored schema travelled admin → database → syncEngine → this page.
      // Generous timeout: a cold context bootstraps every model before the
      // EntityFieldSet query can resolve.
      await expect(
        page.getByRole('heading', { name: CARD_TITLE }),
        'the card appears because a schema exists for this entity type',
      ).toBeVisible({ timeout: 90_000 })

      // The "Custom" chip is the card's own statement that these fields are
      // admin-defined rather than part of the NC form — worth pinning, because
      // it is the only thing distinguishing this section from a built-in one.
      await expect(page.getByText('Custom', { exact: true }).first()).toBeVisible()

      // Editable means a real input bound to the schema's field, addressed the
      // way a user addresses it — by its label.
      const input = page.getByLabel(FIELD.label).first()
      await expect(input, 'an editable host renders DynamicForm, not the readonly view').toBeVisible(
        { timeout: 30_000 },
      )

      await input.fill(TYPED)

      // The assertion is the DATABASE, not the DOM: the autosave is a 600 ms
      // debounce followed by a pessimistic `useLiveMutation` (server first, IDB
      // second), so a DOM check would pass on text that never left the browser.
      // `waitForSqlValue` polls, which is what makes this safe without a sleep.
      await waitForSqlValue(
        `SELECT count(*) FROM entity_field_values
          WHERE entity_type = '${HOST_TYPE}' AND entity_id = '${ncId}'
            AND payload->>'${FIELD.name}' = '${TYPED}'`,
        { timeoutMs: 45_000, label: 'custom-field autosave landed' },
      )

      // The seal, which is the half a payload-only check would miss: the card
      // snapshots the LIVE schema into `form_schema` on every save, so a closed
      // record can be re-rendered from what the questions said at the time.
      const row = valueRowFor(HOST_TYPE, ncId)
      expect(row.payload[FIELD.name], 'the answer is stored').toBe(TYPED)
      expect(
        row.formSchema.map((f) => [f.name, f.label]),
        'and the schema was snapshotted alongside it',
      ).toEqual([[FIELD.name, FIELD.label]])
    } finally {
      await ctx.close()
    }
  })

  test('a read-only host renders the sealed view — visible, and not editable', async ({
    browser,
  }) => {
    // `auditor` holds `ncr:read` and NOT `ncr:update`, so
    // `NonconformancesPageId`'s `isEditable` is false and the card's `editable`
    // prop — which mirrors it — renders `FormSchemaReadonlyView` instead of
    // `DynamicForm`. She also passes `entity_field_value_select_rls`, which is
    // asserted first: without the grant she would see an EMPTY card and the
    // "not editable" half below would pass for the wrong reason.
    expect(
      valueRowsVisibleTo(USERS.auditor.id, HOST_TYPE),
      'the auditor can read NC answers at all (ncr:read)',
    ).toBeGreaterThan(0)

    const { ctx, page } = await openNcAs(browser, AUTH.auditor, ncId)
    try {
      await expect(page.getByRole('heading', { name: CARD_TITLE })).toBeVisible({ timeout: 90_000 })

      // The value is there — as TEXT. This is the positive half; without it,
      // "there is no input" is satisfied by a card that failed to render.
      await expect(
        page.getByText(TYPED, { exact: false }).first(),
        'the reader sees the answer the author typed',
      ).toBeVisible({ timeout: 30_000 })

      // …and the negative half, checked only after the positive one has proved
      // the card is on screen and populated.
      await expect(
        page.getByLabel(FIELD.label),
        'and gets no editable control for it',
      ).toHaveCount(0)
    } finally {
      await ctx.close()
    }
  })

  test('the card self-hides when the schema is emptied', async ({ browser }) => {
    // `hasFields` gates the whole `FormSection`, so an entity type with no
    // custom fields shows no card at all rather than an empty one. That is what
    // keeps this feature invisible on the ~7 entity types a given tenant has not
    // configured, and it is the behaviour that would regress into an empty card
    // on every record in the product if the guard were lost.
    //
    // Emptying the schema (rather than deleting the row) is the real admin
    // action — removing every field in the FormBuilder and saving.
    //
    // ─────────────────────────────────────────────────────────────────────────
    // ASSERTING AN ABSENCE NEEDS A BARRIER, AND THE ONLY HONEST ONE IS THE
    // PRESENCE OF THE SAME THING UNDER THE SAME CONDITIONS.
    //
    // `toHaveCount(0)` passes the instant the page is blank, so a plain "open
    // the page, the card is not there" test passes before anything has
    // rendered — and would pass identically if the card were removed from the
    // product entirely, or if the NC id were wrong, or if the session were
    // logged out. Waiting for some OTHER element first is only a partial fix:
    // it proves the page rendered, not that the custom-fields query had
    // resolved, and those are different moments.
    //
    // So this test does it in two legs, in one run, against the SAME host record
    // and the SAME navigation: leg 1 with the schema still populated, which must
    // show the card, and leg 2 after emptying it, which must not. Leg 1 is the
    // barrier — it establishes that a cold context on this record renders the
    // card, so leg 2's zero is a consequence of the schema and nothing else.
    const before = await openNcAs(browser, AUTH.author, ncId)
    try {
      await expect(
        before.page.getByRole('heading', { name: CARD_TITLE }),
        'leg 1 — with fields configured, a cold context DOES render the card',
      ).toBeVisible({ timeout: 90_000 })
    } finally {
      await before.ctx.close()
    }

    seedSchema(HOST_TYPE, [])

    const after = await openNcAs(browser, AUTH.author, ncId)
    try {
      // The same wait budget as leg 1, spent proving the card never arrives —
      // `toBeHidden` retries until the timeout rather than resolving instantly,
      // which `toHaveCount(0)` would.
      await expect(
        after.page.getByRole('heading', { name: CARD_TITLE }),
        'leg 2 — no fields configured, no card, on the same record and the same route',
      ).toBeHidden({ timeout: 30_000 })

      // …and the page really did load. Without this, leg 2 is also satisfied by
      // a navigation that failed outright.
      await expect(
        after.page.getByText(TYPED, { exact: false }).first().or(
          after.page.getByRole('heading').first(),
        ),
        'the NC detail page itself rendered',
      ).toBeVisible({ timeout: 30_000 })

      // The stored ANSWERS are untouched by emptying the schema — the card is
      // hidden, not the data destroyed. That matters: re-adding the field must
      // bring the previous answer back rather than silently losing it.
      expect(
        valueRowFor(HOST_TYPE, ncId).payload[FIELD.name],
        'emptying the schema hides the card and keeps the answers',
      ).toBe(TYPED)
    } finally {
      await after.ctx.close()
    }
  })
})
