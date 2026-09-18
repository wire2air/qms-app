// PW-J9 · Audit required-field refusals — OQ-07 TC-07-03 step 2 (audit
// instance) and TC-07-05 step 2 (finding).
//
// TWO ENTITIES, ONE FILE: an audit instance, and a finding raised on one. They
// share the refusal shape, and the finding arms need a parent audit anyway.
//
// WHAT THE PROTOCOL ASKED FOR VS WHAT IS ENFORCED. Both test cases named fields
// that are not required anywhere:
//   · TC-07-03 asked for a refusal without "standard or scope" — `scope` is
//     `.optional().nullable()` server-side and carries no client rule, so an
//     audit with no scope is created happily.
//   · TC-07-05 asked for a refusal without "category or description" —
//     `categoryId` is optional by design, defaulting from the parent audit.
// Both protocol steps were corrected in the same change as this file; the arms
// below cover the fields that ARE enforced, and the protocol now records
// behaviour for the rest rather than expecting a refusal that cannot happen.
//
// GATES LIVE IN THE CONTROLLER, NOT THE ROUTE. Neither route mounts
// `enforcePermission(...)`; both call `assertPermission` inside the controller
// (`audit_management:create` for an instance, `audit_management:update` for a
// finding — findings ride the parent audit's update permission). Worth knowing
// if you go looking for a route-level gate and find none.
import { test, expect } from '@playwright/test'
import { AUTH, USERS, SITES, DEPARTMENTS, AUDIT_STANDARD } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import { dateInDays } from '../fixtures/audits.js'
import {
  expectEmptyFormRefused,
  expectMissingFieldRefused,
  expectValidBodyAccepted,
} from '../fixtures/negativeArms.js'

function uniqueScope(tag) {
  return `E2E ${tag} ${Date.now()}`
}

function auditCount() {
  return Number(sqlValue(`SELECT count(*) FROM audit_instances`))
}
function findingCount() {
  return Number(sqlValue(`SELECT count(*) FROM audit_findings`))
}
function findAuditByScope(scope) {
  return sqlValue(`SELECT id FROM audit_instances WHERE scope = '${scope}' LIMIT 1`)
}

/**
 * A body that really does create an audit instance.
 *
 * `programTypeId` is pinned to INTERNAL deliberately. `auditStandardId` is
 * declared `.optional()` but a `.refine()` requires it unless the type is
 * EXTERNAL — so an omit-arm for the standard only exercises that rule while the
 * type is INTERNAL or SUPPLIER. Leave the type out or set it EXTERNAL and the
 * arm silently tests nothing.
 */
function validAuditBody(scope) {
  return {
    auditStandardId: AUDIT_STANDARD.id,
    programTypeId: 'INTERNAL',
    scheduledDate: dateInDays(1),
    scope,
    siteId: SITES.primary.id,
    departmentId: DEPARTMENTS.quality.id,
    leadAuditorUserId: USERS.author.id,
  }
}

// `programTypeId` and `scheduledDate` are required outright; `auditStandardId`
// is required by the refine while the type is INTERNAL. All three refuse.
const AUDIT_REQUIRED_KEYS = ['programTypeId', 'scheduledDate', 'auditStandardId']

test.describe('PW-J9 · audit instance required-field refusals', () => {
  test.use({ storageState: AUTH.author })

  test('control: the body every negative arm is derived from is accepted', async ({ browser }) => {
    test.setTimeout(60_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const scope = uniqueScope('J9-control')

    await expectValidBodyAccepted(ctx, {
      path: '/auditInstances',
      validBody: validAuditBody(scope),
    })

    const id = findAuditByScope(scope)
    expect(id, 'the control body created a real audit instance').toBeTruthy()

    sql(`DELETE FROM audit_instances WHERE id = '${id}'`)
    await ctx.close()
  })

  for (const key of AUDIT_REQUIRED_KEYS) {
    test(`REST: creating an audit without '${key}' is refused 400 and writes nothing`, async ({
      browser,
    }) => {
      test.setTimeout(60_000)
      const ctx = await browser.newContext({ storageState: AUTH.author })

      await expectMissingFieldRefused(ctx, {
        path: '/auditInstances',
        validBody: validAuditBody(uniqueScope(`J9-no-${key}`)),
        omit: key,
        countRows: auditCount,
      })

      await ctx.close()
    })
  }

  test('REST: an audit with no scope is accepted — scope is not an enforced field', async ({
    browser,
  }) => {
    // Pins the fact behind TC-07-03 step 2a. Not a refusal arm: it documents
    // that the protocol cannot expect a refusal here, so nobody re-adds one.
    test.setTimeout(60_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })

    const body = validAuditBody(uniqueScope('J9-noscope'))
    delete body.scope

    const res = await ctx.request.post('/api/v1/services/auditInstances', { data: body })
    expect(res.ok(), `scope is optional, so this is accepted (${res.status()})`).toBe(true)

    const created = await res.json().catch(() => null)
    const id = created?.auditInstance?.id ?? created?.id
    if (id) sql(`DELETE FROM audit_instances WHERE id = '${id}'`)

    await ctx.close()
  })

  test('UI: submitting the empty create dialog tells the user what is missing', async ({ page }) => {
    test.setTimeout(120_000)

    await expectEmptyFormRefused(page, {
      // No /audits/create route — the form is a dialog on the instances tab.
      createPath: '/audits?tab=instances',
      // The dialog renders TWO submit buttons wired to the same validation.
      // 'Create & open' is the one the existing createAdHocAudit fixture drives.
      submitLabel: ['Create & open', 'Create'],
      countRows: auditCount,
      async reach(p) {
        const open = p.getByRole('button', { name: /new audit/i }).first()
        await expect(open, 'the instances tab must offer the create dialog').toBeVisible({
          timeout: 45_000,
        })
        await open.click()
        // Do NOT wait on getByRole('dialog'). HeadlessUI's dialog role sits on
        // an outer positioning wrapper (`tw:relative tw:z-modal`) that carries
        // `data-headlessui-state="open"` while having no box of its own, so
        // Playwright resolves it and reports it HIDDEN — forever. The visible
        // thing is the panel inside it, so let expectEmptyFormRefused wait for
        // the submit control (30s) instead: that is both the real signal and
        // the thing the arm needs anyway.
      },
    })
  })
})

// ── Findings ──────────────────────────────────────────────────────────────
const FINDING_REQUIRED_KEYS = ['auditInstanceId', 'findingTypeId', 'description']

test.describe('PW-J9 · audit finding required-field refusals', () => {
  test.use({ storageState: AUTH.author })

  /** Findings need a parent audit; each test mints and removes its own. */
  async function withParentAudit(ctx, tag, fn) {
    const scope = uniqueScope(tag)
    const res = await ctx.request.post('/api/v1/services/auditInstances', {
      data: validAuditBody(scope),
    })
    expect(res.ok(), `parent audit setup failed: ${await res.text()}`).toBe(true)
    const auditId = findAuditByScope(scope)
    expect(auditId, 'parent audit exists').toBeTruthy()
    try {
      await fn(auditId)
    } finally {
      sql(`DELETE FROM audit_findings WHERE audit_instance_id = '${auditId}'`)
      sql(`DELETE FROM audit_instances WHERE id = '${auditId}'`)
    }
  }

  function validFindingBody(auditInstanceId) {
    return {
      auditInstanceId,
      findingTypeId: 'MINOR_NC',
      description: 'PW-J9 — required-field arm control body.',
    }
  }

  test('control: the body every negative arm is derived from is accepted', async ({ browser }) => {
    test.setTimeout(90_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })

    await withParentAudit(ctx, 'J9-f-control', async (auditId) => {
      const before = findingCount()
      await expectValidBodyAccepted(ctx, {
        path: '/auditFindings',
        validBody: validFindingBody(auditId),
      })
      expect(findingCount(), 'the control body created a real finding').toBe(before + 1)
    })

    await ctx.close()
  })

  for (const key of FINDING_REQUIRED_KEYS) {
    test(`REST: raising a finding without '${key}' is refused 400 and writes nothing`, async ({
      browser,
    }) => {
      test.setTimeout(90_000)
      const ctx = await browser.newContext({ storageState: AUTH.author })

      await withParentAudit(ctx, `J9-f-no-${key}`, async (auditId) => {
        await expectMissingFieldRefused(ctx, {
          path: '/auditFindings',
          validBody: validFindingBody(auditId),
          omit: key,
          countRows: findingCount,
        })
      })

      await ctx.close()
    })
  }

  test('REST: a finding with no category is accepted — category is not enforced', async ({
    browser,
  }) => {
    // Pins the fact behind the TC-07-05 correction. `categoryId` is optional by
    // design and falls back to the parent audit, so a refusal arm here would
    // fail red forever against intended behaviour.
    test.setTimeout(90_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })

    await withParentAudit(ctx, 'J9-f-nocat', async (auditId) => {
      const res = await ctx.request.post('/api/v1/services/auditFindings', {
        data: validFindingBody(auditId), // carries no categoryId at all
      })
      expect(res.ok(), `categoryId is optional, so this is accepted (${res.status()})`).toBe(true)
    })

    await ctx.close()
  })
})
