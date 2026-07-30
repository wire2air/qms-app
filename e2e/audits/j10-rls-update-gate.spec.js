// PW-J10 · 🔴 six audit tables have a company-only UPDATE policy (finding #2).
//
// Their SELECT / INSERT / DELETE policies are permission-gated; UPDATE is not —
// it checks company_id and stops. PostGraphile issues `SET ROLE app_user` for
// every GraphQL request unconditionally, so RLS is the ONLY thing standing
// between an authenticated company member and a raw mutation on these rows.
// With the gate reduced to company scope, any member can reassign a finding,
// re-price its severity, or rewrite a standard's clause text without holding
// any *:update permission, team membership, or share grant.
//
// The probe runs SQL as `app_user` with the session GUCs requireCompanyAccess
// would set (fixtures/db.js sqlAsAppUser) rather than through GraphQL. That is
// the same layer PostGraphile runs at, it removes the API surface as a variable,
// and it is how the sites/departments suites probe RLS. A refusal shows up as
// zero rows changed, not an error — so every assertion reads the value back.
//
// The actor is `auditReader` — *:read on every audit module, no write action
// anywhere — and that choice is load-bearing. Postgres applies the SELECT policy
// when an UPDATE has to locate its rows, so a user who cannot READ a finding
// cannot exploit its company-only UPDATE policy either. The exposure is
// therefore precisely "anyone who can see the record can rewrite it", which is
// the most ordinary role in the module, not an exotic one.
//
// audit_instances is the CONTROL: it had this exact defect, it was fixed on
// 2026-07-22, and it must stay refused. A run where the control goes red is a
// regression of that fix.
//
// EXPECTED TO FAIL for the five tables probed here. The sixth, `audit_evidence`,
// shares the defect but needs an uploaded file to probe and is not covered yet.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUDIT_STANDARD, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql, sqlValue, sqlAsAppUser } from '../fixtures/db.js'

// The persona: read-only across every audit module, no write action anywhere.
const ACTOR = { userId: USERS.auditReader.id, companyId: COMPANY_ID }

/** Insert the rows the finding/program probes need, as superuser (bypasses RLS). */
function seedProbeRows(tag) {
  const instanceId = sqlValue(`
    INSERT INTO audit_instances
      (company_id, audit_number, audit_standard_id, audit_standard_version_id, requirement_schema,
       program_type_id, status_id, scheduled_date, scope, created_by)
    VALUES
      ('${COMPANY_ID}', 'AUD-J10-${tag}', '${AUDIT_STANDARD.id}', '${AUDIT_STANDARD.effectiveVersionId}',
       '[]'::jsonb, 'INTERNAL', 'IN_PROGRESS', CURRENT_DATE, 'PW-J10 probe ${tag}', '${USERS.author.id}')
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

test.describe('PW-J10 · raw UPDATE as an unprivileged member', () => {
  test('CONTROL · audit_instances (fixed 2026-07-22) refuses the write', async () => {
    const rows = seedProbeRows(`ctl-${Date.now()}`)
    try {
      sqlAsAppUser(
        `UPDATE audit_instances SET scope = 'PW-J10 TAMPERED' WHERE id = '${rows.instanceId}';`,
        ACTOR,
      )
      expect(
        sqlValue(`SELECT scope FROM audit_instances WHERE id = '${rows.instanceId}'`),
        'the tightened audit_instances UPDATE policy must still hold',
      ).not.toContain('TAMPERED')
    } finally {
      cleanup(rows)
    }
  })

  test('🔴 audit_findings: severity + assignee are rewritable without permission (FAILS TODAY)', async () => {
    const rows = seedProbeRows(`fnd-${Date.now()}`)
    try {
      sqlAsAppUser(
        `UPDATE audit_findings
            SET severity_score = 9, assigned_to_user_id = '${USERS.auditReader.id}'
          WHERE id = '${rows.findingId}';`,
        ACTOR,
      )
      const after = sql(
        `SELECT severity_score, coalesce(assigned_to_user_id::text,'') FROM audit_findings WHERE id = '${rows.findingId}'`,
      ).split('|')
      expect(
        Number(after[0]),
        'severity must not be rewritable without audit_findings:update',
      ).toBe(1)
      expect(after[1], 'assignee must not be rewritable without audit_findings:update').toBe('')
    } finally {
      cleanup(rows)
    }
  })

  test('🔴 audit_programs: schedule is rewritable without permission (FAILS TODAY)', async () => {
    const rows = seedProbeRows(`prg-${Date.now()}`)
    try {
      sqlAsAppUser(
        `UPDATE audit_programs SET name = 'PW-J10 TAMPERED', active = false WHERE id = '${rows.programId}';`,
        ACTOR,
      )
      const after = sql(
        `SELECT name, active FROM audit_programs WHERE id = '${rows.programId}'`,
      ).split('|')
      expect(
        after[0],
        'a program name must not be rewritable without audit_programs:update',
      ).not.toContain('TAMPERED')
      expect(after[1], 'a recurring schedule must not be silently deactivated').toBe('t')
    } finally {
      cleanup(rows)
    }
  })

  test('🔴 audit_requirements: clause text is rewritable without permission (FAILS TODAY)', async () => {
    const clause = AUDIT_STANDARD.clauses.documentControl
    const before = sqlValue(`SELECT title FROM audit_requirements WHERE id = '${clause.id}'`)
    sqlAsAppUser(
      `UPDATE audit_requirements SET title = 'PW-J10 TAMPERED' WHERE id = '${clause.id}';`,
      ACTOR,
    )
    const after = sqlValue(`SELECT title FROM audit_requirements WHERE id = '${clause.id}'`)
    // Restore before asserting — the seeded clause is shared with every other
    // journey, and this test is expected to fail.
    sql(`UPDATE audit_requirements SET title = '${before}' WHERE id = '${clause.id}'`)
    expect(after, 'clause text must not be rewritable without audit_standards:update').toBe(before)
  })

  test('🔴 audit_standards: identity metadata is rewritable without permission (FAILS TODAY)', async () => {
    const before = sqlValue(
      `SELECT coalesce(description,'') FROM audit_standards WHERE id = '${AUDIT_STANDARD.id}'`,
    )
    sqlAsAppUser(
      `UPDATE audit_standards SET description = 'PW-J10 TAMPERED' WHERE id = '${AUDIT_STANDARD.id}';`,
      ACTOR,
    )
    const after = sqlValue(
      `SELECT coalesce(description,'') FROM audit_standards WHERE id = '${AUDIT_STANDARD.id}'`,
    )
    sql(`UPDATE audit_standards SET description = '${before}' WHERE id = '${AUDIT_STANDARD.id}'`)
    expect(after, 'a standard must not be rewritable without audit_standards:update').toBe(before)
  })

  test('🔴 audit_standard_versions: version state is rewritable without permission (FAILS TODAY)', async () => {
    const versionId = AUDIT_STANDARD.effectiveVersionId
    const before = sqlValue(
      `SELECT coalesce(change_summary,'') FROM audit_standard_versions WHERE id = '${versionId}'`,
    )
    sqlAsAppUser(
      `UPDATE audit_standard_versions SET change_summary = 'PW-J10 TAMPERED' WHERE id = '${versionId}';`,
      ACTOR,
    )
    const after = sqlValue(
      `SELECT coalesce(change_summary,'') FROM audit_standard_versions WHERE id = '${versionId}'`,
    )
    sql(`UPDATE audit_standard_versions SET change_summary = '${before}' WHERE id = '${versionId}'`)
    expect(after, 'a controlled version row must not be rewritable without permission').toBe(before)
  })
})
