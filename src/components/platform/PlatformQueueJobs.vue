<script setup>
// Platform Console — Job queue. Background jobs (graphile-worker) across all
// tenants. Completed jobs are deleted by the worker, so this is the work that
// is waiting, scheduled, running, or dead after exhausting its attempts.
// View = support; retry / remove = admin (audited server-side). Secret-looking
// payload keys arrive already redacted.
import { IconStack2, IconRefresh, IconPlayerPlay, IconTrash } from '@tabler/icons-vue'
import { useConfirm } from '@shared/composables/useConfirm.js'
import { listQueueJobs, retryQueueJob, removeQueueJob, JOB_STATES } from '@/api/platform.js'
import { hasPlatformRole } from '@/utils/currentSession.js'

// "History" (finished runs, incl. successes graphile deletes) is its own
// component; the tab is kept in ?tab= so the Crons page can deep-link to it.
const route = useRoute()
const router = useRouter()
const TABS = [
  { value: 'queue', label: 'Queue' },
  { value: 'history', label: 'History' },
]
const tab = ref(route.query.tab === 'history' ? 'history' : 'queue')
watch(tab, (value) => {
  router.replace({ query: { ...route.query, tab: value === 'queue' ? undefined : value } })
})

const AUTO_REFRESH_MS = 15000

const { confirm } = useConfirm()
const canManage = computed(() => hasPlatformRole('admin'))

const rows = ref([])
const summary = ref({})
const tasks = ref([])
const loading = ref(false)
const autoRefresh = ref(true)

// ?state= lets the console Overview link straight to e.g. failed jobs.
const filters = reactive({
  state: JOB_STATES.some((st) => st.id === route.query.state) ? route.query.state : null,
  task: null,
  search: '',
})
const selected = ref(null)
const detailOpen = ref(false)

const columns = computed(() => {
  const cols = [
    { name: 'id', label: 'JOB', field: 'id', align: 'left' },
    {
      name: 'taskIdentifier',
      label: 'TASK',
      field: 'taskIdentifier',
      align: 'left',
      sortable: true,
    },
    { name: 'state', label: 'STATE', field: 'state', align: 'left', sortable: true },
    { name: 'attempts', label: 'ATTEMPTS', field: 'attempts', align: 'left', sortable: true },
    { name: 'runAt', label: 'RUN AT', field: 'runAt', align: 'left', sortable: true },
    { name: 'lastError', label: 'LAST ERROR', field: 'lastError', align: 'left' },
  ]
  if (canManage.value) cols.push({ name: 'actions', label: '', field: 'actions', align: 'right' })
  return cols
})
const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([])

const taskOptions = computed(() =>
  tasks.value.map((t) => ({ id: t.task, label: `${t.task} (${t.count})` })),
)

function stateMeta(id) {
  return JOB_STATES.find((s) => s.id === id) || { label: id, class: 'tw:bg-gray-100' }
}

async function load() {
  loading.value = true
  try {
    const params = { limit: 500 }
    if (filters.state) params.state = filters.state
    if (filters.task) params.task = filters.task
    if (filters.search.trim()) params.search = filters.search.trim()
    const data = await listQueueJobs(params)
    rows.value = data?.jobs || []
    summary.value = data?.summary || {}
    tasks.value = data?.tasks || []
    if (selected.value) {
      selected.value = rows.value.find((r) => r.id === selected.value.id) || selected.value
    }
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
watch(() => [filters.state, filters.task], load)

let refreshTimer = null
function scheduleRefresh() {
  clearInterval(refreshTimer)
  // Only the Queue tab auto-refreshes; History has its own Refresh button and
  // the toggle is hidden there, so polling behind it could not be stopped.
  if (autoRefresh.value && tab.value === 'queue') {
    refreshTimer = setInterval(() => !loading.value && load(), AUTO_REFRESH_MS)
  }
}
watch(autoRefresh, scheduleRefresh)
watch(tab, (value) => {
  scheduleRefresh()
  if (value === 'queue') load()
})

function toggleState(id) {
  filters.state = filters.state === id ? null : id
}

function openDetail(row) {
  selected.value = row
  detailOpen.value = true
}

async function onRetry(row) {
  const ok = await confirm({
    title: 'Run job now',
    message: `Run ${row.taskIdentifier} #${row.id} now with a fresh set of attempts? If it sends email, recipients it already reached are not emailed again.`,
    okLabel: 'Run now',
  })
  if (!ok) return
  await retryQueueJob(row.id)
  await load()
}

async function onRemove(row) {
  const ok = await confirm({
    title: 'Remove job',
    message: `Remove ${row.taskIdentifier} #${row.id} from the queue? It will never run. This cannot be undone.`,
    okLabel: 'Remove',
    danger: true,
  })
  if (!ok) return
  await removeQueueJob(row.id)
  detailOpen.value = false
  await load()
}

onMounted(() => {
  load()
  scheduleRefresh()
})
onBeforeUnmount(() => {
  clearTimeout(searchTimer)
  clearInterval(refreshTimer)
})
</script>

<template>
  <BasePage width="wide">
    <PageHeader :icon="IconStack2" title="Job Queue">
      <template v-if="tab === 'queue'" #actions>
        <div class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-secondary">
          <BaseSwitch v-model="autoRefresh" label="Auto-refresh" />
          <span aria-hidden="true">Auto-refresh</span>
        </div>
        <BaseButton variant="secondary" :disabled="loading" @click="load">
          <template #icon><IconRefresh :size="16" /></template>
          Refresh
        </BaseButton>
      </template>
    </PageHeader>

    <BaseTabs v-model="tab" :tabs="TABS" ariaLabel="Job queue">
      <BaseTabPanel value="queue">
        <div class="tw:flex tw:flex-col tw:gap-6">
          <ContentGrid min="10rem">
            <BaseClickableRow
              v-for="s in JOB_STATES"
              :key="s.id"
              class="tw:block tw:rounded-xl tw:border tw:p-4 tw:transition-colors tw:hover:bg-main-hover"
              :class="filters.state === s.id ? 'tw:border-primary' : 'tw:border-divider'"
              :aria-label="`Show ${s.label} jobs`"
              @click="toggleState(s.id)"
            >
              <p class="tw:text-3xl tw:font-bold tw:leading-none tw:text-on-main">
                {{ summary[s.id] ?? 0 }}
              </p>
              <span
                class="tw:mt-2 tw:inline-flex tw:rounded-full tw:px-2.5 tw:py-0.5 tw:text-xs tw:font-semibold"
                :class="s.class"
              >
                {{ s.label }}
              </span>
            </BaseClickableRow>
          </ContentGrid>

          <div class="tw:grid tw:grid-cols-1 tw:gap-3 tw:md:grid-cols-3">
            <BaseTextInput
              v-model="filters.search"
              label="Job id, key or error"
              placeholder="Search…"
            />
            <BaseSelect
              v-model="filters.state"
              label="State"
              :options="JOB_STATES"
              optionLabel="label"
              optionValue="id"
              placeholder="All states"
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
            <template #body-cell-id="{ row }">
              <span class="tw:text-xs tw:text-secondary">#{{ row.id }}</span>
            </template>
            <template #body-cell-taskIdentifier="{ row }">
              <div class="tw:text-sm tw:font-medium tw:text-on-main">{{ row.taskIdentifier }}</div>
              <div v-if="row.key" class="tw:line-clamp-1 tw:max-w-xs tw:text-xs tw:text-secondary">
                {{ row.key }}
              </div>
            </template>
            <template #body-cell-state="{ row }">
              <span
                class="tw:inline-flex tw:items-center tw:rounded-full tw:px-2.5 tw:py-0.5 tw:text-xs tw:font-semibold"
                :class="stateMeta(row.state).class"
              >
                {{ stateMeta(row.state).label }}
              </span>
            </template>
            <template #body-cell-attempts="{ row }">
              <span class="tw:text-sm tw:text-secondary"
                >{{ row.attempts }} / {{ row.maxAttempts }}</span
              >
            </template>
            <template #body-cell-runAt="{ row }">
              <span class="tw:text-sm tw:text-secondary tw:whitespace-nowrap">
                {{ row.runAt?.formatDate('datetime') }}
              </span>
            </template>
            <template #body-cell-lastError="{ row }">
              <span
                v-if="row.lastError"
                class="tw:line-clamp-1 tw:max-w-sm tw:text-xs tw:text-red-600"
              >
                {{ row.lastError }}
              </span>
              <span v-else class="tw:text-xs tw:text-secondary">—</span>
            </template>
            <template #body-cell-actions="{ row }">
              <div
                v-if="row.state !== 'running'"
                class="tw:flex tw:justify-end tw:gap-1"
                @click.stop
              >
                <BaseButton variant="secondary" size="sm" @click="onRetry(row)">
                  <template #icon><IconPlayerPlay :size="16" /></template>
                  Run now
                </BaseButton>
                <BaseButton variant="danger" size="sm" @click="onRemove(row)">
                  <template #icon><IconTrash :size="16" /></template>
                </BaseButton>
              </div>
            </template>
          </DataTable>
        </div>
      </BaseTabPanel>
      <BaseTabPanel value="history">
        <PlatformJobRuns
          :cronId="route.query.cronId || null"
          :status="route.query.status || null"
        />
      </BaseTabPanel>
    </BaseTabs>

    <BaseDialog
      v-model="detailOpen"
      :title="selected ? `${selected.taskIdentifier} #${selected.id}` : 'Job'"
      size="3xl"
    >
      <div v-if="selected" class="tw:flex tw:flex-col tw:gap-4">
        <dl class="tw:grid tw:grid-cols-[9rem_1fr] tw:gap-x-4 tw:gap-y-2 tw:text-sm">
          <dt class="tw:text-secondary">State</dt>
          <dd>
            <span
              class="tw:inline-flex tw:rounded-full tw:px-2.5 tw:py-0.5 tw:text-xs tw:font-semibold"
              :class="stateMeta(selected.state).class"
            >
              {{ stateMeta(selected.state).label }}
            </span>
          </dd>
          <dt class="tw:text-secondary">Attempts</dt>
          <dd class="tw:text-on-main">{{ selected.attempts }} / {{ selected.maxAttempts }}</dd>
          <dt class="tw:text-secondary">Run at</dt>
          <dd class="tw:text-on-main">{{ selected.runAt?.formatDate('datetime') }}</dd>
          <dt class="tw:text-secondary">Created</dt>
          <dd class="tw:text-on-main">{{ selected.createdAt?.formatDate('datetime') }}</dd>
          <dt class="tw:text-secondary">Queue</dt>
          <dd class="tw:text-on-main">{{ selected.queueName || '—' }}</dd>
          <dt class="tw:text-secondary">Job key</dt>
          <dd class="tw:text-on-main tw:break-all">{{ selected.key || '—' }}</dd>
          <dt class="tw:text-secondary">Priority</dt>
          <dd class="tw:text-on-main">{{ selected.priority }}</dd>
          <template v-if="selected.lockedBy">
            <dt class="tw:text-secondary">Locked by</dt>
            <dd class="tw:text-on-main tw:break-all">
              {{ selected.lockedBy }} since {{ selected.lockedAt?.formatDate('datetime') }}
            </dd>
          </template>
        </dl>
        <div v-if="selected.lastError">
          <p class="tw:mb-1 tw:text-xs tw:font-semibold tw:text-secondary">LAST ERROR</p>
          <pre
            class="tw:max-h-48 tw:overflow-auto tw:whitespace-pre-wrap tw:rounded-lg tw:bg-main-hover tw:p-3 tw:text-xs tw:text-red-600"
            >{{ selected.lastError }}</pre
          >
        </div>
        <div>
          <p class="tw:mb-1 tw:text-xs tw:font-semibold tw:text-secondary">PAYLOAD</p>
          <pre
            class="tw:max-h-72 tw:overflow-auto tw:rounded-lg tw:bg-main-hover tw:p-3 tw:text-xs tw:text-on-main"
            >{{ JSON.stringify(selected.payload, null, 2) }}</pre
          >
        </div>
      </div>
      <template v-if="canManage && selected && selected.state !== 'running'" #footer>
        <BaseButton variant="danger" @click="onRemove(selected)">
          <template #icon><IconTrash :size="16" /></template>
          Remove
        </BaseButton>
        <BaseButton variant="primary" @click="onRetry(selected)">
          <template #icon><IconPlayerPlay :size="16" /></template>
          Run now
        </BaseButton>
      </template>
    </BaseDialog>
  </BasePage>
</template>
