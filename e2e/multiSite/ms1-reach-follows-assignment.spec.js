// MS-J1…J4, J10, J11 — the feature itself.
//
// A `site`-scoped grant used to mean "records at users.site_id". It now means
// "records at every site assigned to the user". These journeys drive that
// through the real GraphQL path (the authoritative one — PostGraphile always
// SET ROLEs app_user, so RLS fires unconditionally) and watch the visible row
// set move as assignments change.
//
// `siteRoamer` holds ncr:read/update at SITE scope and lives at Primary Site.
// The probe NC lives at Secondary and is owned by someone else in another
// department, so neither the own- nor the department-tier of scope_allowed can
// admit it — only the site tier can. Without that, every assertion here would
// pass for the wrong reason.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, SITES } from '../fixtures/cast.js'
import { graphql, freshContext } from '../fixtures/sites.js'
import {
  ROAMER,
  PROBE_NC_TITLE,
  ensureProbeNc,
  assignSite,
  clearSites,
  effectiveSiteIds,
  bumpEpoch,
} from './fixtures.js'

const NC_QUERY = `query { nonconformances { nodes { id title siteId } } }`

async function visibleNcs(browser, storageState) {
  const ctx = await browser.newContext({ storageState })
  const { body, errors } = await graphql(ctx, NC_QUERY)
  await ctx.close()
  expect(errors, 'Query.nonconformances must resolve — otherwise this probe is vacuous').toBeNull()
  return body.data.nonconformances.nodes
}

/** Same query, but on a session minted AFTER the assignment change. */
async function visibleNcsFresh(browser) {
  const ctx = await freshContext(browser, 'siteRoamer')
  const { body, errors } = await graphql(ctx, NC_QUERY)
  await ctx.close()
  expect(errors, 'Query.nonconformances must resolve').toBeNull()
  return body.data.nonconformances.nodes
}

test.describe('MS · a site-scoped grant reaches every assigned site', () => {
  test.beforeAll(() => {
    ensureProbeNc()
    clearSites(ROAMER)
  })

  test.afterAll(() => {
    clearSites(ROAMER)
    bumpEpoch(ROAMER)
  })

  test('PRECONDITION · the roamer is site-scoped, at Primary, with no extra sites', () => {
    expect(effectiveSiteIds(ROAMER), 'effective sites = primary only').toEqual([SITES.primary.id])
  })

  test('MS-J1 · baseline — only the primary site is visible', async ({ browser }) => {
    const ncs = await visibleNcsFresh(browser)
    expect(ncs.length, 'the roamer sees the seeded primary-site NCs').toBeGreaterThan(0)
    expect(
      ncs.every((n) => n.siteId === SITES.primary.id),
      'no row outside the primary site may be visible before any assignment',
    ).toBe(true)
    expect(
      ncs.some((n) => n.title === PROBE_NC_TITLE),
      'the Secondary-site probe must NOT be visible yet',
    ).toBe(false)
  })

  test('MS-J2 · assigning a second site widens the reach', async ({ browser }) => {
    assignSite(ROAMER, SITES.secondary.id)
    bumpEpoch(ROAMER)

    expect(effectiveSiteIds(ROAMER).sort()).toEqual([SITES.primary.id, SITES.secondary.id].sort())

    const ncs = await visibleNcsFresh(browser)
    expect(
      ncs.some((n) => n.title === PROBE_NC_TITLE),
      'the Secondary-site NC becomes visible once Secondary is assigned',
    ).toBe(true)
    expect(
      ncs.some((n) => n.siteId === SITES.primary.id),
      'the primary site stays visible — assignment widens, it does not replace',
    ).toBe(true)
  })

  // MS-J3 is the one that matters for compliance. "We removed their access at
  // 09:00" has to be true at 09:00, not whenever they next log in — so this
  // deliberately reuses the SAME storage state rather than minting a fresh
  // session, and relies on the authz epoch to invalidate the cached site set.
  test('MS-J3 · removing it narrows the reach again — on a LIVE session', async ({ browser }) => {
    assignSite(ROAMER, SITES.secondary.id)
    bumpEpoch(ROAMER)
    const before = await visibleNcs(browser, AUTH.siteRoamer)
    expect(
      before.some((n) => n.title === PROBE_NC_TITLE),
      'precondition: the live session can see the probe',
    ).toBe(true)

    clearSites(ROAMER)
    bumpEpoch(ROAMER)

    const after = await visibleNcs(browser, AUTH.siteRoamer)
    expect(
      after.some((n) => n.title === PROBE_NC_TITLE),
      'REVOCATION MUST BE IMMEDIATE — the same session must stop seeing it without re-login',
    ).toBe(false)
    expect(after.length, 'the primary site is untouched by the removal').toBeGreaterThan(0)
  })

  test('MS-J4 · the primary site is always effective, even with zero assignments', async ({
    browser,
  }) => {
    clearSites(ROAMER)
    bumpEpoch(ROAMER)
    expect(effectiveSiteIds(ROAMER)).toEqual([SITES.primary.id])

    const ncs = await visibleNcsFresh(browser)
    expect(ncs.length, 'primary-site records remain visible').toBeGreaterThan(0)
    expect(ncs.every((n) => n.siteId === SITES.primary.id)).toBe(true)
  })

  test('MS-J10 · a TENANT-scoped user is unaffected by any of this', async ({ browser }) => {
    // controller holds document_control at tenant scope; the assertion is that
    // the rank>=4 branch of scope_allowed still short-circuits before the site
    // array is ever consulted.
    const ctx = await browser.newContext({ storageState: AUTH.controller })
    const { body, errors } = await graphql(ctx, `query { documents { nodes { id siteId } } }`)
    await ctx.close()
    expect(errors).toBeNull()
    expect(body.data.documents.nodes.length, 'tenant scope still sees everything').toBeGreaterThan(0)
  })
})
