// Which modules may author sub-tasks on a workflow step.
//
// ORIGINAL REPORT (2026-09-26): "we used to have an option when creating a
// task step so user can add sub tasks — is that got buried?" It had not moved;
// WorkflowEditor gated the toggle on a two-entry list,
// MODULES_WITH_CHILD_STEPS = ['CAPA', 'CHANGE_CONTROL'], so it was simply
// absent on every other module.
//
// The restriction was never in the engine. activateInstanceStep cascades into
// the first PENDING child and advanceFromStep navigates siblings by
// (parentInstanceStepId, stepOrder) — both written for ad-hoc as well as
// template-spawned steps. What was missing was a creation endpoint outside
// those two modules.
//
// The rule now is the one that was always the real constraint: a sub-task
// hangs off a Task (ACTION) step, and an approval-only flow has none. So the
// question "may this module author sub-tasks?" is exactly "may it hold a Task
// step?" — which allowedStepTypes already answers, and which this pins so the
// two cannot drift apart again.
import { describe, it, expect } from 'vitest'
import { allowedStepTypes, isApprovalOnlyModule } from '@/components/workflow/workflowModule.js'

// Mirrors WorkflowEditor's showAllowChildSteps / showChildSteps.
const mayAuthorSubTasks = (moduleId) => !isApprovalOnlyModule(moduleId)

const RECORD_MODULES = [
  'NON_CONFORMANCE',
  'CAPA',
  'CHANGE_CONTROL',
  'COMPLAINT',
  'CUSTOMER_COMPLAINT',
  'FORM', // every admin-defined / promoted module
]

const APPROVAL_ONLY = ['APPROVAL', 'LOG_BOOK', 'INSPECTIONS_LOGS', 'AUDIT_INSTANCE', 'QC_INSPECTION']

describe('sub-task authoring availability', () => {
  it('is offered on every record module, not just CAPA and Change Control', () => {
    for (const moduleId of RECORD_MODULES) {
      expect(mayAuthorSubTasks(moduleId), `${moduleId} should offer sub-tasks`).toBe(true)
    }
  })

  it('covers the four modules the old two-entry gate excluded', () => {
    // The regression this file exists for. Listed separately from the sweep
    // above so a future narrowing names the modules it takes away.
    for (const moduleId of ['NON_CONFORMANCE', 'COMPLAINT', 'CUSTOMER_COMPLAINT', 'FORM']) {
      expect(mayAuthorSubTasks(moduleId)).toBe(true)
    }
  })

  it('is NOT offered on approval-only flows — they cannot hold a Task step', () => {
    for (const moduleId of APPROVAL_ONLY) {
      expect(mayAuthorSubTasks(moduleId), `${moduleId} has no Task step to hang one on`).toBe(false)
      expect(allowedStepTypes(moduleId)).not.toContain('ACTION')
    }
  })

  it('tracks allowedStepTypes exactly — the toggle cannot outlive the Task step', () => {
    // If someone adds a module to RECORD_MODULE_IDS, sub-tasks follow
    // automatically; if someone makes a module approval-only, the toggle goes
    // with it. Two lists that must agree are two lists that will drift.
    for (const moduleId of [...RECORD_MODULES, ...APPROVAL_ONLY, 'SOMETHING_UNKNOWN']) {
      expect(mayAuthorSubTasks(moduleId)).toBe(allowedStepTypes(moduleId).includes('ACTION'))
    }
  })
})
