// PW-J14 · URS-NCR-04 — "a nonconformance, once raised, is a permanent record."
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE EXISTS, AND WHY IT IS NOT THE TEST YOU MIGHT EXPECT.
//
// §6 scored URS-NCR-04 *Partial* against `j1-raise-draft-open.spec.js` with the
// note "permanence proven on create; refusal to delete an open record is
// untested". Writing the missing half turned up the reason it was missing: the
// refusal does not exist. There is no layer anywhere in the product that stops
// an OPEN — or a CLOSED — nonconformance from being deleted.
//
// So this file does NOT assert a refusal. It pins what the product does, from
// both sides, and names the one control that IS real. Asserting "the delete was
// refused" would have been a fabrication; asserting nothing would have left the
// requirement untestable. Pinning it precisely is the third option, and it is
// the one that makes a future fix visible: the day someone adds the status
// predicate, the two KNOWN DEFECT assertions below go red and this file gets
// rewritten the right way round.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE DEFECT, MEASURED RATHER THAN REASONED (NCR-D1).
//
// The NC model is paranoid, so a delete is an `UPDATE … SET deleted_at = now()`.
// Three things sit on that write and NOT ONE of them looks at `status_id`:
//
//   nonconformances_del   DELETE policy. USING (company_id = current_company
//                         AND (is_owner OR (has_permission('ncr','delete')
//                         AND scope_allowed(…)))). No status term.
//   nonconformances_upd   UPDATE policy, USING + WITH CHECK. Also no status
//                         term, also no `deleted_at` term.
//   enforce_soft_delete_permission_trg
//                         BEFORE UPDATE OF deleted_at … EXECUTE FUNCTION
//                         enforce_soft_delete_permission('ncr:delete').
//                         Reads the permission and nothing else — the function
//                         body never mentions status_id.
//
// And the guard that DOES know the lifecycle cannot help, because of how it is
// attached:
//
//   nonconformances_status_transition_guard
//                         BEFORE INSERT OR UPDATE **OF status_id**
//
// A soft delete writes `deleted_at`. It does not write `status_id`. A
// column-list trigger does not fire for a statement that does not touch one of
// its columns, so `enforce_nc_status_transition()` — the function that knows
// CLOSED is terminal and that the legal graph has exactly six edges — never
// runs on the one statement that erases the record. The guard and the hole are
// one `OF` clause apart.
//
// There is also no REST delete route to catch it on the other path: all twelve
// routes in backend/api/routes/nonconformances.js are `router.post`, and the
// controller exports no delete handler. Deletion happens exclusively through
// the SyncEngine (GraphQL → `app_user` → the policies above), which is exactly
// the interface with no status check on it.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE SECOND HALF, AND IT IS THE REACHABLE ONE (NCR-D2).
//
// The detail page gets this right — `ncDetailConfig.js:54` renders Delete with
// `visible: !!canDelete && statusId === 'DRAFT'`, and `handleDeleteDraft()`
// re-checks the status before calling `.delete()`. Reading only that file, the
// requirement looks met at the interface even if not at the database.
//
// The LIST does not. `NonconformancesHome.vue:25` is
//
//     const canDelete = computed(() => isAllowed(['ncr:delete']))
//
// with no status term at all, handed to `NonconformancesTable.vue`'s row menu,
// whose `onDeleteNc` confirms and calls `row.delete()` on whatever row it was
// given. So a `ncr:delete` holder is offered Delete on a CLOSED nonconformance
// from the register, and per NCR-D1 nothing underneath refuses it. Two halves
// of one reachable path, which is why both are asserted here rather than only
// the database one.
//
// Note also that the list uses `isAllowed` (tenant-wide) where the detail page
// uses `isAllowedOnRecord` (scope-aware) — a separate inconsistency, not
// asserted here because it is a different requirement.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE PERSONA, AND WHY ONE HAD TO BE MINTED (§47a).
//
// Before this work NOBODY in E2ELAB held `ncr:delete`. A permanence probe run
// by a persona with no delete grant proves nothing about permanence — it proves
// the persona has no grant, and it would have passed for the wrong reason
// forever. `recordDeleter` holds `ncr:read` + `ncr:update` + `ncr:delete` (and
// the CAPA equivalents) at tenant scope, and nothing else — no create, no
// close, no approve, so nothing it does can be mistaken for a lifecycle action.
//
// Read is in there on purpose. A soft delete is an UPDATE, and an RLS-filtered
// UPDATE that matches no row SUCCEEDS SILENTLY reporting `UPDATE 0` — so
// without the SELECT grant "nothing was deleted" would be equally consistent
// with "the record was sealed" and "the reader cannot see it". That is the
// vacuity trap the inspectionsLogs and rca suites were both caught by; the read
// grant is what keeps this probe from joining them.
//
// `ncr:update` is in there too, and the reason is a finding in its own right —
// one this file got WRONG on the first pass and corrected against the database.
// The grant names say a delete needs `delete`. The policies say otherwise:
//
//   has_permission('ncr','delete') = true, scope_allowed = true, row readable
//   UPDATE nonconformances SET deleted_at = now() WHERE id = <CLOSED>  →  UPDATE 0
//
// Because the model is paranoid, a delete IS an UPDATE, so the statement is
// judged by `nonconformances_upd` — whose USING clause demands `ncr:UPDATE`.
// `nonconformances_del` governs a literal SQL `DELETE`, which nothing in the
// product ever issues. Add `ncr:update` and the identical statement becomes
// UPDATE 1. Test 2 pins both halves, because "delete needs delete" is the
// reading a reviewer arrives at from the grant names, and it is not what the
// database does.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { raiseNc, uniqueTitle } from '../fixtures/nonconformances.js'
import { findNcByTitle, sql, sqlAsAppUser, sqlValue } from '../fixtures/db.js'

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

/** Restore a row this file soft-deleted, so a later spec still finds it. */
function undelete(ncId) {
  sql(`UPDATE nonconformances SET deleted_at = NULL WHERE id = ${q(ncId)}`)
}

function deletedAt(ncId) {
  return sqlValue(`SELECT coalesce(deleted_at::text, 'NULL') FROM nonconformances WHERE id = ${q(ncId)}`)
}

test.describe('PW-J14 · URS-NCR-04 — permanence of a raised nonconformance', () => {
  test.use({ storageState: AUTH.author })

  test('KNOWN DEFECT NCR-D1 · an OPEN nonconformance can be soft-deleted through the data interface, and so can a CLOSED one', async ({
    page,
  }) => {
    test.setTimeout(180_000)

    // ── ARRANGE. A real NC raised through the product, not a seeded row. The
    // status has to be genuine: an INSERT that set status_id directly would be
    // refused by the same guard this test is about, and a superuser INSERT that
    // bypassed it would leave the premise unproven.
    const title = uniqueTitle('J14')
    await raiseNc(page, title)
    const nc = findNcByTitle(title)
    expect(nc, 'the NC was raised').toBeTruthy()
    expect(nc.statusId, 'precondition: it is OPEN, not a draft').toBe('OPEN')

    // ── PREMISE 1. The guard that knows the lifecycle exists and is attached.
    // Without this, "the delete succeeded" could mean the product has no status
    // machine at all, which would be a different (and much larger) finding.
    expect(
      sqlValue(
        `SELECT count(*) FROM pg_trigger
          WHERE tgrelid = 'nonconformances'::regclass AND NOT tgisinternal
            AND tgname = 'nonconformances_status_transition_guard'`,
      ),
      'the NC status guard is installed…',
    ).toBe('1')

    // ── PREMISE 2. …and it is attached with a COLUMN LIST that a soft delete
    // never touches. This is the mechanism of the defect, asserted rather than
    // narrated, so the comment above cannot drift away from the database.
    const guardDef = sqlValue(
      `SELECT pg_get_triggerdef(oid) FROM pg_trigger
        WHERE tgrelid = 'nonconformances'::regclass
          AND tgname = 'nonconformances_status_transition_guard'`,
    )
    expect(
      guardDef,
      'KNOWN DEFECT NCR-D1: the lifecycle guard fires only on writes to status_id, so a soft delete (which writes deleted_at) never reaches it',
    ).toMatch(/UPDATE OF status_id/i)

    // ── PREMISE 3. The reader can see the row. Asserted BEFORE the write so a
    // later "UPDATE 0" can never be misread as a seal (see the header).
    const visible = sqlAsAppUser(
      `SELECT 'SEEN=' || count(*)::text FROM nonconformances WHERE id = ${q(nc.id)};`,
      { userId: USERS.recordDeleter.id, companyId: COMPANY_ID },
    )
    expect(visible.ok, `read probe ran (stderr: ${visible.error})`).toBeTruthy()
    expect(
      /SEEN=(\d+)/.exec(visible.output)?.[1],
      'the delete-holder can read the row — so a silent no-op below would be a real refusal, not invisibility',
    ).toBe('1')

    // ── ACT. The soft delete, exactly as `row.delete()` issues it.
    const openDelete = sqlAsAppUser(
      `UPDATE nonconformances SET deleted_at = now() WHERE id = ${q(nc.id)} RETURNING id;`,
      { userId: USERS.recordDeleter.id, companyId: COMPANY_ID },
    )

    expect(
      openDelete.ok,
      `KNOWN DEFECT NCR-D1: deleting an OPEN nonconformance raised no error (stderr: ${openDelete.error})`,
    ).toBeTruthy()
    expect(
      openDelete.output,
      'KNOWN DEFECT NCR-D1: the write LANDED on the row — this is not an RLS no-op, the statement returned the id',
    ).toContain(nc.id)
    expect(
      deletedAt(nc.id),
      'KNOWN DEFECT NCR-D1: an OPEN nonconformance now carries a deleted_at stamp',
    ).not.toBe('NULL')

    // And the status is untouched, which is the whole point: the record is gone
    // from every list and every query while still claiming to be OPEN.
    expect(
      sqlValue(`SELECT status_id FROM nonconformances WHERE id = ${q(nc.id)}`),
      'and it is still OPEN while deleted — the guard never saw the statement',
    ).toBe('OPEN')

    undelete(nc.id)

    // ── THE SAME AGAINST A CLOSED RECORD. CLOSED is terminal in the transition
    // graph (`enforce_nc_status_transition()` admits CLOSED->OPEN only, and
    // nothing else out of it), so if any status were sealed against deletion it
    // would be this one. It is not.
    //
    // A CLOSED NC is borrowed from the tenant rather than driven to CLOSED
    // here: the five-gate close is `j3`'s journey, takes three personas and two
    // e-signatures, and re-walking it would make this test's failure modes
    // ambiguous. The row is restored immediately either way.
    const closedId = sqlValue(
      `SELECT id FROM nonconformances
        WHERE company_id = ${q(COMPANY_ID)} AND status_id = 'CLOSED' AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
    )
    test.skip(!closedId, 'no CLOSED nonconformance in the tenant to probe')

    const closedDelete = sqlAsAppUser(
      `UPDATE nonconformances SET deleted_at = now() WHERE id = ${q(closedId)} RETURNING id;`,
      { userId: USERS.recordDeleter.id, companyId: COMPANY_ID },
    )
    expect(
      closedDelete.output,
      'KNOWN DEFECT NCR-D1: a CLOSED nonconformance — the terminal state of the lifecycle — is deletable too',
    ).toContain(closedId)

    undelete(closedId)
    expect(deletedAt(closedId), 'the borrowed CLOSED record is restored').toBe('NULL')
  })

  test('the control that IS real is the UPDATE permission, not the delete one', async ({
    page,
  }) => {
    test.setTimeout(180_000)

    const title = uniqueTitle('J14-perm')
    await raiseNc(page, title)
    const nc = findNcByTitle(title)

    // ── ARM 1. `author` holds ncr:create/read/update/close — everything except
    // delete — and is refused BY NAME, by the trigger. So a permission control
    // does exist and does work; it is simply not the only one in the path, and
    // this arm is what stops the rest of the file reading as "RLS on this table
    // is open".
    const noDelete = sqlAsAppUser(
      `UPDATE nonconformances SET deleted_at = now() WHERE id = ${q(nc.id)} RETURNING id;`,
      { userId: USERS.author.id, companyId: COMPANY_ID },
    )
    expect(noDelete.ok, 'a holder of everything-but-delete is refused').toBeFalsy()
    expect(
      noDelete.error,
      'and the refusal names the permission it wanted — enforce_soft_delete_permission, ERRCODE QMSSD',
    ).toMatch(/ncr:delete/i)
    expect(deletedAt(nc.id), 'nothing was written').toBe('NULL')

    // ── ARM 2 — THE SURPRISING HALF, MEASURED. `ncr:delete` plus a matching
    // scope is NOT sufficient. Before §47a widened this role, the persona below
    // held delete-and-read only, the row was readable, the scope matched, and
    // the identical statement still reported `UPDATE 0` — silently, which is
    // the worst way for a permission model to say no.
    //
    // The premises are asserted first so that reading is not available as an
    // explanation for anything below.
    const seen = sqlAsAppUser(
      `SELECT 'SEEN=' || count(*)::text FROM nonconformances WHERE id = ${q(nc.id)};`,
      { userId: USERS.recordDeleter.id, companyId: COMPANY_ID },
    )
    expect(/SEEN=(\d+)/.exec(seen.output)?.[1], 'the row is readable to the deleter').toBe('1')

    const grantProbe = sqlAsAppUser(
      `SELECT 'DEL=' || authz.has_permission('ncr','delete')::text
              || ' SCOPE=' || authz.scope_allowed('ncr','delete', owner_id, department_id, site_id)::text
         FROM nonconformances WHERE id = ${q(nc.id)};`,
      { userId: USERS.recordDeleter.id, companyId: COMPANY_ID },
    )
    expect(
      grantProbe.output,
      'it holds ncr:delete AND the row is inside that grant’s scope — everything the DELETE policy asks for',
    ).toContain('DEL=true SCOPE=true')

    const admitted = sqlAsAppUser(
      `UPDATE nonconformances SET deleted_at = now() WHERE id = ${q(nc.id)} RETURNING id;`,
      { userId: USERS.recordDeleter.id, companyId: COMPANY_ID },
    )
    expect(
      admitted.output,
      'with read+update+delete the soft delete lands on an OPEN record',
    ).toContain(nc.id)

    // ── THE MECHANISM, READ OUT OF pg_policy SO THE COMMENTARY CANNOT DRIFT.
    // Two assertions, and each carries a different half of the finding.
    const updUsing = sqlValue(
      `SELECT pg_get_expr(polqual, polrelid) FROM pg_policy
        WHERE polrelid = 'nonconformances'::regclass AND polname = 'nonconformances_upd'`,
    )
    expect(
      updUsing,
      'the UPDATE policy — the one a paranoid delete is actually judged by — demands ncr:UPDATE, which is why the delete grant alone was not enough',
    ).toMatch(/has_permission\('ncr'::text, 'update'::text\)/)
    expect(
      updUsing,
      'KNOWN DEFECT NCR-D1: …and it carries no status_id term, which is why a CLOSED record is no harder to delete than a draft',
    ).not.toMatch(/status_id/)

    // And the DELETE policy, which the grant NAMES, governs a statement the
    // product never issues. Pinned because it is the source of the confusion:
    // `ncr:delete` reads like the operative permission and is not.
    const delUsing = sqlValue(
      `SELECT pg_get_expr(polqual, polrelid) FROM pg_policy
        WHERE polrelid = 'nonconformances'::regclass AND polname = 'nonconformances_del'`,
    )
    expect(
      delUsing,
      'the DELETE policy is the one that checks ncr:delete — and it only ever sees a literal SQL DELETE, which a paranoid model never emits',
    ).toMatch(/has_permission\('ncr'::text, 'delete'::text\)/)

    undelete(nc.id)
    expect(deletedAt(nc.id), 'the probe record is restored').toBe('NULL')
  })

  test('KNOWN DEFECT NCR-D2 · the register offers Delete on a CLOSED nonconformance, while the detail page correctly withholds it', async ({
    browser,
  }) => {
    test.setTimeout(180_000)

    const closedId = sqlValue(
      `SELECT id FROM nonconformances
        WHERE company_id = ${q(COMPANY_ID)} AND status_id = 'CLOSED' AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
    )
    test.skip(!closedId, 'no CLOSED nonconformance in the tenant to probe')
    const closedNumber = sqlValue(`SELECT nc_number FROM nonconformances WHERE id = ${q(closedId)}`)

    const ctx = await browser.newContext({ storageState: AUTH.recordDeleter })
    try {
      // ── THE HALF THAT IS RIGHT. On the record itself, Delete is gated on
      // DRAFT and this record is CLOSED, so the control is absent. Asserted
      // FIRST and on the SAME persona, because otherwise the list finding below
      // could be read as "this user simply has delete everywhere" rather than
      // "the two surfaces disagree".
      const detail = await ctx.newPage()
      await detail.goto(`/nonconformances/${closedId}`, { waitUntil: 'domcontentloaded' })
      await expect(
        detail.getByText(closedNumber).first(),
        'the record renders — this is not a visibility result',
      ).toBeVisible({ timeout: 90_000 })

      // The action may be inline or in the header overflow; open the overflow
      // if there is one, then assert the control is nowhere either way.
      const overflow = detail
        .getByRole('button', { name: 'Print', exact: true })
        .first()
        .locator('xpath=following::button[@aria-label="More actions"][1]')
      if (await overflow.isVisible().catch(() => false)) {
        await overflow.evaluate((el) => el.scrollIntoView({ block: 'center' }))
        await overflow.click()
      }
      await expect(
        detail
          .getByRole('menuitem', { name: 'Delete', exact: true })
          .or(detail.getByRole('button', { name: 'Delete', exact: true })),
        'the detail page withholds Delete on a CLOSED record (ncDetailConfig.js gates it on DRAFT)',
      ).toHaveCount(0)
      await detail.close()

      // ── THE HALF THAT IS NOT. The same record, the same persona, the
      // register. `NonconformancesHome.vue`'s canDelete is a bare
      // isAllowed(['ncr:delete']) with no status term, so the row menu offers
      // Delete on every row it renders.
      const list = await ctx.newPage()
      // `?activeFilter=closed` is not a convenience — the register's DEFAULT
      // quick-filter is `all_open` (NonconformancesHome.vue:44), which shows
      // only DRAFT + OPEN. A CLOSED record is simply not on the default view,
      // so navigating bare would assert against a page that never had the row.
      // The filter bag is URL-synced (`useListLayout({ syncUrl: true })`), and
      // `queryToFilters` coerces this string key straight through, so the pill
      // a person clicks and this query param are the same control.
      await list.goto('/nonconformances?activeFilter=closed', {
        waitUntil: 'domcontentloaded',
      })
      const row = list.getByRole('row').filter({ hasText: closedNumber }).first()
      await expect(row, 'the CLOSED record is in the register').toBeVisible({ timeout: 90_000 })

      const rowMenu = row.getByRole('button', { name: 'More actions' }).first()
      await expect(rowMenu, 'the row carries an actions menu').toBeVisible({ timeout: 30_000 })
      await rowMenu.click()

      await expect(
        list
          .getByRole('menuitem', { name: 'Delete', exact: true })
          .or(list.getByRole('button', { name: 'Delete', exact: true }))
          .first(),
        'KNOWN DEFECT NCR-D2: the register offers Delete on a CLOSED nonconformance — the list gate is a bare ncr:delete check with no status term (NonconformancesHome.vue:25), and per NCR-D1 nothing underneath would refuse it',
      ).toBeVisible({ timeout: 15_000 })

      // NOT clicked. The affordance is the finding; confirming the dialog would
      // delete a record other specs in this shared tenant read.
      await list.keyboard.press('Escape')
      await list.close()
    } finally {
      await ctx.close()
    }

    expect(deletedAt(closedId), 'and this test changed nothing').toBe('NULL')
  })
})
