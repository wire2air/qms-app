<script setup>
// Tickets inside the Support Desk portal: the list, one ticket, or a new one
// (/desk/tickets/new). App.vue renders /desk/* without the QMS chrome.
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: false }
const route = useRoute()
const id = computed(() => (route.params.id === 'new' ? 'create' : route.params.id || undefined))
</script>

<template>
  <SupportDeskFrame view="tickets">
    <CustomerComplaintsIndex :id="id" />
  </SupportDeskFrame>
</template>
