<script setup>
const props = defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  excludeIds: { type: Array, default: () => [] },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

// Active curricula only.
const curricula = useLiveQuery(
  async (db) =>
    db.Curriculum.where()
      .exec()
      .then((all) => all.filter((c) => c.isActive)),
  { models: ['Curriculum'], initial: [] },
)

const options = computed(() => {
  const exclude = new Set(props.excludeIds || [])
  return (curricula.value || []).filter((c) => !exclude.has(c.id))
})
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="options"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    nullLabel="— Select curriculum —"
  >
    <template #selected="{ options: selected, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <CurriculumBadgeById
          v-for="o in selected"
          :key="o.value"
          :curriculumId="o.value"
          :clearable="multiple && (!required || selected.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
