<script setup>
// Support Desk workspace (Intercom-style inbox). App.vue renders /desk/* without
// the QMS sidebar/header — the shell is the whole viewport.
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: false }
</script>

<template>
  <SupportDeskShell :view="$route.params.view" :conversationId="$route.params.id || null" />
</template>
