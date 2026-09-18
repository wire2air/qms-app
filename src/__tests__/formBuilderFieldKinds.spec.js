/**
 * The field-type dropdown's option list.
 *
 * FIELD_KIND_OPTIONS is a curated, QMS-ordered list rather than every type the
 * builder can render — which is why Root Cause Analysis and Risk Assessment
 * went missing when the dropdown was introduced (2026-08-15, reported
 * 2026-08-16). They were fully defined field types with icons, defaults and
 * readonly handling; there was simply no way to add one.
 */
import { describe, it, expect } from 'vitest'
import {
  FIELD_KIND_OPTIONS,
  FIELD_TYPES_CONFIG,
  fieldKindId,
} from '../constants/formBuilderConfig.js'
import { defaultFieldLabel } from '../utils/aiFormHydrate.js'

describe('FIELD_KIND_OPTIONS', () => {
  it('offers the QMS tools', () => {
    const ids = FIELD_KIND_OPTIONS.map((k) => k.id)
    expect(ids).toContain('rca')
    expect(ids).toContain('riskAssessment')
  })

  it('every option maps back to itself through fieldKindId', () => {
    // Otherwise the dropdown adds a field it then can't show as selected.
    for (const opt of FIELD_KIND_OPTIONS) {
      if (opt.type === 'optionGroup') continue // split on groupType, covered elsewhere
      expect(fieldKindId({ type: opt.type }), opt.id).toBe(opt.id)
    }
  })

  it('the tools carry their own defaults', () => {
    // FIELD_TYPES_CONFIG holds per-type OVERRIDES on top of `base`, so most
    // types correctly have no entry. These two do need one — a template id to
    // bind, and (for RCA) the parent problem statement to seed from.
    expect(FIELD_TYPES_CONFIG.rca).toMatchObject({ problemField: '_parent_problem' })
    expect(FIELD_TYPES_CONFIG.riskAssessment).toHaveProperty('riskAssessmentTemplateId')
  })

  it('names the tools instead of "Untitled field"', () => {
    expect(defaultFieldLabel('rca')).toBe('Root Cause Analysis')
    expect(defaultFieldLabel('riskAssessment')).toBe('Risk Assessment')
  })

  it('has no duplicate ids', () => {
    const ids = FIELD_KIND_OPTIONS.map((k) => k.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
