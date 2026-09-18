/**
 * Copy every step of a workflow version — including child steps, per-step
 * users, roles, and allowed outcomes — onto a target version. parentStepId
 * links are remapped through the old→new id map, which is returned.
 *
 * Shared by the editor's "new draft version" flow and the template list's
 * Clone action (2026-08-14) so the two can't drift on which fields carry
 * forward (stepType famously got dropped here once — see WorkflowEditor).
 *
 * Runs inside a useLiveMutation callback — `db` is the SyncEngine handle.
 */
export async function copyVersionSteps(db, sourceVersionId, targetVersionId) {
  if (!sourceVersionId || !targetVersionId) return {}

  const sourceSteps = await db.WorkflowStep.where('workflowVersionId', sourceVersionId).exec()

  // First pass: create all new steps and build the old→new id map.
  const idMap = {}
  const stepPairs = []

  for (const step of sourceSteps) {
    const newStep = db.WorkflowStep.create({
      workflowVersionId: targetVersionId,
      name: step.name,
      description: step.description,
      stepOrder: step.stepOrder,
      stepType: step.stepType ?? 'ACTION',
      approvalRule: step.approvalRule,
      slaDays: step.slaDays,
      delayDays: step.delayDays ?? null,
      delayUntilDate: step.delayUntilDate ?? null,
      maxDelayExtensions: step.maxDelayExtensions ?? null,
      requireComments: step.requireComments,
      requireEsignature: step.requireEsignature,
      allowChildSteps: step.allowChildSteps ?? false,
      formSchema: JSON.parse(JSON.stringify(step.formSchema ?? [])),
    })
    await newStep.save()
    idMap[step.id] = newStep.id
    stepPairs.push({ oldStep: step, newStep })

    const users = await db.WorkflowStepUser.where('stepId', step.id).exec()
    for (const su of users) {
      const newSu = db.WorkflowStepUser.create({ stepId: newStep.id, userId: su.userId })
      await newSu.save()
    }

    const roles = await db.WorkflowStepRole.where('stepId', step.id).exec()
    for (const sr of roles) {
      const newSr = db.WorkflowStepRole.create({ stepId: newStep.id, roleId: sr.roleId })
      await newSr.save()
    }

    const outcomes = await db.AllowedOutcomeOnStep.where('stepId', step.id).exec()
    for (const o of outcomes) {
      const newO = db.AllowedOutcomeOnStep.create({
        stepId: newStep.id,
        outcomeId: o.outcomeId,
      })
      await newO.save()
    }
  }

  // Second pass: remap parentStepId through the idMap. (StepSendBackTarget
  // rows are not carried forward — the engine computes send-back targets at
  // runtime; legacy rows stay dead on the source version.)
  for (const { oldStep, newStep } of stepPairs) {
    if (oldStep.parentStepId && idMap[oldStep.parentStepId]) {
      newStep.parentStepId = idMap[oldStep.parentStepId]
      await newStep.save()
    }
  }

  return idMap
}

/** Newest live version of a workflow (major.minor desc) — the clone source. */
export async function newestVersionOf(db, workflowId) {
  const versions = await db.WorkflowVersion.where('workflowId', workflowId).exec()
  return (
    versions.sort((a, b) => {
      if (a.versionMajor !== b.versionMajor) return b.versionMajor - a.versionMajor
      return b.versionMinor - a.versionMinor
    })[0] ?? null
  )
}
