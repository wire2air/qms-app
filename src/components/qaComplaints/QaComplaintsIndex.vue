<script setup>
// QA "Complaints" surface — an investigation-focused lens over the SAME
// customer_complaints table the support (Customer Complaints) module uses.
// The support UI is untouched; this is where QA reviews, investigates, records
// custom fields (lot/batch/region/symptoms), and escalates to NC. No
// customer-facing conversation/reply surface.
defineProps({
  id: {
    type: String,
    default: undefined,
  },
})
</script>

<template>
  <QaComplaintsCreate v-if="id === 'create'" />
  <QaComplaintsPageId v-else-if="id" :id="id" :key="id" />
  <QaComplaintsHome v-else />
</template>
