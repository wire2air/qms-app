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

// Available trainings (active, non-doc-driven)
const trainings = useLiveQuery(
  async (db) => {
    const all = await db.Training.where().exec()
    return all
      .filter((t) => t.status === 'ACTIVE' && !t.sourceDocumentId)
      .sort((a, b) => a.title?.localeCompare(b.title ?? '') ?? 0)
  },
  { initial: [] },
)

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

const allRoles = useLiveQuery(
  async (db) => {
    const all = await db.Role.where('statusId', 'ACTIVE').exec()
    return all.sort((a, b) => a.name?.localeCompare(b.name ?? '') ?? 0)
  },
  { initial: [] },
)

const availableRoles = computed(() => {
  const excluded = new Set(existingRoleIds.value)
  return allRoles.value.filter((r) => !excluded.has(r.id))
})

const addRule = useLiveMutation(async (db, { trainingId, roleId }) => {
  const record = db.TrainingMatrix.create({ trainingId, roleId })
  await record.save()
})

const saving = ref(false)

async function handleAdd() {
  if (!newTrainingId.value) {
    toast.notify({ type: 'negative', message: 'Please select a training' })
    return
  }
  if (!newRoleId.value) {
    toast.notify({ type: 'negative', message: 'Please select a role' })
    return
  }
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
  <BaseDialog v-model="model" title="Add Training Matrix Rule" maxWidth="md">
    <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
      <div>
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Training</p>
        <TrainingBadgeById v-if="trainingId" :trainingId="trainingId" />
        <select
          v-else
          v-model="newTrainingId"
          class="tw:w-full tw:rounded-lg tw:border tw:border-divider tw:bg-sidebar tw:px-3 tw:py-2 tw:text-sm tw:focus:outline-none tw:focus:ring-2 tw:focus:ring-primary/50"
        >
          <option :value="null">— Select a training —</option>
          <option v-for="t in trainings" :key="t.id" :value="t.id">{{ t.title }}</option>
        </select>
      </div>
      <div>
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Role</p>
        <select
          v-model="newRoleId"
          class="tw:w-full tw:rounded-lg tw:border tw:border-divider tw:bg-sidebar tw:px-3 tw:py-2 tw:text-sm tw:focus:outline-none tw:focus:ring-2 tw:focus:ring-primary/50"
        >
          <option :value="null">— Select a role —</option>
          <option v-for="r in availableRoles" :key="r.id" :value="r.id">{{ r.name }}</option>
        </select>
        <p
          v-if="newTrainingId && !availableRoles.length"
          class="tw:text-xs tw:text-secondary tw:italic tw:mt-1"
        >
          All roles already mapped to this training.
        </p>
      </div>
      <div class="tw:flex tw:justify-end tw:gap-2">
        <BaseButton variant="secondary" @click="model = false">Cancel</BaseButton>
        <BaseButton variant="primary" :loading="saving" @click="handleAdd"> Add Rule </BaseButton>
      </div>
    </div>
  </BaseDialog>
</template>
