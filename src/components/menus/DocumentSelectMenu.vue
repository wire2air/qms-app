<script setup>
defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  hideNullOption: { type: Boolean, default: false },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const triggerElRef = ref(null)

const allDocuments = useLiveQuery(
  async (db) => db.Document.where().orderBy('docNumber', 'asc').exec(),
  { initial: [] },
)

const effectiveVersions = useLiveQuery(
  async (db) => db.DocumentVersion.where().where('statusId', 'EFFECTIVE').exec(),
  { initial: [] },
)

const items = computed(() => {
  const effectiveDocIds = new Set(effectiveVersions.value.map((v) => v.documentId))
  return allDocuments.value
    .filter((d) => effectiveDocIds.has(d.id))
    .map((d) => ({ id: d.id, name: `${d.docNumber} – ${d.title}` }))
})

function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}

defineExpose({
  open() {
    triggerElRef.value?.click()
  },
})
</script>

<template>
  <BaseSelectMenu
    v-model="modelValue"
    :items="items"
    :required="required"
    :multiple="multiple"
    :hideNullOption="hideNullOption"
  >
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <div ref="triggerElRef">
        <template v-if="multiple">
          <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
            <DocumentBadgeById
              v-for="docId in getArray()"
              :key="docId"
              :documentId="docId"
              :clearable="!required || getArray().length > 1"
              @clear="() => scope.clear(docId)"
            />
          </div>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">Select Documents</span>
        </template>
        <template v-else>
          <DocumentBadgeById
            v-if="modelValue"
            :documentId="modelValue"
            :clearable="!required"
            selectable
            @clear="() => scope.clear(modelValue)"
          />
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">Select Document</span>
        </template>
        </div>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
