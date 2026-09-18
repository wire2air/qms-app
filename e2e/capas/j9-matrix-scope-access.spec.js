// PW-J9 · The matrix decides, at its scope — for people the workflow never named.
//
// Since 2026-08-19 an assignment is ROUTING, not a lock: anyone whose role
// grants the step's verb at a scope covering the record may act, with the
// audit trail recording who actually did (utils/workflowStepAccess.js, the
// "on behalf of" affordance in stepTakeover.js). Three faces of that rule:
//
//   1. POSITIVE — `capaSiteEditor` (capa:read/update/approve at SITE scope,
//      Primary Site; no workflow role, owns nothing) edits the record and
//      completes BOTH workflow steps on the assignees' behalf.
//   2. NEGATIVE, no verb — `auditor` (capa:read only) sees the record but
//      every mutation is refused and no action affordance renders.
//   3. NEGATIVE, out of scope — the same `capaSiteEditor`, against a CAPA at
//      Secondary Site: the verb is held but the scope does not cover the
//      record, so RLS hides it and the API refuses actions on it.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, COMPANY_ID, ESIGN_PIN } from '../fixtures/cast.js'
import { createCapa, openCapa, uniqueTitle } from '../fixtures/capas.js'
import { clickWhenReady } from '../fixtures/documents.js'
import { findCapaByTitle, sqlValue, sqlAsAppUser, waitForSqlValue } from '../fixtures/db.js'

/** Can this user SELECT this CAPA row through RLS (the app's real read path)? */
function canSee(userId, capaId) {
  const res = sqlAsAppUser(`SELECT count(*) FROM capas WHERE id = '${capaId}';`, {
    userId,
    companyId: COMPANY_ID,
  })
  expect(res.ok, res.error).toBe(true)
  return res.output.trim().split('\n').pop() === '1'
}

/** Author creates + opens a CAPA at a named site; returns the row. */
async function openedCapaAt(browser, tag, siteName) {
  const ctx = await browser.newContext({ storageState: AUTH.author })
  const page = await ctx.newPage()
  const title = uniqueTitle(tag)
  await createCapa(page, title, { siteName })
  const capa = findCapaByTitle(title)
  await openCapa(page, capa.id)
  await ctx.close()
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE entity_type = 'Capa' AND entity_id = '${capa.id}'
        AND assigned_to = '${USERS.reviewer.id}' AND status_id = 'ASSIGNED'`,
    { timeoutMs: 45_000, label: 'reviewer task assigned' },
  )
  return capa
}

/** The live ASSIGNED task on this CAPA for a given assignee, or null. */
function assignedTaskId(capaId, userId) {
  return sqlValue(
    `SELECT id FROM task_instances
      WHERE entity_type = 'Capa' AND entity_id = '${capaId}'
        AND assigned_to = '${userId}' AND status_id = 'ASSIGNED'
      ORDER BY created_at DESC LIMIT 1`,
  )
}

test.describe('PW-J9 · site-scoped matrix access', () => {
  test('a site-scoped editor — no assignment, no ownership — edits, completes and approves', async ({
    browser,
  }) => {
    test.setTimeout(300_000)
    const capa = await openedCapaAt(browser, 'J9-insite', 'Primary Site')
    expect(capa.ownerId, 'the editor does not own this CAPA').not.toBe(USERS.capaSiteEditor.id)

    // RLS admits them: capa:read at SITE scope covers a Primary Site row.
    expect(canSee(USERS.capaSiteEditor.id, capa.id), 'site scope covers the record').toBe(true)

    const ctx = await browser.newContext({ storageState: AUTH.capaSiteEditor })
    const page = await ctx.newPage()
    await page.goto(`/capas/${capa.id}`, { waitUntil: 'domcontentloaded' })

    // 1. EDIT the record — the problem statement is inline-editable for them
    //    (isEditable consults isAllowedOnRecord, not ownership). The field
    //    already carries the create-time statement, so click INTO the rendered
    //    content (click-to-edit) rather than the empty-state label.
    const marker = `Edited by site-scoped editor ${Date.now()}`
    await clickWhenReady(page, page.getByText('seeded problem statement').first())
    // The click swaps the read-only view for a fresh TipTap mount; typing
    // immediately races its focus. Wait for the editor node and click INTO it
    // so the caret exists before the keystrokes.
    const editor = page.locator('.ProseMirror').first()
    await expect(editor).toBeVisible({ timeout: 10_000 })
    await editor.click()
    await page.keyboard.type(marker)
    // Autosave is debounced; clicking elsewhere flushes focus out of TipTap.
    await page.getByText('CAPA Details').first().click()
    await waitForSqlValue(
      `SELECT count(*) FROM capas WHERE id = '${capa.id}' AND description ILIKE '%${marker}%'`,
      { timeoutMs: 30_000, label: 'description edit persisted' },
    )

    // 2. COMPLETE the reviewer's ACTION step on their behalf. The affordance
    //    must NAME the assignee — that labelling is the guard against
    //    accidental takeover, so it is asserted, not just clicked.
    await clickWhenReady(
      page,
      page.getByRole('button', { name: `Mark Complete on behalf of ${USERS.reviewer.name}` }),
    )
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'Capa' AND entity_id = '${capa.id}'
          AND assigned_to = '${USERS.approver.id}' AND status_id = 'ASSIGNED'`,
      { timeoutMs: 45_000, label: 'approver task after takeover completion' },
    )

    // 3. APPROVE the e-signed APPROVAL step on the approver's behalf —
    //    capa:approve at site scope is what admits them to this one.
    await clickWhenReady(
      page,
      page.getByRole('button', { name: `Approve on behalf of ${USERS.approver.name}` }),
    )
    const pin = page.getByPlaceholder('Enter your e-signature PIN')
    await expect(pin).toBeVisible({ timeout: 15_000 })
    await pin.fill(ESIGN_PIN)
    await page.getByRole('button', { name: 'Sign' }).click()

    await waitForSqlValue(
      `SELECT count(*) FROM workflow_instances
        WHERE resource_type = 'Capa' AND resource_id = '${capa.id}' AND status_id = 'COMPLETED'`,
      { timeoutMs: 45_000, label: 'workflow completed by the site-scoped editor' },
    )

    // The signature is the EDITOR's, with the assignee recorded via the
    // takeover attribution — acting on behalf of is not impersonation.
    const signerCount = sqlValue(
      `SELECT count(*) FROM signatures s
        JOIN task_instances ti ON ti.id = s.task_instance_id
        WHERE s.user_id = '${USERS.capaSiteEditor.id}'
          AND ti.entity_type = 'Capa' AND ti.entity_id = '${capa.id}'`,
    )
    expect(Number(signerCount), 'signature attributed to the actual actor').toBeGreaterThan(0)
    await ctx.close()
  })

  test('no capa:update → read-only: no affordance in the UI, 403 from the API', async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    const capa = await openedCapaAt(browser, 'J9-noverb', 'Primary Site')
    const taskId = assignedTaskId(capa.id, USERS.reviewer.id)
    expect(taskId, 'reviewer task exists').toBeTruthy()

    const ctx = await browser.newContext({ storageState: AUTH.auditor })
    const page = await ctx.newPage()
    await page.goto(`/capas/${capa.id}`, { waitUntil: 'domcontentloaded' })

    // They can read it (capa:read at tenant)…
    await expect(page.getByText(capa.capaNumber).first()).toBeVisible({ timeout: 30_000 })
    // …but no complete/approve affordance renders, own or on-behalf.
    await expect(page.getByRole('button', { name: /Mark Complete/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Approve/ })).toHaveCount(0)

    // The server agrees, independently of the UI: acting on the reviewer's
    // task without the verb is refused.
    const res = await ctx.request.post(`/api/v1/services/taskInstances/${taskId}/action`, {
      data: { action: 'APPROVED', outcomeId: 'COMPLETE_AND_ADVANCE' },
    })
    expect(res.status(), 'task action without capa:update').toBe(403)

    // And the record itself rejects mutation through the update-gated path.
    const submit = await ctx.request.post(`/api/v1/services/capas/${capa.id}/submitForReview`, {
      data: {},
    })
    expect(submit.status(), 'record mutation without capa:update').toBe(403)

    // Nothing moved.
    expect(sqlValue(`SELECT status_id FROM capas WHERE id = '${capa.id}'`)).toBe('OPEN')
    await ctx.close()
  })

  test('capa:update held, record out of site scope → invisible, and actions refuse', async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    // Author (tenant scope) raises the CAPA at SECONDARY Site — outside the
    // editor's site set.
    const capa = await openedCapaAt(browser, 'J9-outsite', 'Secondary Site')
    const taskId = assignedTaskId(capa.id, USERS.reviewer.id)
    expect(taskId, 'reviewer task exists').toBeTruthy()

    // RLS: the same grant that admitted them in test 1 matches nothing here.
    expect(
      canSee(USERS.capaSiteEditor.id, capa.id),
      'site scope must not reach another site’s record',
    ).toBe(false)

    const ctx = await browser.newContext({ storageState: AUTH.capaSiteEditor })
    const page = await ctx.newPage()

    // The UI has nothing to show them — the record does not exist for them.
    await page.goto(`/capas/${capa.id}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('CAPA not found')).toBeVisible({ timeout: 30_000 })

    // Acting on its task is refused even though they hold capa:update —
    // scope_allowed() is the half of the check that says no.
    const res = await ctx.request.post(`/api/v1/services/taskInstances/${taskId}/action`, {
      data: { action: 'APPROVED', outcomeId: 'COMPLETE_AND_ADVANCE' },
    })
    expect(res.status(), 'task action out of site scope').toBe(403)

    const submit = await ctx.request.post(`/api/v1/services/capas/${capa.id}/submitForReview`, {
      data: {},
    })
    expect(submit.status(), 'record mutation out of site scope').toBe(403)

    expect(sqlValue(`SELECT status_id FROM capas WHERE id = '${capa.id}'`)).toBe('OPEN')
    await ctx.close()
  })
})
