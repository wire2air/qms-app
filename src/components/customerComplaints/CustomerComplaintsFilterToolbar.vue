<script setup>
import {
  IconSearch,
  IconX,
  IconBookmark,
  IconTrash,
  IconCircleDot,
  IconAlertTriangle,
  IconInbox,
  IconUser,
  IconMoodSmile,
  IconForms,
  IconUsersGroup,
  IconCalendar,
} from '@tabler/icons-vue'

const props = defineProps({
  formOptions: { type: Array, default: () => [] },
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
  { value: 'spam', label: 'Spam', color: 'red' },
]

const SENTIMENTS = [
  { id: 'POSITIVE', name: 'Positive' },
  { id: 'NEUTRAL', name: 'Neutral' },
  { id: 'NEGATIVE', name: 'Negative' },
  { id: 'URGENT', name: 'Urgent' },
]

const PRIORITIES = [
  { id: 'LOW', name: 'Low' },
  { id: 'MEDIUM', name: 'Medium' },
  { id: 'HIGH', name: 'High' },
  { id: 'CRITICAL', name: 'Critical' },
]

// Option sources for the cascading filter menu.
const statuses = useLiveQuery(
  (db) => db.CustomerComplaintStatus.where().orderBy('displayOrder').exec(),
  { models: ['CustomerComplaintStatus'], initial: [] },
)
const sources = useLiveQuery(
  (db) => db.CustomerComplaintSource.where().orderBy('displayOrder').exec(),
  { models: ['CustomerComplaintSource'], initial: [] },
)
const users = useLiveQuery(
  async (db) => (await db.User.where().exec()).filter((u) => u.userStatusId === 'ACTIVE'),
  { models: ['User'], initial: [] },
)
const teams = useLiveQuery((db) => db.Team.where().exec(), { models: ['Team'], initial: [] })

// Multi-select dimensions use the default 'check' mode (arrays); single-value
// dimensions (form / sentiment / group) use 'radio' so the model key stays a
// scalar — no other code changes needed.
const filterItems = computed(() => [
  {
    id: 'statusId',
    label: 'Status',
    icon: IconCircleDot,
    group: 'statusId',
    options: statuses.value.map((s) => ({ value: s.id, label: s.name })),
  },
  {
    id: 'priorityId',
    label: 'Priority',
    icon: IconAlertTriangle,
    group: 'priorityId',
    options: PRIORITIES.map((p) => ({ value: p.id, label: p.name })),
  },
  {
    id: 'sourceId',
    label: 'Source',
    icon: IconInbox,
    group: 'sourceId',
    options: sources.value.map((s) => ({ value: s.id, label: s.name })),
  },
  {
    id: 'assignedTo',
    label: 'Assignee',
    icon: IconUser,
    group: 'assignedTo',
    searchable: true,
    options: users.value.map((u) => ({
      value: u.id,
      label: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
    })),
  },
  {
    id: 'sentiment',
    label: 'Sentiment',
    icon: IconMoodSmile,
    group: 'sentiment',
    select: 'radio',
    options: SENTIMENTS.map((s) => ({ value: s.id, label: s.name })),
  },
  {
    id: 'assignedTeamId',
    label: 'Group',
    icon: IconUsersGroup,
    group: 'assignedTeamId',
    select: 'radio',
    searchable: true,
    options: teams.value.map((t) => ({ value: t.id, label: t.name })),
  },
  ...(props.formOptions.length
    ? [
        {
          id: 'formId',
          label: 'Form',
          icon: IconForms,
          group: 'formId',
          select: 'radio',
          searchable: true,
          options: props.formOptions.map((f) => ({ value: f.id, label: f.name })),
        },
      ]
    : []),
  { id: 'createdAt', label: 'Created date', icon: IconCalendar, group: 'createdAt', type: 'date' },
])

function arr(key) {
  return Array.isArray(filters.value[key]) ? filters.value[key] : []
}
function removeValue(key, value) {
  filters.value = { ...filters.value, [key]: arr(key).filter((v) => v !== value) }
}

// Labels for the single-select chips (form / sentiment / group).
const sentimentLabel = computed(
  () => SENTIMENTS.find((s) => s.id === filters.value.sentiment)?.name ?? filters.value.sentiment,
)
const teamLabel = computed(
  () => teams.value.find((t) => t.id === filters.value.assignedTeamId)?.name ?? '…',
)
const formLabel = computed(
  () => props.formOptions.find((f) => f.id === filters.value.formId)?.name ?? '…',
)

const hasChips = computed(
  () =>
    arr('statusId').length ||
    arr('priorityId').length ||
    arr('sourceId').length ||
    arr('assignedTo').length ||
    filters.value.sentiment ||
    filters.value.assignedTeamId ||
    filters.value.formId ||
    filters.value.createdAt,
)
const showClear = computed(() => hasChips.value || !!filters.value.search)

const showSaveViewDialog = ref(false)
const newViewName = ref('')

function handleSaveView() {
  const name = newViewName.value.trim()
  if (!name) return
  emit('saveView', name)
  newViewName.value = ''
  showSaveViewDialog.value = false
}

function clearAll() {
  filters.value = {
    ...filters.value,
    search: '',
    statusId: [],
    priorityId: [],
    sourceId: [],
    assignedTo: [],
    sentiment: null,
    assignedTeamId: null,
    formId: null,
    createdAt: null,
  }
}
</script>

<template>
  <!-- Sticky workspace toolbar: pins below the app bar while the list scrolls. -->
  <div
    class="tw:sticky tw:top-0 tw:z-sticky tw:flex tw:flex-col tw:gap-2.5 tw:bg-main tw:pt-1 tw:pb-2.5"
  >
    <!-- Row 1 — search + filter menu -->
    <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
      <div class="tw:relative tw:min-w-[12rem] tw:flex-1 tw:max-w-sm">
        <IconSearch
          :size="16"
          class="tw:pointer-events-none tw:absolute tw:left-2.5 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary"
        />
        <input
          v-model="filters.search"
          type="text"
          placeholder="Search ticket, subject, customer…"
          class="tw:w-full tw:rounded-lg tw:border tw:border-divider tw:bg-card tw:py-1.5 tw:ps-8 tw:pe-3 tw:text-sm tw:text-on-main tw:outline-none tw:transition-colors tw:focus:border-primary"
        />
      </div>

      <div class="tw:ms-auto tw:flex tw:flex-wrap tw:items-center tw:gap-2">
        <BaseFilterMenu v-model="filters" :items="filterItems" />
      </div>
    </div>

    <!-- Row 2 — quick views + saved views -->
    <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
      <BaseQuickFilterPills v-model="activeFilter" :pills="filterPills" ariaLabel="Quick views" />

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

    <!-- Row 3 — applied filters as removable tokens -->
    <div v-if="hasChips" class="tw:flex tw:flex-wrap tw:items-center tw:gap-1.5">
      <span class="tw:text-micro tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary">
        Filters
      </span>
      <CustomerComplaintStatusBadgeById
        v-for="id in arr('statusId')"
        :key="`st-${id}`"
        :statusId="id"
        clearable
        @clear="removeValue('statusId', id)"
      />
      <CustomerComplaintPriorityBadgeById
        v-for="id in arr('priorityId')"
        :key="`pr-${id}`"
        :priorityId="id"
        clearable
        @clear="removeValue('priorityId', id)"
      />
      <CustomerComplaintSourceBadgeById
        v-for="id in arr('sourceId')"
        :key="`so-${id}`"
        :sourceId="id"
        clearable
        @clear="removeValue('sourceId', id)"
      />
      <UserBadgeById
        v-for="id in arr('assignedTo')"
        :key="`as-${id}`"
        :userId="id"
        clearable
        @clear="removeValue('assignedTo', id)"
      />
      <span
        v-if="filters.sentiment"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded-md tw:border tw:border-divider tw:bg-card tw:py-0.5 tw:ps-2 tw:pe-1 tw:text-xs tw:text-secondary"
      >
        Sentiment: {{ sentimentLabel }}
        <button
          type="button"
          aria-label="Clear sentiment filter"
          class="tw:rounded tw:p-0.5 tw:hover:bg-main-hover"
          @click="filters.sentiment = null"
        >
          <IconX class="tw:size-3" />
        </button>
      </span>
      <span
        v-if="filters.assignedTeamId"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded-md tw:border tw:border-divider tw:bg-card tw:py-0.5 tw:ps-2 tw:pe-1 tw:text-xs tw:text-secondary"
      >
        Group: {{ teamLabel }}
        <button
          type="button"
          aria-label="Clear group filter"
          class="tw:rounded tw:p-0.5 tw:hover:bg-main-hover"
          @click="filters.assignedTeamId = null"
        >
          <IconX class="tw:size-3" />
        </button>
      </span>
      <span
        v-if="filters.formId"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded-md tw:border tw:border-divider tw:bg-card tw:py-0.5 tw:ps-2 tw:pe-1 tw:text-xs tw:text-secondary"
      >
        Form: {{ formLabel }}
        <button
          type="button"
          aria-label="Clear form filter"
          class="tw:rounded tw:p-0.5 tw:hover:bg-main-hover"
          @click="filters.formId = null"
        >
          <IconX class="tw:size-3" />
        </button>
      </span>
      <span
        v-if="filters.createdAt"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded-md tw:border tw:border-divider tw:bg-card tw:py-0.5 tw:ps-2 tw:pe-1 tw:text-xs tw:text-secondary"
      >
        Created date
        <button
          type="button"
          aria-label="Clear date filter"
          class="tw:rounded tw:p-0.5 tw:hover:bg-main-hover"
          @click="filters.createdAt = null"
        >
          <IconX class="tw:size-3" />
        </button>
      </span>
      <button
        v-if="showClear"
        type="button"
        class="tw:ms-1 tw:text-xs tw:font-medium tw:text-primary tw:hover:underline"
        @click="clearAll"
      >
        Clear all
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
