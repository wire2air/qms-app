<script setup>
import { IconPlus } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const props = defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  isFilter: { type: Boolean, default: false },
  nullLabel: { type: String, default: null },
  allowCreate: { type: Boolean, default: true },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const categories = useLiveQuery((db) => db.EventCategory.where().orderBy('displayOrder').exec(), {
  models: ['EventCategory'],
  initial: [],
})

const resolvedNullLabel = computed(
  () => props.nullLabel ?? (props.isFilter ? '— All categories —' : '— Select category —'),
)

// Inline "add new" — same pattern as DepartmentSelectMenu. Gated by the
// events-configure permission (same one Lookups → Event Categories uses).
const canCreate = computed(() => props.allowCreate && isAllowed(['quality_events:configure']))
const showCreateDialog = ref(false)

function openCreateDialog(closePopover) {
  closePopover?.()
  showCreateDialog.value = true
}

function onCreated(created) {
  if (!created?.id) return
  if (props.multiple) {
    const arr = Array.isArray(modelValue.value) ? modelValue.value : []
    if (!arr.includes(created.id)) modelValue.value = [...arr, created.id]
  } else {
    modelValue.value = created.id
  }
}
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="categories"
    optionLabel="name"
    optionValue="id"
    :required="props.required"
    :multiple="props.multiple"
    :clearable="!props.required"
    :nullLabel="resolvedNullLabel"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <EventCategoryBadgeById
          v-for="o in options"
          :key="o.value"
          :categoryId="o.value"
          :clearable="props.multiple && (!props.required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>

    <template v-if="canCreate" #footer="{ close }">
      <button
        type="button"
        class="tw:w-full tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2.5 tw:text-sm tw:font-medium tw:text-primary tw:hover:bg-primary/5 tw:border-t tw:border-divider tw:transition-colors"
        @click="openCreateDialog(close)"
      >
        <IconPlus :size="16" />
        Add New Category
      </button>
    </template>
  </BaseSelect>

  <EventCategoryCreateDialog v-if="showCreateDialog" v-model="showCreateDialog" @created="onCreated" />
</template>
