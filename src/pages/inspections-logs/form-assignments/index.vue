<script setup>
import { getCompanyPath } from '@/utils/routeHelpers.js'

defineOptions({
  name: 'FormAssignmentsListPage',
})

// Assignments moved into the Inspections & Logs tabbed workspace — redirect.
// The /form-assignments/create and /form-assignments/:id editor pages stay.
const route = useRoute()
const router = useRouter()
onMounted(() => {
  router.replace({
    path: getCompanyPath('/inspections-logs'),
    query: { ...route.query, tab: 'assignments' },
  })
})
</script>

<template>
  <div />
</template>
