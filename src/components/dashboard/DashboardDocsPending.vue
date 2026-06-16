<script setup>
/**
 * Document versions under review — resolved to the parent document title.
 */
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { IconCircleCheck } from '@tabler/icons-vue'

const pending = useLiveQuery(
  async (db) => {
    const versions = await db.DocumentVersion.where('statusId', 'UNDER_REVIEW').exec()
    const out = []
    for (const v of versions) {
      const doc = v.documentId ? await db.Document.findByPk(v.documentId) : null
      out.push({ version: v, doc })
    }
    return out.sort(
      (a, b) => (b.version.updatedAt?.toMillis?.() ?? 0) - (a.version.updatedAt?.toMillis?.() ?? 0),
    )
  },
  { initial: [] },
)
</script>

<template>
  <DashboardWidgetCard title="Documents Pending Approval" :count="pending.length" linkTo="/documents">
    <BaseEmptyState v-if="!pending.length" dense :icon="IconCircleCheck" title="Nothing awaiting approval" />
    <RouterLink
      v-for="p in pending.slice(0, 5)"
      :key="p.version.id"
      :to="getCompanyPath(`/documents/${p.doc?.id ?? ''}`)"
      class="tw:flex tw:items-center tw:gap-3 tw:px-4 tw:py-2.5 tw:border-t tw:first:border-t-0 tw:border-divider tw:hover:bg-main-hover tw:transition-colors"
    >
      <div class="tw:flex-1 tw:min-w-0">
        <div class="tw:text-sm tw:font-medium tw:text-on-main tw:truncate">
          {{ p.doc?.title || 'Document' }}
        </div>
        <div class="tw:text-xs tw:text-secondary tw:font-mono">
          {{ p.doc?.docNumber }} · v{{ p.version.versionLabel || `${p.version.versionMajor}.${p.version.versionMinor}` }}
        </div>
      </div>
    </RouterLink>
  </DashboardWidgetCard>
</template>
