<script setup>
/**
 * In-place editing of one LIVE approval step (user request 2026-08-16).
 *
 * The create form edits plain objects; this edits the real WorkflowStep behind
 * a saved template, so it owns the two things that differ: persisting the
 * step's own columns, and diffing WorkflowStepRole rows (roles are a join
 * table, not a column). The field layout itself is shared —
 * DocumentApprovalStepFields — so the two surfaces can't drift.
 *
 * Autosaves, debounced, matching how the rest of the template page behaves.
 */
import DocumentApprovalStepFields from './DocumentApprovalStepFields.vue'

const props = defineProps({
  stepId: { type: String, required: true },
  label: { type: String, required: true },
  canEdit: { type: Boolean, default: false },
})

const step = useLiveQueryWithDeps(
  [() => props.stepId],
  async (db, [id]) => (id ? db.WorkflowStep.findByPk(id) : null),
  { models: ['WorkflowStep'], initial: null },
)

const stepRoles = useLiveQueryWithDeps(
  [() => props.stepId],
  async (db, [id]) => (id ? db.WorkflowStepRole.where('stepId', id).exec() : []),
  { models: ['WorkflowStepRole'], initial: [] },
)

// The shape DocumentApprovalStepFields speaks, assembled from the step row plus
// its role join rows.
const model = computed({
  get() {
    return {
      roleIds: stepRoles.value.map((r) => r.roleId),
      approvalRule: step.value?.approvalRule ?? 'ALL',
      requireEsignature: step.value?.requireEsignature ?? true,
      requireComments: step.value?.requireComments ?? true,
      slaDays: step.value?.slaDays ?? null,
    }
  },
  set(next) {
    pending.value = next
    debouncedSave()
  },
})

const pending = ref(null)
const toast = useToast()

const persist = useLiveMutation(async (db, next) => {
  const row = await db.WorkflowStep.findByPk(props.stepId)
  if (!row) return
  row.approvalRule = next.approvalRule ?? 'ALL'
  row.requireEsignature = next.requireEsignature ?? true
  row.requireComments = next.requireComments ?? true
  row.slaDays = next.slaDays ?? null
  await row.save()

  // Roles are rows, so this is a diff rather than an assignment. Anything the
  // user removed is deleted; anything new is created. Untouched rows are left
  // alone so their ids — and anything referencing them — survive an edit.
  const wanted = new Set(next.roleIds ?? [])
  const existing = await db.WorkflowStepRole.where('stepId', props.stepId).exec()
  for (const row2 of existing) {
    if (wanted.has(row2.roleId)) wanted.delete(row2.roleId)
    else await row2.delete()
  }
  for (const roleId of wanted) {
    const rec = db.WorkflowStepRole.create({ stepId: props.stepId, roleId })
    await rec.save()
  }
})

const debouncedSave = useDebounceFn(async () => {
  if (!pending.value) return
  try {
    await persist(pending.value)
    pending.value = null
  } catch (err) {
    toast.error(err?.message || 'Failed to update the approval step')
  }
}, 600)
</script>

<template>
  <DocumentApprovalStepFields v-if="step" v-model="model" :label="label" :disabled="!canEdit" />
</template>
