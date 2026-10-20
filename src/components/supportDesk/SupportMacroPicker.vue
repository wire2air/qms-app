<script setup>
import { IconBolt, IconSearch, IconChevronDown } from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession.js'

/**
 * Macros = canned responses, offered in the compose box for chat, tickets and
 * notes alike. Searchable; inserts with variables substituted.
 */
const props = defineProps({
  complaint: { type: Object, default: null },
})
const emit = defineEmits(['insert'])

const open = ref(false)
const query = ref('')
const inputEl = ref(null)
const macros = useLiveQuery(
  async (db) =>
    (await db.ComplaintCannedResponse.where().exec()).sort((a, b) => a.name.localeCompare(b.name)),
  { models: ['ComplaintCannedResponse'], initial: [] },
)
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return macros.value
  return macros.value.filter(
    (m) =>
      m.name.toLowerCase().includes(q) ||
      (m.body || '').toLowerCase().includes(q) ||
      (m.shortcut || '').toLowerCase().includes(q),
  )
})
function substitute(text) {
  const s = currentSession.value
  const agent = [s?.firstName, s?.lastName].filter(Boolean).join(' ') || 'Support'
  return String(text ?? '')
    .replaceAll('{{customer.name}}', props.complaint?.customerName || 'there')
    .replaceAll('{{ticket.number}}', props.complaint?.complaintNumber || '')
    .replaceAll('{{agent.name}}', agent)
    .replaceAll('{{agent.firstName}}', s?.firstName || agent)
}
function pick(m) {
  emit('insert', substitute(m.bodyHtml || m.body))
  open.value = false
  query.value = ''
}
async function toggle() {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    inputEl.value?.focus()
  }
}
const active = ref(0)
watch(filtered, () => (active.value = 0))
function onKey(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    active.value = Math.min(active.value + 1, filtered.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    active.value = Math.max(active.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (filtered.value[active.value]) pick(filtered.value[active.value])
  } else if (e.key === 'Escape') {
    open.value = false
  }
}
const root = ref(null)
onClickOutside(root, () => (open.value = false))
</script>

<template>
  <div ref="root" class="tw:relative">
    <BaseButton variant="outline" size="sm" :disabled="!macros.length" @click="toggle">
      <IconBolt :size="14" class="tw:mr-1" />
      Macros
      <IconChevronDown :size="12" class="tw:ml-1" />
    </BaseButton>
    <div
      v-if="open"
      class="tw:absolute tw:bottom-full tw:left-0 tw:z-30 tw:mb-1 tw:w-[22rem] tw:rounded-lg tw:border tw:border-divider tw:bg-card tw:shadow-xl"
    >
      <div class="tw:relative tw:border-b tw:border-divider tw:p-2">
        <IconSearch
          :size="14"
          class="tw:absolute tw:left-4 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary"
        />
        <input
          ref="inputEl"
          v-model="query"
          class="tw:w-full tw:rounded-md tw:border tw:border-divider tw:bg-main tw:py-1 tw:pl-7 tw:pr-2 tw:text-sm tw:outline-none tw:focus:border-primary"
          placeholder="Search macros…"
          @keydown="onKey"
        />
      </div>
      <ul class="tw:max-h-72 tw:overflow-y-auto tw:p-1">
        <li
          v-if="!filtered.length"
          class="tw:px-2 tw:py-3 tw:text-center tw:text-xs tw:text-secondary"
        >
          No macro matches.
        </li>
        <li v-for="(m, i) in filtered" :key="m.id">
          <button
            class="tw:w-full tw:rounded-md tw:px-2 tw:py-1.5 tw:text-left"
            :class="i === active ? 'tw:bg-main-selected' : 'tw:hover:bg-main-hover'"
            @mouseenter="active = i"
            @click="pick(m)"
          >
            <div class="tw:text-sm tw:font-medium">{{ m.name }}</div>
            <div class="tw:line-clamp-2 tw:text-xs tw:text-secondary">{{ m.body }}</div>
          </button>
        </li>
      </ul>
      <div class="tw:border-t tw:border-divider tw:px-3 tw:py-1.5 tw:text-micro tw:text-secondary">
        ↑↓ to choose · Enter to insert · variables: {{ '{' }}{{ '{' }}customer.name}} {{ '{'
        }}{{ '{' }}ticket.number}} {{ '{' }}{{ '{' }}agent.name}}
      </div>
    </div>
  </div>
</template>
