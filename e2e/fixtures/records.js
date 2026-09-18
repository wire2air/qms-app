// Fixtures for the `records` project — App Builder submissions and the
// admin-promoted module records built on the same physical table.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE PROVISIONS ANYTHING AT ALL
//
// `qms/database/e2e-seed.sql` §35 was added on 2026-09-01 to unblock exactly
// this suite (Records F-31: "the E2E database could not represent a module
// record AT ALL"). It seeds a genuinely promoted module — `form_templates`
// with is_module + internal_name, the `authz.modules` row whose id IS that
// name, and its `authz.module_actions` — and two differently-owned DRAFT
// records. All of that landed and all of it is used below.
//
// Its THREE ROLE/MEMBERSHIP rows did not land, and nothing said so. Measured
// against app-db on 2026-09-01 after re-applying the seed:
//
//   §35 statement                                   id                        outcome
//   INSERT roles 'E2E Module Owner'                 e2e30000-…-000000000060   NO-OP
//   INSERT roles_on_users author → Module Owner     e2e31000-…-000000000060   NO-OP
//   INSERT roles_on_users ownauthor → OwnScope      e2e31000-…-000000000061   NO-OP
//
// All three collide with ids §31 (the CAPA step-grouping fixture, ~600 lines
// earlier in the same file) already used, and all three are written
// `ON CONFLICT (id) DO NOTHING` — so they fail SILENTLY and the seed still
// exits 0. The observable consequences:
//
//   * `E2E Module Owner` does not exist. `e2e30000-…-000000000060` is
//     **E2E CAPA Site Editor**, and §35's `role_module_permissions` INSERT
//     therefore attached `e2emod:create/read/update/delete @tenant` TO THE CAPA
//     ROLE — whose sole member is `capaSiteEditor`. A privilege the fixture
//     never meant to grant, on a persona another suite owns.
//   * `E2E Module OwnScope` DOES exist and has ZERO members, so `ownAuthor`
//     holds nothing on `e2emod` — and the own-scope persona is the entire point
//     of §35 ("a suite that only ever used the first role could not tell the
//     fix from the defect").
//   * `author` holds nothing on `e2emod` either.
//
// Verified independently: before this file ran, `records:*` was held by NOBODY
// in the E2E tenant — so every plain-submission journey was unrunnable too.
//
// The right fix is three fresh uuids in §35. That file is outside this suite's
// lane and is currently uncommitted-modified by concurrent work, so this
// fixture provisions its OWN roles instead, in an id namespace nothing else
// uses (`e2e3f000-…` roles, `e2e3f100-…` memberships). It is idempotent and it
// does not depend on §35's roles either existing or being correct — but §35
// should still be fixed, because the CAPA role is carrying a grant nobody
// authored.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE PERSONA MAP, AND WHY IT IS SHAPED THIS WAY
//
// `records` is the only table in the product whose PERMISSION NAMESPACE IS A
// COLUMN: every policy dispatches on
// `has_permission_legacy(COALESCE(module_key,'records') || ':<verb>')`. So a
// persona map for this module is a map of NAMESPACES, and the interesting
// assertions are all comparisons between them.
//
//   persona     namespace   grants                        used for
//   author      records     create/read/update/delete @tenant  plain submissions
//   controller  records     read @tenant                       the F-13 menu gate
//   reviewer    e2emod      create/read/update/delete @tenant  module lifecycle
//   ownAuthor   e2emod      read/update @own                   the READ-scope probe
//   auditor     e2emod      read @tenant + update @own         the WRITE-scope probe
//   approver    e2emodb     create/read/update @tenant         namespace isolation
//   noAccess    —           nothing                            the zero-grant control
//
// `auditor`'s split grant is not decoration; it is the only shape that makes
// the F-06 write probe MEAN anything. PostgreSQL applies the SELECT policy to
// the rows an `UPDATE … WHERE` has to locate, so a persona who cannot READ a
// row is filtered out before `record_update_rls` is ever consulted — and a
// probe using one passes identically against the defect. `auditor` reads every
// e2emod record (tenant read) and may write only her own (own update), so the
// zero-row refusal on somebody else's record is genuinely the UPDATE policy
// answering. See `scope_allowed`: for `read` it takes max(rank) over ALL the
// module's grants (`action_id = p_action OR p_action = 'read'`), which is why
// her tenant READ grant does not accidentally widen her UPDATE.
//
// `author` deliberately holds NOTHING on `e2emod`, and `reviewer` NOTHING on
// `records`. That mutual absence is the isolation journey.
import { COMPANY_ID, USERS } from './cast.js'
import { sql, sqlAsAppUser, sqlValue } from './db.js'

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`

// ─────────────────────────────────────────────────────────────────────────────
// Fixture identities
// ─────────────────────────────────────────────────────────────────────────────

export const RECORDS = {
  // The promoted module seeded by e2e-seed.sql §35. Its two sections carry NO
  // `routing` key — see MODULE_B below for why that matters — so this template
  // is used for scope, guard and isolation probes, never for Start.
  module: {
    templateId: 'e2e60000-0000-4000-8000-000000000002',
    key: 'e2emod',
    code: 'E2EMOD',
    title: 'E2E Supplier Qualification',
    // §35's two DRAFT records, with different owners on purpose.
    ownRecordId: 'e2e62000-0000-4000-8000-000000000001', // owner: ownAuthor
    otherRecordId: 'e2e62000-0000-4000-8000-000000000002', // owner: author
    // Provisioned here: the row `auditor` owns, so her own-scoped UPDATE grant
    // has something it MUST reach. Without it "auditor wrote nothing" is
    // indistinguishable from "auditor can never write".
    auditorRecordId: 'e2e6f200-0000-4000-8000-000000000001',
  },

  // A second promoted module. Two promoted modules in one tenant is the real
  // product situation, and it is the only way to state the isolation property
  // as a matrix rather than as a single pair.
  //
  // Its sections DO carry `routing`, which §35's do not — and that gap is a
  // second live defect in the seed, not a style difference:
  // `moduleRecordService.routedSections()` filters on `f.type === 'section' &&
  // f.routing && f.routing.type`, so a section without routing is invisible to
  // it and `startRecord` throws "This module has no routed sections". §35's own
  // comment claims the opposite ("startRecord synthesizes one workflow step per
  // section"), so the seeded module cannot be started and the lifecycle it was
  // built to exercise is unreachable through it. Reported, not patched.
  moduleB: {
    templateId: 'e2e6f000-0000-4000-8000-000000000002',
    key: 'e2emodb',
    code: 'E2EMODB',
    title: 'E2E Module B',
    sections: ['quality', 'commercial'],
  },

  // Plain (module_key IS NULL) submission template — the App Builder
  // Submissions tab. `documentTypeId` is set so Records F-15 is assertable:
  // insertRecord now denormalises the TEMPLATE's document type onto the record,
  // and a template with a null type cannot tell a fix from the defect.
  plain: {
    templateId: 'e2e6f000-0000-4000-8000-000000000001',
    code: 'E2EREC',
    title: 'E2E Records Probe Form',
    documentTypeId: 'FORM',
    fields: ['probeSubject', 'probeNote'],
  },

  // A template used by nothing else, so its `record_counters` row can be
  // deleted to reproduce F-32 — the first-record race, which only exists on the
  // branch that runs when the counter row does NOT yet exist.
  race: {
    templateId: 'e2e6f000-0000-4000-8000-000000000003',
    code: 'E2ERACE',
    title: 'E2E Records Race Form',
  },

  roles: {
    recordsClerk: { id: 'e2e3f000-0000-4000-8000-000000000001', name: 'E2E Records Clerk' },
    recordsReader: { id: 'e2e3f000-0000-4000-8000-000000000002', name: 'E2E Records Reader' },
    moduleTenant: { id: 'e2e3f000-0000-4000-8000-000000000003', name: 'E2E Module Tenant' },
    moduleOwn: { id: 'e2e3f000-0000-4000-8000-000000000004', name: 'E2E Module Own' },
    moduleSplit: { id: 'e2e3f000-0000-4000-8000-000000000005', name: 'E2E Module Split Scope' },
    moduleBTenant: { id: 'e2e3f000-0000-4000-8000-000000000006', name: 'E2E Module B Tenant' },
  },
}

/**
 * The workflow role module-B's sections route to: **E2E Approver** (§4), whose
 * member is `approver` — the same persona that holds `e2emodb:*`.
 *
 * That coincidence is required, not convenient, and it took two measured
 * failures to find. Starting a module record has to satisfy TWO independent
 * checks on the person named in `sectionAssignees`:
 *
 *   1. `submitResourceForReview` validates the picked reviewer against the
 *      step's ROLES. Naming someone outside the routing role fails the start
 *      itself — measured: `POST /form-modules/records/:id/start` → 400.
 *   2. `utils/workflowStepAccess.js` then requires a real GRANT on the record's
 *      module before the assignee may action their own task —
 *      `canActOnRecord({ module: instance.resourceType, action:
 *      actionForStepType(...) })`. Assignment alone does NOT confer the verb.
 *      Measured with a role-member who held no e2emodb grant: 403 *"Your role
 *      does not grant this action, even on a task assigned to you."*
 *
 * So the assignee must be BOTH a member of the routing role AND a grant holder
 * on the module. `reviewer` satisfies only the first (she is the e2emod
 * persona, and REC-J6 depends on her holding nothing on e2emodb); `approver`
 * satisfies both.
 */
const ROUTING_ROLE_ID = 'e2e30000-0000-4000-8000-000000000003'

const PLAIN_SCHEMA = JSON.stringify([
  { name: 'probeSubject', type: 'text', label: 'Probe Subject', required: true },
  { name: 'probeNote', type: 'text', label: 'Probe Note', required: false },
])

// Module B's schema, carrying the per-section `routing` that §35's promoted
// template omits — which is why that one cannot be started (see moduleB above).
const MODULE_B_SCHEMA = JSON.stringify([
  {
    name: 'quality',
    label: 'Quality Review',
    type: 'section',
    routing: { type: 'ACTION', order: 1, roles: [ROUTING_ROLE_ID] },
    fields: [{ name: 'qualityFinding', type: 'text', label: 'Quality Finding', required: false }],
  },
  {
    name: 'commercial',
    label: 'Commercial Review',
    type: 'section',
    routing: { type: 'ACTION', order: 2, roles: [ROUTING_ROLE_ID] },
    fields: [{ name: 'commercialNotes', type: 'text', label: 'Commercial Notes', required: false }],
  },
])

// ─────────────────────────────────────────────────────────────────────────────
// Provisioning
// ─────────────────────────────────────────────────────────────────────────────

function grantSql(roleId, moduleId, actions, scope) {
  return `
    INSERT INTO authz.role_module_permissions (company_id, role_id, module_id, action_id, scope_id, granted_by)
    SELECT ${quote(COMPANY_ID)}, ${quote(roleId)}, ma.module_id, ma.action_id, ${quote(scope)}, NULL
      FROM authz.module_actions ma
     WHERE ma.module_id = ${quote(moduleId)}
       AND ma.action_id IN (${actions.map(quote).join(', ')})
    ON CONFLICT (company_id, role_id, module_id, action_id)
      DO UPDATE SET scope_id = EXCLUDED.scope_id;`
}

function roleSql({ id, name }, description) {
  return `
    INSERT INTO roles (id, company_id, name, description, status_id, created_at, updated_at)
    VALUES (${quote(id)}, ${quote(COMPANY_ID)}, ${quote(name)}, ${quote(description)}, 'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET status_id = 'ACTIVE', deleted_at = NULL, name = EXCLUDED.name;`
}

function membershipSql(membershipId, userId, roleId) {
  return `
    INSERT INTO roles_on_users (id, user_id, role_id, company_id, created_at, updated_at)
    VALUES (${quote(membershipId)}, ${quote(userId)}, ${quote(roleId)}, ${quote(COMPANY_ID)}, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, role_id = EXCLUDED.role_id, deleted_at = NULL;`
}

/**
 * Everything this suite needs, in one idempotent script.
 *
 * `ON CONFLICT … DO UPDATE` rather than `DO NOTHING` throughout, deliberately:
 * DO NOTHING is precisely how §35's three rows failed without saying so. If an
 * id here is ever reused elsewhere, this overwrites and the suite fails loudly
 * on the OTHER fixture rather than passing quietly against the wrong grants.
 */
export function provisionRecordsFixtures() {
  const R = RECORDS
  sql(`
    -- ── Templates ───────────────────────────────────────────────────────────
    INSERT INTO form_templates (id, company_id, title, code, kind, status_id, is_module, internal_name, icon, version, config, module_config, schema, document_type_id, created_at, updated_at)
    VALUES
      (${quote(R.plain.templateId)}, ${quote(COMPANY_ID)}, ${quote(R.plain.title)}, ${quote(R.plain.code)}, 'FORM', 'ACTIVE', false, NULL, NULL, 1,
       '{"layout":"standard","allowDraft":true,"showHeader":true}'::jsonb, NULL, '${PLAIN_SCHEMA}'::jsonb, ${quote(R.plain.documentTypeId)}, NOW(), NOW()),
      (${quote(R.race.templateId)}, ${quote(COMPANY_ID)}, ${quote(R.race.title)}, ${quote(R.race.code)}, 'FORM', 'ACTIVE', false, NULL, NULL, 1,
       '{"layout":"standard"}'::jsonb, NULL, '${PLAIN_SCHEMA}'::jsonb, ${quote(R.plain.documentTypeId)}, NOW(), NOW()),
      (${quote(R.moduleB.templateId)}, ${quote(COMPANY_ID)}, ${quote(R.moduleB.title)}, ${quote(R.moduleB.code)}, 'FORM', 'ACTIVE', true, ${quote(R.moduleB.key)}, 'IconBox', 1,
       '{"layout":"standard"}'::jsonb, '{"displayName":"E2E Module B"}'::jsonb, '${MODULE_B_SCHEMA}'::jsonb, NULL, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE
      SET schema = EXCLUDED.schema, status_id = 'ACTIVE', deleted_at = NULL,
          is_module = EXCLUDED.is_module, internal_name = EXCLUDED.internal_name,
          document_type_id = EXCLUDED.document_type_id, code = EXCLUDED.code;

    -- ── Module B's authz registration ───────────────────────────────────────
    -- Promotion is THREE things (e2e-seed.sql §35 explains why): the template
    -- flag, the authz.modules row whose id IS the internal name, and the
    -- actions. Without the second, has_permission_legacy('e2emodb:read')
    -- resolves nothing and returns false, and every probe against this module
    -- fails for a reason unrelated to what it tests.
    INSERT INTO authz.modules (id, name, section, display_order, is_active)
    VALUES (${quote(R.moduleB.key)}, 'E2E Module B', 'Custom Modules', 901, true)
    ON CONFLICT (id) DO UPDATE SET is_active = true;

    INSERT INTO authz.module_actions (module_id, action_id)
    SELECT ${quote(R.moduleB.key)}, a
      FROM unnest(ARRAY['create','read','update','delete','manage_access']::text[]) AS a
    ON CONFLICT DO NOTHING;

    -- ── Roles ───────────────────────────────────────────────────────────────
    ${roleSql(R.roles.recordsClerk, 'records CRUD at tenant scope (plain submissions)')}
    ${roleSql(R.roles.recordsReader, 'records:read at tenant scope (the F-13 menu gate)')}
    ${roleSql(R.roles.moduleTenant, 'e2emod CRUD at tenant scope')}
    ${roleSql(R.roles.moduleOwn, 'e2emod read/update at OWN scope (read-scope probe)')}
    ${roleSql(R.roles.moduleSplit, 'e2emod read@tenant + update@own (write-scope probe)')}
    ${roleSql(R.roles.moduleBTenant, 'e2emodb create/read/update at tenant scope')}

    -- ── Memberships ─────────────────────────────────────────────────────────
    ${membershipSql('e2e3f100-0000-4000-8000-000000000001', USERS.author.id, R.roles.recordsClerk.id)}
    ${membershipSql('e2e3f100-0000-4000-8000-000000000002', USERS.controller.id, R.roles.recordsReader.id)}
    ${membershipSql('e2e3f100-0000-4000-8000-000000000003', USERS.reviewer.id, R.roles.moduleTenant.id)}
    ${membershipSql('e2e3f100-0000-4000-8000-000000000004', USERS.ownAuthor.id, R.roles.moduleOwn.id)}
    ${membershipSql('e2e3f100-0000-4000-8000-000000000005', USERS.auditor.id, R.roles.moduleSplit.id)}
    ${membershipSql('e2e3f100-0000-4000-8000-000000000006', USERS.approver.id, R.roles.moduleBTenant.id)}

    -- ── Grants ──────────────────────────────────────────────────────────────
    ${grantSql(R.roles.recordsClerk.id, 'records', ['create', 'read', 'update', 'delete'], 'tenant')}
    ${grantSql(R.roles.recordsReader.id, 'records', ['read'], 'tenant')}
    ${grantSql(R.roles.moduleTenant.id, R.module.key, ['create', 'read', 'update', 'delete'], 'tenant')}
    ${grantSql(R.roles.moduleOwn.id, R.module.key, ['read', 'update'], 'own')}
    ${grantSql(R.roles.moduleSplit.id, R.module.key, ['read'], 'tenant')}
    ${grantSql(R.roles.moduleSplit.id, R.module.key, ['update'], 'own')}
    ${grantSql(R.roles.moduleBTenant.id, R.moduleB.key, ['create', 'read', 'update'], 'tenant')}

    -- ── The third e2emod record, owned by auditor ───────────────────────────
    -- DRAFT because records_status_transition_guard admits no other INSERT
    -- state; same site/department as §35's two so scope differences are about
    -- OWNERSHIP and nothing else.
    INSERT INTO records (id, company_id, template_id, module_key, record_number, status_id, user_id, owner_user_id, site_id, department_id, payload, submission_ip, created_at, updated_at)
    VALUES (${quote(R.module.auditorRecordId)}, ${quote(COMPANY_ID)}, ${quote(R.module.templateId)}, ${quote(R.module.key)}, NULL, 'DRAFT',
            ${quote(USERS.auditor.id)}, ${quote(USERS.auditor.id)},
            'e2e51000-0000-4000-8000-000000000001', 'e2e7d000-0000-4000-8000-000000000001', '{}'::jsonb, NULL, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET owner_user_id = EXCLUDED.owner_user_id, deleted_at = NULL;
  `)
}

/**
 * A throwaway record, inserted with RLS and the permission layer bypassed.
 *
 * `status_id` is NOT a parameter: `records_status_transition_guard` admits
 * `DRAFT` and nothing else on INSERT, and that is true of the superuser path
 * too — the INSERT arm has no trust check. A helper that accepted a status
 * would be offering a state the product cannot produce, which is the class of
 * fixture mistake the guard's own integration suite calls out (a seed running
 * under `session_replication_role = replica` silently accepts a bogus status
 * because FK triggers are off, and this trigger is not one of those). Use
 * `forceStatus` to walk a row to its starting state through the trusted path,
 * which is what the product's own service layer does.
 */
export function createProbeRecord({ id, templateId, moduleKey = null, ownerUserId, userId }) {
  sql(`
    DELETE FROM records WHERE id = ${quote(id)};
    INSERT INTO records (id, company_id, template_id, module_key, status_id, user_id, owner_user_id,
                         site_id, department_id, payload, submission_ip, created_at, updated_at)
    VALUES (${quote(id)}, ${quote(COMPANY_ID)}, ${quote(templateId)},
            ${moduleKey === null ? 'NULL' : quote(moduleKey)}, 'DRAFT',
            ${quote(userId ?? ownerUserId)}, ${ownerUserId ? quote(ownerUserId) : 'NULL'},
            'e2e51000-0000-4000-8000-000000000001', 'e2e7d000-0000-4000-8000-000000000001',
            '{}'::jsonb, NULL, NOW(), NOW());`)
  return id
}

/**
 * Walk a probe row to a starting status through the TRUSTED (superuser) path.
 *
 * "Trusted" is not "unguarded": the trigger still enforces the module graph for
 * a superuser, so this only moves a row along a LEGAL edge and throws on any
 * other. There is deliberately no bypass — `session_replication_role = replica`
 * would disable the guard and hand this suite a fixture the product cannot
 * produce. To restart from DRAFT, re-create the row with `createProbeRecord`.
 */
export function forceStatus(id, statusId) {
  sql(`UPDATE records SET status_id = ${quote(statusId)} WHERE id = ${quote(id)}`)
}

export function deleteProbeRecords(ids) {
  if (!ids.length) return
  const list = ids.map(quote).join(', ')
  sql(`
    DELETE FROM analytics_field_values WHERE record_id IN (${list});
    DELETE FROM records WHERE id IN (${list});`)
}

/** Attempt one status write as `app_user` — the untrusted (SyncEngine) path. */
export function statusWriteAsAppUser(userId, recordId, statusId) {
  return sqlAsAppUser(
    `UPDATE records SET status_id = ${quote(statusId)} WHERE id = ${quote(recordId)};`,
    { userId, companyId: COMPANY_ID },
  )
}

/** Attempt one status write as the superuser — the trusted (REST/service) path. */
export function statusWriteTrusted(recordId, statusId) {
  try {
    sql(`UPDATE records SET status_id = ${quote(statusId)} WHERE id = ${quote(recordId)}`)
    return { ok: true, error: '' }
  } catch (err) {
    return { ok: false, error: `${err.stderr ?? err.message ?? ''}` }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Result readers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How many rows a statement actually touched, read off psql's command tag.
 *
 * `sqlAsAppUser` reports `ok: false` only when the statement RAISED. A write
 * that RLS filtered out raises nothing — it succeeds against zero rows — so
 * without this the two very different outcomes "the database refused you" and
 * "the database could not see the row" are indistinguishable, and a probe that
 * checked only `ok` would read a silent no-op as a passing guard.
 *
 * Returns null when no command tag was found, which is itself a failure worth
 * asserting on rather than coercing to 0.
 */
export function affectedRows(res, verb = 'UPDATE') {
  const lines = (res.output || '').trim().split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].trim().match(new RegExp(`^${verb} (?:0 )?(\\d+)$`))
    if (m) return Number(m[1])
  }
  return null
}

/** SELECT count(*) under `app_user`, with the probe's own validity asserted. */
export function countAsAppUser(userId, query) {
  const res = sqlAsAppUser(`SELECT 'RESULT=' || count(*)::text FROM (${query}) probe;`, {
    userId,
    companyId: COMPANY_ID,
  })
  if (!res.ok) throw new Error(`count probe failed: ${res.error || '(empty stderr — psql timeout?)'}`)
  const m = /RESULT=(\d+)/.exec(res.output)
  if (!m) throw new Error(`count probe returned no count (output: ${res.output})`)
  return Number(m[1])
}

/** How many of `recordIds` this persona's `record_select_rls` releases. */
export function recordsVisibleTo(userId, recordIds) {
  const list = recordIds.map(quote).join(', ')
  return countAsAppUser(userId, `SELECT 1 FROM records WHERE id IN (${list}) AND deleted_at IS NULL`)
}

/** Every record id of one module key this persona can read. */
export function recordIdsInModuleVisibleTo(userId, moduleKey) {
  const predicate =
    moduleKey === null ? 'module_key IS NULL' : `module_key = ${quote(moduleKey)}`
  const res = sqlAsAppUser(
    `SELECT 'ROW=' || id FROM records WHERE company_id = ${quote(COMPANY_ID)} AND ${predicate} AND deleted_at IS NULL;`,
    { userId, companyId: COMPANY_ID },
  )
  if (!res.ok) throw new Error(`module read probe failed: ${res.error}`)
  return (res.output.match(/ROW=([0-9a-f-]+)/g) || []).map((s) => s.slice(4))
}

/**
 * A live policy expression, whole, as one whitespace-collapsed line.
 *
 * NOT `sqlValue`: `pg_get_expr` pretty-prints across newlines and every records
 * policy contains `||` (the namespace is built by string concatenation), so
 * db.js's row reader would truncate at the first newline AND then split the
 * remainder on the pipe. Both failures are silent — you get a prefix of the
 * policy and a `toContain` that fails for the wrong reason.
 *
 * @param {'qual'|'check'} kind USING (default) or WITH CHECK.
 */
export function policyExpr(polname, kind = 'qual') {
  const col = kind === 'check' ? 'polwithcheck' : 'polqual'
  const out = sql(
    `SELECT pg_get_expr(${col}, polrelid) FROM pg_policy WHERE polname = ${quote(polname)}`,
  )
  if (!out) throw new Error(`no policy named ${polname}`)
  return out.replace(/\s+/g, ' ').trim()
}

/**
 * The record ids in one module that this user reaches through a PER-ROW grant
 * rather than through a permission — the task-assignee and share arms of
 * `record_select_rls`.
 *
 * These arms are deliberate and they are NOT scoped: the workflow engine handed
 * that specific row to that specific person, so gating them on a tier computed
 * from department/site would revoke access the engine just granted and show an
 * assignee a task they cannot open. Any statement of the form "persona X reads
 * no row of module Y" therefore has to subtract these, or it is asserting that
 * a documented feature does not exist — and it will fail the first time a
 * neighbouring suite leaves a started record behind. (Measured: it did.)
 */
export function perRowGrantedRecordIds(userId, moduleKey) {
  const out = sql(`
    SELECT r.id FROM records r
     WHERE r.module_key = ${quote(moduleKey)} AND r.deleted_at IS NULL
       AND (EXISTS (SELECT 1 FROM task_instances ti
                     WHERE ti.entity_type = r.module_key AND ti.entity_id = r.id
                       AND ti.assigned_to = ${quote(userId)}::uuid AND ti.deleted_at IS NULL)
         OR EXISTS (SELECT 1 FROM shared_with_user sw
                     WHERE sw.entity_type = r.module_key AND sw.entity_id = r.id
                       AND sw.user_id = ${quote(userId)}::uuid AND sw.deleted_at IS NULL))`)
  return out ? out.split('\n').filter(Boolean) : []
}

/** `authz.has_permission_legacy`, evaluated exactly as the policies evaluate it. */
export function hasPermissionLegacy(userId, perm) {
  const res = sqlAsAppUser(
    `SELECT 'RESULT=' || authz.has_permission_legacy(${quote(perm)})::text;`,
    { userId, companyId: COMPANY_ID },
  )
  if (!res.ok) throw new Error(`permission probe failed: ${res.error}`)
  const m = /RESULT=(true|false)/.exec(res.output)
  if (!m) throw new Error(`permission probe returned no boolean (output: ${res.output})`)
  return m[1] === 'true'
}

/** One record row, read with RLS bypassed — the ground truth every probe needs. */
export function findRecord(id) {
  const row = sql(`
    SELECT id, record_number, status_id, coalesce(module_key,''), coalesce(user_id::text,''),
           coalesce(owner_user_id::text,''), company_id, coalesce(document_type_id,''),
           coalesce(deleted_at::text,''), template_id,
           coalesce(jsonb_array_length(form_schema)::text,''), coalesce(template_version::text,''),
           payload::text
      FROM records WHERE id = ${quote(id)}`)
  if (!row) return null
  const c = row.split('|')
  return {
    id: c[0],
    recordNumber: c[1] || null,
    statusId: c[2],
    moduleKey: c[3] || null,
    userId: c[4] || null,
    ownerUserId: c[5] || null,
    companyId: c[6],
    documentTypeId: c[7] || null,
    deletedAt: c[8] || null,
    templateId: c[9],
    formSchemaLength: c[10] === '' ? null : Number(c[10]),
    templateVersion: c[11] === '' ? null : Number(c[11]),
    payload: c[12],
  }
}

/** Records of one template, newest first, RLS bypassed. */
export function recordsForTemplate(templateId, { includeDeleted = false } = {}) {
  const out = sql(`
    SELECT id, coalesce(record_number,''), status_id, coalesce(deleted_at::text,'')
      FROM records
     WHERE template_id = ${quote(templateId)}
       ${includeDeleted ? '' : 'AND deleted_at IS NULL'}
     ORDER BY created_at DESC, record_number DESC`)
  if (!out) return []
  return out.split('\n').map((line) => {
    const [id, recordNumber, statusId, deletedAt] = line.split('|')
    return { id, recordNumber: recordNumber || null, statusId, deletedAt: deletedAt || null }
  })
}

/** The `record_counters` value for a template, or null when no row exists. */
export function counterValue(templateId) {
  return sqlValue(
    `SELECT current_value FROM record_counters WHERE template_id = ${quote(templateId)} AND company_id = ${quote(COMPANY_ID)}`,
  )
}

/**
 * Return a template to its never-used state: no counter row, no records.
 *
 * F-32 lives ONLY on the branch that runs when the counter row does not exist
 * (`SELECT … FOR UPDATE` locks the rows it FINDS, and on a template's first
 * record it finds none). A concurrency probe against a template that already
 * has a counter exercises the UPDATE arm, which was never broken.
 */
export function resetTemplateNumbering(templateId) {
  sql(`
    DELETE FROM analytics_field_values WHERE record_id IN (SELECT id FROM records WHERE template_id = ${quote(templateId)});
    DELETE FROM records WHERE template_id = ${quote(templateId)};
    DELETE FROM record_counters WHERE template_id = ${quote(templateId)} AND company_id = ${quote(COMPANY_ID)};
  `)
}

/** Remove rows this suite created, so re-runs start from the seeded state. */
export function purgeProbeRecords(templateIds) {
  const list = templateIds.map(quote).join(', ')
  sql(`
    DELETE FROM analytics_field_values WHERE record_id IN (SELECT id FROM records WHERE template_id IN (${list}));
    DELETE FROM records WHERE template_id IN (${list});
  `)
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One browser context per storageState, reused across the tests in a file.
 * Same shape as e2e/fixtures/inspectionsLogs.js `createPersonaPool`.
 */
export function createPersonaPool() {
  const pool = new Map()
  return {
    async page(browser, storageState) {
      if (!pool.has(storageState)) {
        const ctx = await browser.newContext({ storageState })
        pool.set(storageState, { ctx, page: await ctx.newPage() })
      }
      return pool.get(storageState).page
    },
    async context(browser, storageState) {
      await this.page(browser, storageState)
      return pool.get(storageState).ctx
    },
    async close() {
      for (const { ctx } of pool.values()) await ctx.close().catch(() => {})
      pool.clear()
    },
  }
}

export function restPost(ctx, path, data) {
  return ctx.request.post(`/api/v1/services${path}`, { data })
}

export function restGet(ctx, path) {
  return ctx.request.get(`/api/v1/services${path}`)
}

export function restDelete(ctx, path) {
  return ctx.request.delete(`/api/v1/services${path}`)
}

export function restPut(ctx, path, data) {
  return ctx.request.put(`/api/v1/services${path}`, { data })
}

/**
 * The message an API error carried.
 *
 * The global handler wraps everything as `{ error: { message, code } }`
 * (utils/response.js sendError) while a few older routes answer a bare
 * `{ message }`. Returning `json.error` unconditionally hands back an OBJECT
 * for the common case, and `expect(...).toMatch()` then fails with "received
 * value must be a string" instead of the assertion under test.
 *
 * MUST be awaited BEFORE the context that made the request is closed.
 */
export async function errorMessage(res) {
  const body = await res.text()
  try {
    const json = JSON.parse(body)
    return json?.error?.message ?? json?.message ?? json?.error ?? body
  } catch {
    return body
  }
}

/** A per-run marker, so a second run of a file never matches the first's rows. */
export function uniqueTag(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`
}
