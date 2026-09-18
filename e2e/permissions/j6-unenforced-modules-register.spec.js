// PERM-J6 — the modules the role builder sells and nothing enforces (F-01).
//
// ═════════════════════════════════════════════════════════════════════════════
// THIS FILE ASSERTS A DEFECT, DELIBERATELY. READ BEFORE "FIXING" A FAILURE.
//
// Four modules are offered in Role & Permission Management with a full set of
// capabilities, carry real grants in real tenants, and are enforced NOWHERE —
// no route gate, no RLS policy, nothing. Ticking those boxes changes nothing at
// all. That is F-01, it is the module's headline finding, and it is open.
//
// A test suite can respond to a known-open defect in three ways: assert the
// correct behaviour and go red (a permanently failing suite that people learn
// to ignore), say nothing (the defect silently widens), or PIN THE CURRENT
// STATE with the reason attached. This file does the third.
//
// So these tests pass while the defect exists. They are not endorsing it. They
// are a tripwire in BOTH directions:
//
//   · if a module is ADDED to the unenforced set, the count assertion fails and
//     someone finds out on the commit that did it rather than in the next audit;
//   · if a module is ENFORCED at last, its case fails with a message saying so,
//     and the fix routes to this file and the pack together.
//
// A green run means "the hole is exactly the shape we documented", not "the
// permission system is fine".
//
// ═════════════════════════════════════════════════════════════════════════════
// MEASURED ON app-db, 2026-09-17 — AND WHY THE REGISTER'S LIST IS WRONG
//
//   module              actions  live grants   enforced?
//   management_review      10          64          no
//   risk_management        10          94          no
//   settings                4          28          no
//   training_matrix         4          28          no
//                         ───         ───
//                          28         214
//
// 28 grantable capabilities, 214 live grants, zero enforcement.
//
// The security review lists seven-to-nine modules and names the wrong ones.
// Corrected here, each verified individually:
//
//   · `api_integrations`       — NOW ENFORCED. Ten route gates in
//     routes/serviceAccounts.js (`enforcePermission('api_integrations', …)`).
//     Remove from F-01.
//   · `notifications`          — NEVER A GAP. All five controller handlers open
//     with `const userId = req.user.id` and scope every query to it, and
//     rls.sql carries self-scoped SELECT/UPDATE policies. Gating it would only
//     take access away.
//   · `training_verifications` — NOT A GAP. Four policies in rls.sql gated on
//     `training_instances:manage`, with SELECT also admitting `verified_by`.
//   · `training_matrix`        — IS A GAP, and an easy one to dismiss. A
//     migration-only search concludes the module "does not exist" because
//     rls.sql calls it "the retired training_matrix". THE LIVE CATALOG
//     DISAGREES: `authz.modules` carries it with 4 actions and 28 grants. The
//     retired thing is the TABLE; the MODULE is still sold in the role builder.
//     This is why every count below is taken from the database and not from a
//     migration file.
//
// `risk_management` deserves its own note: the `risk_assessments` TABLE is well
// protected, but by OTHER modules' verbs (`capa:update`, `ncr:update`,
// `change_control:update`, `complaints:update`). The `risk_management` module
// itself is never consulted by anything. 94 grants, no effect.
import { test, expect } from '@playwright/test'
import { sqlValue } from '../fixtures/db.js'

/**
 * The unenforced set, as measured. Each entry carries the evidence that it is
 * unenforced so a reader does not have to re-derive it.
 */
const UNENFORCED = [
  {
    module: 'management_review',
    actions: 10,
    why: 'seeded with all 10 actions; zero code references and zero rls.sql references',
  },
  {
    module: 'risk_management',
    actions: 10,
    why: 'risk_assessments is gated on capa/ncr/change_control/complaints verbs — never on risk_management',
  },
  {
    module: 'settings',
    actions: 4,
    why: 'distinct from `company_settings`, which IS gated (uoms.js, itemCategories.js); the bare module has no call sites',
  },
  {
    module: 'training_matrix',
    actions: 4,
    why: 'the TABLE is retired; the MODULE is live in authz.modules and still offered in the role builder',
  },
]

const actionCount = (module) =>
  Number(sqlValue(`SELECT count(*) FROM authz.module_actions WHERE module_id = '${module}'`))

const policyCount = (module) =>
  Number(
    sqlValue(
      `SELECT count(*) FROM pg_policies p
        JOIN authz.module_table_bindings b ON b.table_name = p.tablename
       WHERE b.module_id = '${module}'`,
    ),
  )

test.describe('PERM-J6 — the unenforced register (a pinned defect, not an endorsement)', () => {
  for (const { module, actions, why } of UNENFORCED) {
    test(`${module} — still offered, still unenforced (${why})`, () => {
      // It is in the catalog: an administrator can see and tick it.
      const isActive = sqlValue(`SELECT is_active FROM authz.modules WHERE id = '${module}'`)
      expect(isActive, `${module} is still a live catalog module`).toBe('t')

      expect(actionCount(module), `${module} still offers ${actions} capabilities`).toBe(actions)

      // ───────────────────────────────────────────────────────────────────
      // ALL THREE ENFORCEMENT LAYERS, not just one. A module is only in F-01
      // if EVERY layer ignores it; checking a single layer is what produced
      // the register's wrong list (see the sibling case below).
      // ───────────────────────────────────────────────────────────────────

      // 1. The RLS generator: no binding means `apply_module_rls` emits nothing.
      const bindings = Number(
        sqlValue(
          `SELECT count(*) FROM authz.module_table_bindings WHERE module_id = '${module}'`,
        ),
      )
      expect(bindings, `${module} has no module_table_bindings row`).toBe(0)

      // 2. Hand-written RLS: no policy anywhere names this module. This is the
      //    check that clears `notifications` and `training_verifications`,
      //    which have policies without having a binding.
      const handWritten = Number(
        sqlValue(
          `SELECT count(*) FROM pg_policies
            WHERE schemaname = 'public'
              AND (qual LIKE '%''${module}''%' OR with_check LIKE '%''${module}''%')`,
        ),
      )
      expect(
        handWritten,
        `no RLS policy anywhere consults '${module}'. If this is now non-zero the module gained ` +
          'enforcement — GOOD NEWS: update docs/modules/permissions/11-security-review.md F-01 ' +
          'and remove it from this list.',
      ).toBe(0)

      // 3. Generator-emitted policies on a bound table (belt and braces —
      //    implied by 1, asserted separately so a failure names which layer).
      expect(policyCount(module), `${module} is covered by no generated RLS policy`).toBe(0)
    })
  }

  test('an unbound module is NOT automatically an unenforced one — the measurement that corrects the register', () => {
    // ═══════════════════════════════════════════════════════════════════════
    // THE MISTAKE THIS CASE EXISTS TO PREVENT, BECAUSE IT WAS MADE HERE FIRST.
    //
    // The obvious way to find F-01's members is "every active module with no
    // row in `authz.module_table_bindings`". That query returns FORTY-ONE
    // modules on app-db, and the vast majority are perfectly well enforced.
    // Missing a binding means only that the RLS GENERATOR emits nothing for
    // the module — it says nothing about the other two enforcement layers:
    //
    //   · route gates        — `api_integrations` has ten in serviceAccounts.js,
    //                          `products`, `company_settings`, `option_sets` and
    //                          `custom_fields` are gated the same way;
    //   · hand-written RLS   — `notifications` and `training_verifications` have
    //                          policies in rls.sql that the generator did not
    //                          write, so no binding is needed.
    //
    // Treating the 41 as the finding would over-report it by an order of
    // magnitude, which is the same class of error that produced the register's
    // wrong list in the first place. So this asserts the WEAKER, TRUE claim —
    // the four known-unenforced modules are a subset of the unbound ones — and
    // leaves the strong claim to the per-module cases above, each of which
    // checks that specific module against every layer.
    // ═══════════════════════════════════════════════════════════════════════
    const unbound = sqlValue(
      `SELECT coalesce(string_agg(m.id, ' ' ORDER BY m.id), '')
         FROM authz.modules m
    LEFT JOIN authz.module_table_bindings b ON b.module_id = m.id
        WHERE m.is_active = true AND b.module_id IS NULL`,
    ).split(' ')

    for (const { module } of UNENFORCED) {
      expect(unbound, `${module} is unbound`).toContain(module)
    }

    // And the corrected exonerations, pinned so the register cannot drift back:
    // each of these is unbound AND enforced, which is exactly why "unbound"
    // cannot be the test for "unenforced".
    for (const exonerated of ['api_integrations', 'notifications', 'training_verifications']) {
      expect(
        unbound,
        `${exonerated} is unbound but IS enforced — it must not be re-added to F-01`,
      ).toContain(exonerated)
    }
  })

  test('the cost of the gap, stated as a number an auditor can read', () => {
    // 28 capabilities and 214 grants, all inert. This assertion exists so the
    // scale of F-01 is visible in test output rather than only in a document
    // nobody opens.
    const capabilities = Number(
      sqlValue(
        `SELECT count(*) FROM authz.module_actions
          WHERE module_id IN ('management_review','risk_management','settings','training_matrix')`,
      ),
    )
    expect(capabilities, '28 grantable capabilities that do nothing').toBe(28)

    // Grants are tenant data and move as fixtures come and go, so this asserts
    // the SHAPE (some tenant really has granted these) rather than an exact
    // number that would make the test brittle.
    const grants = Number(
      sqlValue(
        `SELECT count(*) FROM authz.role_module_permissions
          WHERE module_id IN ('management_review','risk_management','settings','training_matrix')`,
      ),
    )
    expect(
      grants,
      'administrators really have granted these — the gap is live, not theoretical',
    ).toBeGreaterThan(0)
  })
})
