<script setup>
/**
 * "Add from library" picker for the spec builder. Lists active Test Library
 * entries (DefectCatalog) with checkboxes; the user can tick several and click
 * "Add" to push them all at once. Emits `pick` with the array of chosen
 * entries, so the parent can prepend pre-filled characteristics in one go.
 * Optionally filtered by productTypeId.
 */
const props = defineProps({
  productTypeId: { type: String, default: null },
})
const emit = defineEmits(['pick'])

const sel = ref([])
const all = useLiveQuery(async (db) => db.DefectCatalog.where().exec(), { initial: [] })
const tests = computed(() =>
  all.value
    .filter((t) => t.active)
    .filter((t) => {
      const list = t.applicableProductTypeIds
      if (!props.productTypeId || !Array.isArray(list) || list.length === 0) return true
      return list.includes(props.productTypeId)
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
)

function applySelection(close) {
  const chosen = sel.value
    .map((id) => tests.value.find((t) => t.id === id))
    .filter(Boolean)
  sel.value = []
  if (chosen.length) emit('pick', chosen)
  close?.()
}
</script>

<template>
  <BaseSelectMenu
    v-model="sel"
    :items="tests"
    :multiple="true"
    :required="false"
    :hideNullOption="true"
  >
    <template #button>
      <span class="tw:inline-flex tw:items-center tw:gap-1 tw:text-sm tw:font-medium tw:text-primary">
        + Add from library
      </span>
    </template>
    <template #item="{ item }">
      <div class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:w-full">
        <span>{{ item.name }} <span class="tw:text-xs tw:text-secondary">· {{ item.testType }}</span></span>
        <DefectSeverityBadgeById :severityId="item.defaultSeverity" />
      </div>
    </template>
    <template #footer="{ close }">
      <button
        type="button"
        class="tw:w-full tw:flex tw:items-center tw:justify-center tw:gap-2 tw:px-4 tw:py-2.5 tw:text-sm tw:font-medium tw:border-t tw:border-divider tw:transition-colors"
        :class="sel.length
          ? 'tw:text-primary tw:hover:bg-primary/5'
          : 'tw:text-secondary tw:cursor-not-allowed'"
        :disabled="!sel.length"
        @click="applySelection(close)"
      >
        Add {{ sel.length || '' }} {{ sel.length === 1 ? 'test' : 'tests' }}
      </button>
    </template>
  </BaseSelectMenu>
</template>
