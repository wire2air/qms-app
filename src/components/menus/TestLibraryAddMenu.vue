<script setup>
/**
 * "Add from library" picker for the spec builder. Lists active Test Library
 * entries (DefectCatalog) with a tick state; the user can select several and
 * click "Add" to push them all at once. Emits `pick` with the array of chosen
 * entries, so the parent can prepend pre-filled characteristics in one go.
 * Optionally filtered by Item Group (productFamilyId).
 */
import { IconCheck } from '@tabler/icons-vue'

const props = defineProps({
  productFamilyId: { type: String, default: null },
})
const emit = defineEmits(['pick'])

const sel = ref([])
const all = useLiveQuery(async (db) => db.DefectCatalog.where().exec(), { initial: [] })
const tests = computed(() =>
  all.value
    .filter((t) => t.active)
    .filter((t) => {
      const list = t.applicableProductFamilyIds
      if (!props.productFamilyId || !Array.isArray(list) || list.length === 0) return true
      return list.includes(props.productFamilyId)
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
  <BaseSelect v-model="sel" :options="tests" optionLabel="name" optionValue="id" :multiple="true">
    <template #trigger>
      <button
        type="button"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:text-sm tw:font-medium tw:text-primary"
      >
        + Add from library
      </button>
    </template>

    <template #option="{ opt, selected }">
      <div class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:w-full">
        <span>
          {{ opt.raw.name }}
          <span class="tw:text-xs tw:text-secondary">· {{ opt.raw.testType }}</span>
        </span>
        <div class="tw:flex tw:items-center tw:gap-2 tw:shrink-0">
          <DefectSeverityBadgeById :severityId="opt.raw.defaultSeverity" />
          <IconCheck v-if="selected" :size="16" class="tw:text-primary" />
        </div>
      </div>
    </template>

    <template #footer="{ close }">
      <button
        type="button"
        class="tw:w-full tw:flex tw:items-center tw:justify-center tw:gap-2 tw:px-4 tw:py-2.5 tw:text-sm tw:font-medium tw:border-t tw:border-divider tw:transition-colors"
        :class="
          sel.length
            ? 'tw:text-primary tw:hover:bg-primary/5'
            : 'tw:text-secondary tw:cursor-not-allowed'
        "
        :disabled="!sel.length"
        @click="applySelection(close)"
      >
        Add {{ sel.length || '' }} {{ sel.length === 1 ? 'test' : 'tests' }}
      </button>
    </template>
  </BaseSelect>
</template>
