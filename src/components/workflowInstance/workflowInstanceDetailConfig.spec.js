import { describe, it, expect } from 'vitest'
import { buildWorkflowInstanceSections } from './workflowInstanceDetailConfig.js'

describe('buildWorkflowInstanceSections', () => {
  it('returns a single details section', () => {
    const s = buildWorkflowInstanceSections(null)
    expect(s).toHaveLength(1)
    expect(s[0].id).toBe('details')
    expect(s[0].label).toBeTruthy()
  })
})
