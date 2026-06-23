#!/usr/bin/env node
/**
 * Form-system guard — enforces the reusable form foundation (docs/superpowers/
 * specs/2026-06-23-form-system-design.md) so new/touched forms can't reintroduce
 * the two anti-patterns the system removed:
 *
 *   1. no-handrolled-form-card — a titled form section must use <FormSection>
 *      (BaseCard + BaseSectionHeader), not a hand-rolled
 *      `<div class="tw:bg-white tw:border … tw:rounded-* tw:p-5">` card. The
 *      literal also hardcodes bg-white (breaks dark mode — FormSection uses
 *      bg-card).
 *   2. no-toast-validation — required-field validation must surface through
 *      <ValidationSummary> + per-field <BaseField :error>, not a pile of
 *      `toast({ message: 'X is required' })` calls (one error at a time,
 *      transient, unanchored, a screen-reader dead end).
 *
 * The ALLOWLIST holds forms not yet migrated: the gate is green today and
 * tightens as each form moves onto BaseForm — REMOVE a file from the list when
 * you migrate it (so it can never regress). Run: `npm run lint:forms`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCAN_DIRS = ['src/components', 'src/pages']

// Forms not yet migrated onto the form system. Remove a file when you migrate
// it. (Seeded from the current offenders so the gate is non-breaking.)
const ALLOWLIST = [
  'src/components/audits/AuditAgendaPanel.vue',
  'src/components/audits/AuditInstanceCreateDialog.vue',
  'src/components/audits/AuditInstancesPageId.vue',
  'src/components/audits/AuditOriginPanel.vue',
  'src/components/audits/AuditProgramCreateDialog.vue',
  'src/components/audits/AuditProgramsPageId.vue',
  'src/components/audits/AuditRequirementsEditor.vue',
  'src/components/audits/AuditsInsightsDashboard.vue',
  'src/components/audits/AuditStandardCloneDialog.vue',
  'src/components/audits/AuditStandardCreateDialog.vue',
  'src/components/audits/AuditStandardImportDialog.vue',
  'src/components/audits/AuditStandardsPageId.vue',
  'src/components/auth/ForgotPasswordForm.vue',
  'src/components/auth/LoginForm.vue',
  'src/components/automationRules/AutomationRuleBuilder.vue',
  'src/components/capas/CapaAddChildStepDialog.vue',
  'src/components/capas/CapaEffectivenessCheckCard.vue',
  'src/components/capas/CapaEffectivenessCheckCompleteDialog.vue',
  'src/components/capas/CapaEffectivenessCheckRenewDialog.vue',
  'src/components/capas/CapaEffectivenessCheckScheduleDialog.vue',
  'src/components/capas/CapasCreate.vue',
  'src/components/capas/CapasPageId.vue',
  'src/components/capas/CapaWorkflowDraftPreview.vue',
  'src/components/changeRequests/ChangeRequestAddChildStepDialog.vue',
  'src/components/changeRequests/ChangeRequestsCreate.vue',
  'src/components/changeRequests/ChangeRequestsPageId.vue',
  'src/components/changeRequests/ChangeRequestWorkflowDraftPreview.vue',
  'src/components/changeRequests/ChangeRequestWorkflowSection.vue',
  'src/components/company/auditFindingCategoriesCard.vue',
  'src/components/company/auditStandardTypesCard.vue',
  'src/components/company/EventCategoriesCard.vue',
  'src/components/company/EventSeveritiesCard.vue',
  'src/components/company/ncDispositionTypesCard.vue',
  'src/components/company/ncIssueTypesCard.vue',
  'src/components/company/ProductFamiliesCard.vue',
  'src/components/company/supplierCertificateTypesCard.vue',
  'src/components/customerComplaints/CannedResponsesHome.vue',
  'src/components/customerComplaints/ComplaintFormEditDialog.vue',
  'src/components/customerComplaints/ComplaintFormsHome.vue',
  'src/components/customerComplaints/ComplaintSlaSettings.vue',
  'src/components/customerComplaints/CustomerComplaintAttachmentsPanel.vue',
  'src/components/customerComplaints/CustomerComplaintConversation.vue',
  'src/components/customerComplaints/CustomerComplaintConvertToNcDialog.vue',
  'src/components/customerComplaints/CustomerComplaintFormPanel.vue',
  'src/components/customerComplaints/CustomerComplaintReports.vue',
  'src/components/customerComplaints/CustomerComplaintsCreate.vue',
  'src/components/customerComplaints/CustomerComplaintsPageId.vue',
  'src/components/customerComplaints/EmailChannelsHome.vue',
  'src/components/customerComplaints/RoutingRulesHome.vue',
  'src/components/customerComplaints/SuspendedEmailsHome.vue',
  'src/components/customFields/CustomFieldsCard.vue',
  'src/components/customFields/CustomFieldsCreateSection.vue',
  'src/components/documents/DocumentsCreate.vue',
  'src/components/documents/DocumentsTrainingTab.vue',
  'src/components/formAssignment/FormAssignmentEditor.vue',
  'src/components/informationRequests/InformationRequestDialog.vue',
  'src/components/informationRequests/InformationRequestsSection.vue',
  'src/components/inspectionsLogs/FieldRecordPreview.vue',
  'src/components/inspectionsLogs/InspectionsLogsHome.vue',
  'src/components/inspectionsLogs/InspectionsLogsTemplatesHome.vue',
  'src/components/inspectionsLogs/LogBookDetailPage.vue',
  'src/components/myTraining/MyTrainingPageId.vue',
  'src/components/nonconformances/NcWorkflowDraftPreview.vue',
  'src/components/nonconformances/NonconformancesCreate.vue',
  'src/components/nonconformances/NonconformancesPageId.vue',
  'src/components/products/ProductFamilyCreateDialog.vue',
  'src/components/qcInspection/DefectCatalogCreateDialog.vue',
  'src/components/qualityEvents/QualityEventCreateDialog.vue',
  'src/components/rcaTemplate/RootCauseCategoriesCard.vue',
  'src/components/records/AddRecordDialog.vue',
  'src/components/riskAssessmentTemplate/HazardCategoriesCard.vue',
  'src/components/suppliers/SuppliersDocumentsTab.vue',
  'src/components/suppliers/SuppliersUsersTab.vue',
  'src/components/taskInstance/TaskInstanceCapaActions.vue',
  'src/components/taskInstance/TaskInstanceNcActions.vue',
  'src/components/trainingInstances/TrainingInstancePageId.vue',
  'src/components/trainingMatrix/TrainingMatrixAddDialog.vue',
  'src/components/trainings/TrainingPageId.vue',
  'src/components/trainings/TrainingsCreate.vue',
  'src/components/trainingVerifications/TrainingVerificationPanel.vue',
  'src/components/workflow/WorkflowStep.vue',
  'src/components/workflow/WorkflowStepActionsMenu.vue',
  'src/components/workflow/WorkflowStepForm.vue',
]

function allowlisted(rel) {
  return ALLOWLIST.some((a) => rel.includes(a))
}

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (name.endsWith('.vue')) out.push(full)
  }
  return out
}

// A hand-rolled card surface: bg-white + border + rounded-* + p-5 in one class
// attribute (the chrome FormSection replaces). Order-independent on the three
// signals that distinguish a "card" from an incidental bg-white box.
const HANDROLLED_CARD = [
  /tw:bg-white(?=[^"']*tw:border)(?=[^"']*tw:rounded)(?=[^"']*tw:p-5)/,
  /tw:p-5(?=[^"']*tw:bg-white)(?=[^"']*tw:border)(?=[^"']*tw:rounded)/,
]

// toast(...) / toast.notify(...) / toast.error(...) whose message looks like a
// field-validation error.
const TOAST_VALIDATION = /\btoast(?:\.\w+)?\([^)]*(?:is required|required|please (?:select|enter|fill|complete))/i

const RULES = [
  {
    id: 'no-handrolled-form-card',
    test: (src) => HANDROLLED_CARD.some((re) => re.test(src)),
    msg: 'Hand-rolled form card (bg-white + border + rounded + p-5). Use <FormSection title icon> — it owns the chrome and is dark-mode-safe (bg-card).',
  },
  {
    id: 'no-toast-validation',
    test: (src) => TOAST_VALIDATION.test(src),
    msg: 'Validation surfaced via toast. Use <ValidationSummary> + <BaseField :error> (BaseForm wires both) so errors are persistent, anchored, and accessible.',
  },
]

const violations = []
for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file)
    if (allowlisted(rel)) continue
    const src = readFileSync(file, 'utf8')
    for (const rule of RULES) {
      if (rule.test(src)) violations.push({ rel, id: rule.id, msg: rule.msg })
    }
  }
}

if (violations.length) {
  console.error(`\n✖ Form-system guard: ${violations.length} violation(s)\n`)
  for (const v of violations) {
    console.error(`  ${v.rel}\n    [${v.id}] ${v.msg}\n`)
  }
  console.error('See docs/superpowers/specs/2026-06-23-form-system-design.md.')
  console.error('If a file is a not-yet-migrated form, add it to the ALLOWLIST')
  console.error('in scripts/check-form-system.mjs (and remove it when you migrate).\n')
  process.exit(1)
}

console.log('✓ Form-system guard: no violations')
