<script setup>
/**
 * Log Forms page (/inspections-logs/log-forms) — Log Forms are form BLOCKs
 * categorised for log books (blockCategory = 'LOG_FORM'). Reuses FormBlocksTab
 * with category="LOG_FORM" so it shares the create / rename / design-in-builder
 * machinery; PageHeader owns the title (standalone).
 *
 * A log book is created from a Log Form: its fields are copied into the book's
 * schema and frozen when the book is published (supersede model). Log Forms are
 * exclusive to log books — they don't appear as general Form Blocks or in
 * workflow/QC task-form pickers.
 */
import { IconClipboardText } from '@tabler/icons-vue'
import FormBlocksTab from '@/components/formTemplate/FormBlocksTab.vue'
</script>

<template>
  <BasePage width="standard">
    <PageHeader :icon="IconClipboardText" title="Log Forms">
      <template #actions>
        <HelpButton slug="KB/operations/inspections-and-logs" label="Help" :size="16" />
      </template>
    </PageHeader>
    <FormBlocksTab standalone category="LOG_FORM" />
  </BasePage>
</template>
