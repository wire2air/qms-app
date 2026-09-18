import { describe, it, expect } from 'vitest'
import { buildMyTrainingSections } from './myTrainingDetailConfig.js'

describe('buildMyTrainingSections', () => {
  it('returns a single details section', () => {
    const s = buildMyTrainingSections(null)
    expect(s).toHaveLength(1)
    expect(s[0].id).toBe('details')
    expect(s[0].label).toBeTruthy()
  })
})
