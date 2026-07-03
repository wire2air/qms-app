<script setup>
import {
  IconTool,
  IconChevronRight,
  IconChevronDown,
  IconCheck,
  IconAlertTriangle,
  IconLoader2,
} from '@tabler/icons-vue'

const props = defineProps({
  card: { type: Object, required: true },
  // { kind: 'tool_call', toolName, args, result, isError, status: 'running' | 'done' }
})

const expanded = ref(false)

const statusIcon = computed(() => {
  if (props.card.status === 'running') return IconLoader2
  if (props.card.isError) return IconAlertTriangle
  return IconCheck
})

const statusClass = computed(() => {
  if (props.card.status === 'running') return 'tw:text-blue-600 tw:animate-spin'
  if (props.card.isError) return 'tw:text-red-600'
  return 'tw:text-green-600'
})

const summary = computed(() => {
  if (props.card.status === 'running') return 'Running…'
  if (props.card.isError) {
    return props.card.result?.message ?? 'Tool error'
  }
  // Most tools return { count, summary, rows }. Prefer the summary.
  return props.card.result?.summary ?? `Returned ${props.card.result?.count ?? '?'} result(s)`
})

const argsPreview = computed(() => {
  if (!props.card.args || typeof props.card.args !== 'object') return ''
  const entries = Object.entries(props.card.args).filter(([, v]) => v !== undefined && v !== null && v !== '')
  if (entries.length === 0) return ''
  return entries.map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(', ')
})

const resultJson = computed(() => {
  if (!props.card.result) return ''
  try {
    return JSON.stringify(props.card.result, null, 2)
  } catch {
    return String(props.card.result)
  }
})
</script>

<template>
  <div
    class="tw:rounded-lg tw:border tw:border-divider tw:bg-sidebar tw:overflow-hidden"
  >
    <button
      class="tw:w-full tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-2 tw:text-left tw:text-xs tw:hover:bg-main-hover tw:transition-colors"
      @click="expanded = !expanded"
    >
      <component :is="statusIcon" :size="14" :class="statusClass" class="tw:flex-none" />
      <IconTool :size="14" class="tw:text-secondary tw:flex-none" />
      <span class="tw:font-semibold tw:text-on-main">{{ card.toolName }}</span>
      <span v-if="argsPreview" class="tw:text-secondary tw:truncate">({{ argsPreview }})</span>
      <span class="tw:flex-1 tw:text-secondary tw:truncate tw:text-right">{{ summary }}</span>
      <component
        :is="expanded ? IconChevronDown : IconChevronRight"
        :size="14"
        class="tw:text-secondary tw:flex-none"
      />
    </button>
    <div v-if="expanded" class="tw:border-t tw:border-divider tw:p-3 tw:bg-main tw:text-xs">
      <div v-if="argsPreview" class="tw:mb-2">
        <div class="tw:text-secondary tw:mb-1 tw:font-semibold">Arguments</div>
        <pre class="tw:bg-sidebar tw:rounded tw:p-2 tw:overflow-x-auto tw:text-xs ">{{ JSON.stringify(card.args, null, 2) }}</pre>
      </div>
      <div v-if="resultJson">
        <div class="tw:text-secondary tw:mb-1 tw:font-semibold">{{ card.isError ? 'Error' : 'Result' }}</div>
        <pre class="tw:bg-sidebar tw:rounded tw:p-2 tw:overflow-x-auto tw:text-xs tw:max-h-64">{{ resultJson }}</pre>
      </div>
    </div>
  </div>
</template>
