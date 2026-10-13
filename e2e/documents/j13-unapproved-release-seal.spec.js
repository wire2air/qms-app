// PW-J13 — Release is impossible on an UNAPPROVED version (OQ-01 TC-01-07 step 1,
// URS-DOC-07). The gap this file closes: "releasing an unapproved draft is never
// attempted" — PW-J5 only ever walks the happy path (approve, then EFFECTIVE).
//
// The protocol's note on TC-01-07 is explicit that an absent button is weak
// evidence: "Manual release is restricted to the company owner, and only on
// versions already Approved — both restrictions are enforced at the server, not
// merely hidden in the interface. The database permits no direct
// Draft-to-Effective transition on any path." So this file evidences FOUR layers
// on one freshly-created DRAFT version:
//
//   1. INTERFACE   — no Set Effective affordance for owner / author / approver.
//   2. HTTP (status)— POST …/setEffective as the COMPANY OWNER on a DRAFT → 409.
//   3. HTTP (actor) — the same POST as the AUTHOR → 409 (not the company owner),
//                     even though the author holds document_control:update.
//   4. DATABASE    — DRAFT→EFFECTIVE is refused on BOTH trigger paths:
//                    untrusted (app_user / raw GraphQL) and trusted
//                    (superuser / REST / worker). Probed inside a rolled-back
//                    transaction so the fixture is unchanged.
//
// Measured 2026-09-22 against the live local stack (app-db + api :4000).
//
// ── WHY THIS FILE DOES NOT USE `createSopDocument` ───────────────────────────
// SEED DEFECT, recorded because it bit this work and will bite the next:
// `e2e-seed.sql` §8 inserts `E2E SOP Template` with NO `workflow_id` — the
// INSERT's column list simply omits it — and the file contains no
// 'E2E SOP Template — Approval' workflow at all (`grep -c e2eab100
// qms/database/e2e-seed.sql` → 0, 2026-09-22). The create form makes Approval
// Flow `required` the moment a template is picked ("The selected template has
// no approval flow — add reviewer and approver roles to it first"), so on a
// database built from the seed alone Create Document is refused and
// `createSopDocument` dies on its `Technical Review` readiness anchor —
// PW-J1 fails identically. The link currently PRESENT in the local app-db
// (document_templates.workflow_id = e2eab100-…-001) was inserted by hand and
// exists nowhere in version control, so it does not survive a database reset.
// Building this file's fixture on it would make these tests depend on an
// undeclared manual patch.
//
// So this file creates its document through the product's OTHER supported
// path: "Save as Draft", which requires the title alone and deliberately
// permits a template-less draft (DocumentsCreate.vue's DRAFT_MINIMUM —
// "a template-less draft is coherent: it takes its prefix from the form
// default and its workflow from the ad-hoc flow"). The record it writes is
// identical — `createDocument` is shared by both buttons and creates the same
// v1.0 DRAFT DocumentVersion. That is sufficient and in fact cleaner for
// TC-01-07 step 1, whose subject is an UNAPPROVED DRAFT: the draft never has
// to reach a workflow at all. Section content, the template prefix and the
// inherited flow — none of which this test case is about — are not in play.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, COMPANY_ID } from '../fixtures/cast.js'
import { uniqueTitle, openDocumentDetail } from '../fixtures/documents.js'
import {
  findDocumentByTitle,
  versionsOf,
  sql,
  sqlValue,
  sqlAsAppUser,
  waitForSqlValue,
} from '../fixtures/db.js'

const API = 'http://e2elab.localhost:4000'
const setEffectiveUrl = (docId, versionId) =>
  `${API}/v1/services/documents/${docId}/versions/${versionId}/setEffective`

/**
 * LOCAL helper (deliberately not added to e2e/fixtures/documents.js — this task
 * may not touch shared fixtures). Creates a template-less document via
 * "Save as Draft", whose only requirement is a title. Ends on the detail page
 * of a document whose v1.0 version is DRAFT — the subject of TC-01-07 step 1.
 */
async function createDraftDocument(page, title) {
  await page.goto('/documents')
  await page.getByRole('button', { name: 'Create Document' }).click()
  await expect(page).toHaveURL(/\/documents\/create/)
  // Document Template is `required`, so its select AUTO-PICKS the first option a
  // beat after mount, and that selection fires a watcher which rewrites prefix,
  // review cadence, auto-release and the inherited workflow. A Save-as-Draft
  // click racing that cascade lands on a button mid-re-render and is a silent
  // no-op (observed: the form still on /documents/create 25s later, with the
  // title typed and every derived field populated). So: type the title, let the
  // cascade finish, and retry the click if the first one did not navigate.
  await page.getByPlaceholder('e.g. Clean Room Sterilization Protocol').fill(title)
  await expect(page.getByLabel('Document Prefix')).not.toHaveValue('', { timeout: 15_000 })
  for (let attempt = 0; attempt < 3; attempt++) {
    await dismissViteErrorOverlay(page)
    await page.getByRole('button', { name: 'Save as Draft' }).click()
    const navigated = await page
      .waitForURL(/\/documents\/(?!create)[0-9a-f-]{36}/, { timeout: 15_000 })
      .then(() => true)
      .catch(() => false)
    if (navigated) return title
  }
  throw new Error(`Save as Draft never navigated — still on ${page.url()}`)
}

/**
 * LOCAL guard. `vite-plugin-checker` renders a full-viewport
 * <vite-plugin-checker-error-overlay> whenever ANY file under src/ or resource/
 * fails ESLint — including a file another agent is mid-edit on, which has
 * nothing to do with this spec. It intercepts every pointer event, so clicks
 * silently retry until they time out ("<vite-plugin-checker-error-overlay>
 * intercepts pointer events" in the call log). Report what it says rather than
 * failing as a mysterious click timeout, then remove it so the run can proceed:
 * it is a dev-server affordance, not product UI, and nothing under test renders
 * it.
 */
async function dismissViteErrorOverlay(page) {
  const overlay = page.locator('vite-plugin-checker-error-overlay')
  if (!(await overlay.count())) return
  const said =
    (await overlay
      .first()
      .textContent()
      .catch(() => '')) || ''
  console.warn(
    `[vite checker overlay] a lint error in src/ or resource/ is blocking the page: ${said
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300)}`,
  )
  await page.evaluate(() => {
    document.querySelectorAll('vite-plugin-checker-error-overlay').forEach((n) => n.remove())
  })
}

/** Local helper — the detail page's Set Effective control, wherever it renders. */
function setEffectiveControl(page) {
  return page
    .getByRole('button', { name: /^set effective$/i })
    .or(page.getByRole('menuitem', { name: /^set effective$/i }))
}

/** Local helper — status of one version, straight from the database. */
function statusOf(versionId) {
  return sqlValue(`SELECT status_id FROM document_versions WHERE id = '${versionId}'`)
}

test.describe('PW-J13 · an unapproved draft cannot be released', () => {
  let docId
  let versionId

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    const title = uniqueTitle('J13-draft')
    await createDraftDocument(page, title)
    docId = findDocumentByTitle(title).id
    // The v1.0 row is pushed through the SyncEngine queue a beat after the
    // document, so read it behind a barrier rather than racing it.
    await waitForSqlValue(
      `SELECT count(*) FROM document_versions WHERE document_id = '${docId}' AND deleted_at IS NULL`,
      { timeoutMs: 20_000, label: 'v1.0 DRAFT created' },
    )
    const versions = versionsOf(docId)
    expect(versions, 'exactly one version at creation').toHaveLength(1)
    versionId = versions[0].id
    // The premise of every arm below: the version really is DRAFT, i.e.
    // unapproved. Asserted from the database, not from the screen.
    expect(versions[0].statusId, 'v1.0 is DRAFT (unapproved)').toBe('DRAFT')
    await ctx.close()
  })

  // ── Layer 1: the interface offers nothing ────────────────────────────────
  test('no Set Effective affordance is offered to the company owner on a DRAFT', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const page = await ctx.newPage()
    await openDocumentDetail(page, docId)
    await dismissViteErrorOverlay(page)
    // Both buckets: the inline action bar and the overflow menu. DetailActionBar
    // promotes high-priority actions inline and buckets the rest behind ⋯, so
    // asserting only one of the two would be assertable-but-hollow.
    await expect(setEffectiveControl(page), 'inline / already-rendered').toHaveCount(0)
    await page.getByRole('button', { name: 'More actions' }).click()
    await expect(setEffectiveControl(page), 'inside the overflow menu').toHaveCount(0)
    // Positive control: this owner DOES see the menu's other entries, so the
    // absence above is a gated action and not an unrendered page.
    await expect(page.getByRole('menuitem', { name: /revision history/i })).toBeVisible({
      timeout: 15_000,
    })
    await ctx.close()
  })

  test('no Set Effective affordance is offered to the Author on a DRAFT', async ({ browser }) => {
    test.setTimeout(120_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    await openDocumentDetail(page, docId)
    await dismissViteErrorOverlay(page)
    await expect(setEffectiveControl(page)).toHaveCount(0)
    await page.getByRole('button', { name: 'More actions' }).click()
    await expect(setEffectiveControl(page)).toHaveCount(0)
    // Positive control: the author's own draft affordances DO render, so the
    // absent release action is a gate and not an empty page.
    await expect(page.getByRole('menuitem', { name: /revision history/i })).toBeVisible({
      timeout: 15_000,
    })
    await ctx.close()
  })

  test('the Approver has no read path to the unapproved draft at all', async ({ browser }) => {
    test.setTimeout(120_000)
    // STRONGER than "no button". A DRAFT-only document has no EFFECTIVE version,
    // so `documents_sel`'s permission arm (which requires one) does not match,
    // and the Approver is not author / collaborator / assignee / share — no task
    // exists yet because the draft was never submitted. The Approver therefore
    // cannot reach the record, let alone its release action. Evidenced at the
    // RLS layer (authoritative) and then on screen.
    const reachable = sqlAsAppUser(`SELECT count(*) FROM documents WHERE id = '${docId}';`, {
      userId: USERS.approver.id,
      companyId: COMPANY_ID,
    })
    expect(reachable.ok, reachable.error).toBe(true)
    expect(
      reachable.output.trim().split('\n').pop(),
      'documents_sel yields the Approver no row for a draft-only document',
    ).toBe('0')

    const ctx = await browser.newContext({ storageState: AUTH.approver })
    const page = await ctx.newPage()
    await page.goto(`/documents/${docId}`)
    // No record body ⇒ no action bar ⇒ no Set Effective. Bounded wait so a slow
    // sync cannot make this pass vacuously: we assert the release control is
    // absent after giving the page a real chance to render.
    await page.waitForTimeout(8_000)
    await expect(setEffectiveControl(page)).toHaveCount(0)
    await ctx.close()
  })

  // ── Layer 2 + 3: the server refuses, whoever asks ────────────────────────
  test('HTTP: the company owner is refused 409 when releasing a DRAFT', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const res = await ctx.request.post(setEffectiveUrl(docId, versionId), { data: {} })
    expect(res.status(), 'company owner + DRAFT ⇒ 409 Conflict').toBe(409)
    expect(await res.text()).toMatch(/only APPROVED versions can be set to EFFECTIVE/i)
    expect(statusOf(versionId), 'nothing was written').toBe('DRAFT')
    await ctx.close()
  })

  test('HTTP: the Author is refused 409 — manual release is company-owner-only', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.author })
    // The author holds document_control:update, so `enforcePermission` on the
    // route ADMITS them; the refusal comes from the controller's separate
    // `user.isOwner !== true` gate. That distinction is the point of this arm —
    // the actor restriction is not the permission check.
    const res = await ctx.request.post(setEffectiveUrl(docId, versionId), { data: {} })
    expect(res.status(), 'non-owner ⇒ 409 Conflict').toBe(409)
    expect(await res.text()).toMatch(/only the company owner can make a version effective/i)
    expect(statusOf(versionId), 'nothing was written').toBe('DRAFT')
    await ctx.close()
  })

  // ── Layer 4: the database permits no Draft→Effective on any path ─────────
  test('DATABASE: DRAFT→EFFECTIVE is refused on the untrusted (raw GraphQL) path', async () => {
    // app_user is the role PostGraphile runs every GraphQL mutation as, so this
    // is precisely what a hand-rolled mutation would reach. The author is used
    // deliberately: they PASS document_version_update_rls (update grant +
    // collaborator on their own draft), so the statement reaches the trigger and
    // the refusal we measure is the guard, not a silent 0-row RLS filter.
    const r = sqlAsAppUser(
      `BEGIN; UPDATE document_versions SET status_id = 'EFFECTIVE' WHERE id = '${versionId}'; ROLLBACK;`,
      { userId: USERS.author.id, companyId: COMPANY_ID },
    )
    expect(r.ok, 'the statement was REJECTED, not silently applied').toBe(false)
    expect(r.error).toMatch(/status cannot be changed directly \(attempted DRAFT -> EFFECTIVE\)/i)
    expect(statusOf(versionId)).toBe('DRAFT')
  })

  test('DATABASE: DRAFT→EFFECTIVE is refused on the trusted (REST / worker) path too', async () => {
    // The trusted path is the superuser connection REST controllers and the
    // worker use — the one that CAN legitimately move status. Even there the
    // transition graph in enforce_document_version_transition() has no
    // DRAFT->EFFECTIVE edge, so there is no server-side code path, authorised or
    // otherwise, that could publish an unapproved version. Rolled back.
    let error = ''
    try {
      sql(
        `BEGIN; UPDATE document_versions SET status_id = 'EFFECTIVE' WHERE id = '${versionId}'; ROLLBACK;`,
      )
    } catch (err) {
      error = `${err.stderr ?? ''}`
    }
    expect(error, 'trusted DRAFT→EFFECTIVE raises').toMatch(
      /Illegal document version status transition: DRAFT -> EFFECTIVE/i,
    )
    expect(statusOf(versionId), 'the rollback left the fixture untouched').toBe('DRAFT')
  })

  test('DATABASE: a version cannot even be CREATED in EFFECTIVE from the untrusted path', async () => {
    // The other half of the seal — closing UPDATE alone would leave "insert it
    // already-effective" open. enforce_document_version_transition()'s INSERT
    // arm pins every untrusted insert to DRAFT.
    const r = sqlAsAppUser(
      `BEGIN;
       INSERT INTO document_versions
         (id, company_id, document_id, version_major, version_minor, status_id, is_latest,
          change_reason, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), '${COMPANY_ID}', '${docId}', 9, 9, 'EFFECTIVE', false,
               'J13 probe', '${USERS.author.id}', NOW(), NOW());
       ROLLBACK;`,
      { userId: USERS.author.id, companyId: COMPANY_ID },
    )
    expect(r.ok, 'the insert was REJECTED').toBe(false)
    expect(r.error).toMatch(/can only be created in DRAFT \(attempted EFFECTIVE\)/i)
  })
})
