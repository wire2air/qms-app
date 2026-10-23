<script setup>
import { IconFileText } from '@tabler/icons-vue'

// The list under @ / & in the editor: articles of this knowledge base.
const props = defineProps({
  items: { type: Array, required: true },
  command: { type: Function, required: true },
  query: { type: String, default: '' },
})
const selected = ref(0)
watch(
  () => props.items,
  () => (selected.value = 0),
)
function pick(i) {
  const a = props.items[i]
  if (a) props.command(a)
}
function onKeyDown({ event }) {
  if (!props.items.length) return false
  if (event.key === 'ArrowDown') selected.value = (selected.value + 1) % props.items.length
  else if (event.key === 'ArrowUp')
    selected.value = (selected.value + props.items.length - 1) % props.items.length
  else if (event.key === 'Enter' || event.key === 'Tab') pick(selected.value)
  else return false
  return true
}
defineExpose({ onKeyDown })
</script>

<template>
  <div
    class="tw:w-80 tw:overflow-hidden tw:rounded-lg tw:border tw:border-divider tw:bg-card tw:py-1 tw:shadow-lg"
    role="listbox"
    aria-label="Link an article"
  >
    <p class="tw:px-3 tw:py-1 tw:text-xs tw:text-secondary">Link an article</p>
    <button
      v-for="(a, i) in items"
      :key="a.id"
      type="button"
      role="option"
      :aria-selected="i === selected"
      :class="[
        'tw:flex tw:w-full tw:items-center tw:gap-2 tw:px-3 tw:py-1.5 tw:text-left tw:text-sm',
        i === selected ? 'tw:bg-main-hover' : 'tw:hover:bg-main-hover',
      ]"
      @mousedown.prevent="pick(i)"
    >
      <IconFileText :size="15" class="tw:shrink-0 tw:text-secondary" />
      <span class="tw:flex-1 tw:truncate">{{ a.title }}</span>
      <span v-if="a.audience !== 'PUBLIC'" class="tw:text-xs tw:text-secondary">{{
        a.audience === 'AGENTS' ? 'Agents' : 'Customers'
      }}</span>
      <span v-if="a.status !== 'PUBLISHED'" class="tw:text-xs tw:text-secondary">{{
        a.status === 'DRAFT' ? 'Draft' : 'Archived'
      }}</span>
    </button>
    <p v-if="!items.length" class="tw:px-3 tw:py-2 tw:text-sm tw:text-secondary">
      No article matches “{{ query }}”.
    </p>
  </div>
</template>
