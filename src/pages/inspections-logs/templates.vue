<script setup>
import { getCompanyPath } from '@/utils/routeHelpers.js'

defineOptions({
  name: 'InspectionsLogsTemplatesPage',
})

// Log Books moved into the Inspections & Logs tabbed workspace — redirect,
// carrying any query (filters) along.
const route = useRoute()
const router = useRouter()
onMounted(() => {
  router.replace({
    path: getCompanyPath('/inspections-logs'),
    query: { ...route.query, tab: 'log-books' },
  })
})
</script>

<template>
  <div />
</template>
