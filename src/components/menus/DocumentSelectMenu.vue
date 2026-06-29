<script setup>
const props = defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  hideNullOption: { type: Boolean, default: false },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const selectRef = ref(null)

const allDocuments = useLiveQuery(
  async (db) => db.Document.where().orderBy('docNumber', 'asc').exec(),

  { models: ['Document'], initial: [] },
)

const effectiveVersions = useLiveQuery(
  async (db) => db.DocumentVersion.where().where('statusId', 'EFFECTIVE').exec(),

  { models: ['DocumentVersion'], initial: [] },
)

const items = computed(() => {
  const effectiveDocIds = new Set(effectiveVersions.value.map((v) => v.documentId))
  return allDocuments.value
    .filter((d) => effectiveDocIds.has(d.id))
    .map((d) => ({ id: d.id, name: `${d.docNumber} – ${d.title}` }))
})

// Callers (e.g. TrainingDocumentSelector) open the picker programmatically.
const nullLabel = computed(() => (props.hideNullOption ? null : '— All documents —'))

defineExpose({
  open() {
    selectRef.value?.open()
  },
})
</script>

<template>
  <BaseSelect
    ref="selectRef"
    v-model="modelValue"
    :options="items"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    :nullLabel="nullLabel"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <DocumentBadgeById
          v-for="o in options"
          :key="o.value"
          :documentId="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
