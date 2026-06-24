# Form Migration Plan — all forms (2026-06-23)

> The single tracker for migrating every form onto the form system
> ([2026-06-23-form-system-design.md](2026-06-23-form-system-design.md)). One
> checkbox per file. Check it off only when the file is migrated, removed from
> the `lint:forms` allowlist, and verified by running.

## Source of truth

`scripts/check-form-system.mjs` is authoritative — its `ALLOWLIST` is the list
of not-yet-migrated files. This doc mirrors it for planning. The two guards:

- **`card`** — hand-rolled form-card chrome (`bg-white + border + rounded + p-5`) → `FormSection` (or `BaseCard`/`PageSection` for a non-form card).
- **`toast`** — `toast.notify({ … 'is required' })` validation → `ValidationSummary` + `BaseField :error` (via `BaseForm`).

A tag of `card`+`toast` means both. `toast` ⇒ it's a real input form. `card`-only
⇒ usually an *incidental* card (dashboard/panel/conversation) that just needs the
chrome swapped, **not** a `BaseForm`.

## Definition of done (per file)

1. Surface chosen per the rules below; fields use `BaseForm` + `FormSection` + `BaseFieldRow` + `BaseField` + the right inputs.
2. No hand-rolled card chrome; no toast-as-validation.
3. **Removed from the `ALLOWLIST`** in `scripts/check-form-system.mjs`; `npm run lint:forms` stays green.
4. **Verified by running** the real screen (build/lint passing ≠ verified): validation, submit/autosave, errors.
5. ESLint clean; existing tests pass.

## Recipes by surface

| Surface | What to do |
|---|---|
| **full-page create** (`*Create.vue`) | `BasePage fullHeight` → `BaseForm` (`mode="submit"`) with `StickyFormFooter`. Move the header submit button into the footer. `validate()` replaces toasts. |
| **dialog** (`*Dialog.vue`) | `BaseFormDialog` wrapping `BaseForm` (`hideFooter`, use the dialog's footer) — or keep `BaseDialog` + `BaseForm hideFooter` and wire `@submit` to `BaseDialogFooter`. Validation via `validate()` + inline errors. |
| **detail (autosave)** (`*PageId.vue`) | `BaseForm mode="autosave"`, keep `useAutoSave`, drop `AutosaveIndicator` into `#footer-status`. Sections → `FormSection`. Extract bespoke severity/priority toggles to `SegmentedControl`. |
| **admin list/home, settings, card** | Usually `card`-only. Swap the hand-rolled card to `FormSection` (if it wraps fields) or `BaseCard`/`PageSection` (if it's a display card). Add `BaseForm` only if it actually edits fields. |
| **auth** (`auth/*Form.vue`) | Out of the app shell, but still migrate validation to `ValidationSummary`/`BaseField :error`. Keep their own page chrome. |
| **embedded panel/section** | Case-by-case. If it edits fields → `FormSection` + `BaseField`(+`BaseForm` if it has its own submit). If it's display-only → `BaseCard`/`PageSection`. |

## Phased order

1. **Phase 1 — reference:** `NonconformancesCreate.vue` (full-page create). Proves the pattern + becomes the template.
2. **Phase 2 — full-page creates:** the other `*Create.vue` (CAPA, ChangeRequest, CustomerComplaint, Documents, Trainings).
3. **Phase 3 — dialog creates:** the `*Dialog.vue` set (settle the ≤8-field dialog rule).
4. **Phase 4 — detail pages:** the `*PageId.vue` set onto `mode="autosave"` + `AutosaveIndicator`; extract `SegmentedControl`.
5. **Phase 5 — long tail:** settings/company cards, customer-complaints admin, panels, workflow, auth.

---

## Tracker (83 files, grouped by module)

> `toast` = real form (validate pipeline). `card` = card chrome to swap.

#### audits (12)
- [ ] `AuditAgendaPanel.vue` — embedded panel/section — `card`
- [ ] `AuditInstanceCreateDialog.vue` — dialog — `toast`
- [ ] `AuditInstancesPageId.vue` — detail (autosave) — `card`
- [ ] `AuditOriginPanel.vue` — embedded panel/section — `card`
- [ ] `AuditProgramCreateDialog.vue` — dialog — `toast`
- [ ] `AuditProgramsPageId.vue` — detail (autosave) — `card`
- [ ] `AuditRequirementsEditor.vue` — embedded panel/section — `toast`
- [ ] `AuditsInsightsDashboard.vue` — embedded panel/section — `card`
- [ ] `AuditStandardCloneDialog.vue` — dialog — `toast`
- [ ] `AuditStandardCreateDialog.vue` — dialog — `toast`
- [ ] `AuditStandardImportDialog.vue` — dialog — `toast`
- [ ] `AuditStandardsPageId.vue` — detail (autosave) — `card`

#### auth (2)
- [ ] `ForgotPasswordForm.vue` — auth — `toast`
- [ ] `LoginForm.vue` — auth — `toast`

#### automationRules (1)
- [ ] `AutomationRuleBuilder.vue` — embedded panel/section — `toast`

#### capas (8)
- [ ] `CapaAddChildStepDialog.vue` — dialog — `toast`
- [ ] `CapaEffectivenessCheckCard.vue` — card/section — `card`
- [ ] `CapaEffectivenessCheckCompleteDialog.vue` — dialog — `toast`
- [ ] `CapaEffectivenessCheckRenewDialog.vue` — dialog — `toast`
- [ ] `CapaEffectivenessCheckScheduleDialog.vue` — dialog — `toast`
- [ ] `CapasCreate.vue` — full-page create — `card`+`toast`
- [ ] `CapasPageId.vue` — detail (autosave) — `card`
- [ ] `CapaWorkflowDraftPreview.vue` — embedded panel/section — `card`

#### changeRequests (5)
- [ ] `ChangeRequestAddChildStepDialog.vue` — dialog — `toast`
- [ ] `ChangeRequestsCreate.vue` — full-page create — `card`+`toast`
- [ ] `ChangeRequestsPageId.vue` — detail (autosave) — `card`+`toast`
- [ ] `ChangeRequestWorkflowDraftPreview.vue` — embedded panel/section — `card`
- [ ] `ChangeRequestWorkflowSection.vue` — embedded panel/section — `card`

#### company (8)
- [ ] `auditFindingCategoriesCard.vue` — card/section — `toast`
- [ ] `auditStandardTypesCard.vue` — card/section — `toast`
- [ ] `EventCategoriesCard.vue` — card/section — `toast`
- [ ] `EventSeveritiesCard.vue` — card/section — `toast`
- [ ] `ncDispositionTypesCard.vue` — card/section — `toast`
- [ ] `ncIssueTypesCard.vue` — card/section — `toast`
- [ ] `ProductFamiliesCard.vue` — card/section — `toast`
- [ ] `supplierCertificateTypesCard.vue` — card/section — `toast`

#### customFields (2)
- [ ] `CustomFieldsCard.vue` — card/section — `card`
- [ ] `CustomFieldsCreateSection.vue` — embedded panel/section — `card`

#### customerComplaints (14)
- [ ] `CannedResponsesHome.vue` — admin list/home — `card`+`toast`
- [ ] `ComplaintFormEditDialog.vue` — dialog — `toast`
- [ ] `ComplaintFormsHome.vue` — admin list/home — `card`
- [ ] `ComplaintSlaSettings.vue` — settings — `card`
- [ ] `CustomerComplaintAttachmentsPanel.vue` — embedded panel/section — `card`
- [ ] `CustomerComplaintConversation.vue` — embedded panel/section — `card`
- [ ] `CustomerComplaintConvertToNcDialog.vue` — dialog — `toast`
- [ ] `CustomerComplaintFormPanel.vue` — embedded panel/section — `card`
- [ ] `CustomerComplaintReports.vue` — embedded panel/section — `card`
- [ ] `CustomerComplaintsCreate.vue` — full-page create — `card`+`toast`
- [ ] `CustomerComplaintsPageId.vue` — detail (autosave) — `card`
- [ ] `EmailChannelsHome.vue` — admin list/home — `card`
- [ ] `RoutingRulesHome.vue` — admin list/home — `card`+`toast`
- [ ] `SuspendedEmailsHome.vue` — admin list/home — `card`

#### documents (2)
- [ ] `DocumentsCreate.vue` — full-page create — `toast`
- [ ] `DocumentsTrainingTab.vue` — embedded panel/section — `card`

#### formAssignment (1)
- [ ] `FormAssignmentEditor.vue` — embedded panel/section — `card`

#### informationRequests (2)
- [ ] `InformationRequestDialog.vue` — dialog — `toast`
- [ ] `InformationRequestsSection.vue` — embedded panel/section — `card`

#### inspectionsLogs (4)
- [ ] `FieldRecordPreview.vue` — embedded panel/section — `toast`
- [ ] `InspectionsLogsHome.vue` — admin list/home — `card`
- [ ] `InspectionsLogsTemplatesHome.vue` — admin list/home — `card`
- [ ] `LogBookDetailPage.vue` — detail (autosave) — `card`

#### myTraining (1)
- [ ] `MyTrainingPageId.vue` — detail (autosave) — `card`

#### nonconformances (3)
- [ ] `NcWorkflowDraftPreview.vue` — embedded panel/section — `card`
- [x] `NonconformancesCreate.vue` — full-page create — `card`+`toast` — **migrated (Phase 1 reference)**; pending runtime verification
- [ ] `NonconformancesPageId.vue` — detail (autosave) — `card`

#### products (1)
- [ ] `ProductFamilyCreateDialog.vue` — dialog — `toast`

#### qcInspection (1)
- [ ] `DefectCatalogCreateDialog.vue` — dialog — `toast`

#### qualityEvents (1)
- [ ] `QualityEventCreateDialog.vue` — dialog — `toast`

#### rcaTemplate (1)
- [ ] `RootCauseCategoriesCard.vue` — card/section — `toast`

#### records (1)
- [ ] `AddRecordDialog.vue` — dialog — `toast`

#### riskAssessmentTemplate (1)
- [ ] `HazardCategoriesCard.vue` — card/section — `toast`

#### suppliers (2)
- [ ] `SuppliersDocumentsTab.vue` — embedded panel/section — `toast`
- [ ] `SuppliersUsersTab.vue` — embedded panel/section — `toast`

#### taskInstance (2)
- [ ] `TaskInstanceCapaActions.vue` — embedded panel/section — `toast`
- [ ] `TaskInstanceNcActions.vue` — embedded panel/section — `toast`

#### trainingInstances (1)
- [ ] `TrainingInstancePageId.vue` — detail (autosave) — `card`

#### trainingMatrix (1)
- [ ] `TrainingMatrixAddDialog.vue` — dialog — `toast`

#### trainingVerifications (1)
- [ ] `TrainingVerificationPanel.vue` — embedded panel/section — `card`+`toast`

#### trainings (2)
- [ ] `TrainingPageId.vue` — detail (autosave) — `toast`
- [ ] `TrainingsCreate.vue` — full-page create — `card`+`toast`

#### workflow (3)
- [ ] `WorkflowStep.vue` — embedded panel/section — `card`
- [ ] `WorkflowStepActionsMenu.vue` — embedded panel/section — `toast`
- [ ] `WorkflowStepForm.vue` — embedded panel/section — `toast`

---

## Progress

| Bucket | Count |
|---|---|
| Real forms (have `toast` validation) | 50 |
| Card-only (chrome swap) | 33 |
| **Total in allowlist** | **82** |
| Migrated (removed from allowlist) | 1 |

Update this table and tick boxes as files migrate. When the allowlist is empty,
delete it and make `lint:forms` enforce the rules repo-wide.
