// PW-J1 — Author: create → draft → submit for review (TC-01/02/03).
// Asserts UI state plus the DB facts the journey must produce: DRAFT insert
// with no doc number, completeness gate, then IN_REVIEW + minted doc number +
// workflow instance + approval task.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'
import { createSopDocument, fillAllSections, submitForReview, uniqueTitle } from '../fixtures/documents.js'
import { findDocumentByTitle, versionsOf, sqlValue } from '../fixtures/db.js'

test.use({ storageState: AUTH.author })

test.describe('PW-J1 · author creates an SOP and submits it for review', () => {
  test('list renders for an authorized author', async ({ page }) => {
    await page.goto('/documents')
    await expect(page.getByRole('button', { name: 'Create Document' })).toBeVisible({ timeout: 20_000 })
  })

  test('create from template → DRAFT 1.0 with no doc number', async ({ page }) => {
    const title = uniqueTitle('J1-create')
    await createSopDocument(page, title)

    // Version chip shows a draft; no doc number minted yet.
    await expect(page.getByText(/draft/i).first()).toBeVisible()

    const doc = findDocumentByTitle(title)
    expect(doc, 'document row exists').toBeTruthy()
    expect(doc.docNumber, 'doc_number is NOT minted on create').toBeNull()

    const versions = versionsOf(doc.id)
    expect(versions).toHaveLength(1)
    expect(versions[0].statusId).toBe('DRAFT')
    expect(versions[0].isLatest).toBe(true)

    // Template sections were cloned (E2E SOP Template has 3).
    const sections = sqlValue(`SELECT count(*) FROM document_sections WHERE document_id = '${doc.id}'`)
    expect(Number(sections)).toBeGreaterThanOrEqual(3)
  })

  test('completeness gate blocks submit while sections are empty', async ({ page }) => {
    const title = uniqueTitle('J1-gate')
    await createSopDocument(page, title)

    await page.getByRole('button', { name: /submit for review/i }).click()
    // Incomplete-sections reminder dialog, not the workflow preview.
    await expect(page.getByText(/still|incomplete|empty/i).first()).toBeVisible({ timeout: 10_000 })
    await page.getByRole('dialog').last().getByRole('button', { name: /ok|close|got it|cancel/i }).last().click()

    const doc = findDocumentByTitle(title)
    expect(versionsOf(doc.id)[0].statusId).toBe('DRAFT')
  })

  test('fill sections → submit → IN_REVIEW with doc number, workflow and task', async ({ page }) => {
    const title = uniqueTitle('J1-submit')
    await createSopDocument(page, title)
    const created = findDocumentByTitle(title)
    await fillAllSections(page, created.id)
    await submitForReview(page)

    const doc = findDocumentByTitle(title)
    expect(doc.docNumber, 'doc_number minted at first submit').toMatch(/^ESOP-\d+/)

    const [version] = versionsOf(doc.id)
    expect(version.statusId).toBe('IN_REVIEW')

    const wfCount = sqlValue(
      `SELECT count(*) FROM workflow_instances WHERE resource_type = 'DocumentVersion' AND resource_id = '${version.id}'`,
    )
    expect(Number(wfCount)).toBe(1)

    const openTasks = sqlValue(
      `SELECT count(*) FROM task_instances WHERE source_type = 'WorkflowInstanceStep' AND entity_id = '${version.id}' AND deleted_at IS NULL`,
    )
    expect(Number(openTasks)).toBeGreaterThanOrEqual(1)
  })
})
