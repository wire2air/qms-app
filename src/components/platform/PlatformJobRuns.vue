<script setup>
// Platform Console — Job run history (the Job Queue page's History tab). One
// row per finished job attempt, successes included — graphile deletes a job
// when it succeeds, so this is the only place a successful run is visible.
// Backed by job_runs (kept 30 days). Filters run server-side.
import { IconRefresh } from '@tabler/icons-vue'
import { listJobRuns, RUN_STATUSES } from '@/api/platform.js'

const props = defineProps({
  // Pre-filter to one cron (the Crons page links here with ?cronId=).
  cronId: { type: String, default: null },
  // Pre-filter by result (the console Overview links here with ?status=failed).
  status: { type: String, default: null },
})

const rows = ref([])
const summary = ref(null)
const tasks = ref([])
const loading = ref(false)

const filters = reactive({
  status: RUN_STATUSES.some((st) => st.id === props.status) ? props.status : null,
  task: null,
  cronId: props.cronId,
  search: '',
})
const selected = ref(null)
const detailOpen = ref(false)

const columns = [
  { name: 'startedAt', label: 'STARTED', field: 'startedAt', align: 'left', sortable: true },
  { name: 'status', label: 'RESULT', field: 'status', align: 'left', sortable: true },
  { name: 'taskIdentifier', label: 'TASK', field: 'taskIdentifier', align: 'left', sortable: true },
  { name: 'durationMs', label: 'DURATION', field: 'durationMs', align: 'left', sortable: true },
  { name: 'attempt', label: 'ATTEMPT', field: 'attempt', align: 'left' },
  { name: 'tenant', label: 'TENANT', field: 'tenant', align: 'left' },
  { name: 'error', label: 'ERROR', field: 'error', align: 'left' },
]
const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([{ id: 'startedAt', desc: true }])

const taskOptions = computed(() => tasks.value.map((t) => ({ id: t, label: t })))
const tiles = computed(() => [
  { key: 'total', label: 'Runs (24h)', value: summary.value?.total, class: 'tw:text-on-main' },
  { key: 'failed', label: 'Failed (24h)', value: summary.value?.failed, class: 'tw:text-red-600' },
  {
    key: 'avg',
    label: 'Average duration (24h)',
    value:
      summary.value?.avgDurationMs != null ? formatDuration(summary.value.avgDurationMs) : null,
    class: 'tw:text-on-main',
  },
])

function statusMeta(id) {
  return RUN_STATUSES.find((s) => s.id === id) || { label: id, class: 'tw:bg-gray-100' }
}

function formatDuration(ms) {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms} ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`
  return `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`
}

async function load() {
  loading.value = true
  try {
    const params = { limit: 500 }
    if (filters.status) params.status = filters.status
    if (filters.task) params.task = filters.task
    if (filters.cronId) params.cronId = filters.cronId
    if (filters.search.trim()) params.search = filters.search.trim()
    const data = await listJobRuns(params)
    summary.value = data?.summary || null
    tasks.value = data?.tasks || []
    rows.value = (data?.runs || []).map((r) => ({
      ...r,
      tenant: r.companyName ? `${r.companyName} (${r.companyCode})` : '—',
    }))
  } finally {
    loading.value = false
  }
}

let searchTimer = null
watch(
  () => filters.search,
  () => {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(load, 400)
  },
)
watch(() => [filters.status, filters.task, filters.cronId], load)
watch(
  () => props.cronId,
  (value) => {
    filters.cronId = value
  },
)

function openDetail(row) {
  selected.value = row
  detailOpen.value = true
}

onMounted(load)
onBeforeUnmount(() => clearTimeout(searchTimer))
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-6">
    <ContentGrid min="10rem">
      <BaseCard v-for="t in tiles" :key="t.key">
        <p class="tw:text-3xl tw:font-bold tw:leading-none" :class="t.class">
          {{ t.value ?? '—' }}
        </p>
        <p class="tw:mt-2 tw:text-sm tw:text-secondary">{{ t.label }}</p>
      </BaseCard>
    </ContentGrid>

    <div class="tw:flex tw:flex-wrap tw:items-end tw:gap-3">
      <div class="tw:grid tw:flex-1 tw:grid-cols-1 tw:gap-3 tw:md:grid-cols-3">
        <BaseTextInput
          v-model="filters.search"
          label="Error text or job id"
          placeholder="Search…"
        />
        <BaseSelect
          v-model="filters.status"
          label="Result"
          :options="RUN_STATUSES"
          optionLabel="label"
          optionValue="id"
          placeholder="All results"
        />
        <BaseSelect
          v-model="filters.task"
          label="Task"
          :options="taskOptions"
          optionLabel="label"
          optionValue="id"
          placeholder="All tasks"
        />
      </div>
      <BaseButton variant="secondary" :disabled="loading" @click="load">
        <template #icon><IconRefresh :size="16" /></template>
        Refresh
      </BaseButton>
    </div>

    <div
      v-if="filters.cronId"
      class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-secondary"
    >
      Showing runs of cron
      <span class="tw:text-on-main">{{ filters.cronId }}</span>
      <BaseButton variant="secondary" size="sm" @click="filters.cronId = null">Show all</BaseButton>
    </div>

    <DataTable
      v-model:pagination="pagination"
      v-model:sort="sort"
      :rows="rows"
      :columns="columns"
      :loading="loading"
      rowKey="id"
      :mobileCards="false"
      @rowClick="openDetail"
    >
      <template #body-cell-startedAt="{ row }">
        <span class="tw:text-sm tw:text-on-main tw:whitespace-nowrap">
          {{ row.startedAt?.formatDate('datetime') }}
        </span>
      </template>
      <template #body-cell-status="{ row }">
        <span
          class="tw:inline-flex tw:items-center tw:rounded-full tw:px-2.5 tw:py-0.5 tw:text-xs tw:font-semibold"
          :class="statusMeta(row.status).class"
        >
          {{ statusMeta(row.status).label }}
        </span>
      </template>
      <template #body-cell-taskIdentifier="{ row }">
        <div class="tw:text-sm tw:font-medium tw:text-on-main">{{ row.taskIdentifier }}</div>
        <div v-if="row.cronId" class="tw:text-xs tw:text-secondary">cron · {{ row.cronId }}</div>
      </template>
      <template #body-cell-durationMs="{ row }">
        <span class="tw:text-sm tw:text-secondary">{{ formatDuration(row.durationMs) }}</span>
      </template>
      <template #body-cell-attempt="{ row }">
        <span class="tw:text-sm tw:text-secondary">
          {{ row.attempt ?? '—' }}{{ row.maxAttempts ? ` / ${row.maxAttempts}` : '' }}
        </span>
      </template>
      <template #body-cell-tenant="{ row }">
        <span class="tw:text-sm tw:text-secondary">{{ row.tenant }}</span>
      </template>
      <template #body-cell-error="{ row }">
        <span v-if="row.error" class="tw:line-clamp-1 tw:max-w-sm tw:text-xs tw:text-red-600">
          {{ row.error }}
        </span>
        <span v-else class="tw:text-xs tw:text-secondary">—</span>
      </template>
    </DataTable>

    <BaseDialog
      v-model="detailOpen"
      :title="selected ? `${selected.taskIdentifier} #${selected.jobId}` : 'Run'"
      size="2xl"
    >
      <dl v-if="selected" class="tw:grid tw:grid-cols-[9rem_1fr] tw:gap-x-4 tw:gap-y-2 tw:text-sm">
        <dt class="tw:text-secondary">Result</dt>
        <dd>
          <span
            class="tw:inline-flex tw:rounded-full tw:px-2.5 tw:py-0.5 tw:text-xs tw:font-semibold"
            :class="statusMeta(selected.status).class"
          >
            {{ statusMeta(selected.status).label }}
          </span>
        </dd>
        <dt class="tw:text-secondary">Cron</dt>
        <dd class="tw:text-on-main">{{ selected.cronId || '—' }}</dd>
        <dt class="tw:text-secondary">Started</dt>
        <dd class="tw:text-on-main">{{ selected.startedAt?.formatDate('datetime') }}</dd>
        <dt class="tw:text-secondary">Finished</dt>
        <dd class="tw:text-on-main">{{ selected.finishedAt?.formatDate('datetime') }}</dd>
        <dt class="tw:text-secondary">Duration</dt>
        <dd class="tw:text-on-main">{{ formatDuration(selected.durationMs) }}</dd>
        <dt class="tw:text-secondary">Attempt</dt>
        <dd class="tw:text-on-main">
          {{ selected.attempt ?? '—'
          }}{{ selected.maxAttempts ? ` of ${selected.maxAttempts}` : '' }}
        </dd>
        <dt class="tw:text-secondary">Tenant</dt>
        <dd class="tw:text-on-main">{{ selected.tenant }}</dd>
      </dl>
      <div v-if="selected?.error" class="tw:mt-4">
        <p class="tw:mb-1 tw:text-xs tw:font-semibold tw:text-secondary">ERROR</p>
        <pre
          class="tw:max-h-60 tw:overflow-auto tw:whitespace-pre-wrap tw:rounded-lg tw:bg-main-hover tw:p-3 tw:text-xs tw:text-red-600"
          >{{ selected.error }}</pre
        >
      </div>
    </BaseDialog>
  </div>
</template>
