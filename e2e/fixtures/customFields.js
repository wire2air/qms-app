// Fixtures for the Custom Fields & Lookups journeys (`e2e/customFields/`).
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE SEEDS ITS OWN CAST
//
// `database/e2e-seed.sql` has ZERO fixtures for this module — no option sets, no
// entity field sets, and no persona holding `custom_fields:manage` or any
// `option_sets:*` grant. Measured on `app-db` 2026-09-01: of the 30 seeded
// E2ELAB personas, none holds a grant in either module. So the two permissions
// the module's own tables are gated on could only ever be probed through the
// owner bypass, which proves the bypass works and says nothing about the gate.
//
// This file therefore creates three throwaway personas whose ONLY purpose is to
// be one grant apart from each other:
//
//   cfSchemaAdmin    custom_fields:manage                       — and nothing else
//   optionEditor     option_sets read/create/update             — NOT delete
//   optionDestroyer  option_sets read/create/update/delete
//
// `optionEditor` is a deliberate replica of the seeded **Quality Manager** role
// on `app-db`, which holds `option_sets` create/read/update and not `delete` —
// the role the L-1 fix's behaviour change actually lands on. It exists so that
// change is pinned by a test rather than discovered in production.
//
// They are DB-probe personas only: none has a storage state in `AUTH`, because
// every assertion they carry is at the RLS/trigger layer, which is reached
// through `sqlAsAppUser`, not a browser.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHICH PATH THE ASSERTIONS GO THROUGH, AND WHY IT MATTERS HERE
//
// The frontend reaches all three of this module's tables over the
// GraphQL/syncEngine path, which connects as the untrusted `app_user` DB role —
// so RLS is what governs it, and `sqlAsAppUser` is the only way a test can ask
// the policy directly. REST connects as the superuser and bypasses RLS unless
// `REST_RLS_ENABLED=true` (off by default), so a REST probe would be answering
// a different question.
//
// The one place that distinction is load-bearing rather than pedantic is L-4's
// CHECK constraint, which was chosen over a policy precisely BECAUSE it also
// holds on the superuser path — so `cf4` probes it with the plain `sql()`
// superuser helper on purpose, and says so.
import { expect } from '@playwright/test'
import { COMPANY_ID, USERS } from './cast.js'
import { sql, sqlValue, sqlAsAppUser, waitForSqlValue } from './db.js'

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

// ─────────────────────────────────────────────────────────────────────────────
// The eight registered entity types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The registry, restated — `services/customFields/entityRegistry.js` in the
 * backend repo, which this repo cannot import across the git-repo boundary.
 *
 * The backend already holds itself to this list from three directions
 * (`tests/services/customFieldsEntityRegistry.test.js` parses the migration and
 * `rls.sql` as text and fails on drift in either), and `src/utils/customFieldEntities.js`
 * carries the frontend's own pinned copy. This is a FOURTH restatement and it is
 * deliberately not trusted: `cf4` reads the live CHECK constraint and the live
 * policy out of the catalog and compares BOTH to this list, so a drift here
 * fails loudly instead of quietly weakening the probes built on it.
 */
export const CUSTOM_FIELD_ENTITY_TYPES = Object.freeze([
  'Nonconformance',
  'Capa',
  'ChangeRequest',
  'AuditInstance',
  'Document',
  'Training',
  'CustomerComplaint',
  'Complaint',
])

/**
 * `entity_type` → the authz module whose grants gate that row, as the L-2
 * policies encode it. Editing an NC's custom fields IS editing the NC, so the
 * gate follows the HOST record's module and not `custom_fields`.
 */
export const HOST_MODULE_BY_ENTITY_TYPE = Object.freeze({
  Nonconformance: 'ncr',
  Capa: 'capa',
  ChangeRequest: 'change_control',
  AuditInstance: 'audit_management',
  Document: 'document_control',
  Training: 'training',
  CustomerComplaint: 'complaint_management',
  Complaint: 'complaints',
})

// ─────────────────────────────────────────────────────────────────────────────
// The fixture cast
// ─────────────────────────────────────────────────────────────────────────────

export const CF_ROLES = Object.freeze({
  schemaAdmin: {
    id: 'e2ecf300-0000-4000-8000-000000000001',
    name: 'E2E CF Schema Admin',
    description: 'custom_fields:manage ONLY — the schema-authoring half of the module',
    grants: ['custom_fields:manage'],
  },
  optionEditor: {
    id: 'e2ecf300-0000-4000-8000-000000000002',
    name: 'E2E CF Option Editor',
    description: 'option_sets read/create/update, NOT delete — mirrors seeded Quality Manager',
    grants: ['option_sets:read', 'option_sets:create', 'option_sets:update'],
  },
  optionDestroyer: {
    id: 'e2ecf300-0000-4000-8000-000000000003',
    name: 'E2E CF Option Destroyer',
    description: 'option_sets read/create/update/delete',
    grants: ['option_sets:read', 'option_sets:create', 'option_sets:update', 'option_sets:delete'],
  },
})

export const CF_USERS = Object.freeze({
  cfSchemaAdmin: {
    id: 'e2ecf400-0000-4000-8000-000000000001',
    email: 'cfschema@e2e.test',
    first: 'Cass',
    last: 'SchemaAdmin',
    title: 'Custom Fields Admin',
    color: '#0f766e',
    role: CF_ROLES.schemaAdmin,
    assignmentId: 'e2ecf500-0000-4000-8000-000000000001',
  },
  optionEditor: {
    id: 'e2ecf400-0000-4000-8000-000000000002',
    email: 'cfoptedit@e2e.test',
    first: 'Otto',
    last: 'OptionEditor',
    title: 'Option Set Editor',
    color: '#7c2d12',
    role: CF_ROLES.optionEditor,
    assignmentId: 'e2ecf500-0000-4000-8000-000000000002',
  },
  optionDestroyer: {
    id: 'e2ecf400-0000-4000-8000-000000000003',
    email: 'cfoptdel@e2e.test',
    first: 'Dana',
    last: 'OptionDestroyer',
    title: 'Option Set Destroyer',
    color: '#4c1d95',
    role: CF_ROLES.optionDestroyer,
    assignmentId: 'e2ecf500-0000-4000-8000-000000000003',
  },
})

// Same argon2 hash every seeded E2E account uses (password `12345678`). These
// personas never log in, but `users.password` is what an accidental UI probe
// would need and leaving it NULL would make that failure unreadable.
const PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$0G1ro9Aqx/gzbRQGaUK0uQ$qd3LbNumQRq0B+fhX8NNny73S4pfNCPcWFS/81KSue4'

const PRIMARY_SITE = 'e2e51000-0000-4000-8000-000000000001'
const QUALITY_DEPT = 'e2e7d000-0000-4000-8000-000000000001'

/**
 * Create (idempotently) the three probe personas and their grants.
 *
 * Everything is `ON CONFLICT DO NOTHING` on a fixed id, so a re-run is a no-op
 * and two suites racing on it cannot duplicate rows. Wrapped in one transaction
 * so a half-built persona — a user with a role but no grants — can never be
 * observed by a concurrently-running suite; that shape would read as "the gate
 * denied them" and pass a security probe for the wrong reason.
 */
export function installCustomFieldPersonas() {
  const roleRows = Object.values(CF_ROLES)
    .map((r) => `(${q(r.id)}, ${q(COMPANY_ID)}, ${q(r.name)}, ${q(r.description)}, 'ACTIVE', NOW(), NOW())`)
    .join(',\n    ')

  const userRows = Object.values(CF_USERS)
    .map(
      (u) =>
        `(${q(u.id)}, ${q(u.first)}, ${q(u.last)}, ${q(u.email)}, 'ACTIVE', ${q(COMPANY_ID)}, ${q(u.title)}, 'en', 'America/New_York', ${q(PRIMARY_SITE)}, ${q(QUALITY_DEPT)}, 'INTERNAL', true, ${q(PASSWORD_HASH)}, ${q(u.color)}, false, NOW(), NOW())`,
    )
    .join(',\n    ')

  const assignmentRows = Object.values(CF_USERS)
    .map((u) => `(${q(u.assignmentId)}, ${q(u.id)}, ${q(u.role.id)}, ${q(COMPANY_ID)}, NOW(), NOW())`)
    .join(',\n    ')

  const grantStatements = Object.values(CF_ROLES)
    .map(
      (r) => `INSERT INTO authz.role_module_permissions (company_id, role_id, module_id, action_id, scope_id, granted_by)
  SELECT ${q(COMPANY_ID)}, ${q(r.id)}, ma.module_id, ma.action_id, 'tenant', NULL
  FROM authz.module_actions ma
  WHERE ma.module_id || ':' || ma.action_id IN (${r.grants.map(q).join(', ')})
  ON CONFLICT (company_id, role_id, module_id, action_id) DO NOTHING;`,
    )
    .join('\n')

  // No explicit BEGIN: `sql()` sends the whole script as ONE psql `-c`, which
  // Postgres executes as a single implicit transaction — so the all-or-nothing
  // property the comment above depends on is already there, and an explicit
  // BEGIN inside `-c` only earns a "there is already a transaction in progress"
  // warning.
  sql(`
    INSERT INTO roles (id, company_id, name, description, status_id, created_at, updated_at) VALUES
    ${roleRows}
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO users (id, first_name, last_name, email, user_status_id, company_id, job_title,
                       language_id, time_zone, site_id, department_id, kind, invite_sent, password,
                       color, is_owner, created_at, updated_at) VALUES
    ${userRows}
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO roles_on_users (id, user_id, role_id, company_id, created_at, updated_at) VALUES
    ${assignmentRows}
    ON CONFLICT (id) DO NOTHING;

    ${grantStatements}
  `)

  // The grants are the whole point of these personas, so prove they landed
  // rather than trusting an ON CONFLICT that may have skipped a partial row
  // left by an interrupted earlier run.
  for (const role of Object.values(CF_ROLES)) {
    const got = Number(
      sqlValue(
        `SELECT count(*) FROM authz.role_module_permissions
          WHERE company_id = ${q(COMPANY_ID)} AND role_id = ${q(role.id)}`,
      ),
    )
    expect(got, `${role.name} carries its ${role.grants.length} grants`).toBe(role.grants.length)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema (entity_field_sets) — the ADMIN-AUTHORED half
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠ BLAST RADIUS. `entity_field_sets` is keyed `(company_id, entity_type)`, so
 * there is exactly ONE schema per entity type per tenant and seeding it makes
 * the "Additional information" card appear on EVERY record of that type in the
 * shared E2E tenant — the NC create form included.
 *
 * Two consequences the browser specs are built around:
 *   1. Every seeded field is OPTIONAL (`required: false`). A required custom
 *      field would block `NonconformancesCreate`'s submit for every other
 *      suite raising an NC concurrently.
 *   2. `clearNcSchema()` runs in `afterAll`, and it DELETES the row rather than
 *      emptying it, because the E2ELAB tenant genuinely has zero
 *      `entity_field_sets` rows (measured 2026-09-01) — an empty-schema row is
 *      not the state we found.
 */
export function seedSchema(entityType, schema) {
  sql(`
    INSERT INTO entity_field_sets (id, company_id, entity_type, schema, created_by, created_at, updated_at)
    VALUES (gen_random_uuid(), ${q(COMPANY_ID)}, ${q(entityType)}, ${q(JSON.stringify(schema))}::jsonb,
            ${q(USERS.owner.id)}, NOW(), NOW())
    ON CONFLICT (company_id, entity_type)
    DO UPDATE SET schema = EXCLUDED.schema, deleted_at = NULL, updated_at = NOW()
  `)
  return sqlValue(
    `SELECT id FROM entity_field_sets WHERE company_id = ${q(COMPANY_ID)} AND entity_type = ${q(entityType)}`,
  )
}

/** Remove a seeded schema entirely — see the blast-radius note on `seedSchema`. */
export function clearSchema(entityType) {
  sql(
    `DELETE FROM entity_field_sets WHERE company_id = ${q(COMPANY_ID)} AND entity_type = ${q(entityType)}`,
  )
}

/** The live schema array for an entity type, or `null` when no row exists. */
export function schemaFor(entityType) {
  const raw = sqlValue(
    `SELECT schema::text FROM entity_field_sets
      WHERE company_id = ${q(COMPANY_ID)} AND entity_type = ${q(entityType)} AND deleted_at IS NULL`,
  )
  return raw ? JSON.parse(raw) : null
}

// ─────────────────────────────────────────────────────────────────────────────
// Option sets
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seed an option set.
 *
 * `options` is a **JSON string array**, which is the only shape the product's
 * own authoring page writes: `OptionSetsPageId.vue` pushes `''` and binds
 * `v-model="optionSet.options[idx]"`, and both seeders (`seeder-local.sql`,
 * `bootstrapCompanyDefaults.seedOptionSets`) store string arrays. The readers
 * (`OptionSetSelect`, `freezeOptionLabels.resolveLabel`,
 * `FormSchemaReadonlyView.resolveOptionLabel`) additionally accept
 * `{id,name}` / `{value,label}` objects, but nothing in the product writes
 * those — see the finding recorded in `cf7`.
 */
export function seedOptionSet({ name, options, description = 'E2E custom-fields probe' }) {
  const id = sqlValue(
    `INSERT INTO option_sets (id, company_id, name, description, options, created_at, updated_at)
     VALUES (gen_random_uuid(), ${q(COMPANY_ID)}, ${q(name)}, ${q(description)},
             ${q(JSON.stringify(options))}::jsonb, NOW(), NOW())
     RETURNING id`,
  )
  return id
}

/** Rename one option in place — exactly what the detail page's inline edit does. */
export function renameOption(optionSetId, from, to) {
  const before = optionsOf(optionSetId)
  expect(before, `the option "${from}" is there to rename`).toContain(from)
  sql(
    `UPDATE option_sets
        SET options = ${q(JSON.stringify(before.map((o) => (o === from ? to : o))))}::jsonb,
            updated_at = NOW()
      WHERE id = ${q(optionSetId)}`,
  )
}

export function optionsOf(optionSetId) {
  const raw = sqlValue(`SELECT options::text FROM option_sets WHERE id = ${q(optionSetId)}`)
  return raw ? JSON.parse(raw) : null
}

export function removeOptionSet(optionSetId) {
  sql(`DELETE FROM option_sets WHERE id = ${q(optionSetId)}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Values (entity_field_values) — the PER-RECORD ANSWERS half
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A throwaway answers row for `entityType`, with a synthetic `entity_id`.
 *
 * `entity_id` is polymorphic with **no** foreign key by design, so a random
 * uuid is a legitimate row — and it is the right choice here: the table's
 * unique key is `(company_id, entity_type, entity_id)`, so pointing probes at
 * real host records would collide with the 2,239 rows the tenant already holds
 * and would leave DELETE probes destroying real data.
 */
export function seedValueRow(entityType, { payload = {}, formSchema = [] } = {}) {
  return sqlValue(
    `INSERT INTO entity_field_values (id, company_id, entity_type, entity_id, payload, form_schema, created_at, updated_at)
     VALUES (gen_random_uuid(), ${q(COMPANY_ID)}, ${q(entityType)}, gen_random_uuid(),
             ${q(JSON.stringify(payload))}::jsonb, ${q(JSON.stringify(formSchema))}::jsonb, NOW(), NOW())
     RETURNING id`,
  )
}

export function removeValueRows(ids) {
  const list = ids.filter(Boolean)
  if (!list.length) return
  sql(`DELETE FROM entity_field_values WHERE id IN (${list.map(q).join(',')})`)
}

/**
 * The `created_at <= …` clause that makes a count STABLE on a shared tenant.
 *
 * Three agents run Playwright against this one E2E company at once, and other
 * suites create and delete host records (and therefore answer rows) while this
 * one is running. An assertion of the form
 * `valueRowsVisibleTo(x) === valueRowsInTable()` reads the table TWICE, and a
 * concurrent insert between the two reads fails it for a reason that has
 * nothing to do with the policy — which is how a whole run of CF-1 failed once
 * while the `records` suite was mid-run.
 *
 * Passing a `before` timestamp captured in `beforeAll` freezes both sides of
 * every comparison onto the same set of rows. Omit it when the test is
 * deliberately counting a row it just created.
 */
function beforeClause(before) {
  return before ? ` AND created_at <= ${q(before)}` : ''
}

/** Ground truth, RLS bypassed: how many answer rows of this type the tenant holds. */
export function valueRowsInTable(entityType, { before = null } = {}) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM entity_field_values
        WHERE company_id = ${q(COMPANY_ID)} AND entity_type = ${q(entityType)}${beforeClause(before)}`,
    ),
  )
}

/** The answers row for one host record, parsed, or `null`. */
export function valueRowFor(entityType, entityId) {
  const raw = sqlValue(
    `SELECT payload::text || E'\\x1f' || form_schema::text || E'\\x1f' || id
       FROM entity_field_values
      WHERE company_id = ${q(COMPANY_ID)} AND entity_type = ${q(entityType)} AND entity_id = ${q(entityId)}`,
  )
  if (!raw) return null
  const [payload, formSchema, id] = raw.split('\x1f')
  return { id, payload: JSON.parse(payload), formSchema: JSON.parse(formSchema) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading the policies' verdicts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The `RESULT=` marker exists because `sqlAsAppUser`'s own session setup emits
 * rows — three `SELECT set_config(...)` statements each print their value — so
 * output is several lines and a bare `count(*)` would have to be located by
 * position. Marking it makes the parse independent of how many lines precede it.
 */
function markedCount(res, what) {
  expect(res.ok, `${what} ran (stderr: ${res.error})`).toBeTruthy()
  const m = /RESULT=(\d+)/.exec(res.output)
  expect(m, `${what} returned a count (output: ${res.output})`).not.toBeNull()
  return Number(m[1])
}

/**
 * How many answer rows of `entityType` `entity_field_value_select_rls` releases
 * to this user. Pass the same `before` as `valueRowsInTable` whenever the two
 * are compared — see `beforeClause`.
 */
export function valueRowsVisibleTo(userId, entityType, { before = null } = {}) {
  return markedCount(
    sqlAsAppUser(
      `SELECT 'RESULT=' || count(*) FROM entity_field_values
        WHERE company_id = ${q(COMPANY_ID)} AND entity_type = ${q(entityType)}${beforeClause(before)};`,
      { userId, companyId: COMPANY_ID },
    ),
    `SELECT probe (${entityType})`,
  )
}

/** How many schema rows `entity_field_set_select_rls` releases to this user. */
export function schemaRowsVisibleTo(userId) {
  return markedCount(
    sqlAsAppUser(
      `SELECT 'RESULT=' || count(*) FROM entity_field_sets WHERE company_id = ${q(COMPANY_ID)};`,
      { userId, companyId: COMPANY_ID },
    ),
    'entity_field_sets SELECT probe',
  )
}

/** `authz.has_permission`, evaluated exactly as the policies evaluate it. */
export function hasPermission(userId, moduleId, action) {
  const res = sqlAsAppUser(
    `SELECT 'RESULT=' || authz.has_permission(${q(moduleId)}, ${q(action)})::text;`,
    { userId, companyId: COMPANY_ID },
  )
  expect(res.ok, `permission probe ran (stderr: ${res.error})`).toBeTruthy()
  const m = /RESULT=(true|false)/.exec(res.output)
  expect(m, `permission probe returned a boolean (output: ${res.output})`).not.toBeNull()
  return m[1] === 'true'
}

/**
 * How many rows a write statement actually touched, read off psql's command tag.
 *
 * THE reason every probe in this suite is two-sided. `sqlAsAppUser` reports
 * `ok: false` only when the statement RAISED; an UPDATE or DELETE that RLS
 * filtered out raises NOTHING — it succeeds against zero rows. Without reading
 * the tag, "the database refused you" and "the database could not see the row"
 * are indistinguishable, and a probe that only checked `ok` reads a silent
 * no-op as a passing guard.
 *
 * Sharper still on THIS table: Postgres applies the SELECT policy to the rows an
 * `UPDATE … WHERE` reads, so a persona with no host-module grant is filtered out
 * before the UPDATE policy is ever consulted. Such a probe returns 0 whether the
 * UPDATE policy exists or not — it would have passed against the L-2 defect and
 * proved nothing. That is why every zero below is paired with a persona one
 * grant further up the ladder, on the SAME row, in the same run.
 *
 * Returns `null` when the statement raised (use `deniedByPolicy` for that case).
 */
export function affectedRows(res, verb = 'UPDATE') {
  if (!res.ok) return null
  const tag = (res.output || '').trim().split('\n').pop() || ''
  // INSERT's tag is `INSERT <oid> <count>`; UPDATE/DELETE are `<VERB> <count>`.
  const m = tag.match(verb === 'INSERT' ? /^INSERT \d+ (\d+)$/ : new RegExp(`^${verb} (\\d+)$`))
  return m ? Number(m[1]) : null
}

/**
 * Did the statement RAISE a WITH CHECK / policy refusal (as opposed to being
 * silently filtered to zero rows)?
 *
 * INSERT is the one verb on these tables that fails loudly: there is no
 * pre-existing row for the SELECT policy to hide, so the INSERT policy's
 * WITH CHECK is always reached and a refusal surfaces as SQLSTATE 42501,
 * `new row violates row-level security policy`.
 */
export function deniedByPolicy(res) {
  return !res.ok && /violates row-level security policy/i.test(res.error)
}

/**
 * The raised error text, trimmed to the ERROR line — for asserting a trigger's
 * message.
 *
 * Returns `''` rather than `null` when nothing raised, so a caller's
 * `toMatch(/…/)` fails on the assertion under test instead of on
 * "received value must be a string".
 */
export function errorLine(res) {
  const match = /ERROR:\s*([^\n]*)/.exec(res.error || '')
  return match ? match[1] : ''
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit trail
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `audit_logs.entity_type` for this module's tables — PLURAL PascalCase, which
 * is `handleDefault`'s `toPascalCase(table)` without singularization.
 *
 * ⚠ THE HARDENING DOC'S L-6 IS A MIS-DIAGNOSIS, and this constant is where that
 * is pinned rather than repeated. `22-hardening-2026-09-01.md` §L-6 records the
 * plural as an OPEN platform-wide break — "128 distinct plural entity_type
 * values across audit_logs have no vocabulary row", the module's own rows
 * unreachable through the trail UI's entity filter.
 *
 * That reading checked `public.audit_entity_types` only and missed
 * `public.audit_entity_type_aliases`, the bridge that exists precisely because
 * the trigger writes the plural and the vocabulary is keyed on the singular.
 * Measured live on `app-db` 2026-09-01:
 *
 *   alias              canonical         table                module_id      label
 *   EntityFieldValues  EntityFieldValue  entity_field_values  custom_fields  Custom Field Value
 *   EntityFieldSets    EntityFieldSet    entity_field_sets    custom_fields  Custom Field Set
 *   OptionSets         OptionSet         option_sets          option_sets    Option Set
 *
 * — all three resolve, and across the WHOLE trail only two `entity_type` values
 * fail to resolve, both of them E2E artifacts (`e2emod`, `e2emodb`). Migration
 * `20260902400000-audit-entity-type-orphans.js` says the same thing in its
 * header, names this review as the source of the mis-diagnosis, and closes the
 * thirteen types that were genuinely orphaned (none of them this module's).
 *
 * So the plural is CORRECT-AS-DESIGNED, not a defect, and `cf6` asserts the
 * whole resolution chain rather than the string alone — because the string on
 * its own is exactly what made the finding look like a break.
 */
export const AUDIT_ENTITY_TYPES = Object.freeze({
  values: 'EntityFieldValues',
  sets: 'EntityFieldSets',
  optionSets: 'OptionSets',
})

/** Database `now()`, for scoping an audit probe to rows this run produced. */
export function dbNow() {
  return sqlValue('SELECT now()')
}

/**
 * Wait for the worker to land an audit row.
 *
 * The trigger only ENQUEUES; `graphile_worker` writes `audit_logs`. A
 * single-shot query straight after the DML races that hop and reads as "not
 * audited" — which is exactly the false negative this journey exists to
 * distinguish from L-3's real one.
 */
export async function waitForAuditRow({ entityType, entityId, action, since }) {
  const clauses = [`entity_type = ${q(entityType)}`, `entity_id = ${q(entityId)}`]
  if (action) clauses.push(`action = ${q(action)}`)
  if (since) clauses.push(`created_at > ${q(since)}`)
  await waitForSqlValue(
    `SELECT count(*) FROM audit_logs WHERE ${clauses.join(' AND ')}`,
    { timeoutMs: 90_000, label: `audit row ${action ?? 'any'} ${entityType}/${entityId}` },
  )
  return auditRows({ entityType, entityId, action, since })
}

/** Every audit row matching the filter, newest first. */
export function auditRows({ entityType, entityId, action = null, since = null }) {
  const clauses = [`entity_type = ${q(entityType)}`, `entity_id = ${q(entityId)}`]
  if (action) clauses.push(`action = ${q(action)}`)
  if (since) clauses.push(`created_at > ${q(since)}`)
  const out = sql(
    `SELECT action || E'\\x1f' || coalesce(performed_by::text, '') || E'\\x1f'
            || coalesce(old_value_json::text, 'null') || E'\\x1f' || coalesce(new_value_json::text, 'null')
       FROM audit_logs WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [action_, performedBy, oldJson, newJson] = line.split('\x1f')
    return {
      action: action_,
      performedBy: performedBy || null,
      oldValue: JSON.parse(oldJson),
      newValue: JSON.parse(newJson),
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// The host record the browser journeys hang off
// ─────────────────────────────────────────────────────────────────────────────

export const CARD_TITLE = 'Additional information'

/**
 * An NC that `author` may edit — owner of the record, `ncr:update`, and not
 * CLOSED/CANCELLED, which is exactly `NonconformancesPageId`'s `isEditable`.
 *
 * Prefers one the tenant already holds and raises a fresh one only when there is
 * none. Raising an NC drives the full create wizard (~30–45 s) and, once this
 * suite has seeded a schema, drives `CustomFieldsCreateSection` too — so the
 * fallback is genuinely a fallback, taken on a freshly reset database, and the
 * caller is expected to invoke it BEFORE seeding a schema.
 */
export async function resolveEditableNc(page, raiseNc, uniqueTitle) {
  const existing = sqlValue(
    `SELECT id FROM nonconformances
      WHERE company_id = ${q(COMPANY_ID)} AND owner_id = ${q(USERS.author.id)}
        AND status_id NOT IN ('CLOSED','CANCELLED') AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
  )
  if (existing) return existing

  const title = uniqueTitle('CF-host')
  await raiseNc(page, title)
  const id = sqlValue(
    `SELECT id FROM nonconformances WHERE title = ${q(title)} ORDER BY created_at DESC LIMIT 1`,
  )
  expect(id, 'the fallback raise produced an NC').toBeTruthy()
  return id
}

/**
 * Open a host record's detail page in its own browser context.
 *
 * A fresh context per persona is not tidiness — it is required. syncEngine
 * caches every model in a per-company IndexedDB and only pulls rows newer than
 * its last sync, so a reused context can serve a stale `EntityFieldSet` from
 * cache and the card renders yesterday's schema. A new context starts from an
 * empty IDB and bootstraps the whole model set, which is the only way a spec
 * that MUTATES the schema mid-run can trust what it sees.
 */
export async function openNcAs(browser, storageState, ncId) {
  const ctx = await browser.newContext({ storageState })
  const page = await ctx.newPage()
  await page.goto(`/nonconformances/${ncId}`, { waitUntil: 'domcontentloaded' })
  return { ctx, page }
}
