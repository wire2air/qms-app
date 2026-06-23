# Detail-Page Migration Program — Status & Resume Tracker

**Branch:** `feat/ds-detail-page-template` (local, not pushed). **Goal:** migrate every QMS-core record detail page onto `BaseDetailLayout` + `defineDetailConfig`. Scope = QMS-core (~15 pages), hardest-first. Specs/plans: `docs/superpowers/specs/2026-06-22-detail-template-core-config-design.md` (SP-1), `2026-06-19-detail-page-template-design.md`, `2026-06-22-nc-detail-migration-design.md`; plan `docs/superpowers/plans/2026-06-22-nc-detail-migration.md`.

## Done & structurally verified (awaiting human visual pass on each)
Each: `<module>DetailConfig.js` pure builders (banners/sections/actions) + spec, page moved onto `BaseDetailLayout`. Verified via: `<script setup>` diff = import + 3 computeds only; template token-diff = nothing dropped; dialog count preserved; `pnpm build` green; config unit tests green.

| Module | File | Commit(s) | Config tests |
|---|---|---|---|
| Nonconformance | `nonconformances/NonconformancesPageId.vue` | SP-6 series (…`2663909`) | 13 |
| CAPA | `capas/CapasPageId.vue` | `ededf88`,`3af03b0`,`849eb0d`,`9da9401` | 22 |
| Audit Standard | `audits/AuditStandardsPageId.vue` | `f611497` | 19 |
| Change Request | `changeRequests/ChangeRequestsPageId.vue` | `5e6f529`,`6d2cfa0` (title-dup fix) | 24 |
| Customer Complaint | `customerComplaints/CustomerComplaintsPageId.vue` | `5b9dc67` | 24 |
| Supplier | `suppliers/SuppliersPageId.vue` | `4cee82a` | 8 |

## EXEMPT — full-canvas editors/viewers (do NOT migrate)
- **Document** (`documents/DocumentsPageId.vue`) — reverted (`d9c6ff1`). It is a full-canvas document editor: its own Content/Change Control/Training tabs + a PROPERTIES panel + inline rich-text editors. Wrapping it in `BaseDetailLayout` added redundant chrome (a one-item "Content" anchor nav above the doc's own tabs) and a cramped header. Stays on its original layout. **Lesson: before migrating, open the running page — if it already has its own tabs/properties/editor canvas, it's exempt.**
- Likely also exempt (verify on the running page first): Inspection Log, QC Inspection Spec/Lot, possibly Audit Instance.

`develop` merged in (NC conflict resolved → kept migration + ported `CustomFieldsCard`). SP-1 shared fixes (section `visible` filter, action `title` tooltip) are in and benefit all.

## Remaining (QMS-core)
**Standard / low-risk (BaseDetailPage, fast):** Audit Program (`audits/AuditProgramsPageId.vue`, 586), Training Instance (`trainingInstances/TrainingInstancePageId.vue`, 485), Training (`trainings/TrainingPageId.vue`, 310), My Training (`myTraining/MyTrainingPageId.vue`, 563), **Quality Events** (`qualityEvents/QualityEventsPageId.vue`, 422 — new from develop).

**Needs careful discovery / possibly EXEMPT (BasePage / hand-rolled, large):** Audit Instance (`audits/AuditInstancesPageId.vue`, 1046, BasePage, workflow), Inspection Log (`inspectionsLogs/LogBookDetailPage.vue`, 1447, BasePage), QC Inspection Spec (`qcInspection/SpecificationDetail.vue`, 763, hand-rolled+rail), QC Inspection Lot (`qcInspection/InspectionLotDetail.vue`, 720, hand-rolled). Read each first — if it's a full-canvas viewer/editor it is correctly exempt per the page-layout rules; don't force it.

**Out of QMS-core scope (admin/settings):** User, Role, Group, Option Set, Document Template. List-only (no detail page): Equipment, Records, Audit Logs.

## The recipe (per module)
1. Discover (read page + workflow sub-components; map queries/computeds/handlers/dialogs/rail/sections).
2. `src/components/<m>/<m>DetailConfig.js` — pure `build<M>Banners(record,{isEditable,…})` / `build<M>Sections(record)` / `build<M>Actions(gates,handlers)` mirroring `capas/capaDetailConfig.js`; + `.spec.js` (TDD).
3. Migrate the page: swap `BaseDetailPage`→`BaseDetailLayout`; `:config`/`:record`; title→`#title` (**remove from body**), badges→`#status`, number·type·date→`#meta`, actions→`<DetailActionBar :actions="…"/>` + `AskAiButton`; body→`#section-*`; right column→ranked `BaseRailCard`s in `#rail`; keep `CustomFieldsCard`; keep all dialogs as siblings; add 3 computeds.
4. Verify: config tests, eslint, `<script setup>` diff = import + 3 computeds, template token-diff (no drops), dialog count, `pnpm build`, then human visual.

## Gotchas (learned)
- **`BaseDetailLayout` renders `#section-*` INSTEAD OF the default slot** → the rail MUST live in `#rail`, not a body column (else it vanishes).
- **Title duplication**: moving the title to `#title` requires REMOVING the body title block — grep `editingTitle`/`<entity>.title` to confirm it's only in `#title`. (Hit on Change Request; fixed.)
- Preserve `visitTrail`/`isOwner` co-author/`useAutoSave` and all `useLiveQuery` `{models}` options verbatim — only relocate. Don't let a subagent "improve" the script.
- Buttons become `buildXActions` descriptors (one primary per status; Print secondary; Delete/Audit/etc. overflow); bespoke buttons (AskAi, version popovers, TaskActionBar) ride in the `#actions` slot beside `DetailActionBar`.
- **`:config` wiring (CRITICAL — build/token-diff do NOT catch this; only visual does):** `banners` and `sections` are NOT discrete props on `BaseDetailLayout` — they ONLY flow through `:config`. Passing `:banners`/`:sections` directly makes them silently ignored → `effSections=[]` → the `#section-*` body never renders → **empty main column** (rail still shows). Always assemble `<entity>DetailConfig = computed(() => defineDetailConfig({ variant, width, breadcrumbs, banners, actions, sections }))` and pass `:config="…"` + `:record="…"`. Verify per page: `grep -c ':config=' file` ≥1 AND `grep -c ':banners=\|:sections=' file` ==0. (Hit on CC + CR — fixed `3e99bd3`.)
- pnpm (NOT npm). Known pre-existing unrelated failing test: a `BaseBadge` dark-mode test.

## Verification (human, per page — auth-gated)
Header (title inline-edit+autosave, status/severity badges, meta line, correct primary action per status + overflow + AskAi); banners (read-only/supplier-facing/origin where applicable); anchor sections jump + render; rail fields edit+autosave; all dialogs fire (open/submit/approve/close/cancel/delete/convert + e-sign); workflow draft-preview vs active; **no duplicated title**; CustomFields card shows when configured.

## Wave-2 classification (look-first, code-based 2026-06-23)
Branch: feat/ds-detail-migration-wave2 (off develop after PR #72 merged).
MIGRATE (genuine record pages):
- TrainingInstancePageId (BaseDetailPage; no tabs/rail) — clean record.
- TrainingPageId (BaseDetailPage; own 5 tabs Details/Material/Assessment/Assignees/Instances) — tabs organize fields, not a canvas → put tabs in a single body section (no nav pill via ≤1-section rule), like Supplier.
- AuditProgramsPageId (BaseDetailPage; left fields + right overview rail) — classic.
- QualityEventsPageId (BaseDetailPage; own 6 tabs) — like Supplier/Training; single body section.
- SpecificationDetail (hand-rolled; characteristics table editor + right rail + version/e-sign workflow) — record-ish but custom; migrate carefully.
EXEMPT (full-canvas/execution workspaces — do NOT migrate):
- MyTrainingPageId — training-execution stepper + assessment canvas.
- AuditInstancesPageId — audit workspace (custom tabs + walkthrough/findings/OFI panels + rail + approval workflow).
- LogBookDetailPage (inspectionsLogs) — controlled-doc FormBuilder design platform.
- InspectionLotDetail (qcInspection) — inspection results-capture execution surface.

## ▶ RESUME HERE (fresh session)
- **Branch:** `feat/ds-detail-migration-wave2` (off `develop` after PR #72; pushed). Wave-1's 6 pages are shipped in `develop`.
- **Do next (migrate, in order):** TrainingInstancePageId (clean, no tabs/rail) → AuditProgramsPageId (rail) → TrainingPageId (own 5 tabs → single body section) → QualityEventsPageId (own 6 tabs → single body section) → SpecificationDetail (hand-rolled + version/e-sign; careful).
- **Mark exempt (no migration):** MyTrainingPageId, AuditInstancesPageId, LogBookDetailPage, InspectionLotDetail.
- **⚠ PROCESS — do migrations INLINE, not via isolated subagents.** A wave-2 subagent reported success ("18/18 tests, build ✓") but worked in a throwaway worktree that never landed — left a broken commit (imported a config file that didn't exist; template never migrated). It was reset out. If using subagents, VERIFY the committed main-tree state yourself every time, don't trust self-reports.
- **Per-page verification gates (all must pass before human visual):** (1) config file actually exists on disk; (2) `grep -c ':config=' page` ≥1 AND `grep -c ':banners=\|:sections=' page` ==0; (3) no duplicate title (`editing*Title*`/`<rec>.title` only in `#title`); (4) dialog count unchanged vs original; (5) `pnpm build` green; (6) `pnpm exec eslint` clean; (7) human visual on the running auth page.
