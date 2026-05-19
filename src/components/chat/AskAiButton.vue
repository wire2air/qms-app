<script setup>
import { IconSparkles } from '@tabler/icons-vue'
import { useChatPanel } from '@/composables/useChatPanel'

const props = defineProps({
  entityType: { type: String, required: true }, // 'Capa' | 'Nonconformance' | 'Document' | …
  entityId: { type: String, required: true },
  entityTitle: { type: String, default: '' },
  entityNumber: { type: String, default: '' }, // capaNumber / ncNumber / docNumber
  size: { type: String, default: 'sm' }, // sm | md
})

const panel = useChatPanel()

function open() {
  panel.open({
    threadId: null, // always start a fresh thread; context attaches to first send
    context: {
      entityType: props.entityType,
      entityId: props.entityId,
      entityTitle: props.entityTitle || null,
      entityNumber: props.entityNumber || null,
    },
  })
}
</script>

<template>
  <button
    class="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-lg tw:border tw:border-primary/30 tw:bg-primary/5 tw:text-primary tw:hover:bg-primary/10 tw:transition-colors tw:font-medium"
    :class="size === 'sm' ? 'tw:px-2.5 tw:py-1 tw:text-xs' : 'tw:px-3 tw:py-1.5 tw:text-sm'"
    title="Open AI Assistant with this record as context"
    @click="open"
  >
    <IconSparkles :size="size === 'sm' ? 13 : 15" />
    Ask AI
  </button>
</template>
