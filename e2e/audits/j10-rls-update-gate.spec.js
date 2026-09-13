// PW-J10 · six audit tables' UPDATE policies gate on has_permission (finding #2).
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT WAS HERE
//
// audit_instances, audit_evidence, audit_findings, audit_programs,
// audit_requirements, audit_standards and audit_standard_versions all had a
// company-scoped-only UPDATE policy while their SELECT / INSERT / DELETE
// policies gated on a permission. PostGraphile issues `SET ROLE app_user` for
// every GraphQL request unconditionally, so RLS was the ONLY thing standing
// between an authenticated company member and a raw mutation on these rows —
// with the gate reduced to company scope, any member could reassign a finding,
// re-price its severity, or rewrite a standard's clause text without holding
// any *:update permission, team membership, or share grant. This file
// documented that as a set of EXPECTED-TO-FAIL probes.
//
// FIXED: AUDIT-RLS-2 (2026-09-07, database/rls.sql) added a permission gate to
// every one of these UPDATE policies — `audit_findings_update_rls` on
// `audit_findings:update`, `audit_programs_update_rls` on
// `audit_programs:update`, `audit_requirements_update_rls` /
// `audit_standards_update_rls` / `audit_standard_versions_update_rls` on
// `audit_standards:update`. `audit_instances_upd` (the generator-managed
// native policy) already required `audit_management:update AND
// authz.scope_allowed(...)` — the comment in rls.sql above it wrongly claimed
// it was "company-wide/ungated" (corrected 2026-09-08); it was always the
// CONTROL here, not a sixth defect. These are therefore REGRESSION GUARDS now,
// not demonstrations of a bypass. `audit_evidence` shares the fix but still
// needs an uploaded file to probe and stays out of scope for this file, same
// as before.
//
// Nothing about the MECHANICS below changed — the probe always ran raw SQL as
// `app_user` rather than through the API, for the reasons in the next section
// — only the framing, and now every probe is PAIRED: the same row is first
// attempted by a persona with no relevant grant (must have no effect) and then
// by a persona that holds it (must take effect). A one-sided "the denied user
// is denied" is worth nothing on its own — it passes identically when the
// policy is simply broken and refuses everyone, which is a different bug
// wearing the same green checkmark. Pairing is the same principle
// e2e/auditLogs/a1-read-gate.spec.js uses for the read side of this module.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY RAW SQL AS app_user, NOT A REST OR GRAPHQL CALL
//
// `REST_RLS_ENABLED` is off by default (see root CLAUDE.md, "Auth & company
// scoping") — Sequelize/REST connects as the DB superuser, which bypasses RLS
// entirely, so a REST PATCH here would prove nothing about the policy. RLS
// fires unconditionally for PostGraphile, because `config/postgraphile.js`
// issues `SET ROLE app_user` for every request — that is the layer this file
// probes. `sqlAsAppUser` (fixtures/db.js) reproduces exactly that: a real
// `SET ROLE app_user` plus the session GUCs `requireCompanyAccess`/PostGraphile
// would set, on a raw connection, with no API surface as a variable. Same
// approach as j9-standards-permission-bypass.spec.js's CONTROL and every probe
// in auditLogs/a1-read-gate.spec.js.
//
// An RLS-denied UPDATE returns rowCount 0 — it does NOT raise. Nothing throws,
// nothing 403s: the policy simply matches no rows. So every assertion below
// reads the row back and compares values / a changed-or-not fact; none of them
// assert on a thrown error or a status code.
//
// The DENIED actor is `auditReader` — *:read on every audit module, no write
// action anywhere — and that choice is load-bearing. Postgres applies the
// SELECT policy when an UPDATE has to locate its rows, so a user who cannot
// READ a finding cannot exploit its UPDATE policy either; using her means the
// exposure being guarded against is "anyone who can see the record can rewrite
// it", the most ordinary role in the module, not an exotic one. The GRANTED
// actor is `author` — every audit_management / audit_standards /
// audit_programs / audit_findings action, `tenant` scope — the lead-auditor
// persona this module's other journeys already write through.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUDIT_STANDARD, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql, sqlValue, sqlAsAppUser } from '../fixtures/db.js'

const DENIED = { userId: USERS.auditReader.id, companyId: COMPANY_ID }
const GRANTED = { userId: USERS.author.id, companyId: COMPANY_ID }

/** Insert the rows the finding/program probes need, as superuser (bypasses RLS). */
function seedProbeRows(tag) {
  const instanceId = sqlValue(`
    INSERT INTO audit_instances
      (company_id, audit_number, audit_standard_id, audit_standard_version_id, requirement_schema,
       program_type_id, status_id, scheduled_date, scope, created_by)
    VALUES
      ('${COMPANY_ID}', 'AUD-J10-${tag}', '${AUDIT_STANDARD.id}', '${AUDIT_STANDARD.effectiveVersionId}',
       '[]'::jsonb, 'INTERNAL', 'OPEN', CURRENT_DATE, 'PW-J10 probe ${tag}', '${USERS.author.id}')
    RETURNING id`)
  const findingId = sqlValue(`
    INSERT INTO audit_findings
      (company_id, audit_instance_id, finding_number, finding_type_id, status_id, description,
       severity_score, risk_score, created_by)
    VALUES
      ('${COMPANY_ID}', '${instanceId}', 'FND-J10-${tag}', 'MINOR_NC', 'OPEN',
       'PW-J10 probe finding', 1, 1, '${USERS.author.id}')
    RETURNING id`)
  const programId = sqlValue(`
    INSERT INTO audit_programs
      (company_id, name, program_type_id, audit_standard_id, frequency_id, next_due_date, active, created_by)
    VALUES
      ('${COMPANY_ID}', 'PW-J10 probe program ${tag}', 'INTERNAL', '${AUDIT_STANDARD.id}',
       'ANNUAL', CURRENT_DATE + 30, true, '${USERS.author.id}')
    RETURNING id`)
  return { instanceId, findingId, programId }
}

function cleanup({ instanceId, findingId, programId }) {
  sql(`DELETE FROM audit_findings WHERE id = '${findingId}'`)
  sql(`DELETE FROM audit_instances WHERE id = '${instanceId}'`)
  sql(`DELETE FROM audit_programs WHERE id = '${programId}'`)
}

test.describe('PW-J10 · raw UPDATE gated on has_permission(module, "update")', () => {
  test('CONTROL · audit_instances (fixed 2026-07-22) — denied without permission, applied with it', async () => {
    const rows = seedProbeRows(`ctl-${Date.now()}`)
    try {
      sqlAsAppUser(
        `UPDATE audit_instances SET scope = 'PW-J10 TAMPERED' WHERE id = '${rows.instanceId}';`,
        DENIED,
      )
      expect(
        sqlValue(`SELECT scope FROM audit_instances WHERE id = '${rows.instanceId}'`),
        'no audit_management:update — the write must not take effect',
      ).not.toContain('TAMPERED')

      sqlAsAppUser(
        `UPDATE audit_instances SET scope = 'PW-J10 GRANTED' WHERE id = '${rows.instanceId}';`,
        GRANTED,
      )
      expect(
        sqlValue(`SELECT scope FROM audit_instances WHERE id = '${rows.instanceId}'`),
        'holds audit_management:update — the write must take effect (the gate is not refusing everyone)',
      ).toBe('PW-J10 GRANTED')
    } finally {
      cleanup(rows)
    }
  })

  test('audit_findings: UPDATE requires audit_findings:update', async () => {
    const rows = seedProbeRows(`fnd-${Date.now()}`)
    try {
      sqlAsAppUser(
        `UPDATE audit_findings
            SET severity_score = 9, assigned_to_user_id = '${USERS.auditReader.id}'
          WHERE id = '${rows.findingId}';`,
        DENIED,
      )
      const denied = sql(
        `SELECT severity_score, coalesce(assigned_to_user_id::text,'') FROM audit_findings WHERE id = '${rows.findingId}'`,
      ).split('|')
      expect(Number(denied[0]), 'no audit_findings:update — severity must be unchanged').toBe(1)
      expect(denied[1], 'no audit_findings:update — assignee must be unchanged').toBe('')

      sqlAsAppUser(
        `UPDATE audit_findings
            SET severity_score = 9, assigned_to_user_id = '${USERS.author.id}'
          WHERE id = '${rows.findingId}';`,
        GRANTED,
      )
      const granted = sql(
        `SELECT severity_score, coalesce(assigned_to_user_id::text,'') FROM audit_findings WHERE id = '${rows.findingId}'`,
      ).split('|')
      expect(Number(granted[0]), 'holds audit_findings:update — severity must change').toBe(9)
      expect(granted[1], 'holds audit_findings:update — assignee must change').toBe(USERS.author.id)
    } finally {
      cleanup(rows)
    }
  })

  test('audit_programs: UPDATE requires audit_programs:update', async () => {
    const rows = seedProbeRows(`prg-${Date.now()}`)
    try {
      sqlAsAppUser(
        `UPDATE audit_programs SET name = 'PW-J10 TAMPERED', active = false WHERE id = '${rows.programId}';`,
        DENIED,
      )
      const denied = sql(
        `SELECT name, active FROM audit_programs WHERE id = '${rows.programId}'`,
      ).split('|')
      expect(denied[0], 'no audit_programs:update — name must be unchanged').not.toContain(
        'TAMPERED',
      )
      expect(denied[1], 'no audit_programs:update — schedule must not be silently deactivated').toBe(
        't',
      )

      sqlAsAppUser(
        `UPDATE audit_programs SET name = 'PW-J10 GRANTED', active = false WHERE id = '${rows.programId}';`,
        GRANTED,
      )
      const granted = sql(
        `SELECT name, active FROM audit_programs WHERE id = '${rows.programId}'`,
      ).split('|')
      expect(granted[0], 'holds audit_programs:update — name must change').toBe('PW-J10 GRANTED')
      expect(granted[1], 'holds audit_programs:update — active must change').toBe('f')
    } finally {
      cleanup(rows)
    }
  })

  test('audit_requirements: UPDATE requires audit_standards:update', async () => {
    const clause = AUDIT_STANDARD.clauses.documentControl
    const before = sqlValue(`SELECT title FROM audit_requirements WHERE id = '${clause.id}'`)
    try {
      sqlAsAppUser(
        `UPDATE audit_requirements SET title = 'PW-J10 TAMPERED' WHERE id = '${clause.id}';`,
        DENIED,
      )
      expect(
        sqlValue(`SELECT title FROM audit_requirements WHERE id = '${clause.id}'`),
        'no audit_standards:update — clause text must be unchanged',
      ).toBe(before)

      sqlAsAppUser(
        `UPDATE audit_requirements SET title = 'PW-J10 GRANTED' WHERE id = '${clause.id}';`,
        GRANTED,
      )
      expect(
        sqlValue(`SELECT title FROM audit_requirements WHERE id = '${clause.id}'`),
        'holds audit_standards:update — clause text must change',
      ).toBe('PW-J10 GRANTED')
    } finally {
      // The seeded clause is shared with every other journey — always restore,
      // regardless of which assertion above failed.
      sql(`UPDATE audit_requirements SET title = '${before}' WHERE id = '${clause.id}'`)
    }
  })

  test('audit_standards: UPDATE requires audit_standards:update', async () => {
    const before = sqlValue(
      `SELECT coalesce(description,'') FROM audit_standards WHERE id = '${AUDIT_STANDARD.id}'`,
    )
    try {
      sqlAsAppUser(
        `UPDATE audit_standards SET description = 'PW-J10 TAMPERED' WHERE id = '${AUDIT_STANDARD.id}';`,
        DENIED,
      )
      expect(
        sqlValue(
          `SELECT coalesce(description,'') FROM audit_standards WHERE id = '${AUDIT_STANDARD.id}'`,
        ),
        'no audit_standards:update — description must be unchanged',
      ).toBe(before)

      sqlAsAppUser(
        `UPDATE audit_standards SET description = 'PW-J10 GRANTED' WHERE id = '${AUDIT_STANDARD.id}';`,
        GRANTED,
      )
      expect(
        sqlValue(
          `SELECT coalesce(description,'') FROM audit_standards WHERE id = '${AUDIT_STANDARD.id}'`,
        ),
        'holds audit_standards:update — description must change',
      ).toBe('PW-J10 GRANTED')
    } finally {
      sql(`UPDATE audit_standards SET description = '${before}' WHERE id = '${AUDIT_STANDARD.id}'`)
    }
  })

  test('audit_standard_versions: UPDATE requires audit_standards:update', async () => {
    const versionId = AUDIT_STANDARD.effectiveVersionId
    const before = sqlValue(
      `SELECT coalesce(change_summary,'') FROM audit_standard_versions WHERE id = '${versionId}'`,
    )
    try {
      sqlAsAppUser(
        `UPDATE audit_standard_versions SET change_summary = 'PW-J10 TAMPERED' WHERE id = '${versionId}';`,
        DENIED,
      )
      expect(
        sqlValue(
          `SELECT coalesce(change_summary,'') FROM audit_standard_versions WHERE id = '${versionId}'`,
        ),
        'no audit_standards:update — a controlled version row must be unchanged',
      ).toBe(before)

      sqlAsAppUser(
        `UPDATE audit_standard_versions SET change_summary = 'PW-J10 GRANTED' WHERE id = '${versionId}';`,
        GRANTED,
      )
      expect(
        sqlValue(
          `SELECT coalesce(change_summary,'') FROM audit_standard_versions WHERE id = '${versionId}'`,
        ),
        'holds audit_standards:update — the version row must change',
      ).toBe('PW-J10 GRANTED')
    } finally {
      sql(
        `UPDATE audit_standard_versions SET change_summary = '${before}' WHERE id = '${versionId}'`,
      )
    }
  })
})
