<script setup>
// Platform Console — Overview / landing. At-a-glance tenant counts by lifecycle
// status + entry points into the console. The heavier planes (entitlements,
// billing, flags, ops, analytics, compliance) are on the roadmap — see
// docs/backend/platform-admin-product-review.md.
import {
  IconBuildingCommunity,
  IconUserShield,
  IconHistory,
  IconArrowRight,
  IconMail,
  IconStack2,
  IconClockHour4,
  IconActivityHeartbeat,
} from '@tabler/icons-vue'
import { listCompanies, getOperationsSummary, COMPANY_STATUSES } from '@/api/platform.js'
import { platformRole } from '@/utils/currentSession.js'

const companies = ref([])
const loading = ref(true)

const byStatus = computed(() => {
  const counts = {}
  for (const s of COMPANY_STATUSES) counts[s.id] = 0
  for (const c of companies.value) counts[c.status] = (counts[c.status] || 0) + 1
  return COMPANY_STATUSES.map((s) => ({ ...s, count: counts[s.id] || 0 }))
})

const nav = [
  {
    label: 'Tenants',
    description: 'Directory, lifecycle status, and per-tenant detail.',
    icon: IconBuildingCommunity,
    to: '/platform/companies',
  },
  {
    label: 'Operators',
    description: 'Platform-admin roster — grant and revoke cross-tenant access.',
    icon: IconUserShield,
    to: '/platform/admins',
  },
  {
    label: 'Audit',
    description: 'Immutable trail of every platform action.',
    icon: IconHistory,
    to: '/platform/audit',
  },
  {
    label: 'Email Log',
    description: 'Every email sent, failed, skipped or suppressed — across tenants.',
    icon: IconMail,
    to: '/platform/email-log',
  },
  {
    label: 'Job Queue',
    description: 'Background jobs waiting, running or failed — retry or remove.',
    icon: IconStack2,
    to: '/platform/queue',
  },
  {
    label: 'Crons',
    description: 'Every scheduled job — last result, next run, and any that were missed.',
    icon: IconClockHour4,
    to: '/platform/crons',
  },
]

// Operations health: each tile links to the page that explains it, already
// filtered. A tile turns red/amber only when its number means "look at me".
const ops = ref(null)

function formatAge(ms) {
  if (!ms) return 'none waiting'
  const min = Math.round(ms / 60000)
  if (min < 1) return 'oldest < 1 min'
  if (min < 60) return `oldest ${min} min`
  return `oldest ${Math.floor(min / 60)} h ${min % 60} min`
}

const opsTiles = computed(() => {
  const o = ops.value
  if (!o) return []
  return [
    {
      key: 'failedJobs',
      label: 'Failed jobs',
      value: o.queue.failed,
      detail: 'attempts exhausted',
      tone: o.queue.failed ? 'bad' : 'ok',
      to: { path: '/platform/queue', query: { state: 'failed' } },
    },
    {
      key: 'backlog',
      label: 'Waiting jobs',
      value: o.queue.waiting,
      detail: `${o.queue.running} running · ${formatAge(o.queue.backlogMs)}`,
      tone: o.queue.backlogAlert ? 'warn' : 'ok',
      to: { path: '/platform/queue', query: { state: 'waiting' } },
    },
    {
      key: 'failedRuns',
      label: 'Failed runs (24h)',
      value: o.runs24h.failed,
      detail: `of ${o.runs24h.total} runs`,
      tone: o.runs24h.failed ? 'bad' : 'ok',
      to: { path: '/platform/queue', query: { tab: 'history', status: 'failed' } },
    },
    {
      key: 'missedCrons',
      label: 'Crons missed / failing',
      value: o.crons.missed + o.crons.failing,
      detail: `${o.crons.missed} missed · ${o.crons.failing} failing · ${o.crons.total} total`,
      tone: o.crons.failing ? 'bad' : o.crons.missed ? 'warn' : 'ok',
      to: { path: '/platform/crons', query: { problems: '1' } },
    },
    {
      key: 'failedEmails',
      label: 'Failed emails (24h)',
      value: o.emails24h.failed,
      detail: `${o.emails24h.sent} sent · ${o.emails24h.skipped} skipped`,
      tone: o.emails24h.failed ? 'bad' : 'ok',
      to: { path: '/platform/email-log', query: { status: 'failed' } },
    },
  ]
})

const TONE_CLASS = {
  bad: 'tw:text-red-600',
  warn: 'tw:text-amber-700',
  ok: 'tw:text-on-main',
}

async function loadOps() {
  try {
    ops.value = await getOperationsSummary()
  } catch {
    ops.value = null
  }
}

async function load() {
  loading.value = true
  try {
    const data = await listCompanies()
    companies.value = data?.companies || []
  } finally {
    loading.value = false
  }
}

onMounted(loadOps)

onMounted(load)
</script>

<template>
  <BasePage width="wide">
    <PageHeader :icon="IconBuildingCommunity" title="Platform Console" />

    <BaseCard>
      <p class="tw:text-sm tw:text-secondary">
        Cross-tenant control plane. You are signed in as a
        <span class="tw:font-semibold tw:text-on-main tw:capitalize">{{ platformRole }}</span>
        operator. Every action here is audited.
      </p>
    </BaseCard>

    <PageSection title="Operations" :icon="IconActivityHeartbeat">
      <ContentGrid min="12rem">
        <BaseClickableRow
          v-for="t in opsTiles"
          :key="t.key"
          :to="t.to"
          class="tw:block tw:rounded-xl tw:border tw:border-divider tw:p-4 tw:transition-colors tw:hover:bg-main-hover"
          :aria-label="`Open ${t.label}`"
        >
          <p class="tw:text-3xl tw:font-bold tw:leading-none" :class="TONE_CLASS[t.tone]">
            {{ t.value }}
          </p>
          <p class="tw:mt-2 tw:text-sm tw:font-medium tw:text-on-main">{{ t.label }}</p>
          <p class="tw:text-xs tw:text-secondary">{{ t.detail }}</p>
        </BaseClickableRow>
      </ContentGrid>
      <p v-if="!ops" class="tw:text-sm tw:text-secondary">Operations data unavailable.</p>
    </PageSection>

    <PageSection title="Tenants by status" :icon="IconBuildingCommunity">
      <ContentGrid min="10rem">
        <BaseCard v-for="s in byStatus" :key="s.id">
          <p class="tw:text-3xl tw:font-bold tw:text-on-main tw:leading-none">{{ s.count }}</p>
          <div class="tw:mt-2">
            <CompanyStatusBadge :status="s.id" />
          </div>
        </BaseCard>
      </ContentGrid>
    </PageSection>

    <PageSection title="Console" :icon="IconArrowRight">
      <ContentGrid min="18rem">
        <BaseClickableRow
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="tw:block tw:p-4 tw:rounded-xl tw:border tw:border-divider tw:hover:bg-main-hover tw:transition-colors"
          :aria-label="`Open ${item.label}`"
        >
          <div class="tw:flex tw:items-center tw:gap-3">
            <div
              class="tw:flex tw:items-center tw:justify-center tw:rounded-lg tw:size-10 tw:bg-primary/10 tw:text-primary tw:flex-none"
            >
              <component :is="item.icon" :size="20" />
            </div>
            <div class="tw:flex-1 tw:min-w-0">
              <div class="tw:font-bold tw:text-on-main">{{ item.label }}</div>
              <div class="tw:text-sm tw:text-secondary">{{ item.description }}</div>
            </div>
            <IconArrowRight :size="18" class="tw:text-secondary" />
          </div>
        </BaseClickableRow>
      </ContentGrid>
    </PageSection>
  </BasePage>
</template>
