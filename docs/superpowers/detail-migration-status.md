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
MIGRATE — ✅ ALL DONE & structurally verified (2026-06-23):
- TrainingInstancePageId (`1793860`/`2f2719e`) — clean record; title/status/meta slots, cancel-reason→banner, 2 actions, 11 config tests.
- AuditProgramsPageId (`92afffc`) — left fields + Overview→#rail card; Back dropped (breadcrumb), Delete action, paused banner, 9 config tests.
- TrainingPageId (`b707048`) — 5 tabs in single body section; Publish/Launch/Add-Matrix/Unpublish/Archive/Delete actions, 13 config tests.
- QualityEventsPageId (`0aafe83`) — 6 tabs in single body section; Escalate action, status banner, replaced hand-rolled loading/notFound, 9 config tests.
EXEMPT (full-canvas/execution workspaces / reusable editors — do NOT migrate):
- **SpecificationDetail (qcInspection)** — RECLASSIFIED EXEMPT 2026-06-23 (was tentatively "migrate carefully"). It is a **dual-mode reusable editor**: standalone at `pages/qc-inspection/specifications/[id].vue` AND embedded inline in `products/ProductSpecificationsTab.vue` (`embedded` prop → back-link + emits, `tw:p-5` dropped). `BaseDetailLayout` always wraps in `BasePage` (owns width/full-height/header teleport), which is wrong for the embedded surface. Migrating cleanly would require extracting the large characteristics-editor body into a shared child (state-heavy, high regression risk) — not worth it. Per look-first rule (own characteristics-table canvas + save/approve/version e-sign workflow, reused embedded) it is exempt. User-confirmed.
- MyTrainingPageId — training-execution stepper + assessment canvas.
- AuditInstancesPageId — audit workspace (custom tabs + walkthrough/findings/OFI panels + rail + approval workflow).
- LogBookDetailPage (inspectionsLogs) — controlled-doc FormBuilder design platform.
- InspectionLotDetail (qcInspection) — inspection results-capture execution surface.

## Gotcha discovered in wave-2 (CRITICAL — build/eslint do NOT catch it; only visual/manual does)
- **Dialogs must be siblings AFTER `</BaseDetailLayout>`, never direct children of it.** `BaseDetailLayout` renders `#section-*` (or `#tab-*`) **instead of** the default slot — so a `<BaseDialog>` left as a plain (unslotted) child of `<BaseDetailLayout>` lands in the never-rendered default slot and **silently never opens**. Pattern (matches CAPA/AuditStandard): close `</BaseDetailLayout>`, then place all dialogs as siblings inside the root `<template>`. Run `eslint --fix` after to re-indent. (Hit on TrainingInstance first pass — dialogs were inside; fixed in `2f2719e` before the human pass.)

## ▶ RESUME HERE (fresh session)
- **Branch:** `feat/ds-detail-migration-wave2` (off `develop` after PR #72; pushed). Wave-1's 6 pages are shipped in `develop`.
- **STATUS (2026-06-23):** wave-2 migrations COMPLETE. 4 migrated inline (TrainingInstance `2f2719e`, AuditProgram `92afffc`, Training `b707048`, QualityEvents `0aafe83`) — each passed gates 1–6. SpecificationDetail RECLASSIFIED EXEMPT (dual-mode editor; user-confirmed — see classification section). 5 pages now exempt total.
- **Remaining work:** (a) human visual pass (gate 7) on the 4 migrated pages on the running auth app — header title/status/meta, actions per status + overflow, banners, body sections/tabs render, autosave indicator, all dialogs OPEN (the dialog-sibling gotcha above), rail edit (AuditProgram); (b) open PR for the wave-2 branch once visual passes.
- **⚠ PROCESS — do migrations INLINE, not via isolated subagents.** A wave-2 subagent reported success ("18/18 tests, build ✓") but worked in a throwaway worktree that never landed — left a broken commit (imported a config file that didn't exist; template never migrated). It was reset out. If using subagents, VERIFY the committed main-tree state yourself every time, don't trust self-reports.
- **Per-page verification gates (all must pass before human visual):** (1) config file actually exists on disk; (2) `grep -c ':config=' page` ≥1 AND `grep -c ':banners=\|:sections=' page` ==0; (3) no duplicate title (`editing*Title*`/`<rec>.title` only in `#title`); (4) dialog count unchanged vs original AND dialogs are siblings after `</BaseDetailLayout>` (see gotcha); (5) `pnpm build` green; (6) `pnpm exec eslint` clean; (7) human visual on the running auth page.

## ▶▶ WAVE-3 BACKLOG (remaining pages — pick up here next)
Full inventory verified by scanning `grep -rl BaseDetailPage|BaseDetailLayout src` on 2026-06-23. After wave-2 merges, every detail page is migrated or exempt EXCEPT these:

**Candidate (re-evaluate — was exempt, now looks migratable):**
- **AuditInstancesPageId** (`audits/AuditInstancesPageId.vue`, ~1046 lines). Seen running 2026-06-23: its chrome is a textbook detail shape — title `AUD-…` + Scheduled/PASS badges (`#title`/`#status`), Back·Report·Start Audit·Submit·Cancel·Audit Log·Delete (`#actions` → DetailActionBar), Information/Requirements/Findings/OFI tabs (**panel-mode** tabs → `#tab-*`), Conformance/Audit Team/Overview cards (`#rail`). The audit-execution workspace lives INSIDE the tab panels, which BaseDetailLayout renders untouched. No embedded/dual-mode problem (unlike Spec Detail). → Reasonable migration; just large. Decide: migrate or keep bespoke.

**Out of original QMS-core scope (admin/settings — migrate only if app-wide consistency is wanted):**
- UserPageId (`users/UserPageId.vue`)
- RolePageId (`roles/RolePageId.vue`)
- GroupPageId (`groups/GroupPageId.vue`)
- OptionSetsPageId (`optionSets/OptionSetsPageId.vue`)
- DocumentTemplatesPageId (`documentTemplates/DocumentTemplatesPageId.vue`)

**Confirmed exempt (do NOT migrate):** Document, MyTraining, LogBookDetailPage, InspectionLotDetail, SpecificationDetail (dual-mode). (AuditInstance moved to "candidate" above pending decision.)

**Confirmed migrated (10):** NC, CAPA, Audit Standard, Change Request, Customer Complaint, Supplier (wave-1, in `develop`); Training Instance, Audit Program, Training, Quality Events (wave-2, this branch/PR).
