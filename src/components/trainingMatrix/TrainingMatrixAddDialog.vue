<script setup>
const props = defineProps({
  // Optional — when provided, training is pre-selected and not editable
  trainingId: { type: String, default: null },
})

const emit = defineEmits(['added'])
const model = defineModel({ type: Boolean, default: false })

const toast = useToast()

const newTrainingId = ref(null)
const newRoleId = ref(null)

watch(model, (open) => {
  if (open) {
    newTrainingId.value = props.trainingId ?? null
    newRoleId.value = null
  }
})

// Already-assigned role IDs for the currently selected training
const existingRoleIds = useLiveQueryWithDeps(
  [() => newTrainingId.value],
  async (db, [trainingId]) => {
    if (!trainingId) return []
    const rules = await db.TrainingMatrix.where().exec()
    return rules.filter((r) => r.trainingId === trainingId).map((r) => r.roleId)
  },
  { initial: [] },
)

const addRule = useLiveMutation(async (db, { trainingId, roleId }) => {
  const record = db.TrainingMatrix.create({ trainingId, roleId })
  await record.save()
})

const saving = ref(false)

async function handleAdd() {
  if (!newTrainingId.value || !newRoleId.value) return
  saving.value = true
  try {
    await addRule({ trainingId: newTrainingId.value, roleId: newRoleId.value })
    emit('added')
  } catch (err) {
    toast.notify({ type: 'negative', message: err?.message || 'Failed to add rule' })
  } finally {
    saving.value = false
    model.value = false
    newTrainingId.value = null
    newRoleId.value = null
  }
}
</script>

<template>
  <BaseDialog v-model="model" title="Add Training Matrix Rule" maxWidth="sm">
    <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
      <div>
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Training</p>
        <TrainingBadgeById v-if="trainingId" :trainingId="trainingId" />
        <TrainingSelectMenu v-else v-model="newTrainingId" :required="true" />
      </div>
      <div>
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Role</p>
        <RoleSelectMenu v-model="newRoleId" :required="true" :excludeIds="existingRoleIds" />
      </div>
      <div class="tw:flex tw:justify-end tw:gap-2">
        <BaseButton variant="secondary" @click="model = false">Cancel</BaseButton>
        <BaseButton variant="primary" :loading="saving" :disabled="!newTrainingId || !newRoleId" @click="handleAdd">
          Add Rule
        </BaseButton>
      </div>
    </div>
  </BaseDialog>
</template>
