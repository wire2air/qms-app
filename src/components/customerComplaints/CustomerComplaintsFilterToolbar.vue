<script setup>
import { IconFilter, IconX, IconBookmark, IconTrash, IconCalendar } from '@tabler/icons-vue'

defineProps({
  formOptions: { type: Array, default: () => [] },
  customFieldKeys: { type: Array, default: () => [] },
  savedViews: { type: Array, default: () => [] },
})

const emit = defineEmits(['saveView', 'applyView', 'deleteView'])

const filters = defineModel('filters', { type: Object, required: true })
const activeFilter = defineModel('activeFilter', { type: String, required: true })

const filterPills = [
  { value: 'all_open', label: 'All open' },
  { value: 'mine', label: 'My tickets' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'waiting', label: 'Waiting customer' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
  { value: 'spam', label: 'Spam' },
]

const SENTIMENTS = [
  { id: 'POSITIVE', name: 'Positive' },
  { id: 'NEUTRAL', name: 'Neutral' },
  { id: 'NEGATIVE', name: 'Negative' },
  { id: 'URGENT', name: 'Urgent' },
]

// Advanced filters fold away to keep the toolbar compact.
const showAdvanced = ref(false)

const dateFilterItems = computed(() => [
  { id: 'createdAt', label: 'Created date', icon: IconCalendar, group: 'createdAt', type: 'date' },
])

const advancedActive = computed(
  () =>
    !!(
      filters.value.formId ||
      filters.value.sentiment ||
      filters.value.assignedTeamId ||
      filters.value.createdAt ||
      (filters.value.customKey && filters.value.customValue)
    ),
)

const showClear = computed(
  () =>
    !!(
      filters.value.search ||
      filters.value.statusId ||
      filters.value.priorityId ||
      filters.value.sourceId ||
      filters.value.assignedTo ||
      advancedActive.value
    ),
)

const showSaveViewDialog = ref(false)
const newViewName = ref('')

function handleSaveView() {
  const name = newViewName.value.trim()
  if (!name) return
  emit('saveView', name)
  newViewName.value = ''
  showSaveViewDialog.value = false
}

function clearAdvanced() {
  filters.value.formId = null
  filters.value.sentiment = null
  filters.value.assignedTeamId = null
  filters.value.createdAt = null
  filters.value.customKey = null
  filters.value.customValue = ''
}

function clearAll() {
  filters.value.search = ''
  filters.value.statusId = null
  filters.value.priorityId = null
  filters.value.sourceId = null
  filters.value.assignedTo = null
  clearAdvanced()
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-2">
    <BaseFilterBar
      v-model:search="filters.search"
      searchPlaceholder="Search ticket, subject, customer…"
      :showClear="showClear"
      @clear="clearAll"
    >
      <template #filters>
        <CustomerComplaintStatusSelectMenu v-model="filters.statusId" />
        <CustomerComplaintPrioritySelectMenu v-model="filters.priorityId" />
        <CustomerComplaintSourceSelectMenu v-model="filters.sourceId" />
        <UserSelectMenu v-model="filters.assignedTo" />
        <button
          class="tw:flex tw:items-center tw:gap-1 tw:px-2 tw:py-1 tw:rounded-md tw:text-xs tw:font-medium tw:transition-colors"
          :class="
            advancedActive || showAdvanced
              ? 'tw:bg-blue-100 tw:text-blue-700'
              : 'tw:text-secondary tw:hover:bg-main-hover'
          "
          @click="showAdvanced = !showAdvanced"
        >
          <IconFilter :size="14" />
          More
        </button>
      </template>
    </BaseFilterBar>

    <!-- Advanced filters -->
    <div
      v-if="showAdvanced"
      class="tw:flex tw:items-end tw:p-2 tw:gap-2 tw:flex-wrap tw:rounded-lg tw:border tw:border-divider tw:bg-card"
    >
      <BaseField label="Form" size="xs">
        <BaseSelectMenu v-model="filters.formId" :items="formOptions" />
      </BaseField>
      <BaseField label="Sentiment" size="xs">
        <BaseSelectMenu v-model="filters.sentiment" :items="SENTIMENTS" />
      </BaseField>
      <BaseField label="Group" size="xs">
        <GroupSelectMenu v-model="filters.assignedTeamId" />
      </BaseField>
      <BaseFilterMenu v-model="filters" :items="dateFilterItems" />
      <BaseField v-if="customFieldKeys.length" label="Custom field" size="xs">
        <div class="tw:flex tw:gap-1">
          <BaseSelectMenu
            v-model="filters.customKey"
            :items="customFieldKeys.map((k) => ({ id: k, name: k }))"
          />
          <BaseTextInput v-model="filters.customValue" placeholder="contains…" class="tw:w-32" />
        </div>
      </BaseField>
      <button
        v-if="advancedActive"
        class="tw:flex tw:items-center tw:gap-1 tw:px-2 tw:py-1.5 tw:rounded-md tw:text-xs tw:text-secondary tw:hover:bg-main-hover"
        @click="clearAdvanced"
      >
        <IconX :size="12" />
        Clear
      </button>
    </div>

    <div class="tw:flex tw:gap-2 tw:flex-wrap tw:items-center">
      <button
        v-for="pill in filterPills"
        :key="pill.value"
        class="tw:px-3 tw:py-1 tw:rounded-full tw:text-xs tw:font-medium tw:border tw:transition-colors"
        :class="
          activeFilter === pill.value
            ? pill.value === 'spam'
              ? 'tw:bg-red-50 tw:text-red-700 tw:border-red-300'
              : 'tw:bg-blue-50 tw:text-blue-700 tw:border-blue-300'
            : 'tw:bg-white tw:text-secondary tw:border-divider tw:hover:bg-main-hover'
        "
        @click="activeFilter = pill.value"
      >
        {{ pill.label }}
      </button>

      <span v-if="savedViews.length" class="tw:text-divider">|</span>
      <BaseClickableRow
        v-for="view in savedViews"
        :key="view.id"
        tag="span"
        class="tw:group tw:inline-flex tw:items-center tw:gap-1 tw:px-3 tw:py-1 tw:rounded-full tw:text-xs tw:font-medium tw:border tw:border-divider tw:bg-white tw:text-secondary tw:hover:bg-main-hover"
        :aria-label="`Apply saved view ${view.name}`"
        @click="emit('applyView', view)"
      >
        <IconBookmark :size="12" />
        {{ view.name }}
        <button
          class="tw:hidden tw:group-hover:inline-flex tw:text-secondary tw:hover:text-red-600"
          title="Delete view"
          @click.stop="emit('deleteView', view)"
        >
          <IconTrash :size="12" />
        </button>
      </BaseClickableRow>

      <button
        class="tw:flex tw:items-center tw:gap-1 tw:px-2 tw:py-1 tw:rounded-md tw:text-xs tw:text-secondary tw:hover:bg-main-hover"
        @click="showSaveViewDialog = true"
      >
        <IconBookmark :size="12" />
        Save view
      </button>
    </div>

    <BaseDialog v-model="showSaveViewDialog" title="Save Current View" maxWidth="sm">
      <div class="tw:flex tw:flex-col tw:gap-2 tw:p-1">
        <p class="tw:text-xs tw:text-secondary">
          Saves the current filters and pill selection as a personal quick view.
        </p>
        <BaseTextInput
          v-model="newViewName"
          placeholder="View name, e.g. Urgent unassigned"
          @keyup.enter="handleSaveView"
        />
      </div>
      <template #footer="{ close }">
        <BaseDialogFooter
          submitLabel="Save"
          :disabled="!newViewName.trim()"
          @cancel="close"
          @submit="handleSaveView"
        />
      </template>
    </BaseDialog>
  </div>
</template>
