<script setup>
import { IconColumns, IconArrowUp, IconArrowDown } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'
import { currentSession } from '@/utils/currentSession.js'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  selectable: { type: Boolean, default: false },
  canUpdate: { type: Boolean, default: false },
  customFieldKeys: { type: Array, default: () => [] },
})

defineEmits(['open'])

// Multi-select feeds the bulk actions. Already-converted complaints
// can't be part of a second conversion batch but CAN be bulk-closed etc.
const selected = defineModel('selected', { type: Array, default: () => [] })

function toggleRow(row) {
  if (selected.value.includes(row.id)) {
    selected.value = selected.value.filter((id) => id !== row.id)
  } else {
    selected.value = [...selected.value, row.id]
  }
}

const allVisibleSelected = computed(
  () => props.rows.length > 0 && props.rows.every((r) => selected.value.includes(r.id)),
)

function toggleAll() {
  selected.value = allVisibleSelected.value ? [] : props.rows.map((r) => r.id)
}

// ─── Per-user column customization ───────────────────────────────────────────
// Visibility + order persisted per user in localStorage.
const ALL_COLUMNS = [
  { name: 'complaintNumber', label: 'TICKET', field: 'complaintNumber', sortable: true },
  { name: 'subject', label: 'SUBJECT', field: 'subject', sortable: true },
  { name: 'customer', label: 'CUSTOMER', field: 'customerName', sortable: true },
  { name: 'source', label: 'SOURCE', field: 'sourceId' },
  { name: 'priority', label: 'PRIORITY', field: 'priorityId' },
  { name: 'sentiment', label: 'SENTIMENT', field: 'sentiment' },
  { name: 'assignedTo', label: 'ASSIGNED', field: 'assignedTo' },
  { name: 'assignedTeam', label: 'GROUP', field: 'assignedTeamId' },
  { name: 'status', label: 'STATUS', field: 'statusId' },
  { name: 'createdAt', label: 'CREATED', field: 'createdAt', sortable: true },
]
const DEFAULT_VISIBLE = [
  'complaintNumber',
  'subject',
  'customer',
  'source',
  'priority',
  'assignedTo',
  'status',
  'createdAt',
]

const prefsKey = computed(() => `cc-columns:${currentSession.value?.userId ?? 'anon'}`)

function loadPrefs() {
  try {
    const stored = JSON.parse(localStorage.getItem(prefsKey.value) ?? 'null')
    if (Array.isArray(stored) && stored.length) return stored
  } catch {
    // corrupted prefs — fall back to defaults
  }
  return [...DEFAULT_VISIBLE]
}

// Ordered list of visible column names (system + custom:<key>).
const visibleColumnNames = ref(loadPrefs())

watch(
  visibleColumnNames,
  (v) => localStorage.setItem(prefsKey.value, JSON.stringify(v)),
  { deep: true },
)

const availableColumns = computed(() => [
  ...ALL_COLUMNS,
  ...props.customFieldKeys.map((key) => ({
    name: `custom:${key}`,
    label: key.toUpperCase(),
    field: `custom:${key}`,
  })),
])

const columns = computed(() => {
  const byName = new Map(availableColumns.value.map((c) => [c.name, c]))
  const visible = visibleColumnNames.value
    .map((name) => byName.get(name))
    .filter(Boolean)
    .map((c) => ({ ...c, align: 'left' }))
  return [
    ...(props.selectable ? [{ name: 'select', label: '', field: 'select', align: 'left' }] : []),
    ...visible,
    { name: 'actions', label: '', field: 'actions', align: 'right' },
  ]
})

const showColumnPicker = ref(false)

function isColumnVisible(name) {
  return visibleColumnNames.value.includes(name)
}

function toggleColumn(name) {
  if (isColumnVisible(name)) {
    if (visibleColumnNames.value.length <= 2) return // keep a usable table
    visibleColumnNames.value = visibleColumnNames.value.filter((n) => n !== name)
  } else {
    visibleColumnNames.value = [...visibleColumnNames.value, name]
  }
}

function moveColumn(name, delta) {
  const idx = visibleColumnNames.value.indexOf(name)
  const target = idx + delta
  if (idx === -1 || target < 0 || target >= visibleColumnNames.value.length) return
  const next = [...visibleColumnNames.value]
  ;[next[idx], next[target]] = [next[target], next[idx]]
  visibleColumnNames.value = next
}

function customValue(row, columnName) {
  const key = columnName.slice('custom:'.length)
  const value = row.customFields?.[key]
  if (value == null) return '—'
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

const pagination = ref({
  page: 1,
  rowsPerPage: 50,
  sortBy: 'createdAt',
  descending: true,
  total: null,
})
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-1">
    <!-- Column picker -->
    <div class="tw:flex tw:justify-end">
      <button
        class="tw:flex tw:items-center tw:gap-1 tw:px-2 tw:py-1 tw:rounded-md tw:text-xs tw:text-secondary tw:hover:bg-main-hover"
        @click="showColumnPicker = true"
      >
        <IconColumns :size="14" />
        Columns
      </button>
    </div>

    <BaseTable v-model:pagination="pagination" :rows="rows" :columns="columns" rowKey="id">
      <template #header-cell-select>
        <BaseCheckbox :modelValue="allVisibleSelected" @update:modelValue="toggleAll" />
      </template>
      <template #body-cell-select="{ row }">
        <BaseCheckbox
          :modelValue="selected.includes(row.id)"
          @update:modelValue="() => toggleRow(row)"
        />
      </template>

      <template #body-cell-complaintNumber="{ row }">
        <RouterLink
          :to="getCompanyPath(`/customer-complaints/${row.id}`)"
          class="tw:font-mono tw:text-xs tw:text-secondary tw:hover:text-primary"
        >
          {{ row.complaintNumber || '—' }}
        </RouterLink>
      </template>

      <template #body-cell-subject="{ row }">
        <RouterLink
          :to="getCompanyPath(`/customer-complaints/${row.id}`)"
          class="tw:flex tw:items-center tw:gap-2 tw:text-on-main tw:hover:text-primary"
        >
          <span class="tw:font-medium">{{ row.subject }}</span>
          <BaseBadge v-if="row.isSpam" class="tw:bg-red-100 tw:text-red-700 tw:text-[10px]">
            Spam
          </BaseBadge>
        </RouterLink>
      </template>

      <template #body-cell-customer="{ row }">
        <div class="tw:flex tw:flex-col">
          <span class="tw:text-sm tw:font-medium">{{ row.customerName || '—' }}</span>
          <span v-if="row.customerEmail" class="tw:text-xs tw:text-secondary">
            {{ row.customerEmail }}
          </span>
        </div>
      </template>

      <template #body-cell-source="{ row }">
        <CustomerComplaintSourceBadgeById :sourceId="row.sourceId" />
      </template>

      <template #body-cell-priority="{ row }">
        <CustomerComplaintPriorityBadgeById v-if="row.priorityId" :priorityId="row.priorityId" />
        <span v-else class="tw:text-sm tw:text-secondary">—</span>
      </template>

      <template #body-cell-sentiment="{ row }">
        <CustomerComplaintSentimentBadgeById v-if="row.sentiment" :sentiment="row.sentiment" />
        <span v-else class="tw:text-sm tw:text-secondary">—</span>
      </template>

      <template #body-cell-assignedTo="{ row }">
        <UserBadgeById v-if="row.assignedTo" :userId="row.assignedTo" />
        <span v-else class="tw:text-sm tw:text-secondary tw:italic">Unassigned</span>
      </template>

      <template #body-cell-assignedTeam="{ row }">
        <GroupBadgeById v-if="row.assignedTeamId" :teamId="row.assignedTeamId" />
        <span v-else class="tw:text-sm tw:text-secondary">—</span>
      </template>

      <template #body-cell-status="{ row }">
        <CustomerComplaintStatusBadgeById :statusId="row.statusId" />
      </template>

      <template #body-cell-createdAt="{ row }">
        <span class="tw:text-sm tw:text-secondary">{{ row.createdAt?.formatDate('date') }}</span>
      </template>

      <!-- Custom field columns -->
      <template
        v-for="key in customFieldKeys"
        :key="key"
        #[`body-cell-custom:${key}`]="{ row }"
      >
        <span class="tw:text-sm">{{ customValue(row, `custom:${key}`) }}</span>
      </template>
    </BaseTable>

    <!-- Column customization dialog -->
    <BaseDialog v-model="showColumnPicker" title="Customize Columns" maxWidth="md">
      <p class="tw:text-xs tw:text-secondary tw:mb-3 tw:px-1">
        Choose which columns you see and their order — saved for you only.
      </p>
      <div class="tw:flex tw:flex-col tw:divide-y tw:divide-divider tw:border tw:border-divider tw:rounded-lg">
        <div
          v-for="column in availableColumns"
          :key="column.name"
          class="tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-1.5"
        >
          <BaseCheckbox
            :modelValue="isColumnVisible(column.name)"
            @update:modelValue="() => toggleColumn(column.name)"
          />
          <span class="tw:flex-1 tw:text-sm">{{ column.label }}</span>
          <template v-if="isColumnVisible(column.name)">
            <button
              class="tw:text-secondary tw:hover:text-primary tw:disabled:opacity-30"
              :disabled="visibleColumnNames.indexOf(column.name) === 0"
              @click="moveColumn(column.name, -1)"
            >
              <IconArrowUp :size="14" />
            </button>
            <button
              class="tw:text-secondary tw:hover:text-primary tw:disabled:opacity-30"
              :disabled="visibleColumnNames.indexOf(column.name) === visibleColumnNames.length - 1"
              @click="moveColumn(column.name, 1)"
            >
              <IconArrowDown :size="14" />
            </button>
          </template>
        </div>
      </div>
      <template #footer="{ close }">
        <BaseButton variant="outline" @click="visibleColumnNames = [...DEFAULT_VISIBLE]">
          Reset
        </BaseButton>
        <BaseButton variant="primary" @click="close">Done</BaseButton>
      </template>
    </BaseDialog>
  </div>
</template>
