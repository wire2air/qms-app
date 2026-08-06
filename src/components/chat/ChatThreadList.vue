<script setup>
import { IconMessage, IconTrash } from '@tabler/icons-vue'
import { useChatThreads } from '@/composables/useChatThreads'

const props = defineProps({
  activeThreadId: { type: String, default: null },
  // Filter to one context kind (e.g. 'form_builder' for the docked assistant).
  kind: { type: String, default: null },
})

const emit = defineEmits(['select', 'delete'])

const threads = useChatThreads({ kind: props.kind })

function formatRelative(dt) {
  if (!dt) return ''
  const diff = Date.now() - dt.toMillis()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return dt.formatDate?.() ?? ''
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:h-full tw:gap-2 tw:p-2">
    <div class="tw:flex-1 tw:overflow-y-auto tw:flex tw:flex-col tw:gap-1">
      <template v-if="threads.length === 0">
        <div class="tw:text-xs tw:text-secondary tw:px-3 tw:py-4 tw:text-center">
          No conversations yet.
        </div>
      </template>

      <button
        v-for="t in threads"
        :key="t.id"
        class="tw:group tw:flex tw:items-start tw:gap-2 tw:px-3 tw:py-2 tw:rounded-lg tw:text-left tw:text-sm tw:transition-colors tw:cursor-pointer"
        :class="t.id === activeThreadId
          ? 'tw:bg-primary/10 tw:text-on-main'
          : 'tw:hover:bg-main-hover tw:text-on-main'"
        @click="emit('select', t.id)"
      >
        <IconMessage :size="14" class="tw:text-secondary tw:mt-1 tw:flex-none" />
        <div class="tw:flex-1 tw:min-w-0">
          <div class="tw:truncate tw:font-medium">{{ t.title || 'New conversation' }}</div>
          <div class="tw:text-xs tw:text-secondary tw:truncate">
            {{ formatRelative(t.lastMessageAt ?? t.createdAt) }}
            <template v-if="t.context?.builderTitle"> · {{ t.context.builderTitle }}</template>
          </div>
        </div>
        <span
          class="tw:opacity-0 tw:group-hover:opacity-100 tw:transition-opacity tw:p-1 tw:rounded tw:hover:bg-red-50 tw:hover:text-red-600 tw:flex-none"
          title="Delete"
          @click.stop="emit('delete', t)"
        >
          <IconTrash :size="12" />
        </span>
      </button>
    </div>
  </div>
</template>
