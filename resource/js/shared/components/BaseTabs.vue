<script setup>
/**
 * BaseTabs — an accessible tab bar to replace the ~14 hand-rolled tab
 * implementations (button row + v-if panels, zero ARIA). Implements the WAI-ARIA
 * tabs pattern: role="tablist"/"tab", aria-selected/-controls, roving tabindex,
 * and Arrow/Home/End keyboard navigation.
 *
 * The v-model is the active tab's string id (matching existing `activeTab`
 * usage, incl. binding to `route.query.tab`). Pair with <BaseTabPanel value="…">
 * children for the matching panels:
 *
 *   <BaseTabs v-model="activeTab" :tabs="tabs" ariaLabel="Supplier details">
 *     <BaseTabPanel value="details">…</BaseTabPanel>
 *     <BaseTabPanel value="contacts">…</BaseTabPanel>
 *   </BaseTabs>
 *
 * Panels are slotted children (not siblings) so they receive the active-tab
 * context. The panel region can be relocated with the optional #panels slot
 * naming if needed, but the default slot is the panels.
 *
 * Icons are NOT auto-imported — pass the imported component on a tab's `icon`.
 */
const props = defineProps({
  // [{ value, label, icon?, disabled? }]
  tabs: { type: Array, required: true },
  // 'underline' (default) or 'pills'.
  variant: {
    type: String,
    default: 'underline',
    validator: (v) => ['underline', 'pills'].includes(v),
  },
  // Accessible name for the tablist (WCAG — every tablist needs one).
  ariaLabel: { type: String, default: undefined },
})

const model = defineModel({ type: [String, Number], default: null })

const baseId = useId()
function tabId(value) {
  return `${baseId}-tab-${value}`
}
function panelId(value) {
  return `${baseId}-panel-${value}`
}

// UI-only structural coordination (active id + id helpers) for BaseTabPanel —
// not application data (CLAUDE.md rule #4 governs data, not component wiring).
provide('baseTabs', {
  activeValue: computed(() => model.value),
  tabId,
  panelId,
})

// Default to the first (enabled) tab when nothing is selected yet.
onMounted(() => {
  if (model.value == null) {
    const first = props.tabs.find((t) => !t.disabled) || props.tabs[0]
    if (first) model.value = first.value
  }
})

function isActive(tab) {
  return model.value === tab.value
}

function select(tab) {
  if (!tab.disabled) model.value = tab.value
}

// Roving-tabindex focus management for keyboard navigation.
const btnEls = new Map()
function setBtn(value, el) {
  if (el) btnEls.set(value, el)
  else btnEls.delete(value)
}

function move(kind) {
  const enabled = props.tabs.filter((t) => !t.disabled)
  if (!enabled.length) return
  const idx = enabled.findIndex((t) => t.value === model.value)
  let next
  if (kind === 'home') next = enabled[0]
  else if (kind === 'end') next = enabled[enabled.length - 1]
  else {
    const delta = kind === 'next' ? 1 : -1
    next = enabled[(idx + delta + enabled.length) % enabled.length]
  }
  if (!next) return
  model.value = next.value
  nextTick(() => btnEls.get(next.value)?.focus())
}

function onKeydown(e) {
  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      e.preventDefault()
      move('next')
      break
    case 'ArrowLeft':
    case 'ArrowUp':
      e.preventDefault()
      move('prev')
      break
    case 'Home':
      e.preventDefault()
      move('home')
      break
    case 'End':
      e.preventDefault()
      move('end')
      break
  }
}

const listClass = computed(() =>
  props.variant === 'pills'
    ? 'tw:flex tw:flex-wrap tw:gap-1'
    : 'tw:flex tw:gap-1 tw:overflow-x-auto tw:border-b tw:border-divider',
)

function tabClass(tab) {
  const active = isActive(tab)
  if (props.variant === 'pills') {
    return [
      'tw:inline-flex tw:items-center tw:gap-1.5 tw:whitespace-nowrap tw:rounded-lg tw:px-3 tw:py-1.5 tw:text-sm tw:font-medium tw:transition-colors tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/30',
      active
        ? 'tw:bg-primary tw:text-on-primary'
        : 'tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-main',
      tab.disabled && 'tw:cursor-not-allowed tw:opacity-50',
    ]
  }
  return [
    'tw:inline-flex tw:items-center tw:gap-1.5 tw:whitespace-nowrap tw:-mb-px tw:border-b-2 tw:px-4 tw:py-2 tw:text-sm tw:font-medium tw:transition-colors tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/30',
    active
      ? 'tw:border-primary tw:text-primary'
      : 'tw:border-transparent tw:text-secondary tw:hover:text-on-main',
    tab.disabled && 'tw:cursor-not-allowed tw:opacity-50',
  ]
}
</script>

<template>
  <div>
    <div role="tablist" :aria-label="ariaLabel" :class="listClass" @keydown="onKeydown">
      <button
        v-for="tab in tabs"
        :id="tabId(tab.value)"
        :key="tab.value"
        :ref="(el) => setBtn(tab.value, el)"
        type="button"
        role="tab"
        :aria-selected="isActive(tab)"
        :aria-controls="panelId(tab.value)"
        :tabindex="isActive(tab) ? 0 : -1"
        :disabled="tab.disabled || undefined"
        :class="tabClass(tab)"
        @click="select(tab)"
      >
        <component :is="tab.icon" v-if="tab.icon" :size="16" aria-hidden="true" />
        {{ tab.label }}
      </button>
    </div>

    <slot />
  </div>
</template>
