<script setup>
import { getCompanyPath } from '@/utils/routeHelpers'

defineOptions({
  name: 'InspectionsLogsQueuePage',
})
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}

// "My Queue" is retired — scheduled inspections & log collections now
// materialise TaskInstances and live in the unified task inbox
// (/task-instances). Redirect any old link / bookmark there.
const router = useRouter()
onMounted(() => router.replace(getCompanyPath('/task-instances')))
</script>

<template>
  <div class="tw:p-6 tw:text-sm tw:text-secondary">Redirecting to your tasks…</div>
</template>
