// Forms module fixtures — the published/unpublished/refused states the public
// fill surface has to tell apart, plus the two personas that separate
// `forms_templates` from `form_blocks`.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THESE ROWS ARE BUILT HERE AND NOT IN `database/e2e-seed.sql`
//
// Two reasons, and the first is a property of the fix under test.
//
// 1. THE TOKEN CANNOT BE SEEDED. `enforce_form_template_integrity` mints
//    `public_token` itself and overwrites whatever a caller supplies —
//    deliberately, so that a token can never be chosen and therefore never
//    guessed. A seed file can ask for publication; only the database decides the
//    URL. Every token below is therefore read back at runtime, exactly as
//    `e2e/sites/j4-form-builder-site-field.spec.js` was repaired to do.
//
// 2. THE INTERESTING STATES ARE REACHED, NOT DECLARED. "A token that WAS live
//    and whose form has since been archived" is not a row you can INSERT: the
//    trigger destroys the token on the way out of ACTIVE, so the only way to
//    hold one is to publish, read the token, and then archive. `ensureFormsFixtures()`
//    does exactly that, three times, and hands back the three dead tokens. They
//    are the load-bearing input to the uniform-404 journey — without them that
//    journey degenerates into "a UUID is not 64 hex characters", which the
//    regex in `publicFormShare.js` answers before the database is ever asked.
//
// The E2E seed has NO `forms_templates` or `form_blocks` grant anywhere in it
// (grepped: zero hits), so the F-04 probe has no persona to run as either. The
// two users below exist only to be `app.current_user_id` in an RLS probe; they
// carry no password and never log in, which is honest about what is being
// measured — a policy decision, at the policy layer.
//
// ─────────────────────────────────────────────────────────────────────────────
// MEASURED ON `app-db`, 2026-09-01, and the numbers the specs assert come from
// here rather than from reading the migration:
//
//   form_templates_upd  →  (company_id = …) AND (kind = 'FORM') AND (owner OR
//                          has_permission('forms_templates','update') AND …)
//   form_templates_blk_upd → the same shape with kind = 'BLOCK' and
//                          `form_blocks`, and NO owner arm.
//
//   persona          ft:update  fb:update   UPDATE a FORM   UPDATE a BLOCK
//   formsDesigner      true       false           1               0
//   blockDesigner      false      true            0               1
//
//   SELECT, both personas: 12 forms AND 2 blocks. Reads are NOT narrowed —
//   `form_templates_sel` is tenancy-only and admits blocks to everyone. That is
//   a documented open item (rls.sql, and 11-security-review), not an oversight
//   of this fixture, and f4 pins it as such.
//
// `authz.module_actions` for BOTH modules is exactly {create, update, delete} —
// there is no `read` action, which is why no policy here can gate on one
// without hitting `has_permission`'s read-fallback.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { request } from '@playwright/test'
import { sql, sqlValue } from './db.js'
import { ALT_COMPANY_ID, COMPANY_ID } from './cast.js'

// ── The API origin ──────────────────────────────────────────────────────────
// The public endpoints are probed DIRECTLY, not through the Vite proxy, for two
// reasons: one journey has to send a hostile `Host:` header (the pack's own
// F-01 probe did, and the answer must now be "the header is not a signal"), and
// the proxy would rewrite it. Derived from the app's own
// `VITE_PROXY_API_TARGET` so the two cannot drift — the same trick cast.js uses
// for VITE_DEV_PORT.
function apiBase() {
  if (process.env.E2E_API_URL) return process.env.E2E_API_URL.replace(/\/+$/, '')
  const here = path.dirname(fileURLToPath(import.meta.url))
  for (const f of ['.env.local', '.env']) {
    try {
      const m = fs
        .readFileSync(path.resolve(here, '../..', f), 'utf8')
        .match(/^VITE_PROXY_API_TARGET=(\S+)/m)
      if (m) return m[1].replace(/\/+$/, '')
    } catch {
      // file may not exist — fall through
    }
  }
  return 'http://localhost:4000'
}
export const API_BASE = apiBase()

export const PUBLIC_TEMPLATE_PATH = '/v1/services/public/formTemplates'
export const PUBLIC_RECORD_PATH = '/v1/services/public/records'

// The one message every refusal carries. Asserted as a constant so a change to
// it fails ONE assertion with a name, instead of six comparisons that quietly
// agree with each other on a new string.
export const REFUSAL = { status: 404, message: 'Form not found' }

export const FORMS_PERSONAS = {
  // forms_templates create/update/delete at tenant scope. NO form_blocks grant.
  formsDesigner: {
    id: 'e2e10000-0000-4000-8000-0000000000f1',
    roleId: 'e2e30000-0000-4000-8000-0000000000f1',
    name: 'Fiona FormDesigner',
  },
  // The mirror image, and the half that makes the first one evidence.
  blockDesigner: {
    id: 'e2e10000-0000-4000-8000-0000000000f2',
    roleId: 'e2e30000-0000-4000-8000-0000000000f2',
    name: 'Bruno BlockDesigner',
  },
}

/**
 * The template fixtures. Each exists to be REFUSED in a particular way, or to be
 * the control that proves the refusal was about the state and not about the
 * endpoint being broken.
 */
export const FORMS = {
  /** ACTIVE + published. The live capability every other row is compared to. */
  published: {
    id: 'e2e60000-0000-4000-8000-0000000000f1',
    code: 'E2EPUB',
    title: 'E2E Forms Probe — Published',
    fields: { fullName: 'Full Name', feedback: 'Feedback' },
  },
  /** ACTIVE, never published. The state `is_public` was introduced to create. */
  unpublished: { id: 'e2e60000-0000-4000-8000-0000000000f2', code: 'E2EUNPUB' },
  /** Published, token captured, then walked back to DRAFT via ARCHIVED. */
  drafted: { id: 'e2e60000-0000-4000-8000-0000000000f3', code: 'E2EDRAFT' },
  /** Published, token captured, then archived. */
  archived: { id: 'e2e60000-0000-4000-8000-0000000000f4', code: 'E2EARCH' },
  /** A BLOCK. Cannot be published at all — the trigger refuses with QMSFT. */
  block: { id: 'e2e60000-0000-4000-8000-0000000000f5', code: 'E2EBLOCK' },
  /** DRAFT + soft-deleted. See the note on `softDelete` below: this is the ONLY
   *  shape a deleted template can have, which is itself the finding. */
  softDeleted: { id: 'e2e60000-0000-4000-8000-0000000000f6', code: 'E2EDEL' },
  /** ACTIVE, unpublished — f1 publishes and revokes it through ShareFormDialog. */
  shareDialog: {
    id: 'e2e60000-0000-4000-8000-0000000000f7',
    code: 'E2ESHARE',
    title: 'E2E Forms Probe — Share Dialog',
    fields: { visitorName: 'Visitor Name', visitorNote: 'Visitor Note' },
  },
  /** DRAFT, carries an `internal_name`, so every write-once rule has a subject. */
  structural: {
    id: 'e2e60000-0000-4000-8000-0000000000f8',
    code: 'E2ESTRUCT',
    internalName: 'e2eformsprobe',
  },
  /** ACTIVE FORM used only as the RLS 2×2's FORM cell. */
  rlsForm: { id: 'e2e60000-0000-4000-8000-0000000000f9', code: 'E2ERLSFORM' },
  /** Published, in the OTHER tenant. The token is the tenant binding; this row
   *  is what proves it binds to E2EALT and not to whoever is asking. */
  altPublished: {
    id: 'e2e60000-0000-4000-8000-0000000000fa',
    code: 'E2EALTPUB',
    companyId: ALT_COMPANY_ID,
    fieldLabel: 'Alt Tenant Only Field',
  },
  /** Published, token captured, then explicitly unpublished. */
  revoked: { id: 'e2e60000-0000-4000-8000-0000000000fb', code: 'E2EREVOKED' },
}

const LAB_SITE = 'e2e51000-0000-4000-8000-000000000001'
const LAB_DEPT = 'e2e7d000-0000-4000-8000-000000000001'

const PERSONA_SQL = `
INSERT INTO users (id, first_name, last_name, email, user_status_id, company_id,
   language_id, time_zone, site_id, department_id, kind, invite_sent, is_owner, created_at, updated_at)
VALUES
 ('${FORMS_PERSONAS.formsDesigner.id}','Fiona','FormDesigner','formsdesigner@e2e.test','ACTIVE','${COMPANY_ID}','en','America/New_York','${LAB_SITE}','${LAB_DEPT}','INTERNAL',true,false,NOW(),NOW()),
 ('${FORMS_PERSONAS.blockDesigner.id}','Bruno','BlockDesigner','blockdesigner@e2e.test','ACTIVE','${COMPANY_ID}','en','America/New_York','${LAB_SITE}','${LAB_DEPT}','INTERNAL',true,false,NOW(),NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO roles (id, company_id, name, description, status_id, created_at, updated_at) VALUES
 ('${FORMS_PERSONAS.formsDesigner.roleId}','${COMPANY_ID}','E2E Forms Designer','forms_templates CRUD, NO form_blocks (FORMS F-04 probe)','ACTIVE',NOW(),NOW()),
 ('${FORMS_PERSONAS.blockDesigner.roleId}','${COMPANY_ID}','E2E Block Designer','form_blocks CRUD, NO forms_templates (FORMS F-04 control)','ACTIVE',NOW(),NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO roles_on_users (id, user_id, role_id, company_id, created_at, updated_at) VALUES
 ('e2e31000-0000-4000-8000-0000000000f1','${FORMS_PERSONAS.formsDesigner.id}','${FORMS_PERSONAS.formsDesigner.roleId}','${COMPANY_ID}',NOW(),NOW()),
 ('e2e31000-0000-4000-8000-0000000000f2','${FORMS_PERSONAS.blockDesigner.id}','${FORMS_PERSONAS.blockDesigner.roleId}','${COMPANY_ID}',NOW(),NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO authz.role_module_permissions (company_id, role_id, module_id, action_id, scope_id, granted_by)
SELECT '${COMPANY_ID}','${FORMS_PERSONAS.formsDesigner.roleId}', ma.module_id, ma.action_id, 'tenant', NULL
FROM authz.module_actions ma WHERE ma.module_id = 'forms_templates'
ON CONFLICT (company_id, role_id, module_id, action_id) DO NOTHING;

INSERT INTO authz.role_module_permissions (company_id, role_id, module_id, action_id, scope_id, granted_by)
SELECT '${COMPANY_ID}','${FORMS_PERSONAS.blockDesigner.roleId}', ma.module_id, ma.action_id, 'tenant', NULL
FROM authz.module_actions ma WHERE ma.module_id = 'form_blocks'
ON CONFLICT (company_id, role_id, module_id, action_id) DO NOTHING;
`

// NOTE what the ON CONFLICT clause deliberately does NOT touch:
//   version        — the trigger refuses a decrease, and a probe that bumps it
//                    (f5) would make a second run of the suite fail on the reset
//                    rather than on the assertion.
//   internal_name  — write-once; NULL → value only.
//   is_module      — monotonic.
//   public_token   — server-owned. Naming it here would be the exact mistake the
//                    SyncEngine makes, and the trigger would overwrite it anyway.
const TEMPLATE_SQL = `
INSERT INTO form_templates (id, company_id, title, code, kind, status_id, is_module, internal_name, version, is_public, config, schema, created_at, updated_at) VALUES
 ('${FORMS.published.id}','${COMPANY_ID}','${FORMS.published.title}','${FORMS.published.code}','FORM','ACTIVE',false,NULL,1,true,
  '{"layout":"standard","allowDraft":false,"showHeader":true}',
  '[{"name":"fullName","type":"text","label":"Full Name","required":true},{"name":"feedback","type":"text","label":"Feedback","required":false}]',NOW(),NOW()),
 ('${FORMS.unpublished.id}','${COMPANY_ID}','E2E Forms Probe — Unpublished Active','${FORMS.unpublished.code}','FORM','ACTIVE',false,NULL,1,false,
  '{"layout":"standard"}','[{"name":"secretA","type":"text","label":"Unpublished Only Field","required":false}]',NOW(),NOW()),
 ('${FORMS.drafted.id}','${COMPANY_ID}','E2E Forms Probe — Draft','${FORMS.drafted.code}','FORM','ACTIVE',false,NULL,1,true,
  '{"layout":"standard"}','[{"name":"secretB","type":"text","label":"Draft Only Field","required":false}]',NOW(),NOW()),
 ('${FORMS.archived.id}','${COMPANY_ID}','E2E Forms Probe — Archived','${FORMS.archived.code}','FORM','ACTIVE',false,NULL,1,true,
  '{"layout":"standard"}','[{"name":"secretC","type":"text","label":"Archived Only Field","required":false}]',NOW(),NOW()),
 ('${FORMS.block.id}','${COMPANY_ID}','E2E Forms Probe — Block','${FORMS.block.code}','BLOCK','ACTIVE',false,NULL,1,false,
  '{"layout":"standard"}','[{"name":"blockField","type":"text","label":"Block Only Field","required":false}]',NOW(),NOW()),
 ('${FORMS.softDeleted.id}','${COMPANY_ID}','E2E Forms Probe — Soft Deleted','${FORMS.softDeleted.code}','FORM','DRAFT',false,NULL,1,false,
  '{"layout":"standard"}','[{"name":"secretD","type":"text","label":"Deleted Only Field","required":false}]',NOW(),NOW()),
 ('${FORMS.shareDialog.id}','${COMPANY_ID}','${FORMS.shareDialog.title}','${FORMS.shareDialog.code}','FORM','ACTIVE',false,NULL,1,false,
  '{"layout":"standard","allowDraft":false,"showHeader":true}',
  '[{"name":"visitorName","type":"text","label":"Visitor Name","required":true},{"name":"visitorNote","type":"text","label":"Visitor Note","required":false}]',NOW(),NOW()),
 ('${FORMS.structural.id}','${COMPANY_ID}','E2E Forms Probe — Structural','${FORMS.structural.code}','FORM','DRAFT',false,'${FORMS.structural.internalName}',1,false,
  '{"layout":"standard"}','[{"name":"structField","type":"text","label":"Structural Field","required":false}]',NOW(),NOW()),
 ('${FORMS.rlsForm.id}','${COMPANY_ID}','E2E Forms Probe — RLS Form','${FORMS.rlsForm.code}','FORM','ACTIVE',false,NULL,1,false,
  '{"layout":"standard"}','[{"name":"rlsField","type":"text","label":"RLS Field","required":false}]',NOW(),NOW()),
 ('${FORMS.revoked.id}','${COMPANY_ID}','E2E Forms Probe — Revoked','${FORMS.revoked.code}','FORM','ACTIVE',false,NULL,1,true,
  '{"layout":"standard"}','[{"name":"secretE","type":"text","label":"Revoked Only Field","required":false}]',NOW(),NOW()),
 ('${FORMS.altPublished.id}','${ALT_COMPANY_ID}','E2E Forms Probe — Alt Tenant','${FORMS.altPublished.code}','FORM','ACTIVE',false,NULL,1,true,
  '{"layout":"standard","allowDraft":false,"showHeader":true}',
  '[{"name":"altOnly","type":"text","label":"${FORMS.altPublished.fieldLabel}","required":false}]',NOW(),NOW())
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, schema = EXCLUDED.schema, config = EXCLUDED.config,
  deleted_at = NULL, status_id = EXCLUDED.status_id, is_public = EXCLUDED.is_public,
  updated_at = NOW();
`

let fixtureState = null

/**
 * Build (or rebuild) every fixture and return the three DEAD tokens.
 *
 * Idempotent, and the idempotence is the fiddly part: three of these rows have
 * to be RE-PUBLISHED before they can be re-killed, because the previous run
 * destroyed their tokens. The upsert above puts them back at
 * (ACTIVE, is_public = true) — legal edges in both directions, DRAFT→ACTIVE and
 * ARCHIVED→ACTIVE — the token is read, and then each is walked to its final
 * state by a different route.
 */
export function ensureFormsFixtures() {
  if (fixtureState) return fixtureState

  sql(PERSONA_SQL)
  sql(TEMPLATE_SQL)

  // Read the freshly minted tokens BEFORE the transitions that destroy them.
  const dead = {
    archived: liveToken(FORMS.archived.id),
    drafted: liveToken(FORMS.drafted.id),
    revoked: liveToken(FORMS.revoked.id),
  }
  for (const [name, token] of Object.entries(dead)) {
    if (!/^[0-9a-f]{64}$/.test(token || '')) {
      throw new Error(
        `forms fixture: ${name} did not receive a 64-hex public_token (got ${JSON.stringify(token)}). ` +
          'enforce_form_template_integrity mints it on false→true — check migration 20260902101000 is applied.',
      )
    }
  }

  // ARCHIVED. One legal edge, and the token dies with it.
  sql(`UPDATE form_templates SET status_id = 'ARCHIVED' WHERE id = '${FORMS.archived.id}'`)
  // DRAFT. Two edges, because ACTIVE→DRAFT is the one move the trigger refuses —
  // the route a real user takes is Archive, then Restore-for-rework.
  sql(`UPDATE form_templates SET status_id = 'ARCHIVED' WHERE id = '${FORMS.drafted.id}'`)
  sql(`UPDATE form_templates SET status_id = 'DRAFT' WHERE id = '${FORMS.drafted.id}'`)
  // Explicit revocation — the form stays ACTIVE and usable, only the link dies.
  sql(`UPDATE form_templates SET is_public = false WHERE id = '${FORMS.revoked.id}'`)
  // Soft delete. Reachable ONLY from DRAFT (form_templates_protect_referenced),
  // which is why this row is not also a published one — see f5.
  sql(`UPDATE form_templates SET deleted_at = NOW() WHERE id = '${FORMS.softDeleted.id}'`)

  fixtureState = { dead }
  return fixtureState
}

/** The live `public_token` of a template, or null. Never cached: revocation is
 *  the behaviour under test and a cached token would hide it. */
export function liveToken(templateId) {
  return sqlValue(`SELECT public_token FROM form_templates WHERE id = '${templateId}'`)
}

/** Publication state as the database holds it. */
export function publicationOf(templateId) {
  const row = sql(
    `SELECT is_public, coalesce(public_token,''), status_id, (deleted_at IS NOT NULL)::text,
            coalesce(public_published_by::text,''), coalesce(public_published_at::text,'')
       FROM form_templates WHERE id = '${templateId}'`,
  )
  if (!row) return null
  const [isPublic, token, statusId, deleted, publishedBy, publishedAt] = row.split('|')
  return {
    isPublic: isPublic === 't',
    token: token || null,
    statusId,
    deleted: deleted === 'true',
    publishedBy: publishedBy || null,
    publishedAt: publishedAt || null,
  }
}

/**
 * How many rows a statement actually touched, read off psql's command tag.
 *
 * `sqlAsAppUser` reports `ok: false` only when the statement RAISED. An UPDATE
 * that RLS filtered out raises nothing — it succeeds against zero rows — so
 * without this, "the database refused you" and "the database could not see the
 * row" are indistinguishable and a silent no-op reads as a passing guard.
 * (Same helper, same reasoning, as e2e/fixtures/inspectionsLogs.js.)
 */
export function affectedRows(res) {
  const tag = (res.output || '').trim().split('\n').pop() || ''
  const m = tag.match(/^(?:UPDATE|INSERT 0|DELETE) (\d+)$/)
  return m ? Number(m[1]) : null
}

/**
 * The SQLSTATE psql printed for a rejected statement, or null.
 *
 * psql does NOT print the code at its default verbosity — the plain output is
 * `ERROR:  A form template cannot change kind…` with the class nowhere in it.
 * `superuserWrite` therefore sets `VERBOSITY verbose`, which prefixes the code:
 * `ERROR:  QMSFT: A form template cannot change kind…`. Without that, a spec
 * asserting the SQLSTATE would compare `null` to `'QMSFT'` and fail on every
 * probe, including the ones the trigger got right.
 */
export function sqlstateOf(res) {
  const err = res.error || ''
  return (
    /^ERROR:\s+([0-9A-Z]{5}):/m.exec(err)?.[1] ??
    /SQLSTATE:?\s*([0-9A-Z]{5})/.exec(err)?.[1] ??
    null
  )
}

/**
 * Run a statement as the superuser and report whether the TRIGGER refused it.
 *
 * The structural guard has no `current_user <> 'app_user'` trust split — that
 * absence is the design decision recorded in migration 20260902101000 — so the
 * superuser connection is the RIGHT place to probe it: it is the connection
 * REST/Sequelize uses, and it is the caller F-06 was about. A guard that let
 * this through would be exempting exactly the path the finding names.
 */
export function superuserWrite(statement) {
  try {
    const output = execFileSync(
      'docker',
      [
        'exec',
        '-i',
        process.env.E2E_PSQL_CONTAINER || 'qms-postgres-1',
        'psql',
        '-U',
        process.env.E2E_PSQL_USER || 'postgres',
        '-d',
        process.env.E2E_PSQL_DB || 'app-db',
        '-v',
        'ON_ERROR_STOP=1',
        '-tA',
      ],
      {
        encoding: 'utf8',
        timeout: 15_000,
        // VERBOSITY verbose is what makes the SQLSTATE readable at all — see
        // sqlstateOf. Set per-invocation rather than via PSQL_EDITOR/PGOPTIONS
        // so the helper carries its own requirement.
        input: `\\set VERBOSITY verbose\n${statement}`,
      },
    )
    return { ok: true, output: output.trim(), error: '' }
  } catch (err) {
    return { ok: false, output: err.stdout ?? '', error: `${err.stderr ?? ''}` }
  }
}

// ── The unauthenticated HTTP surface ────────────────────────────────────────

/**
 * A request context with NO cookies and NO storage state.
 *
 * `request.newContext()` INHERITS the project's `use.storageState`, so the
 * naive call would carry a logged-in session onto the one surface in the
 * product whose entire point is that it has none — and a public journey run
 * while authenticated proves nothing at all. The empty literal is not
 * decoration.
 */
export async function anonymousApi({ baseURL = API_BASE, headers = undefined } = {}) {
  return request.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: headers,
  })
}

/**
 * `API_BASE` with its hostname swapped — a REAL `Host:` header, not one bolted
 * on as an extra header.
 *
 * The difference matters. A hostile-Host probe that Playwright silently drops
 * (Host is one of the headers a fetch stack is entitled to own) would still
 * pass every assertion below, for the wrong reason: it would be measuring the
 * default host three times. Changing the ORIGIN makes the browser stack emit
 * the header itself, and `e2e/fixtures/localhostDns.js` — loaded by
 * playwright.config.js in every worker — points any `*.localhost` name at
 * 127.0.0.1 so the connection still lands on the local API.
 */
export function apiOriginFor(hostname) {
  const url = new URL(API_BASE)
  url.hostname = hostname
  return url.origin
}

/**
 * The public read, with the rate limiter made visible.
 *
 * `publicFormLimiter` is 60 requests / 15 minutes per IP, in EVERY environment,
 * and BOTH public endpoints share the one bucket. Three agents run Playwright
 * against this stack concurrently, so a 429 here is an operational fact about
 * the machine and not a fact about the product — it is turned into an error
 * that says so, because a bare `expect(404).toBe(200)` on a 429 costs an hour.
 */
export async function publicGet(ctx, token) {
  const res = await ctx.get(`${PUBLIC_TEMPLATE_PATH}/${token}`)
  assertNotLimited(res, `GET ${PUBLIC_TEMPLATE_PATH}/${String(token).slice(0, 12)}…`)
  return res
}

export async function publicPost(ctx, body) {
  const res = await ctx.post(PUBLIC_RECORD_PATH, { data: body })
  assertNotLimited(res, `POST ${PUBLIC_RECORD_PATH}`)
  return res
}

function assertNotLimited(res, label) {
  if (res.status() !== 429) return
  throw new Error(
    `${label} was rate-limited (429). publicFormLimiter is 60 requests / 15 min per IP and BOTH ` +
      'public endpoints share the bucket, so a re-run inside the same window — or another agent ' +
      'driving the same stack — exhausts it. This is NOT a product failure. Wait for ' +
      `RateLimit-Reset (${res.headers()['ratelimit-reset'] ?? '?'}s) or raise ` +
      'PUBLIC_FORM_RATE_LIMIT_MAX in qms/.env and restart the API.',
  )
}

/**
 * The refusal, reduced to what a caller can actually distinguish.
 *
 * Every response carries `meta.timestamp` and `meta.requestId`, so raw bodies
 * are never equal and comparing them would assert nothing. What must be
 * identical across refusals is the pair below — plus the content type, which is
 * returned so the caller can fold it into the same comparison.
 */
export async function refusalShape(res) {
  let body = null
  try {
    body = await res.json()
  } catch {
    body = { unparseable: await res.text() }
  }
  return JSON.stringify({
    status: res.status(),
    message: body?.error?.message ?? body?.message ?? null,
    keys: Object.keys(body ?? {}).sort(),
    contentType: (res.headers()['content-type'] || '').split(';')[0],
  })
}

/** Records written against a template, newest first. */
export function recordsFor(templateId) {
  const out = sql(
    `SELECT id, company_id, record_number, coalesce(submission_ip,''), coalesce(user_id::text,''), payload::text
       FROM records WHERE template_id = '${templateId}' AND deleted_at IS NULL
       ORDER BY created_at DESC`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    // The payload is JSON written by an anonymous stranger, so it can legally
    // contain a pipe. Split only the five scalar columns off the front and keep
    // the remainder whole — a naive `split('|')` would truncate it and JSON.parse
    // would then throw somewhere that reads as a database problem.
    const parts = line.split('|')
    const [id, companyId, recordNumber, submissionIp, userId] = parts
    const payload = parts.slice(5).join('|')
    return {
      id,
      companyId,
      recordNumber,
      submissionIp: submissionIp || null,
      userId: userId || null,
      payload: JSON.parse(payload),
    }
  })
}

/**
 * The per-template record counter.
 *
 * `createPublicRecord` resolves the token and sanitises the payload BEFORE
 * `insertRecord` takes `SELECT … FOR UPDATE` on this row. So a refused
 * submission must leave the number unchanged — which is the difference between
 * "we said no" and "we said no after doing the work", and the only externally
 * visible evidence that an anonymous caller cannot burn a tenant's sequence.
 */
export function counterFor(templateId) {
  const v = sqlValue(`SELECT current_value FROM record_counters WHERE template_id = '${templateId}'`)
  return v === null ? 0 : Number(v)
}

/** 64 hex characters that name nothing. The baseline every refusal is compared to. */
export function nonexistentToken(seed = 'd') {
  return seed.repeat(64).slice(0, 64)
}
