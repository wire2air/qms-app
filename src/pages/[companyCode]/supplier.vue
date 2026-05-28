<script setup>
/**
 * /<companyCode>/supplier — landing page for EXTERNAL_SUPPLIER users.
 *
 * Phase A.2 placeholder: shows a welcome + the four lists they'll have
 * (Shared Documents, Shared CAPAs, Shared NCs, Asset Requests) as
 * empty-state cards. Phase B fills these with the real data via the
 * shared_with_user junction (RLS-filtered).
 *
 * Login routing (backend handleUserRedirection) sends EXTERNAL_SUPPLIER
 * users here instead of the main /<companyCode>/ dashboard.
 */
import {
  IconFileText,
  IconAlertTriangle,
  IconClipboardList,
  IconUpload,
  IconShieldCheck,
} from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession.js'

defineOptions({
  name: 'SupplierDashboardPage',
})
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}

const firstName = computed(() => currentSession.value?.firstName || 'there')

const cards = [
  {
    key: 'documents',
    title: 'Shared Documents',
    description: 'Documents the client has shared with you. Read-only by default.',
    icon: IconFileText,
    placeholder: 'No documents shared with you yet.',
  },
  {
    key: 'capas',
    title: 'Shared CAPAs',
    description: 'Corrective / preventive actions you have been assigned to or included in.',
    icon: IconAlertTriangle,
    placeholder: 'No CAPAs shared with you yet.',
  },
  {
    key: 'nonconformances',
    title: 'Shared NCs',
    description: 'Non-conformances flagged against you or your products that require your input.',
    icon: IconClipboardList,
    placeholder: 'No non-conformances shared with you yet.',
  },
  {
    key: 'asset-requests',
    title: 'Asset Requests',
    description: 'Document requests from the client — certifications, licenses, insurance, etc.',
    icon: IconUpload,
    placeholder: 'No open requests. The client will notify you when documents are needed.',
  },
]
</script>

<template>
  <div class="tw:p-5 tw:max-w-5xl tw:mx-auto tw:flex tw:flex-col tw:gap-5">
    <!-- Header -->
    <div class="tw:flex tw:items-center tw:gap-3">
      <IconShieldCheck :size="28" class="tw:text-primary tw:shrink-0" />
      <div>
        <h1 class="tw:text-2xl tw:font-bold tw:text-on-main">Welcome, {{ firstName }}</h1>
        <p class="tw:text-sm tw:text-secondary">
          This is your supplier dashboard. Everything you can see here has been explicitly shared
          with you by the client — your view is read-only by default, except where you've been
          included in an approval or action workflow.
        </p>
      </div>
    </div>

    <!-- Empty-state cards (Phase B will populate these with live lists) -->
    <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
      <section
        v-for="card in cards"
        :key="card.key"
        class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:flex-col tw:gap-2"
      >
        <div class="tw:flex tw:items-center tw:gap-2">
          <component :is="card.icon" :size="18" class="tw:text-primary" />
          <h2 class="tw:text-base tw:font-semibold tw:text-on-main">{{ card.title }}</h2>
        </div>
        <p class="tw:text-xs tw:text-secondary">{{ card.description }}</p>
        <div
          class="tw:mt-2 tw:bg-main-hover tw:rounded tw:p-3 tw:text-sm tw:text-secondary tw:italic"
        >
          {{ card.placeholder }}
        </div>
      </section>
    </div>

    <!-- Footer hint -->
    <div
      class="tw:bg-amber-50 tw:border tw:border-amber-200 tw:rounded-lg tw:p-3 tw:text-xs tw:text-amber-900"
    >
      Lists go live when sharing + workflow assignment lands (Phase B). For now this page is the
      shell that proves login routing works — supplier users land here instead of the main app.
    </div>
  </div>
</template>
