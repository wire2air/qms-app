<script setup>
// Support Desk reports inside the desk portal.
import { TICKETS_PATH } from '@/utils/supportDeskPaths.js'

const pageInfo = usePageInfo()
pageInfo.value = { showHeader: false }
</script>

<template>
  <SupportDeskFrame view="reports">
    <CustomerComplaintReports :backTo="TICKETS_PATH" />
  </SupportDeskFrame>
</template>
