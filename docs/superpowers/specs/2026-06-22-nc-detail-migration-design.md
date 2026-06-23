# Nonconformance Detail Migration to BaseDetailLayout (SP-6) — Design Spec

> **Status:** Draft for review · **Date:** 2026-06-22 · **Type:** Live-page migration (UX/IA only; no behavior change).
> **Builds on:** [`2026-06-22-detail-template-core-config-design.md`](2026-06-22-detail-template-core-config-design.md) (SP-1, shipped) and [`2026-06-19-detail-page-template-design.md`](2026-06-19-detail-page-template-design.md).
> **Branch:** `feat/ds-detail-page-template` (this branch only — no new branch).

---

## 1. Goal & non-negotiable constraint

Migrate `src/components/nonconformances/NonconformancesPageId.vue` (~1,367 lines) from the legacy `BaseDetailPage` + hand-rolled `grid-cols-[65fr_16fr]` body onto the SP-1 `BaseDetailLayout` + `defineDetailConfig`, delivering the identity-first header, anchor-nav body, ranked rail, and contextual banners.

**The non-negotiable constraint: only the IA/layout changes. Every behavior is preserved byte-for-byte.** This is a live, regulated QMS page. Nothing about data, validation, permissions, workflow, e-signature, or lifecycle transitions may change. If a choice trades fidelity for prettiness, fidelity wins.

### Explicitly preserved (unchanged)
- All live queries (`nc`, `incompleteStepCount`, `linkedCapaCount`, `ncDispositionType`, `workflowInstance`, `workflowVersion`, `selectedDispositionType`, `allNcWorkflowInstanceIds`, `allNcWorkflowInstanceStepIds`, `sourceLot`, `linkedCapas`).
- `useAutoSave(nc)`; the edit/read duality with every `editingX` ref (`editingTitle/Severity/Detected/DueDate/Cost/Credit`); the `qtyAffectedModel` / `audienceModel` computed get/set.
- Permission/lifecycle gates: `canUpdate`, `isOwner`, `isEditable`, `markCompleteBlockedReason`, `canMarkComplete`, `isOverdue`, `dispositionTracksCost`, `canConvertToSupplier`, `auditIncludeEntities`.
- The three action-RPCs (`POST …/submitForReview`, `…/markComplete`, `…/convertSupplierFacing`) and `nc.delete()`; all handler functions and their flags (`saving/completing/deleting/converting/saveError/completeComments/convertSupplierId`).
- The 6 dialogs (Mark Complete, E-sign, Open NC, Audit Log, Delete, Convert) — kept verbatim as sibling `<BaseDialog>` blocks.
- `NcWorkflowDraftPreview` / `NcWorkflowDetail` — rendered unchanged (the `BaseWorkflowTimeline` upgrade is SP-4, out of scope here).
- All self-hiding panels: `RecordLineagePanel`, `AuditOriginPanel`, `NcLinkedComplaintsPanel`, `SharedWithPanel`, the NC workflow info card.
- `RecordTrailBreadcrumb` / `visitTrail()`, `AskAiButton`, print view.

**A faithful structural map of the current file (line ranges for every query/computed/ref/handler/template region) is the implementation reference; it is reproduced in the SP-6 plan, not duplicated here.**

---

## 2. Target structure (the NC → config mapping)

```
┌─ Breadcrumb (teleported): Nonconformances ▸ NC-MAIN-ENG-001 ──────────────┐
├─ DETAIL HEADER (sticky, morphs on scroll) ───────────────────────────────┤
│ ▣  Non conformance testing            ● Draft   Minor      [Open NC] [Print] [⋯]  [Ask AI] │
│    NC-MAIN-ENG-001 · Audit Finding · Detected 29 Jun 2026                  │
├─ BANNER REGION (contextual) ─────────────────────────────────────────────┤
│  ⓘ Created from QC inspection lot … / Supplier-facing / Read-only          │
├─ ANCHOR NAV (sticky): Details · Workflow · Disposition · CAPAs ───────────┬──────────────┐
│  § Details   (lineage + audit-origin panels, then NC details fields)      │  RAIL (sticky)│
│  § Workflow  (NcWorkflowDraftPreview | NcWorkflowDetail)                   │  Status&Sched │
│  § Disposition (disposition/CAPA-req/cost/credit/notes)                    │  People       │
│  § CAPAs     (linked CAPAs list + create, when capaRequired)              │  Classification│
│                                                                            │  Notify (cc)  │
│                                                                            │  Product (▸)  │
│                                                                            │  Related/Workflow│
└────────────────────────────────────────────────────────────────────────┴──────────────┘
+ <BaseDialog> ×6 (siblings, unchanged)
```

### 2.1 Header (`defineDetailConfig.header` + slots)
- `#title` → existing inline-editable title (`editingTitle` toggle, `BaseClickableRow`/`BaseTextInput`, `isEditable` gate).
- `#status` → `NcStatusBadgeById` + `NcSeverityBadgeById` (+ marked-complete chip).
- `#meta` → `nc.ncNumber` (mono) · type · `Detected {dt.formatDate(nc.detectedAt)}`.
- `breadcrumbs` → existing array; `RecordTrailBreadcrumb` stays in the body top.
- `actions` (ActionDescriptor[], auto-bucketed by `useDetailLayout`):
  - **primary** `Open NC` — `visible: () => isOwner && nc.statusId==='DRAFT'`, `onSelect: openOpenDialog`, `loading: () => saving`.
  - **primary** `Approve & Close` — `visible: () => isOwner && nc && !['DRAFT','CLOSED','VOID'].includes(nc.statusId)`, `disabled: () => !canMarkComplete`, `title: () => markCompleteBlockedReason`, `onSelect: openMarkCompleteDialog`. (DRAFT shows Open; otherwise Approve — never both visible, so one primary at a time.)
  - **secondary** `Print` — `onSelect: openPrintView`.
  - **overflow** `Convert to supplier-facing` (`visible: () => canConvertToSupplier`), `Audit Log`, `Delete` (`visible: () => isOwner && statusId==='DRAFT'`, `variant: 'danger'`).
  - `AskAiButton` is bespoke (its own props/state) → rendered in the header `#actions` area beside the bucketed bar, unchanged. (Implementation note: if `BaseDetailLayout` exposes only the descriptor `actions`, render the action bar + `AskAiButton` via the header `#actions` slot override so both coexist.)

### 2.2 Banners (`config.banners(record)`)
Returns descriptors built from existing state:
- `sourceLot` present → `{ tone:'info', title:'Created from QC inspection', message: lotNumber/point, actions:[{label:'View inspection results', to: lot}] }`.
- `nc.isSupplierFacing` → `{ tone:'info', title:'Supplier-facing', dismissible:false }`.
- `!isEditable && nc.statusId` in CLOSED/VOID → `readOnlyBanner({ message: 'This NC is {status} and read-only.' })`.
Overdue remains a rail indicator (existing `isOverdue` red text + icon), not a banner.

### 2.3 Body sections (`config.sections`, anchor mode, `#section-{id}`)
- **`details`** — `RecordLineagePanel` + `AuditOriginPanel` (self-hiding) at top, then the NC Details fields (description, severity/type/source/detected grid, containment action). Title moved to header.
- **`workflow`** — `NcWorkflowDraftPreview` (`v-if !workflowInstance && statusId==='DRAFT'`) / `NcWorkflowDetail` (`v-else`), props unchanged.
- **`disposition`** — disposition type, CAPA-required toggle, cost/credit (gated by `dispositionTracksCost` + `editingCost/Credit`), notes — edit/read duality intact.
- **`capas`** — `v-if="nc.capaRequired === true"` linked-CAPA list + "Create CAPA"/"Create Change Request" buttons. (Section nav item for `capas` uses `visible: () => nc?.capaRequired === true` so it only appears when relevant.)

### 2.4 Rail (`#rail` slot — NOT descriptor `railCards`)
The `#rail` slot is used (not `railCards` data) because every card holds live `XSelectMenu`/`XBadgeById` controls with `isEditable` gating that must render exactly as today. Cards as `BaseRailCard`s, re-ranked:
1. **Status & schedule** — `NcStatusBadgeById`, marked-complete, due date + `isOverdue` indicator.
2. **People** — initiator (`UserBadgeById`), responsible party (`UserSelectMenu`/badge), site, department.
3. **Classification** — priority (`BaseInlineSelect`/badge), issue type.
4. **Notify (cc)** — `NotificationCcField`.
5. **Product impact** — `collapsible`, `defaultOpen:false` (rare PO/Order/Lot/Qty/supplier/supplier-facing fields incl. the Convert button path).
6. **Related** — CAPA-required state, `NcLinkedComplaintsPanel`, NC workflow info card, `SharedWithPanel` (`v-if isSupplierFacing`).

### 2.5 Variant & dialogs
- `variant: 'standard'`. Field editability continues to use the existing `isEditable` gate (more precise than the variant's blunt `editable` flag); the read-only banner conveys state. No use of `readonly`/`embedded`/`print` variants here.
- All 6 `<BaseDialog>` blocks remain siblings at the end of the template, wired to the same flags/handlers.

---

## 3. What this is NOT
- Not a workflow-visualization upgrade (SP-4 `BaseWorkflowTimeline`).
- Not adding command-palette/hotkeys/peek (SP-2/SP-3).
- Not an Activity-tab/`BaseActivityFeed` (audit stays the existing `AuditLogDialog`).
- Not a data-layer refactor. No query/mutation/computed/RPC changes.

---

## 4. Risks & mitigations
| Risk | Mitigation |
| --- | --- |
| Behavior regression in a live regulated page | Migrate by *moving* existing markup/handlers into the new slots, not rewriting them. Diff the script section to confirm queries/computeds/handlers are unchanged. |
| Inline-edit title in header behaves differently | Reuse the exact `editingTitle` markup in `#title`; keep `isEditable` gate. |
| Action bucketing hides/duplicates a lifecycle action | Drive `visible`/`disabled`/`title` from the existing computeds verbatim; one primary visible per status. |
| `AskAiButton` lost when moving to descriptor actions | Render it in the header `#actions` slot beside the bucketed bar. |
| Anchor-nav sticky offset vs header (SP-1 known) | Uses SP-1's `--detail-header-offset`; acceptable for SP-6, dynamic measurement deferred. |
| Self-hiding panels break when relocated | They already self-hide via their own queries; only their placement moves. |
| jsdom can't catch render/teleport/visual issues | Mandatory: human visual verification on the running authenticated NC page before done (project memory: verify by running). Plus a component test mounting the migrated page with a mock NC asserting sections/rail/header render. |

---

## 5. Acceptance
- `NonconformancesPageId.vue` renders on `BaseDetailLayout` via `defineDetailConfig`; header shows title+status+severity+meta+bucketed actions; banners, anchor nav, ranked rail present.
- All preserved behaviors verifiably intact (script diff shows no query/computed/handler/RPC changes beyond relocation).
- `pnpm lint` clean; `pnpm test` green except the known pre-existing `BaseBadge` failure; `pnpm build-storybook` unaffected.
- **Human verifies the running authenticated NC detail page**: create/edit fields autosave, Open NC / Approve & Close / Delete / Convert / Print / Audit Log all work, workflow draft+active render, dialogs + e-sign work, supplier-facing + QC-origin + read-only banners show correctly.
