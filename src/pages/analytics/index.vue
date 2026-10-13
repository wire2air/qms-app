<script setup>
/**
 * /analytics — redirect only.
 *
 * This was the Overview page until 2026-09-21. It is deliberately NOT deleted:
 * the path is bookmarked, deep-linked, and was for a long time the destination
 * for every Analytics* notification, so it has to keep resolving to something
 * real rather than 404.
 *
 * Dashboards is the honest landing place — it is where the seeded boards that
 * replaced Overview live. The old page itself moved to /analytics/browse.
 *
 * `replace` so the dead path does not sit in history and send Back into a
 * redirect loop.
 */
import { getCompanyPath } from '@/utils/routeHelpers'

defineOptions({
  name: 'AnalyticsPage',
})

const router = useRouter()

onMounted(() => {
  router.replace(getCompanyPath('/analytics/dashboards'))
})
</script>

<template>
  <!-- Nothing renders; the redirect fires on mount. -->
  <div />
</template>
