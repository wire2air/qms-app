<script setup>
// Platform Console — Crons. Every entry in the worker's crontab (mirrored into
// cron_schedules at worker boot) with its schedule in plain words, the last
// run's outcome (job_runs), next run, and a Missed flag when a scheduled slot
// passed without graphile enqueuing it. View = support; Run now = admin
// (audited server-side). Schedules are UTC.
import {
  IconClockHour4,
  IconRefresh,
  IconPlayerPlay,
  IconAlertTriangle,
  IconHistory,
} from '@tabler/icons-vue'
import { useConfirm } from '@shared/composables/useConfirm.js'
import { listCrons, runCronNow, RUN_STATUSES } from '@/api/platform.js'
import { hasPlatformRole } from '@/utils/currentSession.js'

const { confirm } = useConfirm()
const router = useRouter()
const canRun = computed(() => hasPlatformRole('admin'))

const rows = ref([])
const syncedAt = ref(null)
const loading = ref(false)
// ?problems=1 lets the console Overview link straight to missed/failing crons.
const onlyProblems = ref(useRoute().query.problems === '1')

const columns = computed(() => {
  const cols = [
    { name: 'id', label: 'CRON', field: 'id', align: 'left', sortable: true },
    { name: 'schedule', label: 'SCHEDULE', field: 'schedule', align: 'left' },
    { name: 'last', label: 'LAST RUN', field: 'lastStartedAt', align: 'left', sortable: true },
    { name: 'nextRunAt', label: 'NEXT RUN', field: 'nextRunAt', align: 'left', sortable: true },
    { name: 'stats', label: 'LAST 24H', field: 'runs24h', align: 'left', sortable: true },
    { name: 'actions', label: '', field: 'actions', align: 'right' },
  ]
  return cols
})
const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([])

const counts = computed(() => ({
  total: rows.value.length,
  missed: rows.value.filter((r) => r.missed).length,
  failing: rows.value.filter((r) => r.lastStatus === 'failed').length,
}))

const visibleRows = computed(() =>
  onlyProblems.value ? rows.value.filter((r) => r.missed || r.lastStatus === 'failed') : rows.value,
)

function statusMeta(id) {
  return RUN_STATUSES.find((s) => s.id === id) || null
}

function formatDuration(ms) {
  if (ms == null) return ''
  if (ms < 1000) return `${ms} ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`
  return `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`
}

async function load() {
  loading.value = true
  try {
    const data = await listCrons()
    rows.value = data?.crons || []
    syncedAt.value = data?.syncedAt || null
  } finally {
    loading.value = false
  }
}

async function onRun(row) {
  const ok = await confirm({
    title: 'Run cron now',
    message: `Queue ${row.taskIdentifier} (${row.id}) to run now? Its schedule is unchanged.`,
    okLabel: 'Run now',
  })
  if (!ok) return
  await runCronNow(row.id)
  await load()
}

function openHistory(row) {
  router.push({ path: '/platform/queue', query: { tab: 'history', cronId: row.id } })
}

onMounted(load)
</script>

<template>
  <BasePage width="wide">
    <PageHeader :icon="IconClockHour4" title="Crons">
      <template #actions>
        <BaseButton variant="secondary" :disabled="loading" @click="load">
          <template #icon><IconRefresh :size="16" /></template>
          Refresh
        </BaseButton>
      </template>
    </PageHeader>

    <ContentGrid min="10rem">
      <BaseCard>
        <p class="tw:text-3xl tw:font-bold tw:leading-none tw:text-on-main">{{ counts.total }}</p>
        <p class="tw:mt-2 tw:text-sm tw:text-secondary">Scheduled crons</p>
      </BaseCard>
      <BaseClickableRow
        class="tw:block tw:rounded-xl tw:border tw:p-4 tw:transition-colors tw:hover:bg-main-hover"
        :class="onlyProblems ? 'tw:border-primary' : 'tw:border-divider'"
        aria-label="Show only missed or failing crons"
        @click="onlyProblems = !onlyProblems"
      >
        <p
          class="tw:text-3xl tw:font-bold tw:leading-none"
          :class="counts.missed ? 'tw:text-amber-700' : 'tw:text-on-main'"
        >
          {{ counts.missed }}
        </p>
        <p class="tw:mt-2 tw:text-sm tw:text-secondary">Missed</p>
      </BaseClickableRow>
      <BaseClickableRow
        class="tw:block tw:rounded-xl tw:border tw:p-4 tw:transition-colors tw:hover:bg-main-hover"
        :class="onlyProblems ? 'tw:border-primary' : 'tw:border-divider'"
        aria-label="Show only missed or failing crons"
        @click="onlyProblems = !onlyProblems"
      >
        <p
          class="tw:text-3xl tw:font-bold tw:leading-none"
          :class="counts.failing ? 'tw:text-red-600' : 'tw:text-on-main'"
        >
          {{ counts.failing }}
        </p>
        <p class="tw:mt-2 tw:text-sm tw:text-secondary">Last run failed</p>
      </BaseClickableRow>
    </ContentGrid>

    <p class="tw:text-xs tw:text-secondary">
      Schedules run in UTC. Crontab last synced by the worker
      {{ syncedAt ? syncedAt.formatDate('datetime') : '— never (restart the worker)' }}.
    </p>

    <DataTable
      v-model:pagination="pagination"
      v-model:sort="sort"
      :rows="visibleRows"
      :columns="columns"
      :loading="loading"
      rowKey="id"
      :mobileCards="false"
      searchable
    >
      <template #body-cell-id="{ row }">
        <div class="tw:flex tw:items-center tw:gap-2">
          <span class="tw:text-sm tw:font-medium tw:text-on-main">{{ row.id }}</span>
          <BaseTooltip
            v-if="row.missed"
            :text="`Due ${row.lastScheduledAt?.formatDate('datetime')} but never queued`"
          >
            <span
              class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded-full tw:bg-amber-100 tw:px-2 tw:py-0.5 tw:text-xs tw:font-semibold tw:text-amber-700"
            >
              <IconAlertTriangle :size="12" /> Missed
            </span>
          </BaseTooltip>
        </div>
        <div class="tw:text-xs tw:text-secondary">{{ row.taskIdentifier }}</div>
      </template>
      <template #body-cell-schedule="{ row }">
        <div class="tw:text-sm tw:text-on-main">{{ row.schedule }}</div>
        <div class="tw:text-xs tw:text-secondary">{{ row.pattern }}</div>
      </template>
      <template #body-cell-last="{ row }">
        <template v-if="row.lastStartedAt">
          <div class="tw:flex tw:items-center tw:gap-2">
            <span
              v-if="statusMeta(row.lastStatus)"
              class="tw:inline-flex tw:rounded-full tw:px-2 tw:py-0.5 tw:text-xs tw:font-semibold"
              :class="statusMeta(row.lastStatus).class"
            >
              {{ statusMeta(row.lastStatus).label }}
            </span>
            <span class="tw:text-xs tw:text-secondary">{{
              formatDuration(row.lastDurationMs)
            }}</span>
          </div>
          <div class="tw:text-xs tw:text-secondary tw:whitespace-nowrap">
            {{ row.lastStartedAt.formatDate('datetime') }}
          </div>
          <div v-if="row.lastError" class="tw:line-clamp-1 tw:max-w-xs tw:text-xs tw:text-red-600">
            {{ row.lastError }}
          </div>
        </template>
        <template v-else-if="row.lastExecution">
          <div class="tw:text-xs tw:text-secondary">
            Queued {{ row.lastExecution.formatDate('datetime') }}
          </div>
          <div class="tw:text-xs tw:text-secondary">No recorded result yet</div>
        </template>
        <span v-else class="tw:text-xs tw:text-secondary">Never run</span>
      </template>
      <template #body-cell-nextRunAt="{ row }">
        <span class="tw:text-sm tw:text-secondary tw:whitespace-nowrap">
          {{ row.nextRunAt?.formatDate('datetime') || '—' }}
        </span>
      </template>
      <template #body-cell-stats="{ row }">
        <div class="tw:text-sm tw:text-on-main">
          {{ row.runs24h }} run{{ row.runs24h === 1 ? '' : 's' }}
        </div>
        <div v-if="row.failures24h" class="tw:text-xs tw:text-red-600">
          {{ row.failures24h }} failed
        </div>
        <div v-else-if="row.avgDurationMs24h != null" class="tw:text-xs tw:text-secondary">
          avg {{ formatDuration(row.avgDurationMs24h) }}
        </div>
      </template>
      <template #body-cell-actions="{ row }">
        <div class="tw:flex tw:justify-end tw:gap-1">
          <BaseButton variant="secondary" size="sm" @click="openHistory(row)">
            <template #icon><IconHistory :size="16" /></template>
            History
          </BaseButton>
          <BaseButton v-if="canRun" variant="secondary" size="sm" @click="onRun(row)">
            <template #icon><IconPlayerPlay :size="16" /></template>
            Run now
          </BaseButton>
        </div>
      </template>
    </DataTable>
  </BasePage>
</template>
