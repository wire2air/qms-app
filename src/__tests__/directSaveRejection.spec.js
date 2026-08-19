/**
 * A server-rejected write must not look like a saved one.
 *
 * PostGraphile returns the row it mutated, so an empty payload on a networked
 * CREATE/UPDATE means the statement matched zero rows — almost always an RLS
 * denial, occasionally a record deleted underneath us. Either way nothing was
 * written.
 *
 * directSaveStrategy used to treat that as success: it wrote local state to
 * IndexedDB and cleared the edit flags, assuming an empty response still meant
 * the mutation went through. The result was a phantom save — the field showed
 * the new value, IndexedDB agreed, nothing would retry because the edits were
 * cleared, and the server had none of it.
 *
 * This guards the branch itself rather than the behaviour: exercising it for
 * real needs the whole engine stood up (IDB, ObjectPool, socket echo
 * suppression, pooled-instance hydrate), and what actually needs protecting is
 * narrow and absolute — this branch must never again write local state and call
 * it saved.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// From cwd, not import.meta.url: under jsdom that is an http:// URL.
const SRC = readFileSync(join(process.cwd(), 'syncEngine/core/directSaveStrategy.js'), 'utf8')

/** The `else` arm handling an empty response on a non-DELETE mutation. */
const emptyResponseBranch = SRC.slice(
  SRC.indexOf('} else {', SRC.indexOf('else if (serverRecord)')),
)

describe('a mutation that returns no record', () => {
  it('throws instead of persisting local state', () => {
    expect(emptyResponseBranch).toContain('throw new Error')
    // The two calls that made it a phantom save.
    expect(emptyResponseBranch).not.toMatch(/await dehydrate\(/)
    expect(emptyResponseBranch).not.toMatch(/clearAllEdits\(/)
  })

  it('says the change was not saved, and why it may have been refused', () => {
    // Surfaced to the user through useAutoSave's onError and the saveError
    // banners, so this is user-facing wording, not a stack trace.
    expect(emptyResponseBranch).toMatch(/Not saved/)
    expect(emptyResponseBranch).toMatch(/role may not cover this record/)
    expect(emptyResponseBranch).toMatch(/Nothing was changed/)
  })

  it('does not catch the two cases where an empty response is legitimate', () => {
    // DELETE returns no record by design, and is handled before this branch.
    const deleteBranch = SRC.slice(
      SRC.indexOf('if (action === OPERATION.DELETE)'),
      SRC.indexOf('else if (serverRecord)'),
    )
    expect(deleteBranch).toContain('IndexedDB.delete')

    // LOCAL-strategy models never hit the network, and short-circuit earlier.
    expect(SRC.indexOf('LOAD_STRATEGY.LOCAL')).toBeLessThan(SRC.indexOf('MutationRunner.run'))
  })
})
