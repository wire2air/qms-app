<script setup>
/**
 * Add a training to one or more curricula, from the training's detail page.
 * The reverse of the Training Curriculum admin — the searchable multiselect is
 * pre-filled with the curricula this training already belongs to, so it also
 * removes memberships. Persists CurriculumTraining join rows via the syncEngine.
 */
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  trainingId: { type: String, required: true },
  trainingTitle: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const toast = useToast()

const memberships = useLiveQueryWithDeps(
  [() => props.trainingId],
  async (db, [tid]) => (tid ? db.CurriculumTraining.where('trainingId', tid).exec() : []),
  { models: ['CurriculumTraining'], initial: [] },
)
const hasCurricula = useLiveQuery(
  async (db) => (await db.Curriculum.where().exec()).some((c) => c.isActive),
  { models: ['Curriculum'], initial: false },
)

const selected = ref([])
watch(
  () => props.modelValue,
  (open) => {
    if (open) selected.value = (memberships.value || []).map((ct) => ct.curriculumId)
  },
)

const saving = ref(false)
const addMembership = useLiveMutation(async (db, { curriculumId, trainingId }) => {
  const ct = db.CurriculumTraining.create({ curriculumId, trainingId })
  await ct.save()
  return ct
})

async function save() {
  saving.value = true
  try {
    const current = memberships.value || []
    const currentIds = current.map((ct) => ct.curriculumId)
    for (const cid of selected.value.filter((id) => !currentIds.includes(id))) {
      await addMembership({ curriculumId: cid, trainingId: props.trainingId })
    }
    for (const ct of current.filter((ct) => !selected.value.includes(ct.curriculumId))) {
      await ct.delete()
    }
    toast.success('Curricula updated')
    emit('update:modelValue', false)
  } catch (e) {
    toast.error(e?.message || 'Failed to update curricula')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog
    :modelValue="modelValue"
    title="Add to curriculum"
    size="sm"
    @update:modelValue="emit('update:modelValue', $event)"
  >
    <div class="tw:flex tw:flex-col tw:gap-2">
      <p class="tw:text-xs tw:text-secondary">
        Add <strong>{{ trainingTitle }}</strong> to one or more curricula. Everyone whose role is
        mapped to a selected curriculum is assigned this training.
      </p>
      <BaseText as="div" variant="overline">Curricula</BaseText>
      <CurriculumSelectMenu v-model="selected" :multiple="true" />
      <p v-if="!hasCurricula" class="tw:text-xs tw:text-secondary tw:italic">
        No curricula yet — create one on the Training Curriculum page first.
      </p>
    </div>
    <template #footer="{ close }">
      <BaseDialogFooter submitLabel="Save" :loading="saving" @cancel="close" @submit="save" />
    </template>
  </BaseDialog>
</template>
