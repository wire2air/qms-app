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
} from '@tabler/icons-vue'
import { listCompanies, COMPANY_STATUSES } from '@/api/platform.js'
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
]

async function load() {
  loading.value = true
  try {
    const data = await listCompanies()
    companies.value = data?.companies || []
  } finally {
    loading.value = false
  }
}

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
