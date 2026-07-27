// E2E cast — dedicated test tenant seeded by qms/database/e2e-seed.sql.
// Applied automatically by e2e/fixtures/auth.setup.js. Every user shares the
// same password; signers share the same e-sign PIN.

export const BASE_URL = process.env.E2E_BASE_URL || 'http://e2elab.localhost:5173'
export const ALT_BASE_URL = process.env.E2E_ALT_BASE_URL || 'http://e2ealt.localhost:5173'
export const PASSWORD = '12345678'
export const ESIGN_PIN = '12345678'

export const COMPANY_ID = 'e2e00001-0000-4000-8000-000000000001' // E2ELAB
export const ALT_COMPANY_ID = 'e2e00002-0000-4000-8000-000000000002' // E2EALT

export const USERS = {
  // Company Owner — set-effective override, sees everything (isOwner bypass).
  owner: { id: 'e2e10000-0000-4000-8000-000000000001', email: 'owner@e2e.test', name: 'Olivia Owner' },
  // Author — document_control:create/read/update.
  author: { id: 'e2e10000-0000-4000-8000-000000000002', email: 'author@e2e.test', name: 'Aaron Author' },
  // Reviewer — step-1 (ACTION) assignee via the E2E Reviewer role.
  reviewer: { id: 'e2e10000-0000-4000-8000-000000000003', email: 'reviewer@e2e.test', name: 'Rita Reviewer' },
  // Approver — step-2 (APPROVAL, e-sign) assignee via the E2E Approver role.
  approver: { id: 'e2e10000-0000-4000-8000-000000000004', email: 'approver@e2e.test', name: 'Adam Approver' },
  // Document Controller — update/delete + templates CRUD.
  controller: { id: 'e2e10000-0000-4000-8000-000000000005', email: 'controller@e2e.test', name: 'Carla Controller' },
  // Auditor — read-only.
  auditor: { id: 'e2e10000-0000-4000-8000-000000000006', email: 'auditor@e2e.test', name: 'Ava Auditor' },
  // Own-scope author — document_control:* at OWN scope.
  ownAuthor: { id: 'e2e10000-0000-4000-8000-000000000007', email: 'ownauthor@e2e.test', name: 'Owen OwnScope' },
  // No-access — no document permissions (denial tests).
  noAccess: { id: 'e2e10000-0000-4000-8000-000000000008', email: 'noaccess@e2e.test', name: 'Noah NoAccess' },
  // Site Admin — sites:create/read/update/delete at tenant. The only cast
  // member who can create a site; also holds log_books:update, the gate on the
  // sites_on_log_books pivot's (correct) INSERT/DELETE policies.
  siteAdmin: { id: 'e2e10000-0000-4000-8000-000000000010', email: 'siteadmin@e2e.test', name: 'Sam SiteAdmin' },
  // Site-scoped sites reader — sites:read at SITE scope and nothing else.
  // Exists to expose the all-NULL `sites` binding: the grant saves, and returns
  // nothing (PW-J10).
  siteReader: { id: 'e2e10000-0000-4000-8000-000000000011', email: 'sitereader@e2e.test', name: 'Sara SiteReader' },
  // Site-scoped NCR user — ncr:read/update at SITE scope, starts at Primary
  // Site. Moved to Secondary Site mid-test by PW-J7.
  siteRoamer: { id: 'e2e10000-0000-4000-8000-000000000012', email: 'siteroamer@e2e.test', name: 'Rory SiteRoamer' },
}

// Second-tenant owner for cross-tenant isolation tests (logs in via ALT_BASE_URL).
export const ALT_USERS = {
  owner: { id: 'e2e20000-0000-4000-8000-000000000001', email: 'owner@e2e-alt.test', name: 'Otto AltOwner' },
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
  altOwner: 'e2e/.auth/altOwner.json',
}

// Sites seeded by e2e-seed.sql §2 and §15a. Two tenants, three sites — the
// two-tenant pair is what makes cross-tenant isolation (PW-J6) free.
export const SITES = {
  primary: { id: 'e2e51000-0000-4000-8000-000000000001', name: 'Primary Site', code: 'HQ' },
  secondary: { id: 'e2e51000-0000-4000-8000-000000000003', name: 'Secondary Site', code: 'SEC' },
  alt: { id: 'e2e52000-0000-4000-8000-000000000002', name: 'Alt Site', code: 'ALT' }, // E2EALT
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
  approvalWorkflowName: 'E2E Document Approval', // step1 ACTION → Reviewer, step2 APPROVAL+e-sign → Approver
  // NCR — reuses the same cast: author=ncOwner (ncr:create/read/update, owns via
  // nc.ownerId), reviewer=step-1 ACTION assignee (ncr:read), approver=step-2
  // APPROVAL+e-sign assignee (ncr:read/approve), auditor=ncr:read, noAccess=no
  // ncr grants (permission-denial persona).
  ncrWorkflowName: 'E2E NCR Review & Approval', // step1 ACTION → Reviewer, step2 APPROVAL+e-sign → Approver
  ncrDispositionNoCost: 'Use As Is', // tracks_cost=false
  ncrDispositionCost: 'Rework', // tracks_cost=true
  ncrSupplierWithPortal: 'E2E-PWJ5 Supplier Portal', // has an ACTIVE EXTERNAL_SUPPLIER user
  ncrSupplierNoPortal: 'E2E-PWJ5 Supplier NoPortal', // no portal user — negative case
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
