/**
 * Active workflow templates for one module — ACTIVE workflows paired with
 * their PUBLISHED version. The same pool WorkflowVersionSelect renders as
 * cards, exposed to the create wizards (NC / CAPA / Change Control) so they
 * can auto-skip the workflow screen when exactly one is available (user
 * request 2026-08-14) and label the details screen's context strip.
 *
 * Returns { entries } — Array<{ workflow, version }>, live.
 */
import { toValue } from 'vue'

export function useActiveWorkflowEntries(moduleId) {
  const workflows = useLiveQueryWithDeps(
    [() => toValue(moduleId)],
    async (db, [m]) => {
      if (!m) return []
      return db.Workflow.where('moduleId', m).exec()
    },

    { models: ['Workflow'], initial: [] },
  )

  const versions = useLiveQuery(async (db) => db.WorkflowVersion.where().exec(), {
    models: ['WorkflowVersion'],
    initial: [],
  })

  const entries = computed(() =>
    workflows.value
      .filter((w) => w.statusId === 'ACTIVE')
      .map((w) => {
        const version = versions.value.find(
          (v) => v.workflowId === w.id && v.statusId === 'PUBLISHED',
        )
        return version ? { workflow: w, version } : null
      })
      .filter(Boolean),
  )

  return { entries }
}
