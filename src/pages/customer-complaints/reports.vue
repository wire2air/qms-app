<script setup>
import { getCompanyPath } from '@/utils/routeHelpers'
import { TICKET_REPORTS_PATH } from '@/utils/supportDeskPaths.js'

// Support Desk reports moved into the desk portal (/desk/reports).
const route = useRoute()
useRouter().replace({ path: getCompanyPath(TICKET_REPORTS_PATH), query: route.query })
</script>

<template><span /></template>
