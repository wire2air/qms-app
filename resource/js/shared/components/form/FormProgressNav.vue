<script setup>
/**
 * FormProgressNav — a sticky section strip for long, multi-section forms. The
 * form analog of DetailAnchorNav: same anchor-link pattern, plus the two things
 * a long form needs — per-section completion status (so the user sees what's
 * left) and optional scroll-spy (tracks the active section as you scroll). A
 * 7-section form like NC create has no nav today; this is it.
 *
 *   <FormProgressNav :sections="navSections" />
 *
 *   // navSections mirrors the FormSection ids on the page:
 *   const navSections = computed(() => [
 *     { id: 'basic', label: 'Basic', status: form.title ? 'complete' : null },
 *     { id: 'classification', label: 'Classification', status: classOk ? 'complete' : 'error' },
 *     { id: 'product', label: 'Product', status: null },   // optional → no status
 *   ])
 *
 * Each section id must match a FormSection's `id` (its anchor). Clicking scrolls
 * to it. `spy` (default on) observes the sections via IntersectionObserver;
 * pass `activeId` to drive it externally instead (e.g. fullHeight scroll roots).
 */
import { IconCheck, IconAlertTriangle, IconPointFilled } from '@tabler/icons-vue'

const props = defineProps({
  // [{ id, label, icon?, status? }] — status: 'complete' | 'error' | null.
  sections: { type: Array, default: () => [] },
  // Controlled active id; overrides scroll-spy when set.
  activeId: { type: String, default: '' },
  // Auto-track the active section on scroll.
  spy: { type: Boolean, default: true },
})

const internalActive = ref('')
const activeId = computed(() => props.activeId || internalActive.value)

function go(id) {
  const el = typeof document !== 'undefined' ? document.getElementById(id) : null
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  internalActive.value = id
  // Move focus into the section for keyboard users (without yanking the scroll).
  const focusable = el.querySelector(
    'input,select,textarea,button,a[href],[tabindex]:not([tabindex="-1"])',
  )
  focusable?.focus?.({ preventScroll: true })
}

// Scroll-spy: the topmost section currently intersecting wins.
let observer = null
const visible = new Set()
function syncActive() {
  if (props.activeId) return
  for (const s of props.sections) {
    if (visible.has(s.id)) {
      internalActive.value = s.id
      return
    }
  }
}
onMounted(() => {
  if (!props.spy || typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target.id)
        else visible.delete(e.target.id)
      }
      syncActive()
    },
    { rootMargin: '-20% 0px -70% 0px', threshold: 0 },
  )
  for (const s of props.sections) {
    const el = document.getElementById(s.id)
    if (el) observer.observe(el)
  }
})
onBeforeUnmount(() => observer?.disconnect())

const STATUS_ICON = { complete: IconCheck, error: IconAlertTriangle }
function statusColor(status, active) {
  if (status === 'complete') return 'tw:text-good'
  if (status === 'error') return 'tw:text-red-600'
  return active ? 'tw:text-primary' : 'tw:text-secondary/50'
}
</script>

<template>
  <nav
    aria-label="Form sections"
    class="tw:flex tw:gap-1 tw:overflow-x-auto tw:border-b tw:border-divider tw:py-2"
  >
    <a
      v-for="s in sections"
      :key="s.id"
      :href="`#${s.id}`"
      :aria-current="activeId === s.id ? 'true' : undefined"
      class="tw:flex tw:items-center tw:gap-1.5 tw:whitespace-nowrap tw:rounded-md tw:px-3 tw:py-1.5 tw:text-sm tw:font-medium tw:transition-colors tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/40"
      :class="
        activeId === s.id
          ? 'tw:bg-primary/10 tw:text-primary'
          : 'tw:text-secondary tw:hover:text-on-main'
      "
      @click.prevent="go(s.id)"
    >
      <component
        :is="STATUS_ICON[s.status] || IconPointFilled"
        :size="s.status ? 15 : 8"
        :class="statusColor(s.status, activeId === s.id)"
        aria-hidden="true"
      />
      <span v-if="s.icon" class="tw:flex tw:items-center">
        <component :is="s.icon" :size="15" aria-hidden="true" />
      </span>
      {{ s.label }}
    </a>
  </nav>
</template>
