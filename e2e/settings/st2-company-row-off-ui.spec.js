// ST-J2 · The company row off the UI path — REST PATCH, raw GraphQL, and the
// tenant boundary (PW-J2 / PW-J8 / J-02 / J-03 / J-14 / MTC-02 / MTC-03 / MTC-17).
//
// The two DESTRUCTIVE REST probes (ST-10 partial PATCH, ST-11 non-object
// settings) run against the E2EALT tenant as its own owner, not against
// E2ELAB. Until the settings merge ships, the route replaces `settings`
// wholesale — so the same probe on E2ELAB would, for the length of the test,
// wipe keys other suites are reading (the overdue ladder, closure flags).
// E2EALT exists for cross-tenant tests only; nothing reads its settings.
//
// ST-15 is trivially true while `company_update_rls` admits owners only (a
// non-owner can write nothing). It becomes the real probe the moment that
// policy is widened to `company_settings:manage`: the grant must open the
// settings blob, not the company's identity.
import { test, expect } from '@playwright/test'
import { AUTH, ALT_BASE_URL, ALT_COMPANY_ID, COMPANY_ID } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import {
  ALT_API,
  API,
  SETTINGS_USERS,
  companyColumns,
  companySettings,
  expectMutationExists,
  graphql,
  personaContext,
} from '../fixtures/settings.js'

const UPDATE_COMPANY = `
  mutation UpdateCompany($input: UpdateCompanyInput!) {
    updateCompany(input: $input) { company { id } }
  }`

// A seeded UoM (§37b) — the target for the lookup-mutation probe.
const SEEDED_UOM = { id: 'e2ec4000-0000-4000-8000-000000000001', name: 'E2E Kilogram' }

function rawSettings(companyId) {
  return sqlValue(`SELECT coalesce(settings::text, 'null') FROM companies WHERE id = '${companyId}'`)
}

function restoreRawSettings(companyId, raw) {
  const value = raw === 'null' ? 'NULL' : `'${raw.replace(/'/g, "''")}'::jsonb`
  sql(`UPDATE companies SET settings = ${value} WHERE id = '${companyId}'`)
}

function addAltSentinel() {
  sql(`UPDATE companies SET settings = coalesce(settings, '{}'::jsonb) || '{"e2eSettingsSentinel":{"keep":true}}'::jsonb
        WHERE id = '${ALT_COMPANY_ID}'`)
}

/** Resolve the single-company query field by introspection, then fetch one row. */
async function companyById(ctx, id) {
  const { body } = await graphql(ctx, '{ __type(name: "Query") { fields { name args { name } } } }')
  const fields = body?.data?.__type?.fields ?? []
  const field = fields.find((f) => ['company', 'companyById'].includes(f.name) && f.args.some((a) => a.name === 'id'))
  expect(
    field,
    `a single-company query must exist (company-ish fields: ${fields.map((f) => f.name).filter((n) => /ompan/.test(n))})`,
  ).toBeTruthy()
  const res = await graphql(ctx, `query One($id: UUID!) { ${field.name}(id: $id) { id } }`, { id })
  expect(res.errors, `query ${field.name}: ${JSON.stringify(res.errors)}`).toBeNull()
  return res.body?.data?.[field.name] ?? null
}

test('ST-10 · REST PATCH with a partial settings object keeps the keys it did not name (finding #1)', async ({
  browser,
}) => {
  const raw = rawSettings(ALT_COMPANY_ID)
  addAltSentinel()
  const ctx = await browser.newContext({ storageState: AUTH.altOwner, baseURL: ALT_BASE_URL })
  try {
    const res = await ctx.request.patch(`${ALT_API}/v1/services/companies/${ALT_COMPANY_ID}`, {
      failOnStatusCode: false,
      data: { settings: { printSettings: { footerText: 'E2E footer' } } },
    })
    expect(res.status(), await res.text()).toBe(200)
    const after = companySettings(ALT_COMPANY_ID)
    expect(after?.printSettings?.footerText, 'the key the PATCH named is written').toBe('E2E footer')
    expect(after?.e2eSettingsSentinel, 'a key the PATCH did not name must survive it').toEqual({ keep: true })
  } finally {
    await ctx.close()
    restoreRawSettings(ALT_COMPANY_ID, raw)
  }
})

test('ST-11 · REST PATCH refuses a settings value that is not an object, and the row keeps its settings', async ({
  browser,
}) => {
  const raw = rawSettings(ALT_COMPANY_ID)
  addAltSentinel()
  const ctx = await browser.newContext({ storageState: AUTH.altOwner, baseURL: ALT_BASE_URL })
  try {
    const res = await ctx.request.patch(`${ALT_API}/v1/services/companies/${ALT_COMPANY_ID}`, {
      failOnStatusCode: false,
      data: { settings: 'not-an-object' },
    })
    expect([400, 422], `settings: "not-an-object" → ${res.status()}`).toContain(res.status())
    expect(sqlValue(`SELECT jsonb_typeof(settings) FROM companies WHERE id = '${ALT_COMPANY_ID}'`)).toBe('object')
    expect(companySettings(ALT_COMPANY_ID)?.e2eSettingsSentinel).toEqual({ keep: true })
  } finally {
    await ctx.close()
    restoreRawSettings(ALT_COMPANY_ID, raw)
  }
})

test('ST-12 · without company_settings:manage, PATCH /companies is 403 and nothing is written', async ({
  browser,
}) => {
  const nameBefore = companyColumns().name
  const ctx = await browser.newContext({ storageState: AUTH.noAccess })
  try {
    const res = await ctx.request.patch(`${API}/v1/services/companies/${COMPANY_ID}`, {
      failOnStatusCode: false,
      data: { name: 'E2E pwned', settings: { e2ePwned: true } },
    })
    expect(res.status()).toBe(403)
  } finally {
    await ctx.close()
  }
  expect(companyColumns().name).toBe(nameBefore)
  expect(companySettings()?.e2ePwned).toBeUndefined()
})

test('ST-13 · the E2EALT owner cannot read or write E2ELAB’s company — REST 403, GraphQL hidden and refused', async ({
  browser,
}) => {
  const nameBefore = companyColumns().name
  const ctx = await browser.newContext({ storageState: AUTH.altOwner, baseURL: ALT_BASE_URL })
  try {
    const read = await ctx.request.get(`${ALT_API}/v1/services/companies/${COMPANY_ID}`, { failOnStatusCode: false })
    expect(read.status(), 'REST read of another tenant').toBe(403)
    const write = await ctx.request.patch(`${ALT_API}/v1/services/companies/${COMPANY_ID}`, {
      failOnStatusCode: false,
      data: { name: 'E2E pwned', settings: { e2ePwned: true } },
    })
    expect(write.status(), 'REST write to another tenant').toBe(403)

    // GraphQL — the path RLS actually guards. The CONTROL is what stops a
    // broken query from reading as a perfect isolation result.
    expect(await companyById(ctx, COMPANY_ID), 'company_select_rls hides the other tenant').toBeNull()
    expect((await companyById(ctx, ALT_COMPANY_ID))?.id, 'CONTROL: own company is readable').toBe(ALT_COMPANY_ID)

    await expectMutationExists(ctx, 'updateCompany')
    const { errors, body } = await graphql(ctx, UPDATE_COMPANY, {
      input: { id: COMPANY_ID, patch: { name: 'E2E pwned' } },
    })
    // PostGraphile v5 reports an RLS-filtered UPDATE as a null payload, not an
    // error — the row is simply not there for this caller. Either shape is a
    // refusal; the DB assertions after the finally are what prove nothing moved.
    expect(
      Boolean(errors) || !body?.data?.updateCompany?.company,
      `updateCompany on another tenant’s row returned ${JSON.stringify(body?.data)}`,
    ).toBe(true)
  } finally {
    await ctx.close()
  }
  expect(companyColumns().name).toBe(nameBefore)
  expect(companySettings()?.e2ePwned).toBeUndefined()
})

test('ST-14 · raw GraphQL: a member without the grant cannot write the company row, nor any lookup', async ({
  browser,
}) => {
  const ctx = await browser.newContext({ storageState: AUTH.noAccess })
  try {
    await expectMutationExists(ctx, 'updateCompany')
    const { errors, body } = await graphql(ctx, UPDATE_COMPANY, {
      input: { id: COMPANY_ID, patch: { settings: { e2ePwned: true } } },
    })
    // An RLS-filtered UPDATE comes back as a null payload in PostGraphile v5,
    // not an error (see ST-13). The DB assertion below is the real proof.
    expect(
      Boolean(errors) || !body?.data?.updateCompany?.company,
      `noAccess → updateCompany(settings) returned ${JSON.stringify(body?.data)}`,
    ).toBe(true)
    expect(companySettings()?.e2ePwned).toBeUndefined()

    // `uoms` is SELECT-only for app_user. Either PostGraphile exposes no write
    // mutation at all, or the one it exposes is refused and the row untouched.
    const { body: schema } = await graphql(ctx, '{ __type(name: "Mutation") { fields { name } } }')
    const names = (schema?.data?.__type?.fields ?? []).map((f) => f.name)
    expect(names.length, 'introspection works for this session').toBeGreaterThan(0)
    if (names.includes('updateUom')) {
      const probe = await graphql(
        ctx,
        'mutation U($input: UpdateUomInput!) { updateUom(input: $input) { uom { id } } }',
        { input: { id: SEEDED_UOM.id, patch: { name: 'E2E pwned' } } },
      )
      expect(probe.errors, 'updateUom exists and must be refused').toBeTruthy()
    }
    expect(sqlValue(`SELECT name FROM uoms WHERE id = '${SEEDED_UOM.id}'`)).toBe(SEEDED_UOM.name)
  } finally {
    await ctx.close()
  }
})

test('ST-15 · a settings admin cannot rewrite the company’s identity columns over GraphQL', async ({ browser }) => {
  const before = companyColumns()
  const ctx = await personaContext(browser, SETTINGS_USERS.settingsAdmin)
  try {
    for (const patch of [{ code: 'E2EHACK' }, { subscriptionState: 'e2e-hacked' }]) {
      const { errors } = await graphql(ctx, UPDATE_COMPANY, { input: { id: COMPANY_ID, patch } })
      expect(errors, `settingsAdmin → updateCompany(${Object.keys(patch)[0]})`).toBeTruthy()
    }
  } finally {
    await ctx.close()
  }
  const after = companyColumns()
  expect(after.code).toBe(before.code)
  expect(after.subscription_state).toBe(before.subscription_state)
})
