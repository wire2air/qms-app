/**
 * MTC-S03 · MTC-S11 · MTC-S12 — what an anonymous caller can learn, and what
 * another tenant can do.
 *
 * An unknown, a malformed, a revoked and an expired token must be
 * indistinguishable: telling them apart confirms to a stranger that a token was
 * once valid. Revocation and expiry are enforced ONLY in application code
 * (resolveShareToken — Sequelize is superuser, the caller has no DB role), so
 * this is the one place that says they still are.
 *
 * Tenancy: a share link is company-scoped at every internal endpoint and under
 * RLS; the PUBLIC endpoint is host-agnostic by design — the token carries its
 * own company (MTC-S12) — and that is asserted as the documented behaviour.
 *
 * No OTP calls: nothing here needs a verified session.
 */
import { test, expect } from '@playwright/test'
import crypto from 'node:crypto'
import { AUTH, ALT_BASE_URL, ALT_COMPANY_ID } from '../fixtures/cast.js'
import {
  SHARE,
  SHARE_DOMAIN,
  extEmail,
  purgeShareLinks,
  apiAs,
  anonApi,
  anonPage,
  mintShare,
  revokeShare,
  openShare,
  waitForMail,
  tokenFrom,
  linkFor,
  expireLink,
} from '../fixtures/recordSharing.js'

const SUBJECT = `Nonconformance ${SHARE.nc.number} shared with you`
const LIVE = extEmail('j6-live')
const REVOKED = extEmail('j6-revoked')
const EXPIRED = extEmail('j6-expired')
const tokens = {}

test.beforeAll(async () => {
  purgeShareLinks()
  const api = await apiAs(AUTH.author)
  try {
    const r = await mintShare(api, {
      entityType: 'Nonconformance',
      entityId: SHARE.nc.id,
      emails: [LIVE, REVOKED, EXPIRED],
    })
    expect(r.status, r.message).toBe(200)
    for (const [k, e] of [['live', LIVE], ['revoked', REVOKED], ['expired', EXPIRED]]) {
      tokens[k] = tokenFrom((await waitForMail(e, { subject: SUBJECT })).html)
    }
    expect((await revokeShare(api, linkFor(SHARE.nc.id, REVOKED).id)).status).toBe(200)
    expireLink(linkFor(SHARE.nc.id, EXPIRED).id)
  } finally {
    await api.dispose()
  }
})

test('uniform 404 · unknown, malformed, revoked and expired tokens get the same answer, and the page the same words (MTC-S03)', async ({ browser }) => {
  const unknown = crypto.randomBytes(32).toString('base64url')
  const anon = await anonApi()
  try {
    const answers = []
    for (const t of [unknown, 'not-a-token', tokens.revoked, tokens.expired]) {
      const r = await openShare(anon, t)
      answers.push(`${r.status} ${r.message}`)
    }
    expect([...new Set(answers)]).toEqual(['404 This link is no longer valid.'])

    for (const t of [unknown, tokens.revoked, tokens.expired]) {
      const f = await anon.get(`/api/v1/share/${t}/files/00000000-0000-4000-8000-000000000000`)
      expect(f.status()).toBe(404)
    }
    // The CONTROL: the same anonymous caller on the live token gets the gate.
    expect((await openShare(anon, tokens.live)).body.needsVerification).toBe(true)
  } finally {
    await anon.dispose()
  }

  const { ctx, page } = await anonPage(browser)
  try {
    for (const t of [tokens.expired, unknown]) {
      await page.goto(`/share/${t}`)
      await expect(page.getByText('This link is no longer valid.')).toBeVisible()
      await expect(
        page.getByText('Links expire, and the person who shared this can withdraw it at any time.', {
          exact: false,
        }),
      ).toBeVisible()
    }
  } finally {
    await ctx.close()
  }
})

test('tenancy · E2EALT cannot revoke, re-share or read an E2ELAB share link — and the probe can see rows at all', async () => {
  const liveId = linkFor(SHARE.nc.id, LIVE).id
  // PostGraphile v5 naming: the connection is `recordShareLinks` (no `all…`).
  const query = '{ recordShareLinks { nodes { id companyId } } }'
  const alt = await apiAs(AUTH.altOwner, ALT_BASE_URL)
  const author = await apiAs(AUTH.author)
  try {
    const revoke = await revokeShare(alt, liveId)
    expect(revoke.status, revoke.message).toBe(404)
    const mint = await mintShare(alt, {
      entityType: 'Nonconformance',
      entityId: SHARE.nc.id,
      emails: [extEmail('j6-alt')],
    })
    expect(mint.status, mint.message).toBe(404)

    const theirs = await (await alt.post('/api/graphql', { data: { query } })).json()
    expect(theirs.errors, JSON.stringify(theirs.errors)).toBeFalsy()
    const altNodes = theirs.data.recordShareLinks.nodes
    expect(altNodes.map((n) => n.id)).not.toContain(liveId)
    expect(altNodes.every((n) => n.companyId === ALT_COMPANY_ID)).toBe(true)

    const ours = await (await author.post('/api/graphql', { data: { query } })).json()
    expect(ours.errors, JSON.stringify(ours.errors)).toBeFalsy()
    expect(ours.data.recordShareLinks.nodes.map((n) => n.id)).toContain(liveId)
  } finally {
    await alt.dispose()
    await author.dispose()
  }
  expect(linkFor(SHARE.nc.id, LIVE).revokedAt).toBe('')
})

test('tenancy · an E2ELAB token opened on the E2EALT host answers with E2ELAB\'s own gate — the token carries its tenant (MTC-S12, by design)', async () => {
  const anonAlt = await anonApi(ALT_BASE_URL)
  try {
    const r = await openShare(anonAlt, tokens.live)
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ needsVerification: true, label: 'Nonconformance' })
    expect(r.body.maskedEmail.endsWith(`@${SHARE_DOMAIN}`)).toBe(true)
  } finally {
    await anonAlt.dispose()
  }
})

// A sha256 token hash / argon2 OTP hash as it would appear in a response.
const HASHLIKE = /[0-9a-f]{64}|\$argon2/i

test('MTC-S11 · no GraphQL path returns a share credential — not the root connection, not the nested relation', async () => {
  const author = await apiAs(AUTH.author)
  try {
    const gql = async (query) => author.post('/api/graphql', { data: { query } }).then((r) => r.text())

    // CONTROL: the metadata table IS reachable by this persona, and the LIVE
    // link is in it — so a refusal below is about the secrets, not the probe.
    const control = JSON.parse(await gql('{ recordShareLinks { nodes { id } } }'))
    expect(control.errors, JSON.stringify(control.errors)).toBeFalsy()
    expect(control.data.recordShareLinks.nodes.map((n) => n.id)).toContain(linkFor(SHARE.nc.id, LIVE).id)

    for (const query of [
      '{ recordShareLinkSecrets { nodes { shareLinkId tokenHash otpHash } } }',
      '{ recordShareLinks { nodes { id recordShareLinkSecret { tokenHash otpHash } } } }',
    ]) {
      const raw = await gql(query)
      expect(raw, query).not.toMatch(HASHLIKE)
      // Refused at the privilege layer: app_user holds no grant on the table
      // (record-sharing/22 §4.1), so the resolver errors rather than returning rows.
      expect(JSON.parse(raw).errors?.length ?? 0, query).toBeGreaterThan(0)
    }
  } finally {
    await author.dispose()
  }
})

test('🔴 MTC-S11 · the secrets table should not be in the GraphQL schema at all (FAILS TODAY)', async () => {
  // The pack expected "a schema error — the type should not exist", on the
  // strength of the table comment `@behavior -select -insert -update -delete`.
  // Under PostGraphile v5 that comment does not remove it: the schema carries a
  // RecordShareLinkSecret type (tokenHash, otpHash, …), two root fields and a
  // nested field on RecordShareLink. Nothing is readable today — only because
  // the REVOKE holds — so this is the belt missing from belt-and-braces, not a
  // leak. password_reset_tokens carries the identical comment and is exposed
  // the same way. Handed to the sharing backend owner; flips green when fixed.
  const author = await apiAs(AUTH.author)
  try {
    const res = await author.post('/api/graphql', {
      data: {
        query:
          '{ __schema { queryType { fields { name } } } __type(name: "RecordShareLinkSecret") { name } }',
      },
    })
    const body = await res.json()
    test.skip(!body.data?.__schema, 'introspection disabled on this server')
    const rootFields = body.data.__schema.queryType.fields.map((f) => f.name).filter((n) => /ShareLinkSecret/i.test(n))
    expect(rootFields, 'root fields exposing the secrets table').toEqual([])
    expect(body.data.__type, 'RecordShareLinkSecret type').toBeNull()
  } finally {
    await author.dispose()
  }
})
