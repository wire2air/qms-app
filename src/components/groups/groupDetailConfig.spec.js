import { describe, it, expect } from 'vitest'
import { buildGroupSections } from './groupDetailConfig.js'

describe('buildGroupSections', () => {
  it('always returns a single details section', () => {
    const s = buildGroupSections(null)
    expect(s).toHaveLength(1)
    expect(s[0].id).toBe('details')
    expect(s[0].label).toBeTruthy()
  })
})
