<script setup>
/**
 * Standalone Form Blocks page (/form-blocks) — Form Blocks are a first-class
 * sidebar item; the Form Templates page stays a separate, case-by-case surface
 * (eventually an add-on custom-module builder). Reuses FormBlocksTab as the
 * body with `standalone` so PageHeader owns the title.
 */
import { IconLayoutGrid } from '@tabler/icons-vue'
import FormBlocksTab from './FormBlocksTab.vue'
</script>

<template>
  <BasePage width="standard">
    <PageHeader :icon="IconLayoutGrid" title="Form Blocks" />
    <FormBlocksTab standalone />
  </BasePage>
</template>
