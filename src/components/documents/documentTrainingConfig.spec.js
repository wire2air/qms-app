/**
 * The behaviour worth pinning is what happens when training is turned back ON.
 *
 * The reported bug: the submit-for-review reminder offers "disable training and
 * continue", writes enabled:false and SAVES immediately. An author who then
 * cancelled the submit had no way to set it back, because the toggle only
 * existed on the create screen. Re-enabling must therefore find everything
 * they had configured still intact — otherwise the shortcut silently destroys
 * an audience and an assessment.
 */
import { describe, it, expect } from 'vitest'
import {
  defaultTrainingConfig,
  setTrainingEnabled,
  isTrainingEnabled,
} from './documentTrainingConfig.js'

describe('defaultTrainingConfig', () => {
  it('takes `enabled` from the caller — the one thing call sites disagree about', () => {
    expect(defaultTrainingConfig(true).enabled).toBe(true)
    expect(defaultTrainingConfig(false).enabled).toBe(false)
    expect(defaultTrainingConfig().enabled).toBe(false)
  })

  it('carries the full shape, so no call site has to remember a field', () => {
    expect(Object.keys(defaultTrainingConfig()).sort()).toEqual(
      [
        'assessment',
        'autoLaunch',
        'completionDueDays',
        'curriculumIds',
        'enabled',
        'managerId',
        'maxAttempts',
        'passingScore',
        'requireManagerVerification',
        'userIds',
      ].sort(),
    )
  })

  it('gives every call a fresh set of arrays', () => {
    // A shared literal would let one document's audience push into another's.
    const a = defaultTrainingConfig()
    const b = defaultTrainingConfig()
    a.userIds.push('u1')
    a.assessment.push({ text: 'q' })
    expect(b.userIds).toEqual([])
    expect(b.assessment).toEqual([])
  })
})

describe('setTrainingEnabled', () => {
  const configured = {
    enabled: true,
    autoLaunch: true,
    managerId: 'mgr-1',
    requireManagerVerification: true,
    completionDueDays: 14,
    passingScore: 90,
    maxAttempts: 3,
    curriculumIds: ['cur-1'],
    userIds: ['u1', 'u2'],
    assessment: [{ text: 'What is the limit?' }],
  }

  it('keeps every setting when turning training OFF', () => {
    const off = setTrainingEnabled(configured, false)
    expect(off.enabled).toBe(false)
    expect(off).toMatchObject({
      managerId: 'mgr-1',
      completionDueDays: 14,
      passingScore: 90,
      maxAttempts: 3,
      curriculumIds: ['cur-1'],
      userIds: ['u1', 'u2'],
    })
    expect(off.assessment).toHaveLength(1)
  })

  it('round-trips off and back on with nothing lost — the reported bug', () => {
    const restored = setTrainingEnabled(setTrainingEnabled(configured, false), true)
    expect(restored).toEqual(configured)
  })

  it('materialises a config when the version has none', () => {
    // A document created with training off stores null, not a disabled object.
    const made = setTrainingEnabled(null, true)
    expect(made.enabled).toBe(true)
    expect(made.curriculumIds).toEqual([])
  })

  it('does not mutate the config it was given', () => {
    const before = { ...configured }
    setTrainingEnabled(configured, false)
    expect(configured).toEqual(before)
  })
})

describe('isTrainingEnabled', () => {
  it('tolerates a missing config rather than throwing', () => {
    expect(isTrainingEnabled(null)).toBe(false)
    expect(isTrainingEnabled(undefined)).toBe(false)
    expect(isTrainingEnabled({})).toBe(false)
    expect(isTrainingEnabled({ enabled: true })).toBe(true)
  })
})
