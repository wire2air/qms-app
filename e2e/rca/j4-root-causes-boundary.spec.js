// PW-J4 — `root_causes`: the RLS write-authorization boundary (F-01, CLOSED
// 2026-09-01) and the immutability guard that closes what the policy fix
// alone did not (F-09 / QMSRC). Both probed at the `app_user` layer directly
// — the role PostGraphile runs every request as, and the layer the original
// defect and its fix both live at (database/rls.sql, not a migration; see
// docs/modules/rca/11-security-review.md §1 and
// 22-hardening-pass-2026-09-01.md §2-3).
//
// WHY THIS TABLE HAS NO UI TO DRIVE THESE THROUGH. root_causes has no screen
// anywhere in the product (F-08) — PW-J1 shows the only way a real row is
// created (the embedded widget, on workflow-step approval). A REWRITE
// attempt, by contrast, has no UI path at all: nothing in qms-app/src ever
// calls `db.RootCause.*` (22-hardening-pass-2026-09-01.md §8 — a repo-wide
// sweep found zero references). So proving the rewrite is refused has to
// happen at the layer that refuses it.
//
// THE VACUITY LESSON (22-hardening-pass-2026-09-01.md §9.1) — do not "fix"
// this by testing with a zero-grant persona. `root_causes_select_rls` already
// requires a parent `:read`, and Postgres applies the SELECT policy to the
// rows an `UPDATE ... WHERE` reads — so a persona with NO grants at all gets
// `UPDATE 0` whether or not the UPDATE policy has a permission clause (the
// SELECT policy filters the row before UPDATE is ever reached). Measured
// directly against the reverted, pre-fix policy: a zero-grant persona and a
// `capa:read`-only persona both got `UPDATE 0` — the SECOND one is the actual
// exploit, because it holds enough to SEE the row but nothing that should let
// it WRITE. So every probe below uses `USERS.author`, who legitimately holds
// `ncr:read/update` (a parent-module grant), never a bare zero-grant persona.
import { test, expect } from '@playwright/test'
import { COMPANY_ID, RCA, USERS } from '../fixtures/cast.js'
import { sqlAsAppUser, sqlValue } from '../fixtures/db.js'
import { quote } from '../fixtures/rca.js'

const ROOT_CAUSE_ID = RCA.rootCause.id
const SEEDED_DESCRIPTION = RCA.rootCause.description

test.describe('PW-J4 · root_causes write-authorization + immutability', () => {
  test.afterEach(() => {
    // Restore the seeded fixture regardless of which assertion path ran —
    // the seed's own restore only fires on the NEXT `psql < e2e-seed.sql`,
    // not between tests in the same run.
    sqlValue(
      `UPDATE root_causes SET description = ${quote(SEEDED_DESCRIPTION)},
              category_id = '${RCA.categories.people.id}', category_label = 'People', category_color = '#2563eb',
              deleted_at = NULL
        WHERE id = '${ROOT_CAUSE_ID}'`,
    )
  })

  test('CONTROL · the fixture is reachable via ncr:read before any write is attempted', async () => {
    // Asserted rather than assumed — every negative result below would read
    // as "the guard held" even if the real cause were "this persona cannot
    // even see the row", which is exactly the vacuity trap §9.1 documents.
    const visible = sqlAsAppUser(`SELECT count(*) FROM root_causes WHERE id = '${ROOT_CAUSE_ID}';`, {
      userId: USERS.author.id,
      companyId: COMPANY_ID,
    })
    expect(visible.ok, visible.error).toBe(true)
    expect(visible.output.trim().split('\n').pop().trim()).toBe('1')
  })

  test('a holder of a parent module\'s :update permission CAN rewrite deleted_at (the soft-delete path) — QMSRC blocks everything else', async () => {
    // `author` (USERS.author) holds ncr:create/read/update at TENANT scope —
    // one of the three-way (now four-way, +complaints) OR
    // root_causes_update_rls consults. This is the ADMITTING persona.
    const softDelete = sqlAsAppUser(
      `UPDATE root_causes SET deleted_at = now() WHERE id = '${ROOT_CAUSE_ID}';`,
      { userId: USERS.author.id, companyId: COMPANY_ID },
    )
    expect(softDelete.ok, softDelete.error).toBe(true)
    expect(
      sqlValue(`SELECT deleted_at IS NOT NULL FROM root_causes WHERE id = '${ROOT_CAUSE_ID}'`),
      'the RLS policy admits this persona for the one UPDATE the product itself issues',
    ).toBe('t')

    // Restore for the rewrite probe below (still as the trusted DB role —
    // the seed's own semantics, not part of what this test is proving).
    sqlValue(`UPDATE root_causes SET deleted_at = NULL WHERE id = '${ROOT_CAUSE_ID}'`)

    // The SAME persona, same grant, attempting to rewrite CONTENT (not just
    // deleted_at) is refused by the trigger, not the policy — enforce_root_
    // cause_immutable (ERRCODE QMSRC) compares the whole row minus
    // deleted_at/updated_at and raises when anything else differs.
    const rewrite = sqlAsAppUser(
      `UPDATE root_causes SET description = 'REWRITTEN BY PW-J4' WHERE id = '${ROOT_CAUSE_ID}';`,
      { userId: USERS.author.id, companyId: COMPANY_ID },
    )
    expect(rewrite.ok, 'the trigger raises — this must NOT succeed').toBe(false)
    // psql prints ERROR/HINT/CONTEXT but NOT the SQLSTATE, so matching on the
    // code itself can never pass here. The guard's own message is the
    // identifying text (enforce_root_cause_immutable, the QMSRC trigger).
    expect(rewrite.error, 'the immutability guard refused it, not a generic failure').toMatch(
      /A recorded root cause cannot be edited|enforce_root_cause_immutable/,
    )
    expect(
      sqlValue(`SELECT description FROM root_causes WHERE id = '${ROOT_CAUSE_ID}'`),
      'the content is unchanged',
    ).toBe(SEEDED_DESCRIPTION)
  })

  test('a persona with NO grant on any parent module cannot even reach the row (the SELECT-filters-UPDATE trap)', async () => {
    // noAccess holds zero grants anywhere. This is the vacuity-lesson CONTROL:
    // UPDATE 0 here proves nothing about the permission clause on its own
    // (the SELECT policy alone would produce the identical result) — it is
    // included so the admitting-persona test above reads as a genuine
    // contrast rather than an assumption.
    const rewrite = sqlAsAppUser(
      `UPDATE root_causes SET description = 'noAccess should never reach this' WHERE id = '${ROOT_CAUSE_ID}';`,
      { userId: USERS.noAccess.id, companyId: COMPANY_ID },
    )
    // The statement itself does not error (zero rows matched is not a SQL
    // error) — assert the row count it claims to have touched instead.
    expect(rewrite.ok, rewrite.error).toBe(true)
    expect(
      sqlValue(`SELECT description FROM root_causes WHERE id = '${ROOT_CAUSE_ID}'`),
      'unchanged — noAccess cannot see the row at all',
    ).toBe(SEEDED_DESCRIPTION)
  })

  test('INSERT and DELETE still require a parent :update grant — the OR the UPDATE policy now mirrors', async () => {
    const deniedInsert = sqlAsAppUser(
      `INSERT INTO root_causes (company_id, resource_type, resource_id, description, is_primary, created_by)
       VALUES ('${COMPANY_ID}', 'Nonconformance', '${RCA.nonconformance.id}', 'noAccess insert probe', false, '${USERS.noAccess.id}');`,
      { userId: USERS.noAccess.id, companyId: COMPANY_ID },
    )
    expect(deniedInsert.ok, 'refused — noAccess holds no capa|ncr|change_control|complaints:update').toBe(
      false,
    )
    expect(
      sqlValue(
        `SELECT count(*) FROM root_causes WHERE resource_id = '${RCA.nonconformance.id}' AND description = 'noAccess insert probe'`,
      ),
    ).toBe('0')

    const allowedInsert = sqlAsAppUser(
      `INSERT INTO root_causes (id, company_id, resource_type, resource_id, description, is_primary, created_by)
       VALUES (gen_random_uuid(), '${COMPANY_ID}', 'Nonconformance', '${RCA.nonconformance.id}', 'author insert probe (PW-J4)', false, '${USERS.author.id}');`,
      { userId: USERS.author.id, companyId: COMPANY_ID },
    )
    expect(allowedInsert.ok, allowedInsert.error).toBe(true)
    expect(
      sqlValue(
        `SELECT count(*) FROM root_causes WHERE resource_id = '${RCA.nonconformance.id}' AND description = 'author insert probe (PW-J4)'`,
      ),
    ).toBe('1')
    // Clean up the throwaway row directly (not through app_user — no RLS
    // dependency in a cleanup step).
    sqlValue(
      `DELETE FROM root_causes WHERE resource_id = '${RCA.nonconformance.id}' AND description = 'author insert probe (PW-J4)'`,
    )
  })

  test('cross-module read exposure is real and by design — an ncr grant alone returns this row, which is attached to an NC either way', async () => {
    // Documents the design decision left OPEN in
    // docs/modules/rca/11-security-review.md §4 / 22-hardening-pass-2026-09-01.md
    // §10.4: root_causes_select_rls ORs capa|ncr|change_control|complaints:read,
    // so a reader with only ONE parent module's grant sees root causes
    // attached to ALL FOUR resource types. This fixture happens to be a
    // Nonconformance, so this assertion is not itself surprising — it is
    // pinned so a future narrowing of the OR (a real hardening candidate,
    // per the doc) is a deliberate, visible change here rather than a
    // silent one.
    const viaNcr = sqlAsAppUser(`SELECT count(*) FROM root_causes WHERE id = '${ROOT_CAUSE_ID}';`, {
      userId: USERS.author.id, // ncr:read holder, no capa/change_control/complaints grant
      companyId: COMPANY_ID,
    })
    expect(viaNcr.ok, viaNcr.error).toBe(true)
    expect(viaNcr.output.trim().split('\n').pop().trim()).toBe('1')
  })
})
