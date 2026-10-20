<script setup>
import { useSupportAgentHeartbeat } from '@/composables/useSupportAgentHeartbeat.js'

// Mounted once by App.vue inside the authenticated shell — i.e. only after the
// syncEngine is installed and only while a session exists — so the composable
// can read the agent row from IDB without guarding for boot order.
useSupportAgentHeartbeat()
</script>

<template><span hidden /></template>
