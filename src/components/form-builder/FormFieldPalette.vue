<script setup>
import { IconSearch, IconHome, IconGripVertical } from '@tabler/icons-vue'
import { useSortable } from '@vueuse/integrations/useSortable'
import { FIELD_TYPES, CATEGORY_LABELS } from '@/constants/formBuilderConfig'
import { getCompanyPath } from '@/utils/routeHelpers'

defineProps({
  isDragging: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['dragStart', 'dragEnd', 'fieldClick'])

const search = ref('')
const categoryRefs = ref({})

const fieldsByCategory = computed(() => {
  const categories = {}

  for (const [type, meta] of Object.entries(FIELD_TYPES)) {
    const category = meta.category || 'other'
    if (!categories[category]) {
      categories[category] = {}
    }
    categories[category][type] = meta
  }

  return categories
})

const filteredFieldsByCategory = computed(() => {
  if (!search.value) {
    return fieldsByCategory.value
  }

  const searchLower = search.value.toLowerCase()
  const filtered = {}

  for (const [category, fields] of Object.entries(fieldsByCategory.value)) {
    const matchingFields = {}
    for (const [type, meta] of Object.entries(fields)) {
      if (
        meta.label.toLowerCase().includes(searchLower) ||
        type.toLowerCase().includes(searchLower)
      ) {
        matchingFields[type] = meta
      }
    }
    if (Object.keys(matchingFields).length > 0) {
      filtered[category] = matchingFields
    }
  }

  return filtered
})

function setCategoryRef(category, el) {
  if (el) {
    categoryRefs.value[category] = el
  }
}

let sortables = []

// Initialize sortable for each category when refs are set
watch(
  categoryRefs,
  (refs) => {
    sortables.forEach((sortable) => sortable.stop())

    sortables = Object.values(refs).map((el) => {
      return useSortable(el, [], {
        group: {
          name: 'form-fields',
          pull: 'clone',
          put: false,
        },
        sort: false,
        animation: 150,
        handle: '.drag-handle',
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',
        onStart() {
          emit('dragStart')
        },
        onEnd() {
          emit('dragEnd')
        },
      })
    })
  },
  { deep: true },
)

function onFieldClick(fieldType) {
  emit('fieldClick', fieldType)
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:h-full tw:bg-sidebar">
    <div
      class="tw:flex tw:items-center tw:justify-between tw:px-4 tw:py-3 tw:border-b tw:border-divider"
    >
      <div class="tw:text-lg tw:font-bold tw:text-on-sidebar">Components</div>
      <RouterLink
        :to="getCompanyPath('/templates')"
        class="tw:p-2 tw:rounded-lg tw:text-secondary tw:hover:bg-main-hover tw:transition-colors"
      >
        <IconHome :size="20" />
      </RouterLink>
    </div>

    <div class="tw:px-4 tw:py-2 tw:bg-main/30">
      <BaseTextInput v-model="search" placeholder="Search components..." size="sm">
        <template #icon>
          <IconSearch :size="18" class="tw:text-secondary/50" />
        </template>
      </BaseTextInput>
    </div>

    <div class="tw:flex-1 tw:overflow-y-auto tw:px-3 tw:py-4 tw:flex tw:flex-col tw:gap-4">
      <template v-for="(categoryFields, category) in filteredFieldsByCategory" :key="category">
        <div class="tw:flex tw:flex-col tw:gap-3">
          <BaseText as="div" variant="overline">
            {{ CATEGORY_LABELS[category] }}
          </BaseText>

          <div :ref="(el) => setCategoryRef(category, el)" class="tw:flex tw:flex-col tw:gap-2">
            <BaseClickableRow
              v-for="(fieldMeta, fieldType) in categoryFields"
              :key="fieldType"
              :data-field-type="fieldType"
              class="tw:bg-main tw:border drag-handle tw:border-divider tw:p-1 tw:rounded-xl tw:flex tw:items-center tw:gap-2 tw:cursor-grab tw:active:cursor-grabbing tw:hover:border-primary tw:hover:bg-main-selected tw:transition-all"
              :aria-label="`Add ${fieldMeta.label} field`"
              @click="onFieldClick(fieldType)"
            >
              <div
                class="tw:w-8 tw:h-8 tw:bg-main-hover tw:rounded-lg tw:flex tw:items-center tw:justify-center"
              >
                <component :is="fieldMeta.icon" :size="18" class="tw:text-primary" />
              </div>
              <div class="tw:flex-1 tw:text-sm tw:font-medium tw:text-on-sidebar">
                {{ fieldMeta.label }}
              </div>
              <IconGripVertical :size="18" class="tw:text-divider" />
            </BaseClickableRow>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// SortableJS integration
:deep(.sortable-ghost) {
  background: var(--tw-primary);
  border: 1px solid var(--tw-primary);
}

:deep(.sortable-chosen) {
  background: var(--tw-main-selected);
}

:deep(.sortable-drag) {
  background: white;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  border-radius: 8px;
}
</style>
