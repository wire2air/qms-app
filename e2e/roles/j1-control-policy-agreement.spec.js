// ROLE-J1 — 🔍 A visible control and its enforcing policy must agree.
//
// THIS IS THE TEST THE MODULE EXISTS FOR, and no other suite in this repo does
// it for any module.
//
// Cycle 1 found two live privilege escalations in Roles. Neither was a MISSING
// check. Every layer had one:
//
//   Roles page → Users dialog        rpm:update
//   User detail → role picker        user_management:update
//   Roster → bulk assign             user_management:create
//   Create User dialog → Roles       (ungated, and mandatory)
//   REST endpoint (no callers)       rpm:update
//   RLS policy — the ONLY live path  user_management:create
//
// Five surfaces, one question — "may you grant a role" — and four answers. The
// weakest sat on the only path the application actually uses, so a member who
// could onboard people could assign themselves any role in the tenant and
// inherit its entire grant set. The fix raised the policy to rpm:update. Cycle 2
// then found that two of the three UI gates the pack recorded as "aligned" had
// never been changed (F-18), which flipped the same defect the other way round:
// controls offered to people the database would refuse.
//
// Both directions are failures of ONE invariant, and it is not "the gate is
// rpm:update" — pinning that constant would just add a sixth place to forget.
// The invariant is RELATIONAL:
//
//     for every control that assigns a role, and every persona:
//         (does the app offer the control?)  ==  (does the database permit the
//                                                 write that control performs?)
//
// Nothing below hard-codes the answer. The UI side is read from the persona's
// REAL session payload — the same array `isAllowed()` reads — and the database
// side is obtained by ATTEMPTING THE WRITE as `app_user` inside a transaction
// that rolls back. If the policy moves again, this test moves with it and still
// fails the moment a control stops agreeing.
//
// Three layers, deliberately, because each one alone can pass while broken:
//
//   1. STRUCTURE  all four controls write the same row through the same policy,
//                 so their gates must be identical to each other. Read out of
//                 the component source, so a registry cannot drift silently.
//   2. ORACLE     for 7 personas × 4 surfaces, the gate's verdict == the
//                 database's verdict. Cheap, exhaustive, no browser.
//   3. DOM        for the personas that matter, the RENDERED control matches the
//                 oracle. This is what stops layer 2 from being a test of a
//                 reimplementation: if `uiAllows` ever drifts from `isAllowed`,
//                 or a component grows a second gate the registry doesn't know
//                 about, the browser disagrees and this goes red.
//                 ALL FOUR surfaces are driven here. Two of them — the user
//                 detail picker and the Create User dialog's Roles field — are
//                 the two F-18 actually changed, and were for one cycle the two
//                 with no browser coverage at all: the fix was verified by
//                 reading the .vue files and by predicting the gate's verdict,
//                 which is precisely the kind of evidence that let the original
//                 pack record them as "aligned" while they were not.
//
// A disagreement in either direction is a defect, and the direction tells you
// which kind:
//   offered but refused  → the workflow is broken; the user hits a raw error.
//   refused but offered  → far worse; some path is weaker than the UI implies,
//                          which is exactly how the CRITICALs shipped.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, ROLES, COMPANY_ID } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import {
  ROLE_ASSIGNMENT_SURFACES,
  ROLE_ASSIGNMENT_PERMISSION,
  gateLiteralOf,
  sessionOf,
  uiAllows,
  canAssignRoleInDb,
  hasCapabilityInDb,
  assignmentCount,
  restoreRolesFixtures,
} from '../fixtures/roles.js'

// The persona spectrum. It has to span BOTH sides of the invariant or the test
// passes for the wrong reason: a set where every persona is refused is satisfied
// by a UI that shows nothing to anybody, and a set where every persona is
// permitted is satisfied by a UI that shows everything.
//
// `owner` is here for the branch no grant can express — `current_is_owner()` is
// the first short-circuit in every policy in the schema and the first line of
// `isAllowed()`, and a probe that hard-codes it false cannot see that at all.
const SPECTRUM = [
  { key: 'owner', user: USERS.owner, isOwner: true, why: 'isOwner bypass — permitted everywhere' },
  { key: 'roleAdmin', user: USERS.roleAdmin, why: 'holds rpm:update — the intended grantor' },
  { key: 'umCreator', user: USERS.umCreator, why: 'escalation path A: user_management:create' },
  { key: 'umUpdater', user: USERS.umUpdater, why: 'the old user-detail gate: user_management:update' },
  { key: 'teamJoiner', user: USERS.teamJoiner, why: 'escalation path B: teams:update' },
  { key: 'author', user: USERS.author, why: 'ordinary member with unrelated module grants' },
  { key: 'noAccess', user: USERS.noAccess, why: 'holds nothing at all' },
]

function persona(entry) {
  return { id: entry.user.id, companyId: COMPANY_ID, isOwner: !!entry.isOwner }
}

test.describe('ROLE-J1 · a visible control and its enforcing policy agree', () => {
  // Restored BEFORE each test, not only after the file. Nothing here writes —
  // every probe rolls back — but everything here READS the §30 fixtures, and
  // this file's premises are all statements about them: the prize is held by
  // nobody, the locked role is locked, no team has members. A neighbouring spec
  // that died between its grant and its cleanup leaves those false, and the
  // PRECONDITION below then fails for a reason that has nothing to do with this
  // file. Cheap; matches ROLE-J3 and ROLE-J5.
  test.beforeEach(() => restoreRolesFixtures())
  test.afterAll(() => restoreRolesFixtures())

  test('PRECONDITION · the fixture unblocks the module, and one policy decides role assignment', () => {
    // The gap doc 20 names: eleven seeded roles, none able to write to a role.
    expect(
      Number(
        sqlValue(`SELECT count(*) FROM authz.role_module_permissions
                   WHERE company_id = '${COMPANY_ID}'
                     AND module_id = 'role_permission_management'`),
      ),
      'the E2E tenant now has role_permission_management grants (e2e-seed.sql §30)',
    ).toBeGreaterThan(0)

    // RLS is the ONLY enforcement point on the path the SPA uses. There is no
    // route-level gate on the GraphQL write, and the REST endpoint that IS gated
    // has no frontend caller — which is why a UI gate that disagrees with this
    // policy is not "belt and braces", it is the whole belt.
    const insertCheck = sqlValue(
      `SELECT with_check FROM pg_policies
        WHERE tablename = 'roles_on_users' AND cmd = 'INSERT'`,
    )
    expect(insertCheck, 'roles_on_users has an INSERT policy').toBeTruthy()
    expect(
      insertCheck,
      `the INSERT policy enforces ${ROLE_ASSIGNMENT_PERMISSION}. If this changed on purpose, ` +
        `every gate in ROLE_ASSIGNMENT_SURFACES must change with it — that is the point of this file.`,
    ).toContain("has_permission('role_permission_management'::text, 'update'::text)")

    // A policy without its table GRANT is decoration — F-14 shipped exactly that
    // way and did nothing at all. Assert the privileges exist, so a green
    // agreement result below cannot secretly mean "every write is refused at the
    // privilege layer, before any policy runs".
    //
    // INSERT/SELECT/UPDATE and not DELETE: those three are what the SPA's
    // assignment path needs. `roles_on_users` is paranoid, so revoking a role is
    // `ra.delete()` → a soft delete → an UPDATE. The DELETE privilege is F-14's
    // subject and belongs to a different fix; asserting it here would couple
    // this file to work it does not own.
    const grants = sql(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'app_user' AND table_name = 'roles_on_users' ORDER BY 1`,
    ).split('\n')
    expect(grants, 'app_user can actually attempt the writes these policies gate').toEqual(
      expect.arrayContaining(['INSERT', 'SELECT', 'UPDATE']),
    )

    // The prize is unheld at rest — that is what makes "did they acquire it?"
    // answerable rather than a matter of interpretation.
    expect(assignmentCount(USERS.umCreator.id, ROLES.prize.id), 'prize unheld at rest').toBe(0)
  })

  test('STRUCTURE · all four role-assignment controls gate on the same permission', () => {
    // One row, one policy, therefore one gate. This is the assertion that would
    // have caught the original design drift on the day it was written: the four
    // controls do not need to agree with any particular constant, they need to
    // agree WITH EACH OTHER, because they all perform the identical write.
    const found = ROLE_ASSIGNMENT_SURFACES.map((s) => ({
      id: s.id,
      component: s.component,
      literal: gateLiteralOf(s), // read from the .vue file, not from the registry
    }))

    for (const f of found) {
      const registered = ROLE_ASSIGNMENT_SURFACES.find((s) => s.id === f.id).gate
      expect(
        f.literal,
        `${f.component} — the surface registry in e2e/fixtures/roles.js is out of date`,
      ).toEqual(registered)
    }

    const distinct = [...new Set(found.map((f) => JSON.stringify(f.literal)))]
    expect(
      distinct,
      `Four controls write the SAME roles_on_users row through the SAME policy, so they must ` +
        `carry the SAME gate. Found ${distinct.length} different gates:\n` +
        found.map((f) => `  ${f.id.padEnd(26)} ${JSON.stringify(f.literal)}  (${f.component})`).join('\n'),
    ).toHaveLength(1)

    // And that single shared gate is the permission the policy enforces. Checked
    // last and separately: the invariant above is about internal consistency,
    // this one is about matching the database.
    expect(found[0].literal, 'the shared gate names the permission RLS enforces').toEqual([
      ROLE_ASSIGNMENT_PERMISSION,
    ])
  })

  test('🔍 AGREEMENT · every persona × every surface: what is offered is what is permitted', async ({
    browser,
  }) => {
    // The core assertion. Built as a LEDGER rather than a loop of bare expects so
    // a failure names every disagreement at once, with its direction — one
    // mismatched cell in a 28-cell matrix is otherwise reported as a lone
    // "expected true, got false" with no way to see the shape of the problem.
    const rows = []
    for (const entry of SPECTRUM) {
      const session = await sessionOf(browser, AUTH[entry.key])
      // The database's verdict, obtained by attempting the real write and
      // rolling it back — not by reading the policy text and interpreting it.
      const dbPermits = canAssignRoleInDb(persona(entry))

      for (const surface of ROLE_ASSIGNMENT_SURFACES) {
        const uiOffers = uiAllows(session, gateLiteralOf(surface))
        rows.push({
          persona: entry.key,
          surface: surface.id,
          uiOffers,
          dbPermits,
          agree: uiOffers === dbPermits,
        })
      }
    }

    const disagreements = rows.filter((r) => !r.agree)
    const describe = (r) =>
      r.uiOffers
        ? `  OFFERED BUT REFUSED  ${r.persona} → ${r.surface}  (the control is shown, the write fails)`
        : `  REFUSED BUT PERMITTED ${r.persona} → ${r.surface}  (the control is hidden, the write would succeed — ` +
          `something else on this path is weaker than the UI implies)`

    expect(
      disagreements,
      disagreements.length
        ? `A control and its enforcing policy disagree:\n${disagreements.map(describe).join('\n')}`
        : '',
    ).toEqual([])

    // Guard against the vacuous pass. An all-false matrix satisfies the
    // invariant above and means nothing; the spectrum must genuinely straddle it.
    expect(rows.some((r) => r.uiOffers), 'the spectrum contains a permitted persona').toBe(true)
    expect(rows.some((r) => !r.uiOffers), 'the spectrum contains a refused persona').toBe(true)
  })

  test('🛡 refusal is real, not merely a hidden button', async ({ browser }) => {
    // The half that matters most. A hidden control proves nothing about safety —
    // the SPA is not the only client of this database, and the escalations were
    // both executed by writing directly to the pivot. For every persona the UI
    // refuses, the DATABASE must refuse too, and the capability must not move.
    for (const entry of SPECTRUM) {
      const session = await sessionOf(browser, AUTH[entry.key])
      if (uiAllows(session, [ROLE_ASSIGNMENT_PERMISSION])) continue

      const p = persona(entry)
      expect(
        canAssignRoleInDb(p),
        `${entry.key} (${entry.why}) is refused by the UI and must be refused by RLS`,
      ).toBe(false)

      // A rejected INSERT only proves the INSERT failed. This proves the thing
      // that actually mattered: the persona's authority never moved. The prize
      // role carries sites:delete and nothing else in the tenant grants it.
      expect(
        hasCapabilityInDb(p, 'sites', 'delete'),
        `${entry.key} did not acquire the prize capability`,
      ).toBe(false)
      expect(assignmentCount(entry.user.id, ROLES.prize.id), 'no assignment row survived').toBe(0)
    }
  })

  test('DOM · the roster bulk "Assign role" control matches the oracle', async ({ browser }) => {
    // Layer 3, on the surface that was WRONG for two cycles. Without this, the
    // agreement test is a test of `uiAllows` — a reimplementation of the gate —
    // rather than of the app. Here the control is read out of the real DOM.
    //
    // `selectable` on this table is `canAssignRoles || canAssignSites`, so the
    // checkboxes alone do not answer the question; the "Assign role" action in
    // the bulk bar does. umUpdater is the persona that separates them: they can
    // assign SITES and not roles, so a test that stopped at the checkbox would
    // read them as permitted and agree with nothing.
    for (const key of ['roleAdmin', 'umCreator', 'umUpdater', 'noAccess']) {
      const entry = SPECTRUM.find((e) => e.key === key)
      const session = await sessionOf(browser, AUTH[key])
      const expected = uiAllows(session, [ROLE_ASSIGNMENT_PERMISSION])

      const ctx = await browser.newContext({ storageState: AUTH[key] })
      const page = await ctx.newPage()
      try {
        await page.goto('/users', { waitUntil: 'domcontentloaded' })
        await page.waitForLoadState('networkidle').catch(() => {})

        // The users subtree is guarded on user_management:read; a bounced
        // persona is not offered the control, which is a correct reading of
        // "does the app offer this to them".
        const bounced = page.url().includes('/no-access')
        let offered = false
        if (!bounced) {
          // force: the real <input> is sr-only and its visual proxy intercepts
          // pointer events, so an unforced check() waits for stability forever.
          const box = page.getByRole('row').nth(1).getByRole('checkbox')
          if (await box.count()) {
            await box.first().check({ force: true })
            offered = await page
              .getByRole('button', { name: 'Assign role', exact: true })
              .isVisible()
              .catch(() => false)
          }
        }

        expect(
          offered,
          `${key} (${entry.why}): the rendered bulk "Assign role" control must match the gate ` +
            `oracle (${expected}). A mismatch means the component carries a gate the surface ` +
            `registry does not know about.`,
        ).toBe(expected)

        // And the rendered offer must match the database, which is the invariant
        // the whole file is about — asserted here against the DOM directly, not
        // via the oracle, so this test stands on its own.
        expect(
          offered,
          `${key}: the rendered control disagrees with what RLS permits`,
        ).toBe(canAssignRoleInDb(persona(entry)))
      } finally {
        await ctx.close()
      }
    }
  })

  test('DOM · the Roles page Users dialog matches the oracle', async ({ browser }) => {
    // The surface that was already correct in cycle 1 — included precisely
    // BECAUSE it was correct. A regression suite that only watches the places
    // that once broke will let the next drift happen somewhere else.
    for (const key of ['roleAdmin', 'umCreator', 'noAccess']) {
      const entry = SPECTRUM.find((e) => e.key === key)
      const session = await sessionOf(browser, AUTH[key])
      const expected = uiAllows(session, [ROLE_ASSIGNMENT_PERMISSION])

      const ctx = await browser.newContext({ storageState: AUTH[key] })
      const page = await ctx.newPage()
      try {
        await page.goto(`/roles/${ROLES.prize.id}`, { waitUntil: 'domcontentloaded' })
        await page.waitForLoadState('networkidle').catch(() => {})

        // /roles is guarded on role_permission_management:read.
        let offered = false
        if (!page.url().includes('/no-access')) {
          // "View All Users" opens RoleUsersDialog for anyone who can read the
          // role; the GATED control is the dialog's "Save Assignments" button.
          // That split is deliberate in the product and worth preserving in the
          // probe: seeing who holds a role is a read, granting it is not.
          const openDialog = page.getByRole('button', { name: 'View All Users' })
          if (await openDialog.count()) {
            await openDialog.first().click()
            // BaseDialog renders no role="dialog", so the readiness barrier is
            // the dialog's own heading. Waiting on it rather than on the gated
            // button is what separates "the control is absent" from "the dialog
            // had not painted yet" — without it, a slow render reads as a
            // refusal and the test passes for the wrong reason on the negative
            // personas.
            await expect(page.getByText('Assign Users to Role')).toBeVisible({ timeout: 10_000 })
            offered = await page
              .getByRole('button', { name: 'Save Assignments' })
              .isVisible()
              .catch(() => false)
            // The ungated sibling proves the footer rendered at all, so an
            // absent "Save Assignments" is a gate decision and not an empty DOM.
            await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
          }
        }

        expect(
          offered,
          `${key} (${entry.why}): the "Save Assignments" control must match the gate oracle`,
        ).toBe(expected)
        expect(offered, `${key}: and must match what RLS permits`).toBe(
          canAssignRoleInDb(persona(entry)),
        )
      } finally {
        await ctx.close()
      }
    }
  })

  test('DOM · the user-detail role picker matches the oracle', async ({ browser }) => {
    // Layer 3 on the second of the two surfaces F-18 actually CHANGED. Until
    // this test, the fix's UI half on this page was observed only by reading the
    // .vue file (STRUCTURE) and by predicting the gate's verdict from the
    // session payload (AGREEMENT). Neither opens a browser, and the defect was
    // precisely that a browser showed the wrong control to the wrong person.
    //
    // `umUpdater` is why the list is what it is. `user_management:update` was
    // this picker's gate for two cycles, so before the fix the control appeared
    // for them and the write behind it was refused — they are the only cast
    // member who separates the old gate from the new one, and a persona set
    // without them cannot tell the two apart.
    //
    // Each persona visits their OWN detail page, for two reasons. `users_sel`
    // admits you to your own row unconditionally, so an absent control is never
    // ambiguous between "the gate refused" and "RLS hid the record". And the
    // write this control performs there — granting a role to the user on screen
    // — is then exactly the self-assignment `canAssignRoleInDb` attempts, so the
    // DOM and the database are answering the identical question rather than two
    // similar ones.
    const readings = []
    for (const key of ['roleAdmin', 'umUpdater', 'umCreator', 'noAccess']) {
      const entry = SPECTRUM.find((e) => e.key === key)
      const session = await sessionOf(browser, AUTH[key])
      const expected = uiAllows(session, [ROLE_ASSIGNMENT_PERMISSION])

      const ctx = await browser.newContext({ storageState: AUTH[key] })
      const page = await ctx.newPage()
      try {
        await page.goto(`/users/${entry.user.id}`, { waitUntil: 'domcontentloaded' })
        await page.waitForLoadState('networkidle').catch(() => {})

        // The whole /users subtree — list AND detail — is guarded on
        // user_management:read (permissionGuard.js, ADMIN_PERMISSIONS), so a
        // bounced persona is not offered the control, which is a correct reading
        // of "does the app offer this to them".
        //
        // Settle on a verdict by RACING the two possible outcomes rather than by
        // reading the URL the moment the network goes quiet. The guard cannot
        // run until the session request resolves, so a bare url check can win
        // the race against its own redirect — and then the branch below waits
        // twenty seconds for a rail that is never coming and fails as if the
        // page were broken. The rail card's disclosure header is the other
        // outcome and doubles as the readiness barrier and the ungated sibling:
        // it renders for anybody who can read the user, so waiting on it is what
        // separates "the picker is absent" from "the rail had not painted yet".
        const cardHeader = page.getByRole('button', { name: 'Role Assignments' })
        await Promise.race([
          page.waitForURL(/\/no-access/, { timeout: 20_000 }).catch(() => {}),
          cardHeader.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {}),
        ])

        let offered = false
        if (!page.url().includes('/no-access')) {
          await expect(
            cardHeader,
            `${key}: the Role Assignments rail card must render before its contents can be judged`,
          ).toBeVisible({ timeout: 20_000 })

          // Scope to THIS card's body through the disclosure's aria-controls.
          // The gated element is the picker's trigger — a BaseButton carrying
          // IconPlus — and it has no accessible name to match on: a BaseSelect
          // with a #trigger override emits no role="combobox", so getByRole is
          // not available here and the label-less icon is the only handle. The
          // other control that lives in this card, the per-role remove button,
          // carries IconX, so the tabler class cannot confuse the two.
          const bodyId = await cardHeader.getAttribute('aria-controls')
          expect(bodyId, `${key}: the rail card exposes its body via aria-controls`).toBeTruthy()
          offered = (await page.locator(`#${bodyId} button:has(svg.tabler-icon-plus)`).count()) > 0
        }

        expect(
          offered,
          `${key} (${entry.why}): the rendered role picker on the user detail page must match ` +
            `the gate oracle (${expected}). A mismatch means the component carries a gate the ` +
            `surface registry does not know about.`,
        ).toBe(expected)
        expect(
          offered,
          `${key}: and the rendered control must match what RLS permits`,
        ).toBe(canAssignRoleInDb(persona(entry)))
        readings.push(offered)
      } finally {
        await ctx.close()
      }
    }

    // Guard against the vacuous pass. Every assertion above is satisfied by a
    // page that renders no picker for anybody — which is what a broken selector
    // looks like, and also what the module's own administrator being locked out
    // looks like.
    expect(
      [...new Set(readings)],
      'the persona set must straddle the gate — otherwise a page that shows the picker to ' +
        'nobody (a dead selector, or a regression of F-18 in the other direction) passes',
    ).toHaveLength(2)
  })

  test('DOM · the Create User dialog Roles field matches the oracle', async ({ browser }) => {
    // The fourth surface, and the one the surface registry deliberately never
    // drove: its note said the create dialog belonged to USER-J8. That was true
    // of the FLOW and wrong about the GATE — J8 drives this dialog as `owner`,
    // for whom every gate is open, so nothing in the repo ever observed the
    // field disappearing for the persona it disappears for.
    //
    // It is also the only one of the four whose misgating could leave DATA
    // behind. The field used to be unconditional AND `required`, so an onboarder
    // holding user_management:create alone could not complete the form at all;
    // and `createUser` saves the User row FIRST and only then loops the role
    // rows, so the refused write left a real, role-less user behind and reported
    // an error. Hiding the field rather than disabling it is what closes that:
    // there is no longer a path through this dialog that attempts the second
    // write with the first one's permission.
    //
    // THE PERSONA PAIR IS FORCED, and it is worth saying why rather than leaving
    // it to be rediscovered. Two different bars meet on this one screen: opening
    // the dialog is gated on `user_management:create` (UsersHome.vue) and the
    // field inside it on rpm:update — and NO seeded cast member holds both.
    // roleAdmin, the grant-based positive the other DOM tests use, cannot open
    // the dialog at all: e2e-seed.sql §30c gives them user_management:READ and
    // deliberately nothing more, and that absence is load-bearing elsewhere in
    // this file. So the positive here is `owner`, whose pass comes from the
    // isOwner bypass rather than from a grant. The NEGATIVE — umCreator, the
    // persona the whole failure mode is about — is grant-based, which is the
    // half that matters: it is the one that was wrong.
    const readings = []
    for (const key of ['owner', 'umCreator']) {
      const entry = SPECTRUM.find((e) => e.key === key)
      const session = await sessionOf(browser, AUTH[key])
      const expected = uiAllows(session, [ROLE_ASSIGNMENT_PERMISSION])

      const ctx = await browser.newContext({ storageState: AUTH[key] })
      const page = await ctx.newPage()
      try {
        await page.goto('/users', { waitUntil: 'domcontentloaded' })
        await page.waitForLoadState('networkidle').catch(() => {})

        const openDialog = page.getByRole('button', { name: 'Create User' })
        await expect(
          openDialog.first(),
          `${key} must be able to OPEN the Create User dialog — this test is about the field ` +
            `inside it, not about who may create a person`,
        ).toBeVisible({ timeout: 20_000 })
        await openDialog.first().click()

        const dialog = page.getByRole('dialog')
        // Email is the ungated sibling and the readiness barrier in one: no
        // grant anywhere touches it, so its presence proves the form painted and
        // an absent Roles label below is a gate decision rather than an
        // unrendered dialog.
        await expect(
          dialog.getByRole('textbox', { name: 'Email' }),
          `${key}: the create form must be on screen before the Roles field is judged`,
        ).toBeVisible({ timeout: 10_000 })

        // The label's own text, not getByLabel: BaseField generates an id and
        // binds the label's `for` to it, but this field slots RoleSelectMenu
        // without spreading the field payload, so no control claims that id and
        // the association does not exist in the DOM. `count()` and not
        // `isVisible()` because the gate is a v-if — the question is existence.
        const offered = (await dialog.getByText('Roles', { exact: true }).count()) > 0

        expect(
          offered,
          `${key} (${entry.why}): the Create User dialog's Roles field must match the gate ` +
            `oracle (${expected}). Offered-but-refused here is the F-18 failure that leaves a ` +
            `half-onboarded user behind; refused-but-permitted means an administrator cannot ` +
            `place people into roles at the one moment the product asks them to.`,
        ).toBe(expected)
        expect(
          offered,
          `${key}: and the rendered field must match what RLS permits`,
        ).toBe(canAssignRoleInDb(persona(entry)))
        readings.push(offered)
      } finally {
        await ctx.close()
      }
    }

    expect(
      [...new Set(readings)],
      'the pair must straddle the gate — a dialog that never shows the field, or always shows ' +
        'it, satisfies every assertion above and means nothing',
    ).toHaveLength(2)
  })

  test('CONTROL · the role administrator can REACH every control the policy permits them', async ({
    browser,
  }) => {
    // The failure mode the F-18 fix was most at risk of, and one the agreement
    // matrix cannot see. Agreement is satisfied by hiding a control from someone
    // the database permits, as long as the database also refuses — but here the
    // database does NOT refuse, so a hidden control would be a module whose own
    // administrator cannot administer it.
    //
    // Concretely: roleAdmin holds rpm:* and user_management:READ, deliberately
    // not create or update. Before F-18 the roster and user-detail controls
    // gated on those two verbs, so the tenant's role administrator was locked
    // out of two of the four ways to assign a role.
    const p = persona({ user: USERS.roleAdmin })
    expect(canAssignRoleInDb(p), 'the database permits roleAdmin to assign roles').toBe(true)

    const session = await sessionOf(browser, AUTH.roleAdmin)
    expect(session.isOwner, 'roleAdmin is NOT an owner — this is a grant-based pass').toBe(false)
    for (const surface of ROLE_ASSIGNMENT_SURFACES) {
      expect(
        uiAllows(session, gateLiteralOf(surface)),
        `roleAdmin must be offered "${surface.label}" — the database permits it`,
      ).toBe(true)
    }

    // Reachability is a separate question from the gate: a control gated
    // correctly but sitting behind a route guard the persona fails is still
    // unreachable. Both admin subtrees must actually open.
    const ctx = await browser.newContext({ storageState: AUTH.roleAdmin })
    const page = await ctx.newPage()
    try {
      for (const route of ['/roles', '/users']) {
        await page.goto(route, { waitUntil: 'domcontentloaded' })
        await page.waitForLoadState('networkidle').catch(() => {})
        expect(page.url(), `roleAdmin must not be bounced off ${route}`).not.toContain('/no-access')
      }
    } finally {
      await ctx.close()
    }
  })
})
