<script setup>
const props = defineProps({
  id: {
    type: String,
    default: undefined,
  },
})
</script>

<template>
  <!-- No id → the merged Templates list (workflow templates for record modules
       + document templates), not the raw workflow list. Approval-only flows
       live at /approval-flows. The editor is unchanged: every workflow, of
       either kind, still opens here. -->
  <WorkflowEditor v-if="props.id" :id="props.id" />
  <TemplatesHome v-else />
</template>
