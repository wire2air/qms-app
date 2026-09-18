<script setup>
// Approval Flows — the sign-off half of the old single Workflows list (user
// decision 2026-08-15). Log Book, Inspections & Logs, Audit, QC and Document
// Control flows only carry approval steps, so listing them beside NC / CAPA /
// Change Control templates (which carry task forms) made both harder to read.
//
// The editor is the SAME component the Templates side opens — but it is
// mounted under /approval-flows/:id rather than /workflow-templates/:id, so
// the sidebar keeps Approval Flows highlighted while you're inside one.
// Sharing the path made the nav jump to "Templates" on open (user report).
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <WorkflowEditor v-if="$route.params.id" :id="$route.params.id" />
  <WorkflowsHome v-else kind="approval" />
</template>
