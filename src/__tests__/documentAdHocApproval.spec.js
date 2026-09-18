/**
 * The approval flow a template-less document runs.
 *
 * Moving document approval onto the template made the template mandatory,
 * because it was the only source of a workflow. A QMS still requires that
 * someone other than the author approves — so "no template" gets an ad-hoc
 * flow rather than no flow (user request 2026-08-16).
 *
 * The load-bearing property is that its steps carry NO roles. That is what
 * makes the existing submit dialog offer every active user and ask who should
 * review and approve; give these steps a role and the dialog silently narrows
 * to that role's members instead, which is the opposite of the intent.
 */
import { describe, it, expect } from 'vitest'
import {
  adHocApprovalSteps,
  AD_HOC_REVIEW_STEP,
  AD_HOC_APPROVAL_STEP,
} from '../components/documents/documentAdHocApproval.js'

describe('adHocApprovalSteps', () => {
  it('is exactly two gates, Review then Approval', () => {
    const steps = adHocApprovalSteps()
    expect(steps).toHaveLength(2)
    expect(steps.map((s) => s.name)).toEqual([AD_HOC_REVIEW_STEP, AD_HOC_APPROVAL_STEP])
    expect(steps.map((s) => s.stepOrder)).toEqual([1, 2])
  })

  it('assigns no roles — the submitter picks the people', () => {
    // If a roleIds ever appears here, the submit dialog stops asking.
    for (const step of adHocApprovalSteps()) {
      expect(step.roleIds).toBeUndefined()
    }
  })

  it('returns a fresh array each call', () => {
    const a = adHocApprovalSteps()
    a[0].name = 'mutated'
    expect(adHocApprovalSteps()[0].name).toBe(AD_HOC_REVIEW_STEP)
  })

  it('describes the separation-of-duties expectation on the review gate', () => {
    // The reason this flow exists at all: someone other than the author signs.
    expect(adHocApprovalSteps()[0].description).toMatch(/other than the author/i)
  })
})
