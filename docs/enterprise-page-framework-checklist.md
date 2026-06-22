# Enterprise Page Framework — Implementation Checklist

> Living progress tracker for [`enterprise-page-framework-roadmap.md`](enterprise-page-framework-roadmap.md).
> Status: `[ ]` not started · `[ ] ⏳` in progress · `[x]` done. 🟡 = partial (finish/generalize) · ⬜ = net-new.

## P0 — Foundational (build first)

- [ ] ⏳ **List Layout (A3)** 🟡 — `useListLayout` (L1: filter state + URL sync + pagination + selection) + `BaseListLayout` (L2)
  - [x] `listLayoutHelpers` (state precedence + query (de)serialize + sort encode) — 12 tests
  - [x] `useListLayout` composable (filters + URL sync + pagination + selection + state) — 6 tests
  - [x] `BaseListLayout` shell (L2: header/stats/filters/quick-pills/bulk-bar/state region) — 8 tests
  - [x] Stories (Default / Empty / Loading / Error) — Storybook green
  - [ ] ⏳ **Module adoption rollout** (build + lint + 54 framework tests green throughout; all need runtime eyeball)
    - [x] Equipment (reference)
    - [x] Batch 1: Departments, Sites, Roles, Groups, Option Sets, Products, Document Templates, Workflows
      - Notes — Roles: axios-backed `useRoles` kept, filters mirrored in. Groups: card list (no pagination). Products: in-table bulk + linked-specs guard preserved; "Deleted items" renders ready-state only. Document Templates: no toolbar, `useListLayout` for state only. Workflows: query lifted to parent, child prop contracts changed (higher-risk, verify carefully).
    - [x] Batch 2: CAPAs, Nonconformances, Customer Complaints, Change Requests, Documents, Trainings, Records, Training Instances
      - Notes — CustomerComplaints: `syncUrl` off (DateTime filters don't round-trip through query strings). Trainings/TrainingInstances: hand-rolled status pills → `BaseQuickFilterPills`. Capas/NCs: pre-existing latent supplier-banner bug found + preserved as-is.
    - [x] Batch 3: Users, AuditLogs, FormAssignments, NotificationRules, TrainingVerifications, Suppliers, taskInstances, workflowInstances
      - Notes — Users: pills extracted from `UsersFilterToolbar` → `BaseQuickFilterPills`. AuditLogs: axios `useAuditLogs` provide/inject kept, `useListLayout` for state only, `syncUrl` off. taskInstances: `syncUrl` off (would clobber `?taskKindId`). workflowInstances (split-view) + TrainingVerifications (master-detail): shell-only swap, state stays `ready`.
    - [x] Batch 4 (triage tier): apiKey, aiPat, TrainingMatrix, FieldRecords, InspectionsLogsTemplates, Impersonate
      - Notes — apiKey: redundant `apiKeyList.vue` deleted, query lifted to page. aiPat: `aiPatList` slimmed to presenter, real loading state restored. Impersonate: axios `useImpersonate` kept, `:state` from a computed, search mirrored. TrainingMatrix/FieldRecords: shell-only swap (grouped/wrapper pages, stay `ready`).
      - **SKIPPED — AiUsage**: it's a charts/aggregates dashboard → belongs to the future A4 Dashboard template, not A3. Correctly left on `BasePage`.
    - **31 modules migrated, 1 correctly skipped. Build + lint:layout + lint:ds + 54 framework tests green throughout. ⚠️ ZERO runtime-verified — needs an auth'd eyeball pass before merge.**
    - Deferred (NOT BaseListLayout — tabbed/settings/dashboard, `BasePage` is correct for these): Audits, QcInspection, RiskAssessmentTemplates, RcaTemplates, formTemplates, complaintSettings, companySettings, Lookups, Dashboard, AiUsage
    - [ ] Deferred (NOT BaseListLayout — tabbed/settings/dashboard): Audits, QcInspection, RiskAssessmentTemplates, RcaTemplates, formTemplates, complaintSettings, companySettings, Lookups, Dashboard
- [ ] ⏳ **Route-Metadata System (B7)** — central registry (`src/router/routeMeta.js`) + pure resolver (`routeMetaHelpers`, 9 tests) + `useRouteMeta()` (4 tests)
  - [x] Pure resolver: pattern match / fill / resolve / breadcrumb-chain builder
  - [x] `useRouteMeta()` — reactive title/icon/breadcrumbs + `setRecordTitle()` for detail pages
  - [x] `ROUTE_META` registry seeded for ~18 core modules (additive; unmatched → no-op)
  - [x] `document.title` sync wired at app root (App.vue)
  - [ ] Wire breadcrumbs UI into MainHeader (replace/augment RecordTrailBreadcrumb) — next
  - [ ] Detail pages call `setRecordTitle()` (incremental adoption)
- [ ] ⏳ **Keyboard Shortcuts Infra (F5)** — `useHotkeys` + registry + `?` help overlay
  - [x] Pure chord helpers (`hotkeyHelpers`: event→chord, normalize, match, target-guard, display) — 8 tests
  - [x] `useHotkeys` + `useHotkeyRegistry` (central registry, text-field guard, when-gate) — 5 tests
  - [x] `HotkeyHelp.vue` — `?` cheat-sheet reading the registry, platform-aware `kbd` chips — 2 tests + story
  - [x] Mounted at app root (App.vue); migrated GlobalSearch `/` + ChatPanel ⌘K onto the registry
  - [ ] Resolve ⌘K ownership (AI vs command palette) — decide when C4 lands
- [x] **Command Palette (C4)** — `commandHelpers` (8 tests) + `useCommandRegistry`/`useCommands` + `BaseCommandPalette` (5 tests) + `useNavigationCommands` (nav entries from B7 registry); ⌘K/⌘P open it, AI moved to ⌘J, wired in App.vue + story
- [x] **Feedback States finish (G0)** — `BaseStatusState` extended with `denied` / `offline` / `maintenance` variants (+ tests + stories); layout-shaped skeletons already in BaseListLayout/BaseDetailLayout
- [ ] **`useTable` (D1 L1 extraction)** 🟡 — DEFERRED: `useListLayout` already supplies selection/sort/pagination state for the list surface; a separate headless-table extraction is redundant until a non-list consumer needs it

## P1 — High-leverage

- [ ] **Form / Create-Edit Page (A5)** 🟡 — `BaseFormLayout` with `mode` flag
- [ ] **Floating Save Bar (G9)** — dirty/saving/error + unsaved-changes guard
- [ ] **Read-only / Review / Approval modes (E4)** 🟡
- [ ] **Inline Edit wrapper (E3)** 🟡 — `BaseInlineEdit`
- [ ] **Split View / Master-Detail (A10)** — `BaseSplitView` + `useResizablePane`
- [ ] **Inspector Panel (B4)** — `BaseInspector`
- [ ] **Dashboard Page (A4)** — widget-descriptor grid
- [ ] **Wizard (A6)** — `BaseWizard` + `useWizard` 🟡
- [ ] **Activity / Timeline Panel (C1)** 🟡
- [ ] **Comments / Discussion Panel (C2)**
- [ ] **Attachments Panel (C3)** *(deps: BaseFileUpload)*
- [ ] **Related Records + Version History blocks (E5)** 🟡
- [ ] **Filter system + URL sync (D7)** 🟡
- [ ] **Sticky Filters (G2)** + **Sticky Table Actions (G3)** + **Bulk Action Bar (D5)** 🟡
- [ ] **Mini sidebar (B1)** 🟡 + **Unified breadcrumbs (B3)** 🟡 + **Routed sub-nav (B2)** 🟡
- [ ] **Global Search polish / merge with palette (F1)** 🟡

## P2 — Valuable / power features

- [ ] **Settings Page (A7)**
- [ ] **Analytics Page (A8)**
- [ ] **Report Page (A9)** 🟡
- [ ] **Saved Views (D6)**
- [ ] **Column persistence + reorder (D8)** 🟡
- [ ] **Tree Table (D2)**
- [ ] **Virtual Table (D3)** — deferred
- [ ] **Quick Create (F3)** + **Quick Edit (F4)**
- [ ] **Recent Items (F6)** + **Favorites / Pinned (F7)**
- [ ] **Side-by-side Comparison (G6)**
- [ ] **Preview Panel (G7)**
- [ ] **Bulk Edit (G10)**
- [ ] **Context Menu (H)** + `BaseMenu` submenus
- [ ] **AI Assistant generalization (C5)** 🟡 + **Notification Center polish (C6)** 🟡

## P3 — Frontier

- [ ] **Workspace / Multi-panel (A11)**
- [ ] **Bottom Panel (B5)**
- [ ] **Floating Action Bar (G4)**
- [ ] **Batch Operations (G11)**
- [ ] **User-arrangeable dashboards / saved layouts**
- [ ] **Landing / marketing / auth shell standardization (A12)**

## Net-new primitives (slot in as dependents need them)

- [x] `useListLayout` *(P0)* · [ ] `useTable` (headless table extraction still pending)
- [x] `useHotkeys` + `useHotkeyRegistry` + `hotkeyHelpers` *(P0)*
- [x] `useCommandRegistry` + `useCommands` + `commandHelpers` *(P0)*
- [x] `useRouteMeta` + `routeMetaHelpers` + `ROUTE_META` registry *(P0)*
- [ ] `useResizablePane` *(P1)*
- [ ] `useDisclosure` (generalized open/close + persist) *(P1)*
- [ ] `BaseFileUpload` / dropzone *(P1)*
- [ ] `BaseRichTextEditor` *(P2)*
- [ ] `BaseSegmentedControl` *(P2)*
- [ ] `BaseContextMenu` *(P2)*
