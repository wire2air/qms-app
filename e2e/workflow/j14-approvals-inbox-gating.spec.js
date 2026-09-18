// PW-J14 · F-15 — Approvals Inbox gating.
//
// ⚠️ READ THIS BEFORE CHANGING THE FILE. Doc 14 specified this journey as
// "assert /workflow-instances is blocked for a user with no `workflows_templates`
// grant AND for an EXTERNAL_SUPPLIER". **Only half of that was adopted, and the
// other half was rejected on purpose** (19-production-readiness.md §"On F-15's
// other half"). This spec pins BOTH halves — the block AND the deliberate
// non-block — because the non-block is the one nobody would defend on review.
//
// What was wrong: `/workflow-instances` and `/workflow-instances/:id` had no
// guard of any kind. `requiredPermissionFor()` returns null for an unmapped
// first path segment, so both the supplier branch and the permission check fell
// through to `return true` and ANY authenticated principal — supplier portal
// accounts included — could open the tenant's whole approval topology by typing
// the URL. There is no sidebar entry for either route, so the exposure needed a
// guessed or shared id, but no permission at all.
//
// What was NOT done, and why: adding `workflow-instances` to ADMIN_PERMISSIONS
// (the obvious fix, and the one doc 14 asked for) would gate the segment on
// `workflows_templates:read`. `/workflow-instances/:id` is legitimately deep-
// linked from three places in production —
//   · the Nonconformance detail page (NonconformancesPageId.vue:1110)
//   · the Document detail page      (DocumentsPageId.vue:629)
//   · every `WorkflowInstance` notification (NotificationsItem.vue:62)
// — and ordinary reviewers, the people those links exist FOR, hold no template
// permission by design. Gating the segment would break all three: a reviewer
// clicking "an approval needs you" in their notification feed would land on
// /no-access. That is a worse outcome than the finding.
//
// So the segment is closed to suppliers outright (SUPPLIER_BLOCKED_SEGMENTS,
// checked BEFORE the permission map because an unmapped segment would otherwise
// let a supplier straight through) and stays open to authenticated internal
// users, whose visibility is scoped by RLS and — since the F-04 fix — by the
// OWNING module's read permission per resource type.
//
// The internal-user tests below are therefore CONTROLS pinning a decision, not
// coverage of a gap. If a later pass "fixes F-15 properly" by gating the
// segment, they turn red and this comment explains what production breaks.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID, SUPPLIER_USER, USERS } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import { freshContext } from '../fixtures/sites.js'
import { createLiveWorkflowInstance } from '../fixtures/workflow.js'

test.use({ storageState: AUTH.author })

// One instance id for the whole file — the deep-link half needs a REAL one, and
// a "not found" page would be indistinguishable from a guard redirect if we
// invented an id.
//
// LOOKED UP, not manufactured. This journey is about ROUTING; the instance is a
// prop, and every other workflow spec leaves live ones behind. Driving the CR
// creation UI just to obtain a uuid made the whole file depend on the single
// least reliable thing in the harness — `submitCrForApproval`'s 40s sync-back
// barrier, which is where all three attempts of this file died on 2026-08-07
// while every assertion below was untouched. The UI path stays as a fallback for
// a freshly reset database.
let instanceId

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000)
  instanceId = sqlValue(
    `SELECT id FROM workflow_instances
      WHERE company_id = '${COMPANY_ID}' AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
  )
  if (instanceId) return

  const ctx = await browser.newContext({ storageState: AUTH.author })
  const page = await ctx.newPage()
  try {
    ;({ instanceId } = await createLiveWorkflowInstance(page, 'J14-inbox'))
  } finally {
    await ctx.close()
  }
})

test.describe('PW-J14 · F-15 Approvals Inbox gating', () => {
  test('the premise: the CONTROL personas hold no workflow permission', async () => {
    // Load-bearing. Every CONTROL below claims "an internal user with NO
    // template permission can still reach the inbox". If the personas silently
    // acquired one, those tests would keep passing while proving the opposite
    // thing — so assert the premise rather than trusting the seed comment.
    //
    // Note the E2E seed *tries* to grant `workflows_templates:read` to six
    // roles (e2e-seed.sql:100-149) and it never lands: the grant is written as
    // `INSERT … SELECT FROM authz.module_actions WHERE module_id||':'||action_id
    // IN (…)`, and `workflows_templates` has no `read` action in the catalog, so
    // the row matches nothing. If that action is ever added, this assertion goes
    // red — correctly, because the CONTROLs below would then be measuring a
    // permitted user rather than an unpermitted one.
    //
    // ⚠️ SCOPE CHANGED 2026-08-28. This used to count workflows_* grants across
    // the WHOLE tenant and assert zero. That stopped being true, legitimately:
    // creating a document template now also mints that template's approval
    // workflow (`ensureTemplateApprovalWorkflow`), which writes through
    // `workflows_ins` and therefore needs `workflows_templates:create` — so the
    // seed grants exactly that, to the Doc Controller role, or PW-J8 never
    // navigates off /document-templates/create (e2e-seed.sql §7, lines 145-175).
    // Carla is not a persona any CONTROL below drives, so a tenant-wide count
    // was measuring the wrong thing: what has to stay true is that the two
    // personas these CONTROLs actually use hold NOTHING on workflows_*. Asserted
    // per-persona now, which is both narrower and sharper — a grant landing on
    // Rita or Noah trips it, and a grant landing on someone irrelevant does not.
    for (const [name, userId] of [
      ['reviewer', USERS.reviewer.id],
      ['noAccess', USERS.noAccess.id],
    ]) {
      expect(
        Number(
          sqlValue(
            `SELECT count(*) FROM authz.role_module_permissions rmp
               JOIN roles_on_users ru ON ru.role_id = rmp.role_id AND ru.company_id = rmp.company_id
              WHERE rmp.company_id = '${COMPANY_ID}' AND ru.user_id = '${userId}'
                AND rmp.module_id LIKE 'workflow%'`,
          ),
        ),
        `${name} holds no workflows_* permission (see the note above if this fails)`,
      ).toBe(0)
    }

    // The zero-grant persona used by the strongest CONTROL. Structural: they
    // hold no role at all, so no future catalog change can quietly give them one.
    const noAccessGrants = Number(
      sqlValue(
        `SELECT count(*) FROM authz.role_module_permissions rmp
           JOIN roles_on_users ru ON ru.role_id = rmp.role_id AND ru.company_id = rmp.company_id
          WHERE ru.user_id = '${USERS.noAccess.id}'`,
      ),
    )
    expect(noAccessGrants, 'the zero-grant persona genuinely holds nothing').toBe(0)

    expect(instanceId, 'a real workflow instance exists to deep-link at').toBeTruthy()
  })

  test('an EXTERNAL_SUPPLIER is blocked from the Approvals Inbox list', async ({ browser }) => {
    // The half of F-15 that WAS applied. Suppliers hit SUPPLIER_BLOCKED_SEGMENTS
    // before the permission map is consulted at all.
    const ctx = await freshContext(browser, SUPPLIER_USER)
    try {
      const page = await ctx.newPage()
      await page.goto('/workflow-instances', { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(/\/no-access/, { timeout: 20_000 })
    } finally {
      await ctx.close()
    }
  })

  test('the supplier block covers the deep-linked detail route, not just the list', async ({
    browser,
  }) => {
    // The detail route is the one that matters: it is the only one anybody has a
    // link to, and it is where the approval topology actually renders. A guard
    // that only covered `/workflow-instances` exactly would leave the real
    // exposure open — SUPPLIER_BLOCKED_SEGMENTS matches on the FIRST path
    // segment for exactly this reason.
    const ctx = await freshContext(browser, SUPPLIER_USER)
    try {
      const page = await ctx.newPage()
      await page.goto(`/workflow-instances/${instanceId}`, { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(/\/no-access/, { timeout: 20_000 })
    } finally {
      await ctx.close()
    }
  })

  test('CONTROL: an ordinary reviewer with no template grant still reaches the inbox', async ({
    browser,
  }) => {
    // `reviewer` holds RECORD-module grants only — read across
    // document_control/ncr/capa/change_control/audit_*, plus `capa:update` and
    // `change_control:update` since the 2026-08-19 assignee-verb rule made an
    // assignment stop conferring the verb (e2e-seed.sql §32/§33). What she still
    // holds NOTHING of is `workflows_*`, which is the only thing this CONTROL
    // turns on — she is the exact persona doc 19 protects, and blocking her here
    // is what would break the notification deep link in production.
    // (The stale version of this comment said "and nothing else", which stopped
    // being true when the verb backfill landed and would have sent the next
    // reader looking for a grant regression that is not one.)
    const ctx = await browser.newContext({ storageState: AUTH.reviewer })
    try {
      const page = await ctx.newPage()
      await page.goto('/workflow-instances', { waitUntil: 'domcontentloaded' })
      // Wait for the shell to hydrate before asserting the ABSENCE of a
      // redirect: the guard runs on navigation, so a bare URL check against a
      // still-empty DOM would pass before it ever fired.
      await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 20_000 })
      await expect(page).not.toHaveURL(/\/no-access/)
      expect(new URL(page.url()).pathname).toBe('/workflow-instances')
    } finally {
      await ctx.close()
    }
  })

  test('CONTROL: the reviewer’s deep link into a specific instance still resolves', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.reviewer })
    try {
      const page = await ctx.newPage()
      await page.goto(`/workflow-instances/${instanceId}`, { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 20_000 })
      await expect(page).not.toHaveURL(/\/no-access/)
      expect(new URL(page.url()).pathname).toBe(`/workflow-instances/${instanceId}`)
    } finally {
      await ctx.close()
    }
  })

  test('CONTROL: even a zero-grant internal user is not bounced — the segment is not permission-gated', async ({
    browser,
  }) => {
    // `noAccess` holds no permission anywhere in the product. If the segment
    // were quietly moved into RECORD_LIST_PERMISSIONS or ADMIN_PERMISSIONS, THIS
    // is the test that catches it first — and the redirect it would produce is
    // precisely what a reviewer arriving from a notification would see.
    expect(USERS.noAccess.id, 'the zero-grant persona exists').toBeTruthy()
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    try {
      const page = await ctx.newPage()
      await page.goto('/workflow-instances', { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 20_000 })
      await expect(page).not.toHaveURL(/\/no-access/)
    } finally {
      await ctx.close()
    }
  })
})
