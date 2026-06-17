<script setup>
/**
 * "Add from library" picker for the spec builder. Lists active Test Library
 * entries (DefectCatalog); on pick it emits the full entry and resets, so the
 * parent can push a pre-filled characteristic. Optionally filtered by productTypeId.
 */
const props = defineProps({
  productTypeId: { type: String, default: null },
})
const emit = defineEmits(['pick'])

const sel = ref(null)
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

watch(sel, (id) => {
  if (!id) return
  const entry = tests.value.find((t) => t.id === id)
  sel.value = null
  if (entry) emit('pick', entry)
})
</script>

<template>
  <BaseSelectMenu v-model="sel" :items="tests" :required="false" :hideNullOption="true">
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
  </BaseSelectMenu>
</template>
