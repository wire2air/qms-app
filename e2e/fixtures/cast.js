// E2E cast — dedicated test tenant seeded by qms/database/e2e-seed.sql.
// Applied automatically by e2e/fixtures/auth.setup.js. Every user shares the
// same password; signers share the same e-sign PIN.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The dev server can move off 5173 via VITE_DEV_PORT in the app's gitignored
// .env.local (e.g. when another app holds 5173). Mirror that here so the
// suite targets the right port without every run needing E2E_BASE_URL.
function devPort() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  for (const f of ['.env.local', '.env']) {
    try {
      const m = fs
        .readFileSync(path.resolve(here, '../..', f), 'utf8')
        .match(/^VITE_DEV_PORT=(\d+)/m)
      if (m) return m[1]
    } catch {
      // file may not exist — fall through
    }
  }
  return '5173'
}
const DEV_PORT = devPort()

export const BASE_URL = process.env.E2E_BASE_URL || `http://e2elab.localhost:${DEV_PORT}`
export const ALT_BASE_URL = process.env.E2E_ALT_BASE_URL || `http://e2ealt.localhost:${DEV_PORT}`
export const PASSWORD = '12345678'
export const ESIGN_PIN = '12345678'

export const COMPANY_ID = 'e2e00001-0000-4000-8000-000000000001' // E2ELAB
export const ALT_COMPANY_ID = 'e2e00002-0000-4000-8000-000000000002' // E2EALT

export const USERS = {
  // Company Owner — set-effective override, sees everything (isOwner bypass).
  owner: {
    id: 'e2e10000-0000-4000-8000-000000000001',
    email: 'owner@e2e.test',
    name: 'Olivia Owner',
  },
  // Author — document_control:create/read/update.
  author: {
    id: 'e2e10000-0000-4000-8000-000000000002',
    email: 'author@e2e.test',
    name: 'Aaron Author',
  },
  // Reviewer — step-1 (ACTION) assignee via the E2E Reviewer role.
  reviewer: {
    id: 'e2e10000-0000-4000-8000-000000000003',
    email: 'reviewer@e2e.test',
    name: 'Rita Reviewer',
  },
  // Approver — step-2 (APPROVAL, e-sign) assignee via the E2E Approver role.
  approver: {
    id: 'e2e10000-0000-4000-8000-000000000004',
    email: 'approver@e2e.test',
    name: 'Adam Approver',
  },
  // Document Controller — update/delete + templates CRUD.
  controller: {
    id: 'e2e10000-0000-4000-8000-000000000005',
    email: 'controller@e2e.test',
    name: 'Carla Controller',
  },
  // Auditor — read-only.
  auditor: {
    id: 'e2e10000-0000-4000-8000-000000000006',
    email: 'auditor@e2e.test',
    name: 'Ava Auditor',
  },
  // Own-scope author — document_control:* at OWN scope.
  ownAuthor: {
    id: 'e2e10000-0000-4000-8000-000000000007',
    email: 'ownauthor@e2e.test',
    name: 'Owen OwnScope',
  },
  // No-access — no document permissions (denial tests).
  noAccess: {
    id: 'e2e10000-0000-4000-8000-000000000008',
    email: 'noaccess@e2e.test',
    name: 'Noah NoAccess',
  },
  // Site Admin — sites:create/read/update/delete at tenant. The only cast
  // member who can create a site; also holds log_books:update, the gate on the
  // sites_on_log_books pivot's (correct) INSERT/DELETE policies.
  siteAdmin: {
    id: 'e2e10000-0000-4000-8000-000000000010',
    email: 'siteadmin@e2e.test',
    name: 'Sam SiteAdmin',
  },
  // Site-scoped sites reader — sites:read at SITE scope and nothing else.
  // Exists to expose the all-NULL `sites` binding: the grant saves, and returns
  // nothing (PW-J10).
  siteReader: {
    id: 'e2e10000-0000-4000-8000-000000000011',
    email: 'sitereader@e2e.test',
    name: 'Sara SiteReader',
  },
  // Site-scoped NCR user — ncr:read/update at SITE scope, starts at Primary
  // Site. Moved to Secondary Site mid-test by PW-J7.
  siteRoamer: {
    id: 'e2e10000-0000-4000-8000-000000000012',
    email: 'siteroamer@e2e.test',
    name: 'Rory SiteRoamer',
  },
  // Department Admin — departments CRUD + quality_events:create. The second
  // grant is what turns the supervisorUserId gap from a NULL column into an
  // observable failure: event creation routes to the department's supervisor.
  deptAdmin: {
    id: 'e2e10000-0000-4000-8000-000000000013',
    email: 'deptadmin@e2e.test',
    name: 'Dana DeptAdmin',
  },
  // Department-scoped reader — departments:read at DEPARTMENT scope only.
  // The `departments` twin of siteReader; both tables share the all-NULL binding.
  deptReader: {
    id: 'e2e10000-0000-4000-8000-000000000014',
    email: 'deptreader@e2e.test',
    name: 'Derek DeptReader',
  },
  // Training Admin — training:* + training_instances:*, AND the manager_id on
  // the seeded training, so the same persona launches and later verifies.
  trainingAdmin: {
    id: 'e2e10000-0000-4000-8000-000000000015',
    email: 'trainadmin@e2e.test',
    name: 'Tara TrainAdmin',
  },
  // Learner — holds NO training grants at all, deliberately. /my-training/:id is
  // the one training surface with no permission guard (RLS self-scope only), so
  // the learner journey has to prove it works for a user who holds nothing.
  learner: {
    id: 'e2e10000-0000-4000-8000-000000000016',
    email: 'learner@e2e.test',
    name: 'Leo Learner',
  },
  // Teams-grant-only — holds `teams:create` and nothing else. Exists to prove a
  // grant that says nothing about people still admits the whole user roster
  // (USER-J4): authz.has_permission matches ANY action on a module when
  // p_action = 'read', and users_sel's extra_read branch asks for
  // has_permission('teams','read'). Lives at the SECONDARY site.
  teamsOnly: {
    id: 'e2e10000-0000-4000-8000-000000000020',
    email: 'teamsonly@e2e.test',
    name: 'Tessa TeamsOnly',
  },
  // Site-scoped user reader — user_management:read at SITE scope. The `users`
  // twin of siteReader/deptReader: the binding is owner/dept/site all-NULL, so
  // the grant saves and matches nothing through the permission branch
  // (USER-J5). Also at the SECONDARY site, so teamsOnly is a same-site row it
  // *should* be able to see — without which J5's positive half would pass for
  // the wrong reason (users_sel admits you to your own row regardless).
  userSiteReader: {
    id: 'e2e10000-0000-4000-8000-000000000021',
    email: 'usersitereader@e2e.test',
    name: 'Ursula UserSiteReader',
  },
  // Read-only auditor — *:read on every audit module, no write action anywhere.
  // The persona PW-J10 needs: Postgres applies the SELECT policy when an UPDATE
  // has to locate its rows, so only a user who can READ a finding can exploit
  // its company-only UPDATE policy. Kept separate from `auditor`, whose zero
  // audit_standards grants are PW-J9's premise.
  auditReader: {
    id: 'e2e10000-0000-4000-8000-000000000022',
    email: 'auditreader@e2e.test',
    name: 'Rhea AuditReader',
  },
  // ── QC Inspection (e2e-seed.sql §22a) ─────────────────────────────────────
  // The split that matters in this module is execute-vs-dispose: the persona
  // that runs an inspection must not be able to close it out.
  // QC Inspector — inspection_qc:read/create/execute, deliberately NO dispose.
  // Also the actor for the raw-GraphQL status probe (finding #1).
  qcInspector: {
    id: 'e2e10000-0000-4000-8000-000000000030',
    email: 'qcinspector@e2e.test',
    name: 'Ivan Inspector',
  },
  // QA Approver — inspection_qc:read/dispose + e-sign PIN. The disposition gate.
  qcApprover: {
    id: 'e2e10000-0000-4000-8000-000000000031',
    email: 'qcapprover@e2e.test',
    name: 'Quinn QaApprover',
  },
  // QC Author — inspection_spec:write + inspection_plan:* + inspection_templates:write.
  // Note the module names: spec/plan authoring is NOT under inspection_qc.
  qcAuthor: {
    id: 'e2e10000-0000-4000-8000-000000000032',
    email: 'qcauthor@e2e.test',
    name: 'Quincy QcAuthor',
  },
  // Retain custodian — retain_samples:* and NOTHING else. Finding #18's persona:
  // the sidebar shows them Retain Samples, permissionGuard.js bounces them off
  // the /qc-inspection list route. Seeded to keep that reproducible.
  retainCustodian: {
    id: 'e2e10000-0000-4000-8000-000000000033',
    email: 'retaincustodian@e2e.test',
    name: 'Rhea RetainCustodian',
  },
  // Quality Events moderator — quality_events read/update/close/create at tenant
  // scope (e2e-seed.sql §28b). Nothing in the cast held `quality_events:update`
  // before this, which is why the module had no way to exercise its own
  // moderation or close paths. `read` is granted explicitly alongside `update`:
  // has_permission(module,'read') is satisfied by ANY grant on the module, but
  // scope_allowed(module,'read', …) resolves the READ grant's own scope, so an
  // update-only role cannot SELECT the parent event — and would then be locked
  // out of its notes too, since those are correlated to the parent.
  qeManager: {
    id: 'e2e10000-0000-4000-8000-000000000040',
    email: 'qemanager@e2e.test',
    name: 'Quinn QeManager',
  },
  // ── CAPA step grouping + matrix scope (e2e-seed.sql §31) ──────────────────
  // Second member of the E2E Reviewer role — the target CAPA-J8 reassigns a
  // grouped step to. The reassign dialog offers only the step's role members,
  // and Rita was the sole one.
  reviewer2: {
    id: 'e2e10000-0000-4000-8000-000000000060',
    email: 'reviewer2@e2e.test',
    name: 'Riley Reviewer2',
  },
  // capa:read/update/approve at SITE scope (Primary Site), in NO workflow role,
  // owns nothing. CAPA-J9's subject: the matrix alone admits them to records at
  // their site — and shuts them out of records at any other.
  capaSiteEditor: {
    id: 'e2e10000-0000-4000-8000-000000000061',
    email: 'capasiteeditor@e2e.test',
    name: 'Sana SiteEditor',
  },
  // ── Roles module (e2e-seed.sql §30) ───────────────────────────────────────
  // Before these four, the tenant seeded eleven roles and not one of them could
  // WRITE to a role — no `role_permission_management` grant existed anywhere in
  // the cast, so every browser-level requirement in the module was untestable.
  //
  // They are four and not one because the module's defect was never "nobody can
  // administer roles". It was that five surfaces answered "may you grant a
  // role" and gave four different answers. One persona per answer is what makes
  // that disagreement observable in a browser (ROLE-J1).
  //
  // Role administrator — role_permission_management CRUD + user_management:read
  // (the Users dialog lists the whole roster; users_sel would otherwise admit
  // only same-site rows). Deliberately holds NO user_management create/update:
  // that absence is what exposes the two role-assignment controls still gated on
  // those verbs, which hide themselves from the one persona the DATABASE permits.
  roleAdmin: {
    id: 'e2e10000-0000-4000-8000-000000000050',
    email: 'roleadmin@e2e.test',
    name: 'Rosa RoleAdmin',
  },
  // user_management:create ONLY — escalation PATH A's exact persona, the one
  // that could self-assign any role in the tenant before 2026-07-28. Also the
  // persona the roster's bulk "Assign Role" control is still gated on.
  umCreator: {
    id: 'e2e10000-0000-4000-8000-000000000051',
    email: 'umcreator@e2e.test',
    name: 'Cara UmCreator',
  },
  // user_management:update ONLY — the verb the user DETAIL page's role picker
  // gates on. Same question, third answer.
  umUpdater: {
    id: 'e2e10000-0000-4000-8000-000000000052',
    email: 'umupdater@e2e.test',
    name: 'Umar UmUpdater',
  },
  // teams create/read/update ONLY — escalation PATH B, the sideways route to the
  // same outcome via users_on_teams |X| roles_on_teams.
  teamJoiner: {
    id: 'e2e10000-0000-4000-8000-000000000053',
    email: 'teamjoiner@e2e.test',
    name: 'Tom TeamJoiner',
  },
}

// The E2ELAB roles (e2e-seed.sql §4 and later sections), by the name the UI
// renders them under. Added for the workflow template-authoring journeys
// (PW-J1/PW-J3), which pick ROLE POOLS out of a select menu by visible name and
// then assert the resulting `workflow_step_roles` rows by id — without a
// name→id map here the assertion would either hard-code uuids inline or be
// reduced to a row count, neither of which proves the right role landed.
export const ROLES = {
  author: { id: 'e2e30000-0000-4000-8000-000000000001', name: 'E2E Author' },
  reviewer: { id: 'e2e30000-0000-4000-8000-000000000002', name: 'E2E Reviewer' },
  approver: { id: 'e2e30000-0000-4000-8000-000000000003', name: 'E2E Approver' },
  controller: { id: 'e2e30000-0000-4000-8000-000000000004', name: 'E2E Doc Controller' },
  auditor: { id: 'e2e30000-0000-4000-8000-000000000005', name: 'E2E Auditor' },
  // Roles module (§30). `prize` is the capability worth stealing and is assigned
  // to NOBODY — every escalation probe in the `roles` project tries to acquire
  // it, and an unassigned role is the only way "did the attacker gain it?" has a
  // clean answer. It carries sites:delete, the same capability the integration
  // suite (role-assignment-escalation.test.js) uses, so the browser probe and
  // the DB probe are asking the identical question.
  prize: { id: 'e2e30000-0000-4000-8000-000000000059', name: 'E2E Prize Role' },
  locked: { id: 'e2e30000-0000-4000-8000-000000000058', name: 'E2E Locked Role' },
  roleAdmin: { id: 'e2e30000-0000-4000-8000-000000000050', name: 'E2E Role Admin' },
}

// The capability the prize role carries, as the pair every probe checks. Kept
// here so a spec never hard-codes 'sites'/'delete' inline and drifts from §30.
export const PRIZE_CAPABILITY = { module: 'sites', action: 'delete' }

// Teams seeded by §30d. The difference between them IS escalation path B's test:
// the users_on_teams INSERT policy needs teams:update alone for a team that
// confers no roles, and additionally role_permission_management:update for one
// that does. Without the plain team a refusal proves nothing — it could equally
// mean team administration is broken for everyone.
export const TEAMS = {
  roleCarrying: { id: 'e2e3b000-0000-4000-8000-000000000001', name: 'E2E Role-Carrying Team' },
  plain: { id: 'e2e3b000-0000-4000-8000-000000000002', name: 'E2E Plain Team' },
}

// Second-tenant owner for cross-tenant isolation tests (logs in via ALT_BASE_URL).
export const ALT_USERS = {
  owner: {
    id: 'e2e20000-0000-4000-8000-000000000001',
    email: 'owner@e2e-alt.test',
    name: 'Otto AltOwner',
  },
}

// storageState files written by auth.setup.js, consumed via test.use().
export const AUTH = {
  owner: 'e2e/.auth/owner.json',
  author: 'e2e/.auth/author.json',
  reviewer: 'e2e/.auth/reviewer.json',
  approver: 'e2e/.auth/approver.json',
  controller: 'e2e/.auth/controller.json',
  auditor: 'e2e/.auth/auditor.json',
  ownAuthor: 'e2e/.auth/ownAuthor.json',
  noAccess: 'e2e/.auth/noAccess.json',
  siteAdmin: 'e2e/.auth/siteAdmin.json',
  siteReader: 'e2e/.auth/siteReader.json',
  siteRoamer: 'e2e/.auth/siteRoamer.json',
  deptAdmin: 'e2e/.auth/deptAdmin.json',
  deptReader: 'e2e/.auth/deptReader.json',
  trainingAdmin: 'e2e/.auth/trainingAdmin.json',
  learner: 'e2e/.auth/learner.json',
  teamsOnly: 'e2e/.auth/teamsOnly.json',
  userSiteReader: 'e2e/.auth/userSiteReader.json',
  auditReader: 'e2e/.auth/auditReader.json',
  qcInspector: 'e2e/.auth/qcInspector.json',
  qcApprover: 'e2e/.auth/qcApprover.json',
  qcAuthor: 'e2e/.auth/qcAuthor.json',
  retainCustodian: 'e2e/.auth/retainCustodian.json',
  qeManager: 'e2e/.auth/qeManager.json',
  reviewer2: 'e2e/.auth/reviewer2.json',
  capaSiteEditor: 'e2e/.auth/capaSiteEditor.json',
  roleAdmin: 'e2e/.auth/roleAdmin.json',
  umCreator: 'e2e/.auth/umCreator.json',
  umUpdater: 'e2e/.auth/umUpdater.json',
  teamJoiner: 'e2e/.auth/teamJoiner.json',
  altOwner: 'e2e/.auth/altOwner.json',
}

// Quality Events fixtures seeded by e2e-seed.sql §28.
//
// The standing event is reported by `deptAdmin`, who holds quality_events
// create+read but is NOT the assignee and holds no update — so they reach the
// event through the SELECT policy's reachability OR (reported_by_user_id).
// That is deliberately the persona the F-01 INSERT policy was left open for:
// "you can see it, so you can comment on it, as yourself".
//
// The supplier is SHARED on the event, so the parent is reachable for them.
// Without that share a supplier seeing no notes would prove nothing about
// `visibility` — only that they could not reach the event.
export const QUALITY_EVENTS = {
  categories: {
    deviation: { id: 'e2eec000-0000-4000-8000-000000000001', name: 'Deviation' },
    nearMiss: { id: 'e2eec000-0000-4000-8000-000000000002', name: 'Near Miss' },
  },
  severities: {
    minor: { id: 'e2eed000-0000-4000-8000-000000000001', name: 'Minor' },
    major: { id: 'e2eed000-0000-4000-8000-000000000002', name: 'Major' },
  },
  standing: {
    id: 'e2eef000-0000-4000-8000-000000000001',
    number: 'EV-E2E-0001',
    title: 'E2E Standing Quality Event',
    reportedBy: 'e2e10000-0000-4000-8000-000000000013', // deptAdmin
    // Assigned to qeManager since seed §28e. That assignment is what makes the
    // standing event the EMPTY-REVIEW-FIELDS fixture: closeQualityEvent checks
    // the reviewer FIRST and the three mandatory review fields SECOND, so on an
    // unassigned event the second gate is unreachable and cannot be tested.
    // Its notes / attachment / supplier share are untouched — QE-J1 and QE-J2
    // still own it.
    assignedTo: 'e2e10000-0000-4000-8000-000000000040', // qeManager
    internalNoteId: 'e2eeb000-0000-4000-8000-000000000001',
    publicNoteId: 'e2eeb000-0000-4000-8000-000000000002',
    attachmentId: 'e2eea000-0000-4000-8000-000000000001',
  },
  // ── The lifecycle fixtures (seed §28f) ──────────────────────────────────
  // One event per journey, because close and cancel are TERMINAL: a shared row
  // would make the suite order-dependent and un-rerunnable. All four are
  // assigned to a reviewer, since every gated action starts with that check.
  // `resetLifecycleEvents()` (fixtures/qualityEvents.js) restores their seeded
  // status and clears the signature / audit rows they accumulate.
  //
  // `assignedTo` is duplicated onto each rather than assumed, because two of
  // these four exist ONLY to tell the reviewer personas apart.
  close: {
    id: 'e2eef000-0000-4000-8000-000000000002',
    number: 'EV-E2E-0002',
    title: 'E2E Close Journey Event',
    assignedTo: 'e2e10000-0000-4000-8000-000000000040', // qeManager
    // reviewSummary / recommendedAction / decision are pre-filled in the seed,
    // so QE-J3 drives Close → e-sign and never touches a rich-text editor.
    reviewFieldsPrefilled: true,
  },
  cancel: {
    id: 'e2eef000-0000-4000-8000-000000000003',
    number: 'EV-E2E-0003',
    title: 'E2E Cancel Journey Event',
    assignedTo: 'e2e10000-0000-4000-8000-000000000040', // qeManager
    // Deliberately NOT pre-filled: cancel must not require the review that
    // close does — it asserts the event will not be investigated at all.
    reviewFieldsPrefilled: false,
  },
  draft: {
    id: 'e2eef000-0000-4000-8000-000000000004',
    number: 'EV-E2E-0004',
    title: 'E2E Draft Journey Event',
    assignedTo: 'e2e10000-0000-4000-8000-000000000040', // qeManager
    // The only DRAFT in the tenant, and unreachable by any client path — the
    // server creates events as OPEN and the guard refuses untrusted status
    // writes — which is exactly why POST /submit needs a seeded input.
    statusId: 'DRAFT',
  },
  foreignReviewer: {
    id: 'e2eef000-0000-4000-8000-000000000005',
    number: 'EV-E2E-0005',
    title: 'E2E Foreign Reviewer Event',
    // deptAdmin, NOT qeManager — the point of the fixture. Its review fields
    // are complete, so the assigned-reviewer rule is the only gate left.
    assignedTo: 'e2e10000-0000-4000-8000-000000000013', // deptAdmin
    reviewFieldsPrefilled: true,
  },
}

// Sites seeded by e2e-seed.sql §2 and §15a. Two tenants, three sites — the
// two-tenant pair is what makes cross-tenant isolation (PW-J6) free.
export const SITES = {
  primary: { id: 'e2e51000-0000-4000-8000-000000000001', name: 'Primary Site', code: 'HQ' },
  secondary: { id: 'e2e51000-0000-4000-8000-000000000003', name: 'Secondary Site', code: 'SEC' },
  alt: { id: 'e2e52000-0000-4000-8000-000000000002', name: 'Alt Site', code: 'ALT' }, // E2EALT
}

// Departments seeded by e2e-seed.sql §3 and §15d — one per site, which is what
// lets the site-scope probes separate the site tier from the department tier.
export const DEPARTMENTS = {
  quality: { id: 'e2e7d000-0000-4000-8000-000000000001', name: 'Quality', code: 'QA' },
  operations: { id: 'e2e7d000-0000-4000-8000-000000000003', name: 'Operations', code: 'OPS' },
}

// The log book + pivot row PW-J8 mutates (e2e-seed.sql §15c).
export const LOG_BOOK = {
  id: 'e2e5b000-0000-4000-8000-000000000001',
  title: 'E2E Sites Log Book',
  pivotId: 'e2e5c000-0000-4000-8000-000000000001',
}

// Seeded fixtures the journeys rely on (E2ELAB).
export const FIXTURES = {
  sopTemplateName: 'E2E SOP Template', // PUBLISHED, prefix ESOP, 3 sections, training OFF
  // Fingerprint of the template a document must actually inherit — see the
  // guard in createSopDocument (documents/23 §1).
  sopTemplatePrefix: 'ESOP',
  // The workflow that template MINTS, and the only flow a document created
  // from it may run. Pinned because the create form has been observed handing
  // documents a different template's flow (documents/23 §1).
  sopTemplateApprovalWorkflow: 'E2E SOP Template — Approval',
  approvalWorkflowName: 'E2E Document Approval', // step1 ACTION → Reviewer, step2 APPROVAL+e-sign → Approver
  // A document's approval flow is INHERITED from its template (2026-08-15) —
  // the create form no longer offers a workflow picker. Each template carries
  // its own "<template> — Approval" workflow, so the flow the SOP journeys
  // actually run is this one, NOT `approvalWorkflowName` above (which remains
  // the seeded standalone workflow used elsewhere). The create form renders
  // these two steps read-only; step 1's name is the readiness anchor.
  sopTemplateApprovalStep1: 'Technical Review',
  sopTemplateApprovalStep2: 'Approval',
  // NCR — reuses the same cast: author=ncOwner (ncr:create/read/update, owns via
  // nc.ownerId), reviewer=step-1 ACTION assignee (ncr:read), approver=step-2
  // APPROVAL+e-sign assignee (ncr:read/approve), auditor=ncr:read, noAccess=no
  // ncr grants (permission-denial persona).
  ncrWorkflowName: 'E2E NCR Review & Approval', // step1 ACTION → Reviewer, step2 APPROVAL+e-sign → Approver
  ncrDispositionNoCost: 'Use As Is', // tracks_cost=false
  ncrDispositionCost: 'Rework', // tracks_cost=true
  ncrSupplierWithPortal: 'E2E-PWJ5 Supplier Portal', // has an ACTIVE EXTERNAL_SUPPLIER user
  ncrSupplierNoPortal: 'E2E-PWJ5 Supplier NoPortal', // no portal user — negative case
  // CR — same cast again: author=crOwner (change_control:create/read/update/delete,
  // owns via cr.ownerId OR cr.createdBy — the co-author model), reviewer=step-1
  // ACTION assignee, approver=step-2 APPROVAL+e-sign assignee, ownAuthor holds
  // change_control at OWN scope (PW-J6), noAccess=no change_control grants.
  // Unlike the NCR/CAPA workflows this one has a THIRD step, 'Implementation',
  // with allowChildSteps=true so PW-J4 can add sub-tasks post-approval.
  crWorkflowName: 'E2E CR Review & Approval',
  crImplementationStepName: 'Implementation',
  // Training — seeded ACTIVE with trainingAdmin as manager_id, so launch and
  // verify are both available without first exercising activate. The assessment
  // is 2 single-choice questions with unambiguous correct answers, against
  // passingScore 70: both right = 100 (pass), one right = 50 (fail). maxAttempts
  // is 2, leaving room for one retry after a deliberate fail.
  trainingTitle: 'E2E Read & Understood Training',
  // Audits — the cast is reused once more: author=lead auditor (every audit
  // grant), reviewer=close-out step 1 + standard-approval step 1,
  // approver=step 2 on both (e-signed), auditor=audit_management:read and
  // NOTHING else (the persona PW-J9's dead-permission probe needs),
  // noAccess=no audit grants. Step names double as the Playwright anchors for
  // the per-step reviewer pickers, so they are unique across both workflows.
  auditCloseOutWorkflowName: 'E2E Audit Close-Out', // step1 ACTION → Reviewer, step2 APPROVAL+e-sign → Approver
  auditStandardWorkflowName: 'E2E Audit Standard Approval',
  auditCloseOutStep1: 'Audit Review',
  auditCloseOutStep2: 'Audit Sign-Off',
  auditStandardStep1: 'Standard Review',
  auditStandardStep2: 'Standard Approval',
}

// The seeded audit standard (e2e-seed.sql §25) every audit journey runs against.
// Clause 4 is a section header (a PARENT) and is therefore exempt from the
// close-out "assess every clause" gate; 4.1 and 4.2 are the two leaves a
// walkthrough has to score.
export const AUDIT_STANDARD = {
  id: 'e2ea1000-0000-4000-8000-000000000001',
  code: 'E2E-STD-9001',
  name: 'E2E Quality Standard',
  effectiveVersionId: 'e2ea2000-0000-4000-8000-000000000001',
  clauses: {
    section: {
      id: 'e2ea3000-0000-4000-8000-000000000001',
      number: '4',
      title: 'Quality Management System',
    },
    documentControl: {
      id: 'e2ea3000-0000-4000-8000-000000000002',
      number: '4.1',
      title: 'Document control',
    },
    training: {
      id: 'e2ea3000-0000-4000-8000-000000000003',
      number: '4.2',
      title: 'Training records',
    },
  },
  leafCount: 2,
}

// Workflow versions the audit journeys submit against (e2e-seed.sql §24).
export const AUDIT_WORKFLOWS = {
  closeOutVersionId: 'e2eaf002-0000-4000-8000-000000000001',
  standardVersionId: 'e2eaf002-0000-4000-8000-000000000002',
}

// Supplier ids (not in USERS/AUTH — this persona never logs into the app UI).
export const SUPPLIER_IDS = {
  withPortal: 'e2e70000-0000-4000-8000-000000000001',
  noPortal: 'e2e70000-0000-4000-8000-000000000002',
}

// The ACTIVE EXTERNAL_SUPPLIER portal user behind SUPPLIER_IDS.withPortal —
// the account NC assignments are re-pointed to on supplier-facing conversion.
export const SUPPLIER_PORTAL_USER_ID = 'e2e10000-0000-4000-8000-000000000009'

// The same account as a login-able persona. Deliberately NOT in USERS/AUTH:
// auth.setup.js logs in every USERS entry, and a portal account failing to
// authenticate would take down every suite. The one journey that needs it
// (PW-J5, the EXTERNAL_SUPPLIER redirect) mints its own session instead.
export const SUPPLIER_USER = {
  id: SUPPLIER_PORTAL_USER_ID,
  email: 'supplier@e2e.test',
  name: 'Sam Supplier',
}

// The seeded training catalog entry (e2e-seed.sql §20) and its assessment key.
// Answer ids are part of the seed's JSONB, so the journeys can submit a
// deterministic pass (both correct) or fail (one correct) without reading the
// quiz out of the UI first.
export const TRAINING = {
  id: 'e2e8a000-0000-4000-8000-000000000001',
  title: 'E2E Read & Understood Training',
  passingScore: 70,
  maxAttempts: 2,
  // questionId -> optionId
  correctAnswers: { q1: 'q1a', q2: 'q2b' },
  wrongAnswers: { q1: 'q1b', q2: 'q2a' },
  // one right, one wrong => 50, below passingScore
  halfAnswers: { q1: 'q1a', q2: 'q2a' },
}

// QC Inspection fixtures (e2e-seed.sql §22b–§22f). The specification is seeded
// EFFECTIVE and the sampling plan APPROVED so a lot journey can start without
// first exercising the authoring paths (PW-J4/J5 cover those on their own,
// against records they create).
export const QC = {
  product: {
    id: 'e2e91000-0000-4000-8000-000000000001',
    name: 'E2E Widget 10mm',
    sku: 'E2E-WIDGET-10',
  },
  // Reserved for PW-J4/J5. Authoring a spec/plan against the shared product
  // above would SUPERSEDE the seeded EFFECTIVE spec and silently change what
  // every later lot is inspected against.
  authoringProduct: {
    id: 'e2e91000-0000-4000-8000-000000000002',
    name: 'E2E Authoring Widget',
    sku: 'E2E-WIDGET-AUTH',
  },
  supplier: { id: 'e2e70000-0000-4000-8000-000000000003', name: 'E2E QC Supplier', code: 'EQCS' },
  uom: { id: 'e2e90000-0000-4000-8000-000000000001', code: 'EA' },
  productionLine: {
    id: 'e2e92000-0000-4000-8000-000000000001',
    name: 'E2E Line 1',
    code: 'LINE-1',
  },
  shift: { id: 'e2e93000-0000-4000-8000-000000000001', name: 'E2E Shift A', code: 'A' },
  storageLocation: {
    id: 'e2e94000-0000-4000-8000-000000000001',
    name: 'E2E Retain Room A',
    code: 'RETAIN-A',
    conditions: '25 C / 60% RH',
  },
  specification: {
    id: 'e2e96000-0000-4000-8000-000000000001',
    name: 'E2E Widget 10mm Spec',
    code: 'E2E-SPEC-1',
  },
  // LEN is NUMERIC 9.90–10.10 mm and CRITICAL — the deliberate out-of-spec
  // target (record 12.5). VIS is PASS_FAIL, LBL is TEXT; leaving one unscored
  // is what proves the completeness gate (PW-J3).
  characteristics: {
    length: {
      id: 'e2e97000-0000-4000-8000-000000000001',
      code: 'LEN',
      name: 'Length',
      lsl: 9.9,
      usl: 10.1,
    },
    visual: { id: 'e2e97000-0000-4000-8000-000000000002', code: 'VIS', name: 'Visual Finish' },
    label: { id: 'e2e97000-0000-4000-8000-000000000003', code: 'LBL', name: 'Label Text' },
  },
  samplingPlan: { id: 'e2e98000-0000-4000-8000-000000000001', name: 'E2E Widget Incoming Plan' },
  defect: { id: 'e2e99000-0000-4000-8000-000000000001', code: 'SCRATCH', name: 'Surface Scratch' },
  templateIncoming: {
    id: 'e2e9a000-0000-4000-8000-000000000001',
    name: 'E2E Widget Incoming Inspection',
  },
  templateInProcess: {
    id: 'e2e9a000-0000-4000-8000-000000000002',
    name: 'E2E Widget In-Process Inspection',
  },
  dispositionWorkflowName: 'E2E QC Disposition',
  // Global AQL standards seeded by migration (company_id IS NULL), not by the
  // E2E seed — PW-J6 clones one of these.
  globalStandards: ['Z1.4-2008', 'ISO_2859-1'],
}

// Analytics / QMS Intelligence fixtures (e2e-seed.sql §31).
//
// FACT_MONTH is the whole reason exact figures are assertable here. `ncr.raised`
// buckets on `created_at`, and every other suite in this repo creates
// nonconformances *now*, so any assertion against the current month depends on
// run order. §31 back-dates six rows into one month no other journey writes to,
// which is what turns "greater than zero" into "exactly 6".
//
// TENANT_VALUE and SITE_VALUE are not two guesses at the same number — they are
// two CORRECT answers to the same question, which is the module's central claim.
// `author` holds ncr:read at tenant scope and sees all six; `siteRoamer` holds it
// at site scope from Primary Site and sees the four that live there. Measured
// against the live stack on 2026-08-18 via metric_value() under app_user.
export const ANALYTICS = {
  FACT_MONTH: { start: '2026-02-01', end: '2026-02-28' },
  METRIC: 'ncr.raised',
  // What every picker in the module actually displays. The key is never shown.
  METRIC_LABEL: 'NCs Raised',
  DIMENSION_LABEL: 'Severity',
  TENANT_VALUE: 6, // author / auditor  — ncr:read at tenant
  SITE_VALUE: 4, // siteRoamer        — ncr:read at site (Primary)
  // The severity mix, so a breakdown assertion does not have to re-derive it.
  SEVERITY_BREAKDOWN: { MINOR: 2, MAJOR: 2, CRITICAL: 2 },
  sharedDashboard: {
    id: 'e2ea2000-0000-4000-8000-000000000001',
    name: 'E2E Shared NC Board',
  },
  privateDashboard: {
    id: 'e2ea2000-0000-4000-8000-000000000002',
    name: 'E2E Private Board',
  },
  sharedWidget: { id: 'e2ea3000-0000-4000-8000-000000000001', title: 'NCs raised' },
  // The shared board's tiles IN SEEDED ORDER. Three of them, because a reorder
  // journey has to tell "moved down one" apart from "moved to the end".
  // e2e-seed.sql §31 resets `position` on every run, so this order is the state
  // every test starts from even though the journey persists a different one.
  sharedWidgetOrder: ['NCs raised', 'NC severity split', 'NC trend'],
  sharedReport: {
    id: 'e2ea4000-0000-4000-8000-000000000001',
    name: 'E2E Shared NC Report',
  },
  privateReport: {
    id: 'e2ea4000-0000-4000-8000-000000000002',
    name: 'E2E Private NC Report',
  },
  // A dashboard/report id that is syntactically valid and belongs to nobody —
  // the premise for "not found" states, which must be distinguishable from a
  // crash and from a private record leaking its existence.
  ABSENT_ID: 'e2eaffff-0000-4000-8000-0000000000ff',
}
