// PERM-J5 — the single-capability module has exactly two states.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE FINDING, EXPRESSED AS AN ASSERTION (F-03)
//
// `automation_rules` is bound `single_action = 'manage'`: the catalog registers
// ONE action for it, so the only two expressible states are "can do everything
// here" and "cannot see it at all". There is no read-only view of automation
// rules, and no way to let someone inspect a rule without also letting them
// delete it.
//
// That is a product decision, not a bug — but it is one nobody re-decides on
// purpose. This file pins it so that IF someone later splits `manage` into
// `read` + `manage`, this test fails, and the failure routes them to the pack
// to update it. A finding that only lives in a document gets fixed by accident
// and the document goes stale; a finding that lives in a test cannot.
//
// ─────────────────────────────────────────────────────────────────────────────
// A TRAP THAT COSTS AN HOUR IF YOU GREP FOR THIS INSTEAD OF QUERYING IT
//
// `migrations/20260709122000-wire-automation-rules-module.js` contains BOTH:
//
//   up()   → INSERT … VALUES ('automation_rules', 'manage')          ← 1 action
//   down() → INSERT … ('automation_rules','read'),('…','create'),
//            ('…','update'),('…','delete')                           ← 4 actions
//
// The four-action insert is the ROLLBACK. A grep that does not track which
// function it landed in reports four actions and concludes the finding is
// stale. It is not. The assertions below read the live catalog, which cannot
// be misread this way.
import { test, expect } from '@playwright/test'
import { sqlValue } from '../fixtures/db.js'
import { registeredActions } from '../fixtures/permissions.js'

test.describe('PERM-J5 — automation_rules is all-or-nothing, on purpose', () => {
  test('the catalog registers exactly one action, and it is `manage`', () => {
    const actions = registeredActions('automation_rules')

    expect(
      actions,
      'automation_rules must expose exactly one capability — if this changed, ' +
        'docs/modules/permissions/11-security-review.md F-03 needs updating along with it',
    ).toEqual(['manage'])
  })

  test('the binding still declares single_action, which is what collapses the UI to a checkbox', () => {
    // The role builder renders a single checkbox rather than a CRUD row because
    // of this column, not because of the action count. Both have to agree or
    // the UI offers a tier the engine cannot honour.
    const singleAction = sqlValue(
      `SELECT single_action FROM authz.module_table_bindings WHERE module_id = 'automation_rules'`,
    )
    expect(singleAction, 'the binding pins single_action = manage').toBe('manage')
  })

  test('there is no `read` to withhold — the state "can look but not touch" is inexpressible', () => {
    // Stated as its own case because this is the user-visible consequence and
    // the reason the finding was raised. An administrator who wants to give
    // someone visibility into automation rules without edit rights cannot.
    const actions = registeredActions('automation_rules')
    expect(actions).not.toContain('read')
    expect(actions).not.toContain('update')
    expect(actions).not.toContain('delete')
  })

  test('the module is RLS-gated, so the single capability is actually enforced somewhere', () => {
    // A single-action module whose action is enforced nowhere would be a
    // different and worse finding: the checkbox would be decorative. The
    // policies are generator-emitted via `authz.apply_module_rls`.
    const policies = Number(
      sqlValue(
        `SELECT count(*) FROM pg_policies
          WHERE tablename = (SELECT table_name FROM authz.module_table_bindings WHERE module_id = 'automation_rules')`,
      ),
    )
    expect(policies, 'automation_rules table carries RLS policies').toBeGreaterThan(0)
  })
})
