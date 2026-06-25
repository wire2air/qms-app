# Form Module Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all 81 remaining form-bearing components onto the form system (BaseForm + FormSection + per-field rules + FormProgressNav + unsaved-changes guard), removing each from the `lint:forms` allowlist, until the guard enforces the rules repo-wide.

**Architecture:** Every form becomes "sections + per-field `:rules`" instead of hand-rolled card chrome and toast-as-validation. The reference implementation (`NonconformancesCreate.vue`) is already migrated and proven at runtime. This plan applies the same six **surface recipes** to the rest, file by file, in dependency order. There is no new framework code to write — the toolkit is complete (see Foundation below); this is repetitive, recipe-driven application work, so the recipes are written once in full and the checklist maps each file to its recipe.

**Tech Stack:** Vue 3 `<script setup>`, Tailwind (`tw:` prefix), Vitest + `@vue/test-utils` (happy-dom), `@tabler/icons-vue`, luxon `DateTime`, the project syncEngine (`useLiveQuery`/`useLiveMutation`).

## Global Constraints

Copied verbatim from `qms-app/CLAUDE.md` and the form-system spec — every task implicitly includes these:

- Auto-imports: components under `src/components/` + `resource/js/shared/components/`, Vue APIs, vueuse, vue-router are auto-imported. **Do not** write explicit imports for them. `validators.js` and composables ARE explicit imports.
- Icons: always `@tabler/icons-vue`, explicitly imported. Never another icon lib.
- No Quasar / `W*` wrappers in touched code (entity-lookup `W*` still allowed). No `<form>` elements. Tailwind always carries the `tw:` prefix. `defineModel` for v-model. `function foo(){}` not `const foo = () =>`.
- Data: no `get/post/put/del` from `@/api` for entity CRUD — use `useLiveQuery`/`useLiveQueryWithDeps` + `useLiveMutation`. Action-RPCs (verb endpoints) may use `post` with the tagged-comment exception. Components receive `id` props, not full objects.
- Dates are luxon `DateTime`; format with `dt.formatDate()`.
- Every authenticated page root is `<BasePage>`; never hand-pick page padding/width/section-gap.
- Validation rule shape: a rule is `(value) => true | string | ((label) => string)`. Field rules live on `<BaseField :value :rules>`; the form-level `:validate` prop is the escape hatch only for values not bound to a labeled BaseField.
- **Definition of done per file** (see below) must be fully met, including removal from the allowlist and runtime verification.

---

## Foundation (already built — do NOT rebuild)

These exist and are tested; recipes compose them:

| Piece | Path | Role |
|---|---|---|
| `BaseForm` | `resource/js/shared/components/form/BaseForm.vue` | submit pipeline, field-rule collection, section auto-expand-on-error (C1), sticky footer, ⌘↵, beforeunload |
| `FormSection` | `…/form/FormSection.vue` | card/section chrome, `optional`, `collapsible :defaultOpen`, self-registers for C1 |
| `BaseFieldRow` / `BaseField` | `…/BaseFieldRow.vue`, `…/form/BaseField.vue` | responsive grid; field chrome + `:value`/`:rules`/inline error |
| `validators.js` | `…/form/validators.js` | `required`, `requiredWhen`, `resolveRuleMessage` (add `minLen`/`pattern`/`email`/etc. on first demand) |
| `ValidationSummary` | `…/form/ValidationSummary.vue` | focusable error list, jump-to-field |
| `StickyFormFooter` / `AutosaveIndicator` | `…/form/StickyFormFooter.vue`, `…/form/AutosaveIndicator.vue` | submit/cancel/status; autosave status |
| `FormProgressNav` | `…/form/FormProgressNav.vue` | sticky section nav + per-section completion |
| `useUnsavedChangesGuard` | `resource/js/shared/composables/useUnsavedChangesGuard.js` | in-app route-leave + dirty-cancel confirm; `allowLeave()` after save |
| `BaseFormDialog` | `resource/js/shared/components/BaseFormDialog.vue` | dialog wrapper around BaseForm |
| `FormPageExample` (Storybook) | `…/form/FormPageExample.stories.js` | the copy-paste reference for a full create page |
| Reference migration | `src/components/nonconformances/NonconformancesCreate.vue` | full-page create, done + verified |

**Net-new validators** are added under TDD in `validators.spec.js` the first time a form needs them — never speculatively.

---

## Definition of Done (per file)

A file is done only when ALL hold (extends the original tracker's DoD with the new capabilities):

1. **Surface chosen** per the recipe table; fields use `BaseForm` + `FormSection` + `BaseFieldRow` + `BaseField` + the right inputs. No `Q*`/`W*` (except entity-lookup `W*`), no `<form>`, no hand-rolled card chrome (`bg-white + border + rounded + p-5`).
2. **Validation is per-field `:rules`** (not toast, not a central `validate()` listing every field). `:validate` only for values with no labeled BaseField. Errors surface via `ValidationSummary` + inline.
3. **Multi-section pages (≥4 sections)** wire `FormProgressNav` with `navSections`; optional sections are `collapsible :defaultOpen="false"`.
4. **Create/edit pages** use `useUnsavedChangesGuard(isDirty)` and call `allowLeave()` before the post-save redirect.
5. **Detail (autosave) pages** use `mode="autosave"` + `useAutoSave` + `AutosaveIndicator` in `#footer-status` (no submit button, no guard).
6. **Data layer** is syncEngine (`useLiveQuery`/`useLiveMutation`), not `@/api` CRUD; components take `id` props.
7. **Removed from `ALLOWLIST`** in `scripts/check-form-system.mjs`; `npm run lint:forms` stays green.
8. **ESLint clean**, `npm run lint:layout` + `lint:ds` green, existing + new Vitest tests pass.
9. **Verified by running** the real screen (build/lint ≠ verified): validation fires, submit/autosave works, errors surface, C1 expands a collapsed section on error, dirty-cancel prompts. Auth-gated screens are eyeballed by the user.

---

## Surface Recipes (the reusable task templates)

Each file in the checklist names one recipe. Apply it end-to-end as a single reviewable task (one file = one task = one commit), following the bite-sized step cycle inside.

### Recipe A — Full-page create (`*Create.vue`)

**Model:** `NonconformancesCreate.vue`. **Files:** Modify the `*Create.vue`; no test file (verified at runtime + lint).

> **Tabbed creates stay tabbed (user directive 2026-06-24).** If the existing
> page uses `BaseTabs` (e.g. `DocumentsCreate`: Properties / Content / Training),
> KEEP the tabs and the child components — do NOT flatten them into one scrolling
> sectioned form. Migrate *inside* the existing layout: wrap in `BaseForm`,
> convert each child's fields to `BaseField :value/:rules` (they auto-register
> with the parent `BaseForm` across component boundaries via provide/inject), add
> `useUnsavedChangesGuard`, move submit to the footer. Skip `FormProgressNav` for
> tabbed pages (the tabs are the nav). Do not inline/orphan child components.

**Interfaces consumed:** `BaseForm`, `FormSection`, `BaseFieldRow`, `BaseField`, `FormProgressNav`, `useUnsavedChangesGuard`, `required`/`requiredWhen` from `validators.js`.

- [ ] **Step 1 — Inventory the old form.** List every field, its required-ness, and the current toast/validate messages. Note any cross-field rules.
- [ ] **Step 2 — Page shell.** Root `<BasePage width="standard" fullHeight>` + `PageHeader`. Inside the scroll region add the sticky nav:
  ```vue
  <div class="tw:overflow-y-auto tw:flex-1 tw:min-h-0">
    <div class="tw:sticky tw:top-0 tw:z-10 tw:bg-main"><FormProgressNav :sections="navSections" /></div>
    <BaseForm class="tw:py-6" :validate="validate" :dirty="isDirty" :loading="saving"
      :submitError="submitError" submitLabel="Submit" @submit="onSubmit" @cancel="goBack">
  ```
- [ ] **Step 3 — Sections.** One `FormSection :id` per group; required groups open, optional groups `optional collapsible :defaultOpen="false"`. Fields go in `BaseFieldRow :columns="2"`.
- [ ] **Step 4 — Per-field rules.** Each required field: `:value="form.x" :rules="[required()]"`. Cross-field: `:rules="[requiredWhen(() => form.cond, 'msg')]"`. Only values without a labeled BaseField go in `validate()`.
- [ ] **Step 5 — navSections + completion.** `const navSections = computed(() => [{ id, label, icon, status: <done> ? 'complete' : null }, …])`.
- [ ] **Step 6 — Unsaved guard.** `const { allowLeave } = useUnsavedChangesGuard(isDirty)`; `allowLeave()` immediately before every post-save `router.push`.
- [ ] **Step 7 — Data layer.** Replace any `@/api` entity CRUD with `useLiveMutation`. Keep action-RPCs with the tagged comment.
- [ ] **Step 8 — Remove from allowlist** in `scripts/check-form-system.mjs`.
- [ ] **Step 9 — Verify.** `npx prettier --write <file>`; `npx eslint <file>`; `npm run lint:forms && npm run lint:layout`; `npx vitest run` (no new failures). Then runtime-eyeball with the user.
- [ ] **Step 10 — Commit.** `git commit -m "feat(forms): migrate <Name>Create to the form system"`.

### Recipe B — Dialog create/edit (`*Dialog.vue`)

**Model:** `BaseFormDialog` + `FormPageExample`/`BaseFormDialog.stories.js`. ≤8 fields → single column; no `FormProgressNav` (dialogs aren't multi-section).

- [ ] **Step 1 — Inventory** fields + validation messages.
- [ ] **Step 2 — Wrap** in `BaseFormDialog` (or `BaseDialog` + `BaseForm hideFooter` wired to `BaseDialogFooter`). Body is `FormSection`-less for short dialogs; group with `BaseFieldRow`/`BaseField` directly.
- [ ] **Step 3 — Per-field `:rules`** exactly as Recipe A Step 4. Replace toast-validation entirely.
- [ ] **Step 4 — Submit** via `@submit` → `useLiveMutation` (or tagged action-RPC). On success close the dialog; surface failures via the dialog footer error, not a toast.
- [ ] **Step 5 — Remove from allowlist; verify (lint + vitest + runtime); commit.**

### Recipe C — Detail page (`*PageId.vue`) — chrome swap inside `BaseDetailLayout`

> **CORRECTED 2026-06-24 after investigation.** These pages are ALREADY migrated
> to `BaseDetailLayout` + `defineDetailConfig` + (mostly) `useAutoSave` by the
> prior detail-template effort. They autosave and do NOT use `BaseForm`. **Do NOT
> add `BaseForm`/`mode="autosave"`/`FormProgressNav`/`AutosaveIndicator`** — that
> would fight `BaseDetailLayout`. The ONLY form-guard violations left are (a)
> leftover hand-rolled card chrome inside the `#section-*` slots, and (b)
> toast-as-validation on the two `toast`-tagged pages. This recipe is a light
> chrome/validation swap, nothing structural.

- [ ] **Step 1 — Swap each hand-rolled card** inside the `#section-*` slots: a `<div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">` that wraps a hand-rolled overline/bordered header + fields → `<FormSection title="…">` (FormSection IS card-surface + titled header, so drop the bespoke `<BaseText variant="overline">…</BaseText>` header too). A plain surface with no title → `<BaseCard>`. Keep all inner fields/inline-edit/v-model/handlers byte-for-byte.
- [ ] **Step 2 — Toast→inline (only ChangeRequestsPageId, TrainingPageId):** replace `toast.*('… required')` inline-edit validation with inline error display (surface `save()` errors / a small inline error ref next to the field — per CLAUDE.md "inline edit + auto-save"; BaseModel validates on save). No central `validate()`, no BaseForm.
- [ ] **Step 3 — Do NOT touch** the `BaseDetailLayout`/`defineDetailConfig`/`useAutoSave`/rail/dialogs/queries/computeds. This is IA-chrome only.
- [ ] **Step 4 — Extract** any bespoke severity/priority toggle to `SegmentedControl` only if trivially in the swapped section (else leave).
- [ ] **Step 5 — Remove from allowlist; verify** (eslint + `lint:forms`/`layout`/`ds` + vitest + **`pnpm build`**).

### Recipe D — Settings/admin card (`*Card.vue` with `toast`)

These edit a small set of fields inside a card. **Model:** `FormSection` wrapping fields + `:rules`.

- [ ] **Step 1 — Swap chrome:** hand-rolled card → `FormSection` (if it wraps editable fields) or `BaseCard`/`PageSection` (display-only).
- [ ] **Step 2 — If it edits fields,** wrap in `BaseForm` (often `hideFooter` with an inline Save), per-field `:rules`, `useLiveMutation` for the create/update.
- [ ] **Step 3 — Remove from allowlist; verify; commit.**

### Recipe E — Admin list/home (`*Home.vue`) & display card (`card`-only)

Usually incidental card chrome, not a real form. **Model:** chrome swap only.

- [ ] **Step 1 — Swap** `bg-white + border + rounded + p-5` → `BaseCard`/`PageSection`. Add `BaseForm` ONLY if it actually edits fields (then it's Recipe D).
- [ ] **Step 2 — Remove from allowlist; verify; commit.**

### Recipe F — Embedded panel/section & auth

**Panels:** case-by-case. Editing fields → `FormSection` + `BaseField` (+ `BaseForm` if it has its own submit). Display-only → `BaseCard`/`PageSection`.
**Auth (`auth/*Form.vue`):** keep their own page chrome (outside the app shell) but migrate validation to `ValidationSummary` + `BaseField :error`/`:rules`.

- [ ] **Step 1 — Classify** edit-vs-display; pick the surface.
- [ ] **Step 2 — Apply** the matching field/validation pattern; data via syncEngine where applicable.
- [ ] **Step 3 — Remove from allowlist; verify; commit.**

---

## Phased Checklist (81 files)

Tick a box only when its file meets the full Definition of Done and is removed from the allowlist. Tag legend: **A** create · **B** dialog · **C** detail-autosave · **D** settings-card · **E** list/display · **F** panel/auth.

### Phase 1 — Full-page creates (highest visibility, proves Recipe A across modules)
- [ ] `capas/CapasCreate.vue` — **A**
- [ ] `changeRequests/ChangeRequestsCreate.vue` — **A**
- [ ] `customerComplaints/CustomerComplaintsCreate.vue` — **A**
- [ ] `documents/DocumentsCreate.vue` — **A**
- [ ] `trainings/TrainingsCreate.vue` — **A**

### Phase 2 — Dialog creates (Recipe B; settle the ≤8-field rule once)
- [ ] `audits/AuditInstanceCreateDialog.vue` — **B**
- [ ] `audits/AuditProgramCreateDialog.vue` — **B**
- [ ] `audits/AuditStandardCloneDialog.vue` — **B**
- [ ] `audits/AuditStandardCreateDialog.vue` — **B**
- [ ] `audits/AuditStandardImportDialog.vue` — **B**
- [ ] `capas/CapaAddChildStepDialog.vue` — **B**
- [ ] `capas/CapaEffectivenessCheckCompleteDialog.vue` — **B**
- [ ] `capas/CapaEffectivenessCheckRenewDialog.vue` — **B**
- [ ] `capas/CapaEffectivenessCheckScheduleDialog.vue` — **B**
- [ ] `changeRequests/ChangeRequestAddChildStepDialog.vue` — **B**
- [ ] `customerComplaints/ComplaintFormEditDialog.vue` — **B**
- [ ] `customerComplaints/CustomerComplaintConvertToNcDialog.vue` — **B**
- [ ] `informationRequests/InformationRequestDialog.vue` — **B**
- [ ] `products/ProductFamilyCreateDialog.vue` — **B**
- [ ] `qcInspection/DefectCatalogCreateDialog.vue` — **B**
- [ ] `qualityEvents/QualityEventCreateDialog.vue` — **B**
- [ ] `records/AddRecordDialog.vue` — **B**
- [ ] `trainingMatrix/TrainingMatrixAddDialog.vue` — **B**

### Phase 3 — Detail pages, autosave (Recipe C)
- [ ] `audits/AuditInstancesPageId.vue` — **C**
- [ ] `audits/AuditProgramsPageId.vue` — **C**
- [ ] `audits/AuditStandardsPageId.vue` — **C**
- [ ] `capas/CapasPageId.vue` — **C**
- [ ] `changeRequests/ChangeRequestsPageId.vue` — **C**
- [ ] `customerComplaints/CustomerComplaintsPageId.vue` — **C**
- [ ] `inspectionsLogs/LogBookDetailPage.vue` — **C**
- [ ] `myTraining/MyTrainingPageId.vue` — **C**
- [ ] `nonconformances/NonconformancesPageId.vue` — **C**
- [ ] `trainingInstances/TrainingInstancePageId.vue` — **C**
- [ ] `trainings/TrainingPageId.vue` — **C**

### Phase 4 — Settings/admin cards (Recipe D) & company config cards
- [ ] `company/auditFindingCategoriesCard.vue` — **D**
- [ ] `company/auditStandardTypesCard.vue` — **D**
- [ ] `company/EventCategoriesCard.vue` — **D**
- [ ] `company/EventSeveritiesCard.vue` — **D**
- [ ] `company/ncDispositionTypesCard.vue` — **D**
- [ ] `company/ncIssueTypesCard.vue` — **D**
- [ ] `company/ProductFamiliesCard.vue` — **D**
- [ ] `company/supplierCertificateTypesCard.vue` — **D**
- [ ] `rcaTemplate/RootCauseCategoriesCard.vue` — **D**
- [ ] `riskAssessmentTemplate/HazardCategoriesCard.vue` — **D**
- [ ] `capas/CapaEffectivenessCheckCard.vue` — **D**
- [ ] `customFields/CustomFieldsCard.vue` — **D/E** (display-only → E)

### Phase 5 — Admin list/home & display cards (Recipe E)
- [ ] `customerComplaints/CannedResponsesHome.vue` — **E** (+D if it edits)
- [ ] `customerComplaints/ComplaintFormsHome.vue` — **E**
- [ ] `customerComplaints/EmailChannelsHome.vue` — **E**
- [ ] `customerComplaints/RoutingRulesHome.vue` — **E** (+D if it edits)
- [ ] `customerComplaints/SuspendedEmailsHome.vue` — **E**
- [ ] `customerComplaints/ComplaintSlaSettings.vue` — **D**
- [ ] `inspectionsLogs/InspectionsLogsHome.vue` — **E**
- [ ] `inspectionsLogs/InspectionsLogsTemplatesHome.vue` — **E**

### Phase 6 — Embedded panels/sections & auth (Recipe F)
- [ ] `audits/AuditAgendaPanel.vue` — **F**
- [ ] `audits/AuditOriginPanel.vue` — **F**
- [ ] `audits/AuditRequirementsEditor.vue` — **F**
- [ ] `audits/AuditsInsightsDashboard.vue` — **F** (display)
- [ ] `automationRules/AutomationRuleBuilder.vue` — **F**
- [ ] `capas/CapaWorkflowDraftPreview.vue` — **F** (display)
- [ ] `changeRequests/ChangeRequestWorkflowDraftPreview.vue` — **F** (display)
- [ ] `changeRequests/ChangeRequestWorkflowSection.vue` — **F**
- [ ] `customerComplaints/CustomerComplaintAttachmentsPanel.vue` — **F**
- [ ] `customerComplaints/CustomerComplaintConversation.vue` — **F**
- [ ] `customerComplaints/CustomerComplaintFormPanel.vue` — **F**
- [ ] `customerComplaints/CustomerComplaintReports.vue` — **F** (display)
- [ ] `customFields/CustomFieldsCreateSection.vue` — **F**
- [ ] `documents/DocumentsTrainingTab.vue` — **F**
- [ ] `formAssignment/FormAssignmentEditor.vue` — **F** (full-canvas — verify layout exemption)
- [ ] `informationRequests/InformationRequestsSection.vue` — **F**
- [ ] `inspectionsLogs/FieldRecordPreview.vue` — **F**
- [ ] `nonconformances/NcWorkflowDraftPreview.vue` — **F** (display)
- [ ] `suppliers/SuppliersDocumentsTab.vue` — **F**
- [ ] `suppliers/SuppliersUsersTab.vue` — **F**
- [ ] `taskInstance/TaskInstanceCapaActions.vue` — **F**
- [ ] `taskInstance/TaskInstanceNcActions.vue` — **F**
- [ ] `trainingVerifications/TrainingVerificationPanel.vue` — **F**
- [ ] `workflow/WorkflowStep.vue` — **F**
- [ ] `workflow/WorkflowStepActionsMenu.vue` — **F**
- [ ] `workflow/WorkflowStepForm.vue` — **F**
- [ ] `auth/ForgotPasswordForm.vue` — **F** (auth)
- [ ] `auth/LoginForm.vue` — **F** (auth)

### Phase 7 — Lock it in
- [ ] When the allowlist is empty, delete the `ALLOWLIST` array and make `scripts/check-form-system.mjs` enforce the rules repo-wide.
- [ ] Update `docs/superpowers/specs/2026-06-23-form-migration-plan.md` progress table to 0 remaining.

---

## Per-task cadence (applies to every checklist item)

Because each file is one reviewable task, the inner loop is identical:

1. Read the file + its data layer; pick the recipe.
2. Apply the recipe steps (above).
3. `npx prettier --write <file>` → `npx eslint <file>` (0 errors).
4. `npm run lint:forms && npm run lint:layout && npm run lint:ds` (green).
5. `npx vitest run` (no new failures; add/adjust component tests when behavior is non-trivial — e.g. cross-field rules).
6. Runtime-verify the real screen (user eyeballs auth-gated pages).
7. Commit one file per commit: `feat(forms): migrate <File> to the form system`.

## Risk notes

- **Workflow-bearing creates** (CAPA, ChangeRequest) share the `WorkflowReviewerPickerDialog` + `:validate` escape-hatch pattern from NC. Reuse it; do not invent a new validation path. (A future `WorkflowCard` to replace the dialog is a separate effort — see the UX review, not this plan.)
- **`FormAssignmentEditor`** is likely a full-canvas editor exempt from `BasePage` (see CLAUDE.md layout exemptions) — confirm before forcing it into a page shell.
- **Net-new validators** (`minLen`, `pattern`, `email`, numeric bounds) get TDD'd into `validators.spec.js` the first time a form needs them — keep them demand-driven.
- **Detail vs create:** `*PageId.vue` is autosave (Recipe C, no guard/footer-submit); `*Create.vue` is explicit-submit (Recipe A, with guard). Do not mix the two modes.

---

## Self-Review

- **Spec coverage:** every file in the authoritative `ALLOWLIST` (82; NC create already removed → 81 remaining) appears exactly once in the phased checklist, each tagged to a recipe. ✓
- **Placeholder scan:** no TBD/TODO; recipes contain concrete steps and the one code template (Recipe A shell) that differs from prose. ✓
- **Type/name consistency:** `useUnsavedChangesGuard`/`allowLeave`, `navSections`, `required`/`requiredWhen`, `mode="autosave"`, `FormProgressNav :sections` all match the shipped Foundation APIs. ✓
- **Ambiguity:** a few files are edit-vs-display judgment calls (`CustomFieldsCard`, `CannedResponsesHome`, `RoutingRulesHome`) — flagged inline with both tags; the implementer classifies in Step 1 of the recipe. ✓
