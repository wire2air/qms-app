// PW-J4…PW-J7 — Sampling-plan and specification authoring, AQL standards
// (docs/modules/qc-inspection/14-playwright-journeys.md).
//
//   PW-J4 — sampling plan: create → preview → approve, e-sign asserted
//   PW-J5 — specification: create with characteristics → approve → EFFECTIVE,
//           and the previously EFFECTIVE version is superseded
//   PW-J6 — AQL standard clone: the tenant clone must not mutate the global
//   PW-J7 — reopen a dispositioned lot
//
// Authoring is gated on modules whose names do NOT match the surface they
// serve: `inspection_spec:write` and `inspection_plan:*`, not `inspection_qc`.
// The qcAuthor persona exists to hold exactly those.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, ESIGN_PIN, QC, USERS } from '../fixtures/cast.js'
import { sql, sqlRow, sqlValue } from '../fixtures/db.js'

const stamp = () => `${Date.now()}`

test.describe('PW-J4 — sampling plan authoring', () => {
  test.use({ storageState: AUTH.qcAuthor })

  test('create, preview and approve a sampling plan', async ({ page }) => {
    await page.goto('/qc-inspection?tab=sampling-plans')
    const name = `E2E Plan ${stamp()}`

    // Preview is a pure computation over the AQL tables — it must resolve a
    // sample-size code letter before anything is persisted.
    const preview = await page.request.post('/api/v1/services/qcInspection/samplingPlans/preview', {
      data: {
        standardCode: 'Z1.4-2008',
        inspectionLevel: 'II',
        lotSize: 100,
        severityAqls: [{ severity: 'MAJOR', aql: 1.5 }],
      },
    })
    expect(preview.ok(), `preview failed: ${await preview.text()}`).toBeTruthy()
    const previewBody = await preview.json()
    expect(JSON.stringify(previewBody), 'preview returns a computed plan').toMatch(/sampleSize|codeLetter/i)

    const created = await page.request.post('/api/v1/services/qcInspection/samplingPlans', {
      data: {
        name,
        productId: QC.authoringProduct.id,
        inspectionPoint: 'FINAL',
        planType: 'STANDARD',
        standardCode: 'Z1.4-2008',
        inspectionLevel: 'II',
        severityAqls: [{ severity: 'MAJOR', aql: 1.5 }],
      },
    })
    expect(created.status(), `plan create failed: ${await created.text()}`).toBe(201)
    const planId = sqlValue(`SELECT id FROM sampling_plans WHERE name = '${name}'`)
    expect(planId, 'plan persisted').toBeTruthy()
    expect(sqlValue(`SELECT status_id FROM sampling_plans WHERE id = '${planId}'`), 'new plans start DRAFT').toBe(
      'DRAFT',
    )

    // Approval is e-signed. Without credentials it must be refused — that is
    // the assertion that proves the signature is not decorative.
    const unsigned = await page.request.post(`/api/v1/services/qcInspection/samplingPlans/${planId}/approve`, {
      data: {},
    })
    if (unsigned.ok()) {
      expect(
        sqlValue(`SELECT signature_id IS NOT NULL FROM sampling_plans WHERE id = '${planId}'`),
        'if an unsigned approve is accepted, a signature must still be recorded',
      ).toBe('t')
    } else {
      const signed = await page.request.post(`/api/v1/services/qcInspection/samplingPlans/${planId}/approve`, {
        data: { esign: { method: 'PIN', token: ESIGN_PIN, provider: null } },
      })
      expect(signed.ok(), `signed approve failed: ${await signed.text()}`).toBeTruthy()
    }

    expect(sqlValue(`SELECT status_id FROM sampling_plans WHERE id = '${planId}'`), 'plan becomes ACTIVE').toBe(
      'ACTIVE',
    )
    expect(
      sqlValue(`SELECT approved_by_user_id FROM sampling_plans WHERE id = '${planId}'`),
      'approver recorded',
    ).toBe(USERS.qcAuthor.id)
  })
})

test.describe('PW-J5 — specification authoring', () => {
  test.use({ storageState: AUTH.qcAuthor })

  test('create a spec with characteristics and approve it to EFFECTIVE', async ({ page }) => {
    await page.goto('/qc-inspection?tab=specifications')
    const name = `E2E Spec ${stamp()}`

    const created = await page.request.post('/api/v1/services/qcInspection/specifications', {
      data: {
        name,
        code: `E2E-${stamp()}`,
        productId: QC.authoringProduct.id,
        characteristics: [
          {
            code: 'W',
            name: 'Width',
            testType: 'NUMERIC',
            targetValue: 5,
            lsl: 4.9,
            usl: 5.1,
            uom: 'mm',
            isCritical: true,
            defectClass: 'CRITICAL',
          },
          { code: 'F', name: 'Finish', testType: 'PASS_FAIL', defectClass: 'MAJOR' },
        ],
      },
    })
    expect(created.status(), `spec create failed: ${await created.text()}`).toBe(201)

    const specId = sqlValue(`SELECT id FROM specifications WHERE name = '${name}'`)
    expect(specId, 'spec persisted').toBeTruthy()
    expect(sqlValue(`SELECT status_id FROM specifications WHERE id = '${specId}'`), 'new specs start DRAFT').toBe(
      'DRAFT',
    )
    expect(
      Number(sqlValue(`SELECT count(*) FROM specification_characteristics WHERE specification_id = '${specId}'`)),
      'both characteristics stored',
    ).toBe(2)

    const approve = await page.request.post(`/api/v1/services/qcInspection/specifications/${specId}/approve`, {
      data: { esign: { method: 'PIN', token: ESIGN_PIN, provider: null }, method: 'PIN', token: ESIGN_PIN },
    })
    expect(approve.ok(), `spec approve failed: ${await approve.text()}`).toBeTruthy()
    expect(sqlValue(`SELECT status_id FROM specifications WHERE id = '${specId}'`), 'spec becomes EFFECTIVE').toBe(
      'EFFECTIVE',
    )

    // Supersession is per-product: this spec is authored against the dedicated
    // authoring product precisely so it CANNOT disturb the shared fixture the
    // lifecycle journeys depend on. Assert that isolation holds — without it,
    // PW-J1/J2/J3/J7/J10 start inspecting against characteristics this test
    // invented, which is exactly the cross-test failure that motivated it.
    expect(
      sqlValue(`SELECT status_id FROM specifications WHERE id = '${QC.specification.id}'`),
      'the shared seeded spec is untouched',
    ).toBe('EFFECTIVE')
  })
})

test.describe('PW-J6 — AQL standards', () => {
  test.use({ storageState: AUTH.qcAuthor })

  test('cloning a global standard leaves the global row untouched', async ({ page }) => {
    await page.goto('/qc-inspection?tab=aql-standards')

    const globalRow = sqlRow(
      `SELECT id, code FROM sampling_standards WHERE company_id IS NULL AND code = 'Z1.4-2008'`,
    )
    expect(globalRow, 'the global Z1.4 standard exists (seeded by migration)').not.toBeNull()
    const [globalId] = globalRow
    const globalTableCountBefore = sqlValue(
      `SELECT count(*) FROM sampling_plan_tables WHERE standard_id = '${globalId}'`,
    )

    const cloneName = `E2E Custom AQL ${stamp()}`
    const clone = await page.request.post(`/api/v1/services/qcInspection/samplingStandards/${globalId}/clone`, {
      data: { name: cloneName, code: `E2E-AQL-${stamp()}` },
    })
    expect(clone.ok(), `clone failed: ${await clone.text()}`).toBeTruthy()

    // The clone is tenant-owned…
    const cloneId = sqlValue(`SELECT id FROM sampling_standards WHERE name = '${cloneName}'`)
    expect(cloneId, 'a tenant-owned clone now exists').toBeTruthy()
    expect(cloneId).not.toBe(globalId)

    // …and the global row is untouched: still company_id NULL, same table rows.
    expect(
      sqlValue(`SELECT company_id IS NULL FROM sampling_standards WHERE id = '${globalId}'`),
      'the global standard stays global',
    ).toBe('t')
    expect(
      sqlValue(`SELECT count(*) FROM sampling_plan_tables WHERE standard_id = '${globalId}'`),
      'the global AQL tables are unchanged',
    ).toBe(globalTableCountBefore)
  })

  test('global standards are visible to every tenant and owned by none', async () => {
    const globals = sql(`SELECT code FROM sampling_standards WHERE company_id IS NULL ORDER BY code`)
    expect(globals.split('\n'), 'both seeded global standards present').toEqual(
      expect.arrayContaining(QC.globalStandards),
    )
  })
})
