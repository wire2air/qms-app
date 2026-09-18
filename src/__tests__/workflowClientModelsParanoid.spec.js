// Workflows F-24 — a client model that declares `deletedAt` must declare `paranoid`.
// (qms/docs/modules/workflows/17-missing-coverage-report.md §P3)
//
// `BaseModel.paranoid` defaults to **false**, and nothing links it to the
// presence of a `deletedAt` @Property. `WorkflowInstance` and
// `WorkflowInstanceStep` declared `deletedAt` but not `paranoid`, so
// `instance.delete()` took the else-branch in `BaseModel.delete()` and set
// `#action = OPERATION.DELETE` — a hard delete of an approval record, i.e. the
// audit trail for a signed approval chain — instead of stamping `deletedAt`.
// Their queries also returned soft-deleted rows, because `Model.where()` passes
// `this.paranoid` into the QueryBuilder as the filter field.
//
// Two layers, because either alone is weak:
//   1. behaviour — prove the branch `paranoid` selects, against the real
//      BaseModel, so this is a test of the mechanism and not of a string;
//   2. declaration — a scan over every model in `models/`, so the invariant is
//      enforced for models added later, not just for the two that were wrong.
//
// The declaration scan is a source scan on purpose: `models/*.js` use legacy
// decorators (`@ClientModel`/`@Property`) that need vite-plugin-babel, which the
// lighter vitest config deliberately does not load, so the classes cannot be
// imported here.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BaseModel } from '@syncEngine/core/BaseModel.js'

const MODELS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../models')

describe('BaseModel paranoid branch (the mechanism F-24 depends on)', () => {
  let recorded
  let previousStrategy

  beforeEach(() => {
    recorded = []
    previousStrategy = BaseModel._saveStrategy
    // The real strategy talks GraphQL + IndexedDB; all we need is the action
    // the instance carried when save() was reached. save() resets #action
    // afterwards, so it has to be read inside the strategy.
    BaseModel._saveStrategy = function captureAction(instance) {
      recorded.push({ action: instance.action, deletedAt: instance.deletedAt })
      return Promise.resolve()
    }
  })

  afterEach(() => {
    BaseModel._saveStrategy = previousStrategy
  })

  it('hard-deletes when paranoid is not set, even though deletedAt exists', async () => {
    class NotParanoid extends BaseModel {
      deletedAt = null
    }
    const row = new NotParanoid()

    await row.delete()

    expect(recorded).toHaveLength(1)
    expect(recorded[0].action).toBe('delete')
    expect(recorded[0].deletedAt).toBeNull()
  })

  it('soft-deletes when paranoid is set', async () => {
    class Paranoid extends BaseModel {
      static paranoid = true
      deletedAt = null
    }
    const row = new Paranoid()

    await row.delete()

    expect(recorded).toHaveLength(1)
    expect(recorded[0].action).toBe('update')
    expect(recorded[0].deletedAt).not.toBeNull()
  })
})

describe('client model declarations', () => {
  function modelFiles() {
    return readdirSync(MODELS_DIR)
      .filter(function isModel(name) {
        return name.endsWith('.js') && !name.endsWith('.spec.js') && !name.endsWith('.test.js')
      })
      .sort()
  }

  function readModel(name) {
    return readFileSync(path.join(MODELS_DIR, name), 'utf8')
  }

  it.each(['workflowInstance.js', 'workflowInstanceStep.js'])(
    '%s declares static paranoid so .delete() cannot hard-delete an approval record',
    (name) => {
      const source = readModel(name)
      expect(source).toMatch(/@Property\([^)]*\)\s*deletedAt/)
      expect(source).toMatch(/static\s+paranoid\s*=\s*(true|'deletedAt'|"deletedAt")/)
    },
  )

  it('every model declaring deletedAt also declares paranoid', () => {
    const offenders = modelFiles().filter(function isOffender(name) {
      const source = readModel(name)
      const declaresDeletedAt = /@Property\([^)]*\)\s*deletedAt/.test(source)
      const declaresParanoid = /static\s+paranoid\s*=/.test(source)
      return declaresDeletedAt && !declaresParanoid
    })

    expect(
      offenders,
      `These client models declare a deletedAt @Property without "static paranoid", so ` +
        `.delete() emits a hard DELETE mutation and queries return soft-deleted rows:\n` +
        offenders.map((n) => `  models/${n}`).join('\n'),
    ).toEqual([])
  })

  it('the scan actually sees the model directory', () => {
    // Guards against a rename of models/ turning the invariant above into a
    // vacuous pass.
    const files = modelFiles()
    expect(files.length).toBeGreaterThan(50)
    expect(files).toContain('workflowInstance.js')
  })
})
