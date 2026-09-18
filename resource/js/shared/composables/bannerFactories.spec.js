import { describe, it, expect } from 'vitest'
import {
  readOnlyBanner, archivedBanner, approvalPendingBanner, lockedBanner,
  workflowWaitingBanner, unsavedChangesBanner, validationIssuesBanner,
} from './bannerFactories.js'

describe('bannerFactories', () => {
  it('readOnlyBanner is neutral and not dismissible', () => {
    const b = readOnlyBanner()
    expect(b.id).toBe('read-only')
    expect(b.tone).toBe('neutral')
    expect(b.dismissible).toBe(false)
    expect(b.title).toBeTruthy()
    expect(b.icon).toBeTruthy()
  })
  it('archivedBanner is warning tone', () => {
    expect(archivedBanner().tone).toBe('warning')
  })
  it('approvalPendingBanner is info tone', () => {
    expect(approvalPendingBanner().tone).toBe('info')
  })
  it('lockedBanner is warning tone', () => {
    expect(lockedBanner().id).toBe('locked')
    expect(lockedBanner().tone).toBe('warning')
  })
  it('workflowWaitingBanner is info tone', () => {
    expect(workflowWaitingBanner().tone).toBe('info')
  })
  it('unsavedChangesBanner is warning and dismissible-false', () => {
    const b = unsavedChangesBanner()
    expect(b.id).toBe('unsaved-changes')
    expect(b.tone).toBe('warning')
  })
  it('validationIssuesBanner is danger and includes the count', () => {
    const b = validationIssuesBanner(3)
    expect(b.tone).toBe('danger')
    expect(b.message).toContain('3')
  })
  it('allows overriding title and message', () => {
    const b = readOnlyBanner({ title: 'Custom', message: 'Why' })
    expect(b.title).toBe('Custom')
    expect(b.message).toBe('Why')
  })
})
