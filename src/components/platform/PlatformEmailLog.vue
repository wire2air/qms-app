<script setup>
// Platform Console — Email log. Every email the worker tried to send, across
// all tenants, with its outcome (sent / failed / skipped / blocked / duplicate
// suppressed). Backed by email_logs (deny-all to tenants; bodies never stored).
// Filters run server-side; the table searches within the loaded rows.
import { IconMail, IconRefresh } from '@tabler/icons-vue'
import { listEmailLogs, listCompanies, EMAIL_STATUSES } from '@/api/platform.js'

const rows = ref([])
const summary = ref(null)
const loading = ref(false)
const companies = ref([])

// ?status= lets the console Overview link straight to e.g. failed emails.
const route = useRoute()
const filters = reactive({
  status: EMAIL_STATUSES.some((st) => st.id === route.query.status) ? route.query.status : null,
  companyId: null,
  search: '',
})
const selected = ref(null)
const detailOpen = ref(false)

const columns = [
  { name: 'occurredAt', label: 'WHEN', field: 'occurredAt', align: 'left', sortable: true },
  { name: 'status', label: 'STATUS', field: 'status', align: 'left', sortable: true },
  { name: 'toEmail', label: 'TO', field: 'toEmail', align: 'left', sortable: true },
  { name: 'subject', label: 'SUBJECT', field: 'subject', align: 'left' },
  { name: 'tenant', label: 'TENANT', field: 'tenant', align: 'left', sortable: true },
  { name: 'job', label: 'JOB', field: 'taskIdentifier', align: 'left' },
]
const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([{ id: 'occurredAt', desc: true }])

const tiles = computed(() => [
  { key: 'sent', label: 'Sent', value: summary.value?.sent, class: 'tw:text-green-700' },
  { key: 'failed', label: 'Failed', value: summary.value?.failed, class: 'tw:text-red-600' },
  {
    key: 'skipped',
    label: 'Skipped / blocked',
    value: summary.value?.skipped,
    class: 'tw:text-amber-700',
  },
  {
    key: 'deduplicated',
    label: 'Duplicates suppressed',
    value: summary.value?.deduplicated,
    class: 'tw:text-blue-700',
  },
])

function statusMeta(id) {
  return EMAIL_STATUSES.find((s) => s.id === id) || { label: id, class: 'tw:bg-gray-100' }
}

async function load() {
  loading.value = true
  try {
    const params = { limit: 500 }
    if (filters.status) params.status = filters.status
    if (filters.companyId) params.companyId = filters.companyId
    if (filters.search.trim()) params.search = filters.search.trim()
    const data = await listEmailLogs(params)
    summary.value = data?.summary || null
    rows.value = (data?.logs || []).map((l) => ({
      ...l,
      tenant: l.companyName ? `${l.companyName} (${l.companyCode})` : '—',
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
watch(() => [filters.status, filters.companyId], load)

function openDetail(row) {
  selected.value = row
  detailOpen.value = true
}

onMounted(async () => {
  load()
  const data = await listCompanies()
  companies.value = (data?.companies || []).map((c) => ({
    id: c.id,
    label: `${c.name} (${c.code})`,
  }))
})
onBeforeUnmount(() => clearTimeout(searchTimer))
</script>

<template>
  <BasePage width="wide">
    <PageHeader :icon="IconMail" title="Email Log">
      <template #actions>
        <BaseButton variant="secondary" :disabled="loading" @click="load">
          <template #icon><IconRefresh :size="16" /></template>
          Refresh
        </BaseButton>
      </template>
    </PageHeader>

    <PageSection title="Last 24 hours" :icon="IconMail">
      <ContentGrid min="10rem">
        <BaseCard v-for="t in tiles" :key="t.key">
          <p class="tw:text-3xl tw:font-bold tw:leading-none" :class="t.class">
            {{ t.value ?? '—' }}
          </p>
          <p class="tw:mt-2 tw:text-sm tw:text-secondary">{{ t.label }}</p>
        </BaseCard>
      </ContentGrid>
    </PageSection>

    <div class="tw:grid tw:grid-cols-1 tw:gap-3 tw:md:grid-cols-3">
      <BaseTextInput v-model="filters.search" label="Recipient or subject" placeholder="Search…" />
      <BaseSelect
        v-model="filters.status"
        label="Status"
        :options="EMAIL_STATUSES"
        optionLabel="label"
        optionValue="id"
        placeholder="All statuses"
      />
      <BaseSelect
        v-model="filters.companyId"
        label="Tenant"
        :options="companies"
        optionLabel="label"
        optionValue="id"
        placeholder="All tenants"
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
      <template #body-cell-occurredAt="{ row }">
        <span class="tw:text-sm tw:text-on-main tw:whitespace-nowrap">
          {{ row.occurredAt?.formatDate('datetime') }}
        </span>
      </template>
      <template #body-cell-status="{ row }">
        <span
          class="tw:inline-flex tw:items-center tw:rounded-full tw:px-2.5 tw:py-0.5 tw:text-xs tw:font-semibold tw:whitespace-nowrap"
          :class="statusMeta(row.status).class"
        >
          {{ statusMeta(row.status).label }}
        </span>
      </template>
      <template #body-cell-toEmail="{ row }">
        <span class="tw:text-sm tw:text-on-main">{{ row.toEmail }}</span>
      </template>
      <template #body-cell-subject="{ row }">
        <div class="tw:line-clamp-1 tw:max-w-md tw:text-sm tw:text-on-main">
          {{ row.subject || '—' }}
        </div>
        <div v-if="row.error" class="tw:line-clamp-1 tw:max-w-md tw:text-xs tw:text-red-600">
          {{ row.error }}
        </div>
        <div v-else-if="row.template" class="tw:text-xs tw:text-secondary">{{ row.template }}</div>
      </template>
      <template #body-cell-tenant="{ row }">
        <span class="tw:text-sm tw:text-secondary">{{ row.tenant }}</span>
      </template>
      <template #body-cell-job="{ row }">
        <div v-if="row.jobId" class="tw:text-xs tw:text-secondary">
          <div class="tw:text-on-main">{{ row.taskIdentifier }}</div>
          #{{ row.jobId }} · attempt {{ row.attempt }}
        </div>
        <span v-else class="tw:text-xs tw:text-secondary">—</span>
      </template>
    </DataTable>

    <BaseDialog v-model="detailOpen" title="Email" :subtitle="selected?.subject || ''" size="2xl">
      <dl v-if="selected" class="tw:grid tw:grid-cols-[9rem_1fr] tw:gap-x-4 tw:gap-y-2 tw:text-sm">
        <dt class="tw:text-secondary">Status</dt>
        <dd>
          <span
            class="tw:inline-flex tw:rounded-full tw:px-2.5 tw:py-0.5 tw:text-xs tw:font-semibold"
            :class="statusMeta(selected.status).class"
          >
            {{ statusMeta(selected.status).label }}
          </span>
        </dd>
        <dt class="tw:text-secondary">When</dt>
        <dd class="tw:text-on-main">{{ selected.occurredAt?.formatDate('datetime') }}</dd>
        <dt class="tw:text-secondary">To</dt>
        <dd class="tw:text-on-main tw:break-all">{{ selected.toEmail }}</dd>
        <dt class="tw:text-secondary">From</dt>
        <dd class="tw:text-on-main tw:break-all">{{ selected.fromEmail || '—' }}</dd>
        <dt class="tw:text-secondary">Template</dt>
        <dd class="tw:text-on-main">{{ selected.template || '—' }}</dd>
        <dt class="tw:text-secondary">Tenant</dt>
        <dd class="tw:text-on-main">{{ selected.tenant }}</dd>
        <dt class="tw:text-secondary">Job</dt>
        <dd class="tw:text-on-main">
          <template v-if="selected.jobId">
            {{ selected.taskIdentifier }} #{{ selected.jobId }} (attempt {{ selected.attempt }})
          </template>
          <template v-else>—</template>
        </dd>
        <dt class="tw:text-secondary">Message id</dt>
        <dd class="tw:text-on-main tw:break-all">{{ selected.messageId || '—' }}</dd>
        <dt class="tw:text-secondary">SMTP time</dt>
        <dd class="tw:text-on-main">
          {{ selected.durationMs != null ? `${selected.durationMs} ms` : '—' }}
        </dd>
        <template v-if="selected.error">
          <dt class="tw:text-secondary">Reason</dt>
          <dd class="tw:whitespace-pre-wrap tw:text-red-600">{{ selected.error }}</dd>
        </template>
      </dl>
      <p class="tw:mt-4 tw:text-xs tw:text-secondary">
        Email bodies are not stored — they can carry one-time codes and sign-in links.
      </p>
    </BaseDialog>
  </BasePage>
</template>
