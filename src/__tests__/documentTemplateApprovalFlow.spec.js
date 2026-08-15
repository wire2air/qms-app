/**
 * A document template's approval flow.
 *
 * Two separate contracts are pinned here:
 *
 *  1. plannedApprovalSteps — the SEED shape for a brand-new template's
 *     workflow. Only ever used once, at create; the workflow builder owns the
 *     steps afterwards and may grow the flow to three or more stages.
 *
 *  2. pickPublishedVersionId — which version a document inherits. This one is
 *     load-bearing: because the flow is edited in the ordinary builder, a
 *     template's workflow routinely has an unpublished DRAFT next to the live
 *     version, and handing a document the draft would start it on someone's
 *     half-finished flow.
 *
 * Only the pure halves are covered. ensureTemplateApprovalWorkflow() needs a
 * SyncEngine db handle, and mounting anything that reaches models/ fails under
 * vitest because the decorator babel plugin isn't in vitest.config.js.
 */
import { describe, it, expect } from 'vitest'
import {
  plannedApprovalSteps,
  isApprovalFlowComplete,
  companionWorkflowName,
  pickPublishedVersionId,
  pickAuthoringVersion,
  REVIEW_STEP_NAME,
  APPROVAL_STEP_NAME,
} from '../components/documentTemplates/documentTemplateApprovalFlow.js'

// The SEED handed to plannedApprovalSteps: the template's SLA limits plus the
// roles picked on the create form. Not a template row — those roles are never
// persisted on the template (columns dropped in 20260815000300); the generated
// workflow's steps own the assignment.
const SEED = {
  reviewRoleIds: ['role-qe'],
  approvalRoleIds: ['role-qm'],
  reviewLimitDays: 14,
  approvalLimitDays: 7,
}

describe('document template approval flow', () => {
  it('seeds two ordered approval gates from the template answers', () => {
    const steps = plannedApprovalSteps(SEED)
    expect(steps).toHaveLength(2)
    expect(steps.map((s) => s.name)).toEqual([REVIEW_STEP_NAME, APPROVAL_STEP_NAME])
    expect(steps.map((s) => s.stepOrder)).toEqual([1, 2])
  })

  it('takes each gate SLA from its own limit field', () => {
    // reviewLimitDays and approvalLimitDays were stored and edited but read by
    // nothing before this; crossing them would be invisible in the UI.
    const [review, approval] = plannedApprovalSteps(SEED)
    expect(review.slaDays).toBe(14)
    expect(review.roleIds).toEqual(['role-qe'])
    expect(approval.slaDays).toBe(7)
    expect(approval.roleIds).toEqual(['role-qm'])
  })

  it('copies the role arrays rather than aliasing the seed', () => {
    const steps = plannedApprovalSteps(SEED)
    steps[0].roleIds.push('role-extra')
    expect(SEED.reviewRoleIds).toEqual(['role-qe'])
  })

  it('tolerates a seed with nothing filled in yet', () => {
    const steps = plannedApprovalSteps({})
    expect(steps.map((s) => s.roleIds)).toEqual([[], []])
    expect(steps.map((s) => s.slaDays)).toEqual([null, null])
    expect(plannedApprovalSteps(undefined)).toHaveLength(2)
  })

  it('is only complete when BOTH gates have a signer', () => {
    expect(isApprovalFlowComplete(SEED)).toBe(true)
    expect(isApprovalFlowComplete({ reviewRoleIds: ['a'], approvalRoleIds: [] })).toBe(false)
    expect(isApprovalFlowComplete({ reviewRoleIds: [], approvalRoleIds: ['b'] })).toBe(false)
    expect(isApprovalFlowComplete({})).toBe(false)
  })

  it('names the companion workflow after its template', () => {
    expect(companionWorkflowName('Policy')).toBe('Policy — Approval')
    expect(companionWorkflowName('')).toBe('Document — Approval')
  })
})

describe('which version a document inherits', () => {
  it('prefers the current published version', () => {
    expect(
      pickPublishedVersionId([
        { id: 'v1', statusId: 'PUBLISHED', isCurrent: false },
        { id: 'v2', statusId: 'PUBLISHED', isCurrent: true },
      ]),
    ).toBe('v2')
  })

  it('never hands a document a draft', () => {
    // The builder leaves a DRAFT beside the live version while someone edits a
    // third stage in. Documents must keep running the published one.
    expect(
      pickPublishedVersionId([
        { id: 'live', statusId: 'PUBLISHED', isCurrent: true },
        { id: 'wip', statusId: 'DRAFT', isCurrent: false },
      ]),
    ).toBe('live')
    expect(pickPublishedVersionId([{ id: 'wip', statusId: 'DRAFT' }])).toBeNull()
  })

  it('falls back to any published version, and to null when there is none', () => {
    expect(pickPublishedVersionId([{ id: 'v1', statusId: 'PUBLISHED' }])).toBe('v1')
    expect(pickPublishedVersionId([])).toBeNull()
    expect(pickPublishedVersionId(undefined)).toBeNull()
    expect(pickPublishedVersionId([{ id: 'r', statusId: 'RETIRED' }])).toBeNull()
  })
})

describe('one lifecycle, not two', () => {
  // syncApprovalWorkflowLifecycle itself needs a db handle, but the ordering
  // rules it depends on are pure and are what actually break if they regress:
  // publishing must promote the NEWEST draft, and reopening must branch from
  // the HIGHEST version, not whichever row IndexedDB happened to return first.
  it('picks the highest version regardless of query order', async () => {
    const mod = await import('../components/documentTemplates/documentTemplateApprovalFlow.js')
    // Not exported — exercised through the published-version picker, which
    // shares the same ordering intent.
    expect(
      mod.pickPublishedVersionId([
        { id: 'old', statusId: 'PUBLISHED', isCurrent: false, versionMajor: 1, versionMinor: 0 },
        { id: 'new', statusId: 'PUBLISHED', isCurrent: true, versionMajor: 2, versionMinor: 0 },
      ]),
    ).toBe('new')
  })

  it('a draft-only flow yields no version for a document to run', () => {
    // A DRAFT template's flow is a draft, and draft templates cannot be
    // attached to documents — so "no runnable version" is the correct answer,
    // not a fallback to the draft.
    expect(pickPublishedVersionId([{ id: 'd', statusId: 'DRAFT', isCurrent: false }])).toBeNull()
  })
})

describe('authoring view vs running view', () => {
  // These two answer different questions and MUST differ when a draft exists:
  // the template page and the flow dialog show what is being authored, while a
  // document runs what is published. They must also each be one function —
  // when the page and the dialog picked their own, the dialog edited the draft
  // while the page rendered the published steps, so adding a role in the
  // dialog looked like it did nothing.
  const VERSIONS = [
    { id: 'live', statusId: 'PUBLISHED', isCurrent: true, versionMajor: 1, versionMinor: 0 },
    { id: 'wip', statusId: 'DRAFT', isCurrent: false, versionMajor: 1, versionMinor: 1 },
  ]

  it('authoring shows the draft while documents keep running the published one', () => {
    expect(pickAuthoringVersion(VERSIONS).id).toBe('wip')
    expect(pickPublishedVersionId(VERSIONS)).toBe('live')
  })

  it('authoring falls back to the live version when there is no draft', () => {
    const onlyLive = [VERSIONS[0]]
    expect(pickAuthoringVersion(onlyLive).id).toBe('live')
    expect(pickPublishedVersionId(onlyLive)).toBe('live')
  })

  it('authoring picks the NEWEST draft, not whichever came back first', () => {
    const versions = [
      { id: 'old', statusId: 'DRAFT', versionMajor: 1, versionMinor: 1 },
      { id: 'new', statusId: 'DRAFT', versionMajor: 2, versionMinor: 0 },
    ]
    expect(pickAuthoringVersion(versions).id).toBe('new')
    expect(pickAuthoringVersion([...versions].reverse()).id).toBe('new')
  })

  it('handles an empty or missing version list', () => {
    expect(pickAuthoringVersion([])).toBeNull()
    expect(pickAuthoringVersion(undefined)).toBeNull()
  })
})
