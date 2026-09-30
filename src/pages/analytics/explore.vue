<script setup>
/**
 * /analytics/explore — redirect only, for now.
 *
 * The Data Explorer page is switched off (2026-09-30) and its nav entries are
 * gone. The path keeps resolving, same as /analytics, so a bookmark or deep
 * link lands on Dashboards rather than a 404.
 *
 * To bring the page back: render <DataExplorer /> here again and restore the
 * sidebar entry (MainSidebar) and the header button (DashboardsHome). The
 * component, its route meta and its `analytics_explore:read` gate are untouched.
 *
 * `replace` so the dead path does not sit in history and send Back into a
 * redirect loop.
 */
import { getCompanyPath } from '@/utils/routeHelpers'

defineOptions({ name: 'AnalyticsExplorePage' })

const router = useRouter()

onMounted(() => {
  router.replace(getCompanyPath('/analytics/dashboards'))
})
</script>

<template>
  <!-- Nothing renders; the redirect fires on mount. -->
  <div />
</template>
