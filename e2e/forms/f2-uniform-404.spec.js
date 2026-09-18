// FORMS-F2 — one refusal, one answer. The public surface must be no oracle.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE PROPERTY UNDER TEST, AND WHY IT IS A SECURITY PROPERTY
//
// `services/publicFormShare.js` opens with it: the resolver returns a template
// or null, and it never says WHY. The endpoint it replaced did say why — it
// answered 404 for "no such row" and 403 for "row exists but is not ACTIVE" —
// and that difference is a MEMBERSHIP ORACLE over the primary keys of every
// form in the product: an unauthenticated caller holding a UUID could learn
// that it named a real template in some tenant, without being shown it.
//
// So "everything is 404" is not sloppiness being tidied up. The uniformity IS
// the control, and a control nothing measures is a control one refactor away
// from being gone. This file measures it.
//
// The six refused shapes named in the hardening pass, and how each is reached:
//
//   raw template UUID   the primary key of a form that IS published, offered in
//                       the token position. The capability is no longer the id.
//   unpublished-ACTIVE  a live form nobody published. `is_public` defaults FALSE
//                       and was deliberately NOT backfilled, so this is the state
//                       most of the product is actually in.
//   DRAFT               a form that WAS published: token captured, then walked
//                       ACTIVE → ARCHIVED → DRAFT.
//   ARCHIVED            a form that WAS published, then archived.
//   BLOCK               a fragment. It has no token and cannot be given one —
//                       the trigger refuses `is_public` on a BLOCK outright
//                       (see f5) — so it is probed by its id, which is exactly
//                       how F-01 reached it.
//   soft-deleted        `paranoid: true` adds `deleted_at IS NULL` to the
//                       resolver's query without being asked.
//
// plus a REVOKED token (published, then explicitly unpublished — the ordinary
// user action) and a 64-hex token that names nothing, which is the baseline
// every other answer has to be equal to.
//
// ─────────────────────────────────────────────────────────────────────────────
// TWO-SIDED
//
// Ten identical 404s is ALSO what a broken endpoint, a stopped API and a
// deleted route look like. Every run therefore takes one more reading: the live
// token of a genuinely published form, through the same helper, in the same
// test — 200, with that form's schema. The refusals are only evidence because
// the admission sits beside them.
//
// And the dead tokens are load-bearing in the other direction: each of them
// WORKED at fixture time (`ensureFormsFixtures` publishes, reads the token, then
// kills it three different ways). Without that, "an archived form's token is
// refused" is indistinguishable from "that string was never a token".
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT WAS MEASURED (app-db + :4000, 2026-09-01)
//
//   GET …/public/formTemplates/<live token>   → 200
//        {"schema":[…],"meta":{"timestamp":…,"requestId":…,"status":200}}
//   GET …/public/formTemplates/<template uuid> → 404
//        {"error":{"message":"Form not found"},"meta":{…,"status":404}}
//   GET …/public/formTemplates/<64 × 'd'>      → 404, byte-identical but for meta
//   POST …/public/records with either          → 404, the same body
//
// Every response carries `meta.timestamp` and `meta.requestId`, so raw bodies
// are NEVER equal and comparing them would assert nothing. `refusalShape()`
// reduces a response to what a caller can actually distinguish — status, the
// message, the top-level key set, and the content type — and it is those that
// have to collapse to a single value.
//
// ⚠ `publicFormLimiter`: 60 requests / 15 min per IP across BOTH endpoints.
// This file spends 17 of them — 11 reads and 6 writes — which is over half of
// what the whole `forms` project costs (32). Two back-to-back runs inside one
// 15-minute window will 429; `assertNotLimited` says so by name when they do.
import { test, expect } from '@playwright/test'
import { COMPANY_ID } from '../fixtures/cast.js'
import {
  FORMS,
  REFUSAL,
  anonymousApi,
  counterFor,
  ensureFormsFixtures,
  liveToken,
  nonexistentToken,
  publicGet,
  publicPost,
  publicationOf,
  recordsFor,
  refusalShape,
} from '../fixtures/forms.js'

/** Every input that must be refused, and the reason it is in the list. */
let refusals = []
let live = null

// The READ's single refusal shape, captured by the first test and re-checked by
// the second. The two endpoints diverging is F-02 itself — the read checked
// ACTIVE, the write checked only existence — so "the write is self-consistent"
// is not the claim worth making; "the write answers exactly what the read
// answers" is. Declaration order is the dependency, hence the serial mode below.
let readRefusal = null

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  const { dead } = ensureFormsFixtures()
  live = liveToken(FORMS.published.id)

  expect(live, 'the control — a genuinely published form — has a token').toMatch(/^[0-9a-f]{64}$/)

  // State preconditions. Each names the fixture that must hold, so a stale
  // database fails here with a cause instead of somewhere downstream with a 404
  // that looks like a pass.
  expect(publicationOf(FORMS.unpublished.id).statusId, 'the unpublished probe is ACTIVE').toBe(
    'ACTIVE',
  )
  expect(publicationOf(FORMS.unpublished.id).isPublic, '…and unpublished').toBe(false)
  expect(publicationOf(FORMS.drafted.id).statusId).toBe('DRAFT')
  expect(publicationOf(FORMS.archived.id).statusId).toBe('ARCHIVED')
  expect(publicationOf(FORMS.softDeleted.id).deleted, 'the deleted probe is soft-deleted').toBe(true)
  expect(publicationOf(FORMS.revoked.id).isPublic, 'the revoked probe is unpublished').toBe(false)

  refusals = [
    {
      label: 'the raw UUID of a form that IS published',
      value: FORMS.published.id,
      why: 'the primary key was the capability until F-01 was closed; it is not one now',
    },
    {
      label: 'the raw UUID of an ACTIVE form nobody published',
      value: FORMS.unpublished.id,
      why: 'activation is no longer publication — this is the state most templates are in',
    },
    {
      label: 'the raw UUID of a form BLOCK',
      value: FORMS.block.id,
      why: 'a fragment embedded in CAPA/CR child steps; never publicly fillable',
    },
    {
      label: 'the raw UUID of a soft-deleted template',
      value: FORMS.softDeleted.id,
      why: 'paranoid: true puts deleted_at IS NULL on the resolver query',
    },
    {
      label: 'a token that WAS live, on a form since ARCHIVED',
      value: dead.archived,
      why: 'leaving ACTIVE revokes; restoring does not republish',
    },
    {
      label: 'a token that WAS live, on a form since walked back to DRAFT',
      value: dead.drafted,
      why: 'the same rule, reached by the ARCHIVED → DRAFT restore-for-rework edge',
    },
    {
      label: 'a token that WAS live, then explicitly revoked',
      value: dead.revoked,
      why: 'the ordinary user action — Revoke in ShareFormDialog',
    },
    {
      label: 'a syntactically perfect token that names nothing',
      value: nonexistentToken(),
      why: 'the baseline: this is what "does not exist" is allowed to look like',
    },
    {
      label: 'a token of the right length in the wrong alphabet',
      value: 'A'.repeat(64),
      why: 'PUBLIC_SHARE_TOKEN_RE is lowercase-only; refused before the database is asked',
    },
    {
      label: "a caller's idea of a query",
      value: "' OR 1=1 --",
      why: 'refused by one regex, at no database cost — the cheap half of the DoS story',
    },
  ]
})

test.describe('FORMS-F2 — every refusal is the same refusal', () => {
  test('the read answers ten different wrong keys with one indistinguishable 404', async () => {
    const ctx = await anonymousApi()

    // ── The admission, first. Without it the ten below are worthless. ───────
    const ok = await publicGet(ctx, live)
    expect(ok.status(), 'the control form is served').toBe(200)
    const served = await ok.json()
    expect(
      served.schema.map((f) => f.label),
      'and it is THIS form — so the endpoint is up, routed, and reading the right row',
    ).toEqual([FORMS.published.fields.fullName, FORMS.published.fields.feedback])

    // ── The ten refusals ────────────────────────────────────────────────────
    const shapes = new Map()
    for (const probe of refusals) {
      expect(probe.value, `${probe.label} is a defined probe`).toBeTruthy()
      const res = await publicGet(ctx, encodeURIComponent(probe.value))
      expect(res.status(), `${probe.label} — ${probe.why}`).toBe(REFUSAL.status)
      shapes.set(probe.label, await refusalShape(res))
    }
    await ctx.dispose()

    // The property itself. Not "they are all 404" — that much is asserted above,
    // one probe at a time, with a reason attached. This is the stronger claim:
    // NOTHING a caller can observe separates "this UUID names a real, published
    // form in this tenant" from "this string names nothing anywhere".
    const distinct = new Set(shapes.values())
    expect(
      distinct.size,
      `every refusal is byte-identical modulo meta. Observed:\n${[...shapes]
        .map(([k, v]) => `  ${k} → ${v}`)
        .join('\n')}`,
    ).toBe(1)

    // …and the one answer is the neutral one, not a leaky one that happens to be
    // consistent.
    readRefusal = [...distinct][0]
    const only = JSON.parse(readRefusal)
    expect(only.message, 'the message names no row, no tenant and no reason').toBe(REFUSAL.message)
    expect(only.keys, 'and the body carries no second channel').toEqual(['error', 'meta'])
  })

  test('the write refuses the same keys the same way, and before it touches the counter', async () => {
    // The write is the half F-02 was about, and it used to check LESS than the
    // read: `insertRecord` verified only that the template existed. Both now ask
    // `resolvePublishedForm` the same question, so the answers must match — and
    // this test compares them to the READ's answer, not merely to each other.
    const probes = [
      { label: 'the raw UUID of a published form', value: FORMS.published.id },
      { label: 'the raw UUID of a BLOCK', value: FORMS.block.id },
      { label: 'a revoked token', value: ensureFormsFixtures().dead.revoked },
      { label: 'the raw UUID of a soft-deleted template', value: FORMS.softDeleted.id },
      { label: 'a token that names nothing', value: nonexistentToken('c') },
    ]

    const counterBefore = counterFor(FORMS.published.id)
    const rowsBefore = recordsFor(FORMS.published.id).length

    const ctx = await anonymousApi()
    const shapes = new Set()
    for (const probe of probes) {
      const res = await publicPost(ctx, { token: probe.value, payload: { fullName: 'nobody' } })
      expect(res.status(), `POST refuses ${probe.label}`).toBe(REFUSAL.status)
      shapes.add(await refusalShape(res))
    }
    await ctx.dispose()

    expect(shapes.size, 'the write is no more of an oracle than the read').toBe(1)
    expect(readRefusal, 'the read leg ran and recorded its answer').not.toBeNull()
    expect(
      [...shapes][0],
      'and it is the SAME answer — two endpoints answering one question in two places ' +
        'is the drift F-02 was, and `resolvePublishedForm` is the single place they both ask now',
    ).toBe(readRefusal)

    // ── The thing a refusal must NOT have done ──────────────────────────────
    // `createPublicRecord` resolves the token and sanitises the payload BEFORE
    // `insertRecord` takes `SELECT … FOR UPDATE` on the counter row. If it did
    // not, an anonymous caller could burn a tenant's record sequence — and
    // create gaps in a numbering scheme that a quality system treats as
    // evidence — without ever being allowed to submit anything.
    expect(
      counterFor(FORMS.published.id),
      'five refused submissions advanced the published form’s counter by zero',
    ).toBe(counterBefore)
    expect(recordsFor(FORMS.published.id).length, 'and wrote no rows').toBe(rowsBefore)
  })

  test('a payload cannot be smuggled past the schema, and none of it reaches the tenant', async () => {
    // The positive control for the write, and the only place in this file where
    // a submission is ACCEPTED — so the refusals above are known not to be
    // "the endpoint rejects everything".
    //
    // `sanitizePublicPayload` DROPS undeclared top-level keys rather than
    // refusing them, deliberately: DynamicForm has 31 field types and 35
    // consumers, and a real submission must not 400 because the sanitiser's
    // model of the renderer is a version behind. Dropping is the safe half of
    // that trade only if it actually drops — which is what this asserts.
    const marker = `F2-${Date.now()}`
    const ctx = await anonymousApi()
    const res = await publicPost(ctx, {
      token: live,
      payload: {
        fullName: marker,
        feedback: 'declared',
        // Every one of these was storable by an anonymous stranger before F-02.
        companyId: '00000000-0000-4000-8000-000000000000',
        templateId: FORMS.block.id,
        statusId: 'APPROVED',
        userId: '00000000-0000-4000-8000-000000000000',
        __proto__spam: 'x',
      },
    })
    expect(res.status(), 'a well-formed submission on a live token is accepted').toBe(201)
    const body = await res.json()
    await ctx.dispose()

    // What the caller is told back. The template id is conspicuous by its
    // absence: it is the capability this endpoint stopped accepting, and
    // returning it would hand it straight back.
    expect(Object.keys(body.record), 'the response carries a record number and nothing else').toEqual(
      ['recordNumber'],
    )

    const created = recordsFor(FORMS.published.id).find(
      (r) => r.recordNumber === body.record.recordNumber,
    )
    expect(created, 'the record exists').toBeTruthy()
    expect(
      Object.keys(created.payload).sort(),
      'only the two fields the schema declares survived',
    ).toEqual(['feedback', 'fullName'])
    expect(created.payload.fullName).toBe(marker)
    expect(
      created.companyId,
      'and the tenant is the RESOLVED TEMPLATE’s, not the one the body asked for',
    ).toBe(COMPANY_ID)
    expect(created.userId, 'still anonymous').toBeNull()
  })
})
