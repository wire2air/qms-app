// Workflows F-20 — the template-delete control must gate on the permission that
// actually enforces the operation.
// (qms/docs/modules/workflows/17-missing-coverage-report.md §P3)
//
// The button in WorkflowEditor.vue gated on `workflows_templates:delete`, but
// nothing on its path honours that action:
//
//   * `handleDeleteDraft()` → `workflow.delete()`. `Workflow` is a paranoid
//     client model, so that is a GraphQL **UPDATE** stamping `deleted_at`. At
//     the DB it lands on `workflows_upd`, whose USING/WITH CHECK read
//     `has_permission('workflows_templates','update')` (verified against
//     app-db). The `workflows_del` policy — correctly gated on `delete` — is
//     dormant, because no application path issues a real SQL DELETE on
//     `workflows`.
//   * The only `:delete` consumer in the system is the REST route
//     `DELETE /v1/services/workflows/:id`, which the template editor never
//     calls (all template writes go through SyncEngine/GraphQL).
//
// Net effect of the old string: a `:delete`-only role saw a button that could
// not work, and an `:update`-only role — the role that CAN delete — did not see
// one. Both directions are regressions worth catching, so this asserts the
// positive gate AND the absence of the stale string.
//
// Source-level assertion by necessity: the gate is a `computed()` inside a
// ~1000-line SFC whose setup pulls in the router, the syncEngine and a dozen
// live queries; mounting it to read one boolean would test the harness, not the
// permission string.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const EDITOR = path.join(SRC_DIR, 'components/workflow/WorkflowEditor.vue')

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (statSync(full).isFile()) out.push(full)
  }
  return out
}

describe('workflow template delete permission (F-20)', () => {
  it('canDeleteWorkflow gates on workflows_templates:update', () => {
    const source = readFileSync(EDITOR, 'utf8')
    const line = source.split('\n').find((l) => l.includes('const canDeleteWorkflow'))

    expect(line, 'canDeleteWorkflow was renamed or removed from WorkflowEditor.vue').toBeTruthy()
    expect(line).toContain('workflows_templates:update')
    expect(line).not.toContain('workflows_templates:delete')
  })

  it('no frontend surface gates on workflows_templates:delete', () => {
    const offenders = walk(SRC_DIR, [])
      .filter((f) => /\.(vue|js|mjs)$/.test(f) && !f.includes('__tests__'))
      .filter((f) => readFileSync(f, 'utf8').includes('workflows_templates:delete'))
      .map((f) => path.relative(SRC_DIR, f))

    expect(
      offenders,
      `workflows_templates:delete governs nothing the UI can reach — the template ` +
        `editor's delete is a paranoid soft-delete governed by the workflows_upd RLS ` +
        `policy, which checks :update. Gating UI on :delete produces a visible but ` +
        `inert control. Offending files:\n` +
        offenders.map((f) => `  src/${f}`).join('\n'),
    ).toEqual([])
  })
})
