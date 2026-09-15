// CMP-J3 — Customer Complaint (support ticket) lifecycle: create -> accept ->
// assign -> close.
//
// WHY THIS FILE EXISTS. `complaint_management` (customer_complaints table) is
// the SIBLING module to `complaints` — separate table, controller, permission
// set and state machine (rule-based, not a fixed edge list: see
// docs/modules/complaints/07-state-machine.md "Support customer_complaints").
// It had zero E2E coverage before this, same as the internal module. This
// file drives the support-agent side (create/accept/assign/close) rather than
// the QA-investigation lens (`/complaints`, covered by J1/J2) — the two
// surfaces read the SAME table but are gated by DIFFERENT verbs
// (`complaint_management:*`), so a permission regression on one is invisible
// to a probe of the other.
//
// `close` currently gates on enforcePermission('complaint_management',
// 'update') (always-on) PLUS a dormant requirePermission(..., 'close') that
// only fires when AUTHZ_VERBS_ENABLED=true (11-security-review.md §6) — so
// today `:update` alone is sufficient to close a ticket. supportAgent holds
// update, which is what this journey actually proves is enough.
import { test, expect } from '@playwright/test'
import { AUTH, USERS } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import {
  createPersonaPool,
  findCustomerComplaintBySubject,
  purgeCustomerComplaintBySubject,
  purgeMintedCustomerComplaints,
  restPost,
} from '../fixtures/complaints.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

const SUBJECT = 'E2E J3 Customer Complaint'

test.describe('CMP-J3 · Customer Complaint (support) lifecycle', () => {
  test.beforeAll(() => {
    purgeMintedCustomerComplaints()
    purgeCustomerComplaintBySubject(SUBJECT)
  })
  test.afterAll(() => {
    purgeCustomerComplaintBySubject(SUBJECT)
  })

  test('create: lands in `customer_complaints`, not `complaints`, gated on complaint_management:create', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.supportAgent)

    const restCalls = []
    page.on('request', (req) => {
      if (req.url().includes('/v1/services/customerComplaints')) {
        restCalls.push(`${req.method()} ${new URL(req.url()).pathname}`)
      }
    })

    const res = await restPost(page, '/customerComplaints', {
      subject: SUBJECT,
      description: 'Seeded by CMP-J3.',
      customerName: 'Erin E2E Customer',
      customerEmail: 'erin.customer.j3@e2e.test',
    })
    expect(res.status(), `create failed: ${await res.text()}`).toBe(201)
    const body = await res.json()
    expect(body.customerComplaint?.subject).toBe(SUBJECT)

    const row = findCustomerComplaintBySubject(SUBJECT)
    expect(row, 'the row landed in customer_complaints').not.toBeNull()
    expect(row.complaintNumber, 'a CC- number was minted').toMatch(/^CC-/)
    expect(
      sqlValue(`SELECT count(*) FROM complaints WHERE subject = '${SUBJECT}'`),
      'nothing was ALSO written to the internal complaints table',
    ).toBe('0')
  })

  test('accept: the agent becomes the assignee and status moves off NEW', async ({ browser }) => {
    const page = await pool.page(browser, AUTH.supportAgent)
    const row = findCustomerComplaintBySubject(SUBJECT)
    expect(row, 'the create test left a row behind').not.toBeNull()

    const res = await restPost(page, `/customerComplaints/${row.id}/accept`, {})
    expect(res.status(), `accept failed: ${await res.text()}`).toBe(200)

    const after = findCustomerComplaintBySubject(SUBJECT)
    expect(after.assignedTo, 'the accepter became the assignee').toBe(USERS.supportAgent.id)
    expect(['IN_PROGRESS', 'ASSIGNED'], 'status moved off NEW').toContain(after.statusId)
  })

  test('assign: a second agent can be assigned, moving assignedTo without an owner grant on the new assignee', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.supportAgent)
    const row = findCustomerComplaintBySubject(SUBJECT)

    // Re-assign to the seeded owner (any valid company user works — the
    // assignee does not need a complaint_management grant of their own,
    // since assignment is a routing decision made by the caller, not a
    // self-service claim).
    const res = await restPost(page, `/customerComplaints/${row.id}/assign`, {
      userId: USERS.owner.id,
    })
    expect(res.status(), `assign failed: ${await res.text()}`).toBe(200)

    const after = findCustomerComplaintBySubject(SUBJECT)
    expect(after.assignedTo).toBe(USERS.owner.id)
  })

  test('close: a workflow-free ticket closes directly (no requireClosureApproval by default)', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.supportAgent)
    const row = findCustomerComplaintBySubject(SUBJECT)

    const res = await restPost(page, `/customerComplaints/${row.id}/close`, {})
    expect(res.status(), `close failed: ${await res.text()}`).toBe(200)

    const after = findCustomerComplaintBySubject(SUBJECT)
    expect(after.statusId).toBe('CLOSED')

    // Terminal — a second close attempt is refused, not silently accepted.
    const again = await restPost(page, `/customerComplaints/${row.id}/close`, {})
    expect(again.status(), 'closing an already-closed ticket is refused').toBe(409)
  })

  test('UI: the QA lens (/complaints) never shows a customer_complaints row', async ({
    browser,
  }) => {
    // Regression lock for the misleading in-code comment on QaComplaintsIndex
    // ("writes to the same customer_complaints table") — the two tables are
    // genuinely separate, and a customer ticket must never surface on the
    // internal Quality Complaints list.
    const page = await pool.page(browser, AUTH.owner)
    await page.goto('/complaints')
    await expect(page.getByText('New Complaint', { exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(SUBJECT, { exact: false })).toHaveCount(0)
  })
})
