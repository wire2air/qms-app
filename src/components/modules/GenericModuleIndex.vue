<script setup>
// Branches a module route into list / create / detail (mirrors CapasIndex).
defineProps({
  moduleKey: { type: String, required: true },
  id: { type: String, default: undefined },
})
</script>

<template>
  <GenericModuleCreate v-if="id === 'create'" :moduleKey="moduleKey" />
  <GenericModulePageId v-else-if="id" :id="id" :key="id" :moduleKey="moduleKey" />
  <GenericModuleHome v-else :moduleKey="moduleKey" />
</template>
