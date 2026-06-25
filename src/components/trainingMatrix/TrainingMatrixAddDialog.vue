<script setup>
import { required } from '@shared/components/form/validators.js'

const props = defineProps({
  // Optional — when provided, training is pre-selected and not editable
  trainingId: { type: String, default: null },
})

const emit = defineEmits(['added'])
const model = defineModel({ type: Boolean, default: false })

const formRef = ref(null)
const saving = ref(false)
const saveError = ref('')

const newTrainingId = ref(null)
const newRoleId = ref(null)

watch(model, (open) => {
  if (open) {
    newTrainingId.value = props.trainingId ?? null
    newRoleId.value = null
    saveError.value = ''
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

  { models: ['TrainingMatrix'], initial: [] },
)

// All active roles — mirrors the source used by RoleSelectMenu
const allRoles = useLiveQuery(async (db) => db.Role.where('statusId', 'ACTIVE').exec(), {
  models: ['Role'],
  initial: [],
})

// Roles not yet mapped to this training — empty means all roles are taken
const availableRoles = computed(() => {
  const excluded = new Set(existingRoleIds.value)
  return (allRoles.value ?? []).filter((r) => !excluded.has(r.id))
})

const addRule = useLiveMutation(async (db, { trainingId, roleId }) => {
  const record = db.TrainingMatrix.create({ trainingId, roleId })
  await record.save()
})

async function onValidSubmit() {
  saving.value = true
  saveError.value = ''
  try {
    await addRule({ trainingId: newTrainingId.value, roleId: newRoleId.value })
    emit('added')
    model.value = false
  } catch (err) {
    saveError.value = err?.message || 'Failed to add rule'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="model" title="Add Training Matrix Rule" maxWidth="md">
    <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <BaseField label="Training" required :value="newTrainingId" :rules="[required()]">
          <TrainingBadgeById v-if="trainingId" :trainingId="trainingId" />
          <TrainingSelectMenu v-else v-model="newTrainingId" :required="true" />
        </BaseField>
        <BaseField label="Role" required :value="newRoleId" :rules="[required()]">
          <RoleSelectMenu v-model="newRoleId" :required="true" :excludeIds="existingRoleIds" />
          <p
            v-if="newTrainingId && !availableRoles.length"
            class="tw:text-xs tw:text-secondary tw:italic tw:mt-1"
          >
            All roles already mapped to this training.
          </p>
        </BaseField>
      </div>
    </BaseForm>

    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Add Rule"
        :loading="saving"
        :error="saveError"
        @cancel="close"
        @submit="formRef.submit()"
      />
    </template>
  </BaseDialog>
</template>
