// PW-J6 · Standards library: author a standard, approve v1.0, then supersede it
// with v1.1 (MTC-13/14).
//
// 🟡 Gap this journey documents on the way through: there is NO UI anywhere for
// attaching an approval workflow to a standard. The create dialog never sends
// workflowVersionId (the schema accepts it), and the detail page only prints
// "No approval workflow attached. Drafts can't be submitted until one is set."
// So a standard authored entirely through the product cannot be submitted at
// all. The journey asserts that warning renders, then reaches for the REST PATCH
// to get past it — when a picker ships, replace `attachStandardWorkflow` with it
// and this journey covers the whole path through the UI.
//
// The supersede half runs against the standard this test just created, never the
// seeded fixture standard: approving a v1.1 on THAT would repoint
// current_effective_version_id and change the clause ids every other audit
// journey snapshots.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, AUDIT_WORKFLOWS } from '../fixtures/cast.js'
import {
  addClause,
  approveStandardVersion,
  attachStandardWorkflow,
  createStandard,
  findStandardByCode,
  forceResync,
  clauseCount,
  submitStandardVersion,
  versionsOfStandard,
} from '../fixtures/audits.js'
import { clickWhenReady } from '../fixtures/documents.js'
import { waitForSqlValue } from '../fixtures/db.js'

test.use({ storageState: AUTH.author })

test.describe('PW-J6 · standard authoring and version approval', () => {
  test('v1.0 DRAFT → UNDER_REVIEW → EFFECTIVE, then v1.1 supersedes it', async ({
    page,
    browser,
  }) => {
    test.setTimeout(480_000)

    const stamp = Date.now()
    const code = `E2E-J6-${stamp}`
    const standard = await createStandard(page, { name: `E2E J6 Standard ${stamp}`, code })

    // Creating a standard auto-mints a v1.0 DRAFT — no workflow, no clauses.
    let versions = versionsOfStandard(standard.id)
    expect(versions).toHaveLength(1)
    expect(versions[0].label).toBe('1.0')
    expect(versions[0].statusId).toBe('DRAFT')
    expect(standard.currentEffectiveVersionId).toBeNull()

    // 🟡 The un-submittable state, and the fact the UI offers no way out of it.
    await expect(
      page.getByText("No approval workflow attached. Drafts can't be submitted until one is set."),
    ).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Submit for Approval' })).toHaveCount(0)

    await attachStandardWorkflow(page, standard.id, AUDIT_WORKFLOWS.standardVersionId)
    // The PATCH happens outside the app, so a plain reload keeps showing the
    // stale IDB copy (bootstrapGate's 5-minute TTL) and "Submit for Approval"
    // never appears — force the re-bootstrap.
    await forceResync(page)
    await expect(
      page.getByText("No approval workflow attached. Drafts can't be submitted until one is set."),
    ).toHaveCount(0, { timeout: 30_000 })

    // An empty draft is refused server-side, so clauses come first.
    await addClause(page, { number: '1.1', title: 'Management responsibility' })
    await addClause(page, { number: '1.2', title: 'Internal communication' })
    await waitForSqlValue(
      `SELECT count(*) FROM audit_requirements
        WHERE audit_standard_version_id = '${versions[0].id}' AND deleted_at IS NULL`,
      { timeoutMs: 30_000, label: 'clauses saved on the draft' },
    )
    expect(clauseCount(versions[0].id)).toBe(2)

    await submitStandardVersion(page)
    await waitForSqlValue(
      `SELECT count(*) FROM audit_standard_versions WHERE id = '${versions[0].id}' AND status_id = 'UNDER_REVIEW'`,
      { timeoutMs: 45_000, label: 'v1.0 under review' },
    )

    await approveStandardVersion(browser, { standardId: standard.id, versionId: versions[0].id })

    const afterV1 = findStandardByCode(code)
    expect(
      afterV1.currentEffectiveVersionId,
      'the approved version becomes the effective one',
    ).toBe(versions[0].id)

    // ── v1.1: amend the effective standard and approve again.
    // The approval happened in the reviewer's and approver's browser contexts,
    // so this page's IDB still has the version UNDER_REVIEW — and "New Draft" is
    // gated on there being an EFFECTIVE version and no open one.
    await page.goto(`/audits/standards/${standard.id}`)
    await forceResync(page)
    await clickWhenReady(page, page.getByRole('button', { name: 'New Draft' }))
    const draftId = await waitForSqlValue(
      `SELECT id FROM audit_standard_versions
        WHERE audit_standard_id = '${standard.id}' AND status_id = 'DRAFT'
        ORDER BY version_major DESC, version_minor DESC LIMIT 1`,
      { timeoutMs: 45_000, label: 'v1.1 draft spawned' },
    )
    expect(
      clauseCount(draftId),
      'a new draft copies the effective version’s clause list forward',
    ).toBe(2)

    // The draft was minted by an action RPC, not a syncEngine mutation, so the
    // clause editor is only pointed at it after the row reaches IDB.
    await forceResync(page)
    await addClause(page, { number: '1.3', title: 'Management review inputs' })
    await waitForSqlValue(
      `SELECT count(*) = 3 FROM audit_requirements
        WHERE audit_standard_version_id = '${draftId}' AND deleted_at IS NULL`,
      { timeoutMs: 30_000, label: 'third clause added to v1.1' },
    )

    await submitStandardVersion(page, { changeSummary: 'Added 1.3 (E2E J6).' })
    await approveStandardVersion(browser, { standardId: standard.id, versionId: draftId })

    versions = versionsOfStandard(standard.id)
    const v10 = versions.find((v) => v.label === '1.0')
    const v11 = versions.find((v) => v.id === draftId)
    expect(v11.statusId, 'the new version is effective').toBe('EFFECTIVE')
    expect(v10.statusId, 'the prior effective version is superseded, not deleted').toBe(
      'SUPERSEDED',
    )
    expect(v10.supersededAt).toBeTruthy()
    expect(findStandardByCode(code).currentEffectiveVersionId).toBe(draftId)
  })
})
