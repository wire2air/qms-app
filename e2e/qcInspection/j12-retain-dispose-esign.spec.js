// PW-J12 — Dispose e-sign + sealed record (docs/modules/qc-inspection/14-playwright-journeys.md;
// journey J-13, requirement R25).
//
// Covers: dispose a RETAINED sample through the PIN e-sign dialog → DISPOSED
// status, a DISPOSED custody event, the DISPOSE audit_logs row carrying the
// e-sign metadata → then prove the record is SEALED, at the UI *and* at the
// server: the edit/dispose controls disappear, and a direct REST PATCH is
// rejected with "record is sealed".
//
// Two deliberate non-assertions, both documented defects rather than gaps here:
//   • NO `signatures` ledger row is asserted, because none is minted. The
//     dispose path calls verifyAndSign with `step: null`, so it returns early
//     after the PIN check (signatureService.js:576) and `meaning:'DISPOSED'` is
//     dead. Security-review finding #16. This spec pins the CURRENT behavior —
//     when #16 is fixed, the "no signatures row" assertion below flips.
//   • The raw-GraphQL status bypass that defeats this seal at the DB layer
//     (finding #14) is NOT probed here — it deliberately bypasses the UI, so it
//     lives in j13-permission-gates.spec.js alongside the other RLS probes.
import { test, expect } from '@playwright/test'
import { AUTH, ESIGN_PIN, USERS } from '../fixtures/cast.js'
import {
  createLotViaRest,
  createRetainSample,
  disposeRetainSample,
  expectRetainPatchRejected,
  findRetainSample,
  retainAuditActions,
  retainEventTypes,
} from '../fixtures/qcInspection.js'
import { sql, sqlRow } from '../fixtures/db.js'

test.describe('PW-J12 — dispose e-sign + sealed record', () => {
  // The inspector creates the sample (holds create/update, not dispose)…
  test('a retain sample is disposed under PIN e-sign and then sealed', async ({ browser }) => {
    const inspectorCtx = await browser.newContext({ storageState: AUTH.qcInspector })
    const inspectorPage = await inspectorCtx.newPage()
    const lot = await createLotViaRest(inspectorPage, {})
    const sample = await createRetainSample(inspectorPage, lot.id, { quantity: '4' })
    expect(sample.statusId).toBe('RETAINED')

    // …and is refused the disposal, since `dispose` is a distinct grant.
    const denied = await inspectorPage.request.post(
      `/api/v1/services/qcInspection/retainSamples/${sample.id}/dispose`,
      { data: { disposalMethod: 'Incinerated', method: 'PIN', token: ESIGN_PIN, provider: null } },
    )
    expect(denied.status(), 'inspector holds no retain_samples:dispose').toBe(403)
    expect(findRetainSample(sample.id).statusId, 'refused disposal leaves it RETAINED').toBe('RETAINED')
    await inspectorCtx.close()

    // ── The custodian disposes it ──────────────────────────────────────────
    // NOTE the custodian reaches the retain DETAIL page directly. They cannot
    // reach the /qc-inspection LIST route at all (finding #18) — record-module
    // detail routes are deliberately guard-open and defer to RLS.
    const custodianCtx = await browser.newContext({ storageState: AUTH.retainCustodian })
    const custodianPage = await custodianCtx.newPage()

    await disposeRetainSample(custodianPage, sample.id, {
      method: 'Incinerated',
      notes: 'E2E disposal — witnessed.',
    })

    const disposed = findRetainSample(sample.id)
    expect(disposed.statusId).toBe('DISPOSED')
    expect(disposed.disposedAt, 'disposal timestamp recorded').toBeTruthy()
    expect(disposed.disposalMethod).toBe('Incinerated')

    expect(retainEventTypes(sample.id), 'DISPOSED custody event').toContain('DISPOSED')
    expect(retainAuditActions(sample.id), 'DISPOSE audit-log row').toContain('DISPOSE')

    // The audit row is the ONLY durable record of the e-sign decision — assert
    // it actually carries the identity + method, since finding #16 means there
    // is no signature ledger entry to fall back on.
    const auditRow = sqlRow(
      `SELECT new_value_json::text, performed_by, ip_address FROM audit_logs
        WHERE entity_id = '${sample.id}' AND action = 'DISPOSE'
        ORDER BY created_at DESC LIMIT 1`,
    )
    expect(auditRow, 'a DISPOSE audit row exists').not.toBeNull()
    const [auditJson, performedBy, ip] = auditRow
    // esignMethod + signedAt + disposalMethod are written explicitly by
    // retainSampleService — this payload IS the Part-11 evidence of record.
    expect(auditJson, 'audit payload names the e-sign method').toMatch(/"esignMethod":\s*"PIN"/)
    expect(auditJson, 'audit payload timestamps the signature').toMatch(/"signedAt"/)
    expect(auditJson, 'audit payload records the disposal method').toMatch(/Incinerated/)
    expect(performedBy, 'disposal attributed to the custodian').toBe(USERS.retainCustodian.id)
    expect(ip, 'signer ip captured').toBeTruthy()

    // Finding #16, pinned: the PIN was verified but NO signature row exists.
    // When #16 ships a `retain_sample_id` subject column, this flips to expect 1.
    expect(
      sql(`SELECT count(*) FROM signatures WHERE meaning = 'DISPOSED'`),
      'no signatures ledger row is minted today (finding #16)',
    ).toBe('0')

    // ── Sealed: the UI hides the write controls ────────────────────────────
    await custodianPage.goto(`/qc-inspection/retain-samples/${sample.id}`)
    await expect(custodianPage.getByText('Disposed').first()).toBeVisible({ timeout: 20_000 })
    await expect(
      custodianPage.getByRole('button', { name: 'Record Disposal' }),
      'dispose control is hidden once disposed',
    ).toHaveCount(0)
    await expect(
      custodianPage.getByLabel('Position', { exact: true }),
      'position field is disabled once disposed',
    ).toBeDisabled()

    // ── Sealed: the SERVER refuses the write too ───────────────────────────
    // The hidden button is not the guarantee — this is.
    await expectRetainPatchRejected(custodianPage, sample.id, { position: 'Shelf Z' }, /sealed/i)
    expect(findRetainSample(sample.id).position, 'sealed record unchanged').not.toBe('Shelf Z')

    await custodianCtx.close()
  })
})
