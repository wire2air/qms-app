import { describe, it, expect } from 'vitest'
import { LOOKUP_ENTITIES, LOOKUP_CASCADES } from '@/constants/formBuilderConfig'

/**
 * Every form surface pulls lookups from ONE registry (user decision
 * 2026-08-27). The component bindings live in lookupMenus.js, which cannot be
 * imported here (its .vue imports drag the decorator graph past the test
 * transform) — that module self-checks against the registry in dev instead.
 * This spec pins the pure half: complete metadata, and cascades that only
 * name declared entities.
 */
describe('lookup registry', () => {
  const values = LOOKUP_ENTITIES.map((e) => e.value)

  it('metadata is complete (selectMenu/badgeById/idProp/model/label)', () => {
    for (const e of LOOKUP_ENTITIES) {
      for (const k of ['selectMenu', 'badgeById', 'idProp', 'model', 'label']) {
        expect(e[k], `${k} for ${e.value}`).toBeTruthy()
      }
    }
  })

  it('cascades reference declared entities only', () => {
    for (const [child, parents] of Object.entries(LOOKUP_CASCADES)) {
      expect(values, `cascade child ${child}`).toContain(child)
      for (const parent of Object.keys(parents)) {
        expect(values, `cascade parent ${parent} of ${child}`).toContain(parent)
      }
    }
  })

  it('entity values are unique', () => {
    expect(new Set(values).size).toBe(values.length)
  })
})
