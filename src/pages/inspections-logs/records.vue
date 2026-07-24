<script setup>
import { getCompanyPath } from '@/utils/routeHelpers.js'

defineOptions({
  name: 'FieldRecordsListPage',
})

// Logs moved into the Inspections & Logs tabbed workspace — redirect,
// carrying any query (e.g. ?scope=needs_review, ?formId=…) along.
const route = useRoute()
const router = useRouter()
onMounted(() => {
  router.replace({
    path: getCompanyPath('/inspections-logs'),
    query: { ...route.query, tab: 'logs' },
  })
})
</script>

<template>
  <div />
</template>
