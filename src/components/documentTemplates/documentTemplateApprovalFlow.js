/**
 * The approval flow a Document Template owns (user decision 2026-08-15).
 *
 * Authoring a standalone APPROVAL-module workflow and then pointing each
 * document at it was friction with no payoff: every document already comes from
 * a template. So the template OWNS a workflow — `documentTemplate.workflowId` —
 * and documents created from it inherit that workflow's published version.
 *
 * The flow itself is a completely ordinary workflow, edited in the ordinary
 * workflow builder, running on the ordinary engine with the ordinary
 * draft → publish lifecycle. That is the whole point of the design: a document
 * approval can have as many stages as any other approval flow (two-stage
 * review → approve, or author → QA → regulatory, or anything else). An earlier
 * cut of this generated exactly two fixed steps from a pair of role pickers,
 * which quietly removed multi-level approval — a capability workflows always
 * had. This module no longer owns the step list.
 *
 * What it still does is BOOTSTRAP: when a template first gets its workflow, it
 * seeds the conventional two gates (Technical Review → Approval) from the roles
 * picked on the create form, with each gate's SLA taken from the template's
 * review/approval limit. After that the builder is the only writer.
 *
 * Those picked roles are NOT stored on the template. They were, briefly
 * (review_role_ids / approval_role_ids, dropped in 20260815000300) — but a
 * write-once copy of an editable flow is a copy that goes stale, and a
 * three-stage flow has no honest representation in two arrays. The workflow's
 * steps are the only place who-signs-what lives.
 *
 * The companion workflow is hidden from the Approval Flows list because module
 * 'APPROVAL' is template-owned (see isTemplateOwnedModule in workflowModule.js).
 */

import { copyVersionSteps } from '@/components/workflow/workflowVersionCopy.js'

export const REVIEW_STEP_NAME = 'Technical Review'
export const APPROVAL_STEP_NAME = 'Approval'

/** Name the companion workflow after its template, so it's identifiable in the DB. */
export function companionWorkflowName(templateName) {
  return `${templateName || 'Document'} — Approval`
}

/**
 * The STARTING two steps a new template's answers describe. Pure — no DB
 * access — so the shape is unit-testable without a SyncEngine. Only ever used
 * to seed a brand-new companion workflow; the builder owns the steps after
 * that, and may well end up with a different number of them.
 *
 * @param {{reviewRoleIds?: string[], approvalRoleIds?: string[],
 *          reviewLimitDays?: number, approvalLimitDays?: number}} seed
 *   the template's SLA limits plus the roles picked on the create form —
 *   assembled by the caller, not read off a persisted template row.
 */
export function plannedApprovalSteps(seed) {
  const gate = (i) => seed?.gates?.[i] ?? {}
  return [
    {
      name: REVIEW_STEP_NAME,
      description:
        'Subject-matter expert reviews the document for technical accuracy and completeness.',
      stepOrder: 1,
      // Roles are optional — an empty list means "anyone", which the submit
      // dialog already honours by offering every active internal user.
      roleIds: [...(gate(0).roleIds ?? seed?.reviewRoleIds ?? [])],
      slaDays: gate(0).slaDays ?? seed?.reviewLimitDays ?? null,
      approvalRule: gate(0).approvalRule ?? 'ALL',
      requireEsignature: gate(0).requireEsignature ?? true,
      requireComments: gate(0).requireComments ?? true,
    },
    {
      name: APPROVAL_STEP_NAME,
      description: 'Final sign-off for release.',
      stepOrder: 2,
      roleIds: [...(gate(1).roleIds ?? seed?.approvalRoleIds ?? [])],
      slaDays: gate(1).slaDays ?? seed?.approvalLimitDays ?? null,
      approvalRule: gate(1).approvalRule ?? 'ALL',
      requireEsignature: gate(1).requireEsignature ?? true,
      requireComments: gate(1).requireComments ?? true,
    },
  ]
}

/**
 * The default per-gate config a new template's form starts from.
 *
 * Resolution order for each field is specific → general:
 *   SLA   — the template's own Review/Approval Limit, else the company's
 *           Approval Workflow default SLA, else blank.
 *   rule  — the company's default approval rule.
 *   esign — ALWAYS on. See below.
 *   comments — always on; an approval decision with no rationale is not much
 *           of a record, and the reviewer can still type one word.
 *
 * Reading the company defaults matters: an admin who set "Default SLA 7" under
 * Approval Workflow Defaults expects a new gate to start at 7, not blank
 * (reported 2026-08-16).
 *
 * E-signature deliberately does NOT read settings.defaultWorkflowRequireSignature
 * (changed 2026-08-16). That setting is the default for ORDINARY workflows —
 * inspections, audits, QC — where an unsigned step is a reasonable choice. A
 * document approval is not that: it is a regulated decision under 21 CFR 820.40
 * / Part 11 §11.50, and documentAdHocApproval already hardcodes it on for the
 * template-less path for exactly this reason. Honouring the generic setting
 * here meant a tenant with it off silently got unsigned document approvals,
 * while the ad-hoc flow beside it signed them — the inconsistency was reported
 * as a bug. Still per-gate editable on the template surface, so a tenant who
 * genuinely wants it off can turn it off where they can see it.
 *
 * @param {object} template  the template form state (its own limits win)
 * @param {object} settings  currentCompany.settings
 */
export function defaultApprovalGates(template = {}, settings = {}) {
  const rule = settings.defaultWorkflowApprovalRule ?? 'ALL'
  const fallbackSla = settings.defaultSla ?? null
  return [
    {
      roleIds: [],
      approvalRule: rule,
      requireEsignature: true,
      requireComments: true,
      slaDays: template.reviewLimitDays ?? fallbackSla,
    },
    {
      roleIds: [],
      approvalRule: rule,
      requireEsignature: true,
      requireComments: true,
      slaDays: template.approvalLimitDays ?? fallbackSla,
    },
  ]
}

/** True once both seeded gates have someone who can sign them. */
export function isApprovalFlowComplete(seed) {
  return (seed?.reviewRoleIds?.length ?? 0) > 0 && (seed?.approvalRoleIds?.length ?? 0) > 0
}

/**
 * Make sure the template has a companion workflow, and return it.
 *
 * CREATE-ONLY for the step list. If the template already points at a workflow,
 * this touches nothing but the workflow's name — the builder owns the steps,
 * and rewriting them here would silently discard a third approval stage
 * someone added. Safe to call on every template save.
 *
 * @param {object} db          SyncEngine db handle (from useLiveMutation)
 * @param {object} template    the DocumentTemplate instance (already saved)
 * @param {{reviewRoleIds?: string[], approvalRoleIds?: string[],
 *          requireEsignature?: boolean, approvalRule?: string}} [opts]
 *   the roles to seed the two starting gates with. Only used when the workflow
 *   is created; ignored once one exists.
 * @returns {Promise<object>} the companion Workflow
 */
export async function ensureTemplateApprovalWorkflow(db, template, opts = {}) {
  // CFR 21 Part 11 §11.50/§11.70 want an e-signed attestation on each regulated
  // decision, which is what these gates are — so e-sign defaults ON. The
  // builder can relax it per step afterwards.
  const requireEsignature = opts.requireEsignature ?? true
  const approvalRule = opts.approvalRule ?? 'ALL'

  const existingWorkflow = template.workflowId
    ? await db.Workflow.findByPk(template.workflowId)
    : null

  if (existingWorkflow) {
    // Keep the name in step with the template's, nothing else.
    const wanted = companionWorkflowName(template.name)
    if (existingWorkflow.name !== wanted) {
      existingWorkflow.name = wanted
      await existingWorkflow.save()
    }
    return existingWorkflow
  }

  const workflow = db.Workflow.create({
    name: companionWorkflowName(template.name),
    description: `Approval flow for documents created from the "${template.name}" template.`,
    moduleId: 'APPROVAL',
    statusId: 'ACTIVE',
    isDefault: false,
  })
  await workflow.save()

  // The version mirrors the TEMPLATE's state rather than having a lifecycle of
  // its own (user decision 2026-08-15): a draft template's flow is a draft you
  // can still edit, and it goes live when the template does. Only PUBLISHED
  // templates can be attached to a document, so a draft flow is never reachable
  // from a document.
  const published = template.statusId === 'PUBLISHED'
  const version = db.WorkflowVersion.create({
    workflowId: workflow.id,
    versionMajor: 1,
    versionMinor: 0,
    statusId: published ? 'PUBLISHED' : 'DRAFT',
    isCurrent: published,
  })
  await version.save()

  const outcomes = await db.WorkflowStepOutcome.where().exec()

  const seed = {
    gates: opts.gates,
    reviewRoleIds: opts.reviewRoleIds ?? [],
    approvalRoleIds: opts.approvalRoleIds ?? [],
    reviewLimitDays: template.reviewLimitDays,
    approvalLimitDays: template.approvalLimitDays,
  }

  for (const plan of plannedApprovalSteps(seed)) {
    const step = db.WorkflowStep.create({
      workflowVersionId: version.id,
      name: plan.name,
      description: plan.description,
      stepOrder: plan.stepOrder,
      stepType: 'APPROVAL',
      approvalRule: plan.approvalRule ?? approvalRule,
      slaDays: plan.slaDays,
      requireComments: plan.requireComments ?? true,
      requireEsignature: plan.requireEsignature ?? requireEsignature,
      formSchema: [],
    })
    await step.save()

    for (const roleId of plan.roleIds ?? []) {
      const sr = db.WorkflowStepRole.create({ stepId: step.id, roleId })
      await sr.save()
    }
    for (const o of outcomes) {
      const rec = db.AllowedOutcomeOnStep.create({ stepId: step.id, outcomeId: o.id })
      await rec.save()
    }
  }

  template.workflowId = workflow.id
  await template.save()

  return workflow
}

/**
 * The workflow version a document created from this template should inherit.
 * Returns null when the template has no flow yet — the caller surfaces that as
 * "this template has no approval flow" rather than creating a broken document.
 */
export async function publishedVersionIdForTemplate(db, template) {
  if (!template?.workflowId) return null
  const versions = await db.WorkflowVersion.where('workflowId', template.workflowId).exec()
  return pickPublishedVersionId(versions)
}

/**
 * The version a document should RUN: the current published one, else any
 * published one. NEVER a draft — with the builder in play a template's
 * workflow routinely has an unpublished draft sitting next to the live
 * version, and a document must not start running someone's work in progress.
 */
export function pickPublishedVersionId(versions) {
  const published = (versions ?? []).filter((v) => v.statusId === 'PUBLISHED')
  return (published.find((v) => v.isCurrent) ?? published[0])?.id ?? null
}

/**
 * The version an AUTHORING surface should show: the draft being worked on if
 * there is one, else the live published version.
 *
 * Deliberately different from pickPublishedVersionId, and deliberately shared.
 * The template page and the flow dialog originally each picked their own — the
 * dialog edited the draft while the page rendered the published steps, so
 * adding a role in the dialog appeared to do nothing when you came back. They
 * were reading two different sets of step rows. Any surface that shows "the
 * flow as it is being authored" must use this one.
 */
export function pickAuthoringVersion(versions) {
  const list = versions ?? []
  const draft = sortByVersionDesc(list.filter((v) => v.statusId === 'DRAFT'))[0]
  if (draft) return draft
  const published = list.filter((v) => v.statusId === 'PUBLISHED')
  return published.find((v) => v.isCurrent) ?? published[0] ?? null
}

/** Newest version first — highest major, then highest minor. */
export function sortByVersionDesc(versions) {
  return [...(versions ?? [])].sort((a, b) =>
    a.versionMajor !== b.versionMajor
      ? b.versionMajor - a.versionMajor
      : b.versionMinor - a.versionMinor,
  )
}

// ─── One lifecycle, not two ──────────────────────────────────────────────────
//
// The template and its approval flow are published, archived and reopened
// together (user decision 2026-08-15) — nobody should have to remember to
// publish a workflow after publishing the template that owns it. The builder
// hides its own Publish / New Version controls for a template-owned workflow
// for the same reason; these transitions are the only writer.
//
//   template → PUBLISHED : publish its draft version, make it current
//   template → DRAFT     : reopen — give the builder a fresh draft to edit
//   template → ARCHIVED  : archive the workflow so it stops being offered
//
/**
 * Bring the companion workflow in line with the template's status.
 * Call AFTER the template's own status change has been saved.
 *
 * @param {object} db        SyncEngine db handle (from useLiveMutation)
 * @param {object} template  the DocumentTemplate instance
 */
export async function syncApprovalWorkflowLifecycle(db, template) {
  if (!template?.workflowId) return null
  const workflow = await db.Workflow.findByPk(template.workflowId)
  if (!workflow) return null

  const versions = await db.WorkflowVersion.where('workflowId', workflow.id).exec()

  if (template.statusId === 'PUBLISHED') {
    const draft = newestDraft(versions)
    if (draft) {
      // Only one version may be current, so stand the others down first.
      for (const v of versions) {
        if (v.id !== draft.id && v.isCurrent) {
          v.isCurrent = false
          await v.save()
        }
      }
      draft.statusId = 'PUBLISHED'
      draft.isCurrent = true
      await draft.save()
    }
    if (workflow.statusId !== 'ACTIVE') {
      workflow.statusId = 'ACTIVE'
      await workflow.save()
    }
    return workflow
  }

  if (template.statusId === 'ARCHIVED') {
    if (workflow.statusId !== 'ARCHIVED') {
      workflow.statusId = 'ARCHIVED'
      await workflow.save()
    }
    return workflow
  }

  // DRAFT — the template is editable again, so its flow must be too. Reuse any
  // draft that already exists rather than stacking up empty versions.
  if (workflow.statusId !== 'ACTIVE') {
    workflow.statusId = 'ACTIVE'
    await workflow.save()
  }
  if (!newestDraft(versions)) {
    const source = highestVersion(versions)
    const draft = db.WorkflowVersion.create({
      workflowId: workflow.id,
      versionMajor: source?.versionMajor ?? 1,
      versionMinor: source ? source.versionMinor + 1 : 0,
      statusId: 'DRAFT',
    })
    await draft.save()
    await copyVersionSteps(db, source?.id, draft.id)
  }
  return workflow
}

function highestVersion(versions) {
  return sortByVersionDesc(versions)[0]
}

function newestDraft(versions) {
  return highestVersion((versions ?? []).filter((v) => v.statusId === 'DRAFT'))
}
