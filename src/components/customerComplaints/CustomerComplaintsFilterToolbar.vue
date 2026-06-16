<script setup>
import { IconSearch, IconFilter, IconX, IconBookmark, IconTrash } from '@tabler/icons-vue'

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

const advancedActive = computed(
  () =>
    !!(
      filters.value.formId ||
      filters.value.sentiment ||
      filters.value.assignedTeamId ||
      filters.value.dateFrom ||
      filters.value.dateTo ||
      (filters.value.customKey && filters.value.customValue)
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
  filters.value.dateFrom = null
  filters.value.dateTo = null
  filters.value.customKey = null
  filters.value.customValue = ''
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-2">
    <div class="tw:bg-main-hover tw:rounded-lg">
      <div class="tw:flex tw:items-center tw:p-2 tw:gap-2 tw:flex-wrap">
        <div class="tw:w-full tw:md:w-1/4 tw:relative">
          <IconSearch
            :size="16"
            class="tw:absolute tw:left-2 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary tw:pointer-events-none"
          />
          <BaseTextInput
            v-model="filters.search"
            placeholder="Search ticket, subject, customer…"
            class="tw:pl-7"
          />
        </div>
        <div class="tw:w-full tw:md:w-1/6">
          <CustomerComplaintStatusSelectMenu v-model="filters.statusId" />
        </div>
        <div class="tw:w-full tw:md:w-1/6">
          <CustomerComplaintPrioritySelectMenu v-model="filters.priorityId" />
        </div>
        <div class="tw:w-full tw:md:w-1/6">
          <CustomerComplaintSourceSelectMenu v-model="filters.sourceId" />
        </div>
        <div class="tw:w-full tw:md:w-1/6">
          <UserSelectMenu v-model="filters.assignedTo" />
        </div>
        <button
          class="tw:flex tw:items-center tw:gap-1 tw:px-2 tw:py-1 tw:rounded-md tw:text-xs tw:font-medium tw:transition-colors"
          :class="
            advancedActive || showAdvanced
              ? 'tw:bg-blue-100 tw:text-blue-700'
              : 'tw:text-secondary tw:hover:bg-white'
          "
          @click="showAdvanced = !showAdvanced"
        >
          <IconFilter :size="14" />
          More
        </button>
      </div>

      <!-- Advanced filters -->
      <div
        v-if="showAdvanced"
        class="tw:flex tw:items-end tw:px-2 tw:pb-2 tw:gap-2 tw:flex-wrap tw:border-t tw:border-divider tw:pt-2"
      >
        <div class="tw:flex tw:flex-col tw:gap-0.5">
          <label class="tw:text-[10px] tw:uppercase tw:font-bold tw:text-secondary">Form</label>
          <BaseSelectMenu v-model="filters.formId" :items="formOptions" />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-0.5">
          <label class="tw:text-[10px] tw:uppercase tw:font-bold tw:text-secondary">
            Sentiment
          </label>
          <BaseSelectMenu v-model="filters.sentiment" :items="SENTIMENTS" />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-0.5">
          <label class="tw:text-[10px] tw:uppercase tw:font-bold tw:text-secondary">Group</label>
          <GroupSelectMenu v-model="filters.assignedTeamId" />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-0.5">
          <label class="tw:text-[10px] tw:uppercase tw:font-bold tw:text-secondary">
            Created from
          </label>
          <BaseDatePicker v-model="filters.dateFrom" class="tw:w-36" />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-0.5">
          <label class="tw:text-[10px] tw:uppercase tw:font-bold tw:text-secondary">
            Created to
          </label>
          <BaseDatePicker v-model="filters.dateTo" class="tw:w-36" />
        </div>
        <div v-if="customFieldKeys.length" class="tw:flex tw:flex-col tw:gap-0.5">
          <label class="tw:text-[10px] tw:uppercase tw:font-bold tw:text-secondary">
            Custom field
          </label>
          <div class="tw:flex tw:gap-1">
            <BaseSelectMenu
              v-model="filters.customKey"
              :items="customFieldKeys.map((k) => ({ id: k, name: k }))"
            />
            <BaseTextInput
              v-model="filters.customValue"
              placeholder="contains…"
              class="tw:w-32"
            />
          </div>
        </div>
        <button
          v-if="advancedActive"
          class="tw:flex tw:items-center tw:gap-1 tw:px-2 tw:py-1.5 tw:rounded-md tw:text-xs tw:text-secondary tw:hover:bg-white"
          @click="clearAdvanced"
        >
          <IconX :size="12" />
          Clear
        </button>
      </div>
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
        <BaseButton variant="outline" @click="close">Cancel</BaseButton>
        <BaseButton variant="primary" :disabled="!newViewName.trim()" @click="handleSaveView">
          Save
        </BaseButton>
      </template>
    </BaseDialog>
  </div>
</template>
