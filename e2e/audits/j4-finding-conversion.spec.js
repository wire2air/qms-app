// PW-J4 · Finding → CAPA conversion, both paths (MTC-11).
//
// The module ships "attach existing" only — there is no auto-create-and-link
// endpoint (an explicit deferred-phase comment in auditFindings.js). The UI
// papers over that with a deep link: "+ New CAPA" navigates to
// /capas/create?findingId=<id>, and the CAPA create page calls the link endpoint
// itself once the row exists. Both halves are asserted:
//
//   1. Link CAPA  → picker → spawned_capa_id set + the chip renders.
//   2. + New CAPA → deep link carries findingId → the new CAPA self-links on save.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, AUDIT_STANDARD } from '../fixtures/cast.js'
import { createCapa, fillCapaCreateForm, uniqueTitle } from '../fixtures/capas.js'
import { findCapaByTitle, waitForSqlValue } from '../fixtures/db.js'
import {
  createAdHocAudit,
  findingsOf,
  openAuditTab,
  scoreClause,
  startAudit,
  uniqueScope,
} from '../fixtures/audits.js'

test.use({ storageState: AUTH.author })

/** Expand a finding row so its link/spawn controls are in the DOM. */
async function expandFinding(page, findingNumber) {
  const row = page.getByText(findingNumber, { exact: true }).first()
  await expect(row).toBeVisible({ timeout: 30_000 })
  await row.locator('xpath=preceding::button[1]').click()
}

test.describe('PW-J4 · a finding converts into corrective action', () => {
  test('attach an existing CAPA, then raise a new one from the deep link', async ({ page }) => {
    test.setTimeout(300_000)

    // An existing CAPA to attach in the first half.
    const capaTitle = uniqueTitle('J4-attach')
    await createCapa(page, capaTitle)
    const existingCapa = findCapaByTitle(capaTitle)
    expect(existingCapa).toBeTruthy()

    // An audit with two findings — one per conversion path.
    const scope = uniqueScope('J4')
    const audit = await createAdHocAudit(page, scope)
    await startAudit(page)
    await openAuditTab(page, 'Requirements')
    await scoreClause(page, audit.id, AUDIT_STANDARD.clauses.documentControl, 'Major NC')
    await scoreClause(page, audit.id, AUDIT_STANDARD.clauses.training, 'Minor NC')

    const findings = findingsOf(audit.id)
    expect(findings).toHaveLength(2)
    const [majorFinding, minorFinding] = findings
    expect(majorFinding.typeId).toBe('MAJOR_NC')
    expect(minorFinding.typeId).toBe('MINOR_NC')

    // ── 1. Attach the existing CAPA.
    await openAuditTab(page, 'Findings')
    await expandFinding(page, majorFinding.findingNumber)
    await page.getByRole('button', { name: 'Link CAPA' }).first().click()
    await expect(page.getByRole('heading', { name: 'Link CAPA to Finding' })).toBeVisible({
      timeout: 20_000,
    })
    await page.getByPlaceholder('Search by number or title…').fill(existingCapa.capaNumber)
    await page
      .getByRole('button', { name: new RegExp(existingCapa.capaNumber) })
      .first()
      .click()
    await page.getByRole('button', { name: 'Link CAPA' }).last().click()

    await waitForSqlValue(
      `SELECT count(*) FROM audit_findings WHERE id = '${majorFinding.id}' AND spawned_capa_id = '${existingCapa.id}'`,
      { timeoutMs: 30_000, label: 'existing CAPA linked to the finding' },
    )
    // Lineage is recorded on top of the FK column. Direction-agnostic: the link
    // service may normalise the pair, and the assertion is that the two records
    // are related at all.
    await waitForSqlValue(
      `SELECT count(*) FROM record_links
        WHERE (from_id = '${majorFinding.id}' AND to_id = '${existingCapa.id}')
           OR (from_id = '${existingCapa.id}' AND to_id = '${majorFinding.id}')`,
      { timeoutMs: 30_000, label: 'finding ↔ CAPA lineage link' },
    )
    // The linked chip surfaces in the collapsed row, not just the expanded one.
    //
    // Anchored on the CAPA's NUMBER, not the word "CAPA". The chip used to be a
    // bare "CAPA" label; AuditFindingLinkedChip now live-queries the target and
    // renders its code + live status ("CAPA-014 OPEN") so an auditor sees
    // remediation progress at a glance. Meanwhile "CAPA" as loose text is all
    // over this panel — the bulk bar's "Create CAPA"/"Attach to CAPA" buttons,
    // the "+ New CAPA" and "Link CAPA" pills on every unlinked finding, the
    // "CAPA / Response" heading — so `getByText('CAPA').first()` was green
    // whether or not anything had been linked at all. It proved nothing.
    //
    // The title attribute is the chip's own (`Open linked ${kind}`), which
    // separates it from the "Link CAPA" pill that also mentions the number
    // nowhere. Scoped to the collapsed row: this is the assertion that the chip
    // is surfaced WITHOUT expanding, which is the whole point of the check.
    await page.reload()
    await openAuditTab(page, 'Findings')
    await expect(
      page.getByRole('button', { name: new RegExp(existingCapa.capaNumber) }),
      'the collapsed finding row carries a chip naming the linked CAPA',
    ).toHaveCount(1)
    await expect(
      page.locator('button[title="Open linked CAPA"]').first(),
    ).toBeVisible({ timeout: 30_000 })

    // ── 2. Deep-link a brand-new CAPA off the second finding.
    await expandFinding(page, minorFinding.findingNumber)
    await page.getByRole('button', { name: 'New CAPA' }).first().click()
    await expect(page).toHaveURL(new RegExp(`/capas/create\\?findingId=${minorFinding.id}`), {
      timeout: 30_000,
    })

    const newCapaTitle = uniqueTitle('J4-deeplink')
    await fillCapaCreateForm(page, newCapaTitle)
    const newCapa = findCapaByTitle(newCapaTitle)
    expect(newCapa).toBeTruthy()

    await waitForSqlValue(
      `SELECT count(*) FROM audit_findings WHERE id = '${minorFinding.id}' AND spawned_capa_id = '${newCapa.id}'`,
      { timeoutMs: 45_000, label: 'the CAPA created from the deep link self-linked' },
    )
    // The two findings point at DIFFERENT CAPAs — the second link must not have
    // overwritten the first.
    const after = findingsOf(audit.id)
    expect(after.find((f) => f.id === majorFinding.id).spawnedCapaId).toBe(existingCapa.id)
    expect(after.find((f) => f.id === minorFinding.id).spawnedCapaId).toBe(newCapa.id)
  })
})
