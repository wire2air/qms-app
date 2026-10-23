<script setup>
import { getCompanyPath } from '@/utils/routeHelpers'
import { ticketPath, NEW_TICKET_PATH } from '@/utils/supportDeskPaths.js'

// Tickets moved into the Support Desk portal (/desk/tickets). Old addresses —
// e-mails, notifications, bookmarks — land on the same screen there.
const route = useRoute()
const router = useRouter()
const id = route.params.id
router.replace({
  path: getCompanyPath(id === 'create' ? NEW_TICKET_PATH : ticketPath(id || null)),
  query: route.query,
  hash: route.hash,
})
</script>

<template><span /></template>
