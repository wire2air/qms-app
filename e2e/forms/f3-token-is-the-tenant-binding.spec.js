// FORMS-F3 — the token IS the tenant binding. Nothing else in the request is.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE ARGUMENT THIS FILE HAS TO SETTLE
//
// F-01's release condition asked for the public lookup to be "scoped by the
// host-resolved tenant". The hardening pass declined, and the reason is a fact
// about the surface rather than a preference: an unauthenticated request has no
// tenant context to resolve. That is precisely why the pack's own probe with
// `Host: nonexistent.localhost` came back 200 — the header was the only ambient
// signal and it was doing nothing.
//
// The answer taken instead was to make the capability carry the tenancy: a
// token names ONE form, that form belongs to ONE company, and `companyId` for
// the write is read off the resolved row. There is then no tenant to confuse and
// no ambient signal to spoof.
//
// That is a strictly stronger claim than "the endpoint is scoped", and it needs
// a different test. Scoping is proved by showing a request from tenant A cannot
// see tenant B. This is proved by showing the request's ORIGIN IS IRRELEVANT —
// the same token answers identically from every host, and two different tokens
// answer differently from the same host.
//
// ─────────────────────────────────────────────────────────────────────────────
// SO THE HOST PROBE'S EXPECTED RESULT INVERTED, AND THAT IS THE POINT
//
// `14-playwright-journeys.md` PW-J9 specifies: "repeat with a request carrying
// an invalid Host header and assert the result is unchanged. Predicted: passes
// today (i.e. the exposure is confirmed)". Under the old design an unchanged
// 200 was the finding. Under the new one an unchanged 200 is the guarantee —
// same observation, opposite meaning — because what reaches the caller is no
// longer "any ACTIVE template in any tenant" but "the one form this token
// names". The assertions below are written to that reading, and the thing that
// makes them safe is the pairing: every host that returns ALT's schema is also
// shown NOT returning LAB's.
//
// ─────────────────────────────────────────────────────────────────────────────
// MEASURED (:4000, 2026-09-01)
//
//   GET …/public/formTemplates/<ALT token>                        → 200, [{label:"Alt Tenant Only Field"}]
//   GET …/public/formTemplates/<ALT token>  Host: nonexistent.localhost → 200, identical body
//   GET …/public/formTemplates/<LAB token>                        → 200, [Full Name, Feedback]
//
// The two tenants are E2ELAB (`e2e00001-…`) and E2EALT (`e2e00002-…`), the same
// pair every cross-tenant journey in this suite uses. E2EALT held NO form
// templates at all before this fixture — the cross-tenant probe on this surface
// had nothing to point at, which is one reason it was never written.
//
// ⚠ `publicFormLimiter`: 60 requests / 15 min per IP. This file spends 6.
import { test, expect } from '@playwright/test'
import { ALT_COMPANY_ID, COMPANY_ID } from '../fixtures/cast.js'
import {
  FORMS,
  anonymousApi,
  apiOriginFor,
  ensureFormsFixtures,
  liveToken,
  publicGet,
  publicPost,
  recordsFor,
} from '../fixtures/forms.js'

let labToken = null
let altToken = null

/** The labels a schema response actually rendered — the tenant's own content. */
function labelsOf(body) {
  return (body.schema ?? []).map((f) => f.label)
}

test.beforeAll(() => {
  ensureFormsFixtures()
  labToken = liveToken(FORMS.published.id)
  altToken = liveToken(FORMS.altPublished.id)

  expect(labToken, 'E2ELAB has a published form').toMatch(/^[0-9a-f]{64}$/)
  expect(altToken, 'E2EALT has one too — otherwise there is nothing to leak').toMatch(
    /^[0-9a-f]{64}$/,
  )
  expect(labToken, 'and the two capabilities are distinct').not.toBe(altToken)
})

test.describe('FORMS-F3 — a token from one tenant never yields another tenant’s form', () => {
  test('each token serves its own tenant’s schema and only that', async () => {
    const ctx = await anonymousApi()

    const lab = await (await publicGet(ctx, labToken)).json()
    const alt = await (await publicGet(ctx, altToken)).json()
    await ctx.dispose()

    // Positive, both sides. Two-sided is not decoration here: "ALT's token does
    // not return LAB's fields" is satisfied by an endpoint that returns nothing
    // to anybody, and by an endpoint that is simply down.
    expect(labelsOf(lab), 'E2ELAB’s token serves E2ELAB’s form').toEqual([
      FORMS.published.fields.fullName,
      FORMS.published.fields.feedback,
    ])
    expect(labelsOf(alt), 'E2EALT’s token serves E2EALT’s form').toEqual([
      FORMS.altPublished.fieldLabel,
    ])

    // Negative, both directions.
    expect(labelsOf(lab), 'and carries nothing of the other tenant').not.toContain(
      FORMS.altPublished.fieldLabel,
    )
    expect(labelsOf(alt)).not.toContain(FORMS.published.fields.fullName)

    // The response is the schema and nothing else — no company id, no template
    // id, no internal name, no module config, no publisher. `resolvePublishedForm`
    // selects `['id','companyId','schema','version']` and the controller returns
    // only `{ schema }`; `companyId` is used to scope the write and never leaves
    // the process. Asserted because the leak F-01 describes is a leak of
    // METADATA as much as of content.
    expect(Object.keys(alt).sort(), 'the body is { schema, meta } and no more').toEqual([
      'meta',
      'schema',
    ])
    expect(JSON.stringify(alt)).not.toContain(ALT_COMPANY_ID)
    expect(JSON.stringify(alt)).not.toContain(FORMS.altPublished.id)
  })

  test('the Host header is not a signal — in either direction', async () => {
    // Three origins, one token, one answer. Under the id-as-capability design
    // this shape of probe was the demonstration of the hole; it is now the
    // demonstration that there is no host-shaped lever to pull at all.
    const hosts = [
      { label: 'the default host', baseURL: undefined },
      { label: 'the OTHER tenant’s host', baseURL: apiOriginFor('e2elab.localhost') },
      { label: 'a host that names no tenant', baseURL: apiOriginFor('nonexistent.localhost') },
    ]

    const bodies = []
    for (const host of hosts) {
      const ctx = await anonymousApi({ baseURL: host.baseURL })
      const res = await publicGet(ctx, altToken)
      expect(res.status(), `E2EALT’s token resolves from ${host.label}`).toBe(200)
      const body = await res.json()
      await ctx.dispose()

      expect(
        labelsOf(body),
        `…to E2EALT’s form, and to E2EALT’s form only, from ${host.label}`,
      ).toEqual([FORMS.altPublished.fieldLabel])
      bodies.push(JSON.stringify(labelsOf(body)))
    }

    expect(new Set(bodies).size, 'the origin of the request changes nothing').toBe(1)
  })

  test('a submission lands in the token’s tenant, whatever the request claims', async () => {
    // The write is where a tenant confusion would actually cost something: a
    // record in the wrong company is a quality record in the wrong quality
    // system. `createPublicRecord` derives `companyId` from the resolved
    // template and passes it to `insertRecord`, which re-checks it against the
    // template's own — belt and braces on the one path with no session.
    const labBefore = recordsFor(FORMS.published.id).length
    const altBefore = recordsFor(FORMS.altPublished.id).length

    const marker = `F3-${Date.now()}`
    // Everything hostile in one request: E2EALT's token, sent to E2ELAB's host,
    // with a body that asks for E2ELAB.
    const ctx = await anonymousApi({ baseURL: apiOriginFor('e2elab.localhost') })
    const res = await publicPost(ctx, {
      token: altToken,
      companyId: COMPANY_ID,
      templateId: FORMS.published.id,
      payload: { altOnly: marker, fullName: 'should not be stored' },
    })
    expect(res.status(), 'the submission is accepted — on E2EALT’s form').toBe(201)
    const { record } = await res.json()
    await ctx.dispose()

    const altRows = recordsFor(FORMS.altPublished.id)
    expect(altRows.length, 'one new record on the E2EALT template').toBe(altBefore + 1)
    expect(recordsFor(FORMS.published.id).length, 'and none at all on the E2ELAB one').toBe(labBefore)

    const created = altRows.find((r) => r.recordNumber === record.recordNumber)
    expect(created, 'the record the caller was told about').toBeTruthy()
    expect(
      created.companyId,
      'filed under E2EALT — the token’s tenant, not the host’s and not the body’s',
    ).toBe(ALT_COMPANY_ID)
    expect(created.companyId).not.toBe(COMPANY_ID)
    expect(
      Object.keys(created.payload),
      'and only the field E2EALT’s schema declares survived the sanitiser',
    ).toEqual(['altOnly'])
  })
})
