/**
 * The approval flow for a document created WITHOUT a template
 * (user request 2026-08-16).
 *
 * Moving document approval onto the Document Template (2026-08-15) had a side
 * effect nobody asked for: the template became mandatory, because it was the
 * only thing that supplied a workflow. But a QMS still requires that someone
 * other than the author approves a document — "no template" must not mean "no
 * approval", and it must not mean "cannot submit" either.
 *
 * So a document with no template runs a per-company AD-HOC flow: two ordinary
 * APPROVAL steps, Review then Approval, carrying NO roles. Everything else is
 * unchanged — the engine, tasks, e-signature, notifications.
 *
 * The reason it carries no roles is the whole trick. The existing submit
 * dialog already offers every active internal user for a role-less step
 * ("Step has no roles → every active internal user"), so the submitter is
 * asked to pick a reviewer and an approver at submit time and those picks
 * arrive as `pickedReviewers`, which submitResourceForReview already honours
 * verbatim over role expansion. No new dialog, no new backend path.
 *
 * Identified by `isDefault` on module APPROVAL rather than by name: the
 * partial unique index workflows_one_default_per_module makes "at most one per
 * company" a database guarantee instead of a naming convention, and nothing
 * else uses the flag on this module (template companions are all isDefault
 * false). It is hidden from Approval Flows for free — module APPROVAL is
 * template-owned. See isTemplateOwnedModule.
 */
import { pickPublishedVersionId } from '@/components/documentTemplates/documentTemplateApprovalFlow.js'

export const AD_HOC_APPROVAL_NAME = 'Document Approval'
export const AD_HOC_REVIEW_STEP = 'Review'
export const AD_HOC_APPROVAL_STEP = 'Approval'

/** The two role-less gates. Pure, so the shape is testable without a db. */
export function adHocApprovalSteps() {
  return [
    {
      name: AD_HOC_REVIEW_STEP,
      description: 'Reviewed for accuracy and completeness by someone other than the author.',
      stepOrder: 1,
    },
    {
      name: AD_HOC_APPROVAL_STEP,
      description: 'Final sign-off for release.',
      stepOrder: 2,
    },
  ]
}

/** The company's ad-hoc flow, or null when it hasn't been created yet. */
export async function findAdHocApprovalWorkflow(db) {
  const workflows = await db.Workflow.where('moduleId', 'APPROVAL').exec()
  return workflows.find((w) => w.isDefault) ?? null
}

/** Published version id of the ad-hoc flow, or null. Never a draft. */
export async function findAdHocApprovalVersionId(db) {
  const workflow = await findAdHocApprovalWorkflow(db)
  if (!workflow) return null
  const versions = await db.WorkflowVersion.where('workflowId', workflow.id).exec()
  return pickPublishedVersionId(versions)
}

/**
 * Make sure the company has an ad-hoc flow, and return its published version
 * id. Create-only: an existing flow is returned untouched, so a company that
 * has edited it (renamed a step, added a third gate, pinned a role) keeps
 * those edits.
 *
 * Lazily created rather than seed-only, because every company that onboarded
 * before this existed would otherwise be unable to create a template-less
 * document at all.
 */
export async function ensureAdHocApprovalVersionId(db) {
  const existing = await findAdHocApprovalVersionId(db)
  if (existing) return existing

  const workflow = db.Workflow.create({
    name: AD_HOC_APPROVAL_NAME,
    description:
      'Used by documents created without a template. The reviewer and approver are chosen when the document is submitted.',
    moduleId: 'APPROVAL',
    statusId: 'ACTIVE',
    isDefault: true,
  })
  await workflow.save()

  const version = db.WorkflowVersion.create({
    workflowId: workflow.id,
    versionMajor: 1,
    versionMinor: 0,
    statusId: 'PUBLISHED',
    isCurrent: true,
  })
  await version.save()

  const outcomes = await db.WorkflowStepOutcome.where().exec()

  for (const plan of adHocApprovalSteps()) {
    const step = db.WorkflowStep.create({
      workflowVersionId: version.id,
      name: plan.name,
      description: plan.description,
      stepOrder: plan.stepOrder,
      stepType: 'APPROVAL',
      approvalRule: 'ALL',
      slaDays: null,
      requireComments: true,
      // Matches every other document approval in the product. A templated
      // document's gates are e-signed (21 CFR 820.40 / Part 11 §11.50), and an
      // untemplated one being quietly less controlled would be the surprise.
      requireEsignature: true,
      formSchema: [],
    })
    await step.save()

    // Deliberately NO WorkflowStepRole rows — that is what makes the submit
    // dialog offer every active user and ask who should review and approve.
    for (const o of outcomes) {
      const rec = db.AllowedOutcomeOnStep.create({ stepId: step.id, outcomeId: o.id })
      await rec.save()
    }
  }

  return version.id
}
