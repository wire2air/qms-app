<script setup>
/**
 * BaseSwitcher — a compact single-select icon toggle group (e.g. grid/list view
 * switch). Implements the WAI-ARIA radiogroup pattern: role="radiogroup" with
 * role="radio" buttons, aria-checked, roving tabindex, and Arrow/Home/End
 * navigation (rule #8 — the old version was a clickable <svg> with no keyboard
 * or roles).
 *
 *   <BaseSwitcher v-model="view" ariaLabel="View" :switches="[
 *     { icon: IconLayoutGrid, value: 'grid', tooltip: 'Grid view' },
 *     { icon: IconList, value: 'list', tooltip: 'List view' },
 *   ]" />
 *
 * Icons are NOT auto-imported — pass imported @tabler/icons-vue components.
 */
const props = defineProps({
  // [{ icon, value, tooltip? }] — icon is a @tabler/icons-vue component.
  switches: {
    type: Array,
    required: true,
    validator: (value) => value.every((item) => typeof item.icon === 'function' && item.value),
  },
  // Accessible name for the radiogroup (WCAG — every radiogroup needs one).
  ariaLabel: { type: String, default: undefined },
})

const modelValue = defineModel({ type: String, required: true })

// Roving-tabindex focus management for keyboard navigation (mirrors BaseTabs).
const btnEls = new Map()
function setBtn(value, el) {
  if (el) btnEls.set(value, el)
  else btnEls.delete(value)
}

function move(kind) {
  const items = props.switches
  if (!items.length) return
  const idx = items.findIndex((s) => s.value === modelValue.value)
  let next
  if (kind === 'home') next = items[0]
  else if (kind === 'end') next = items[items.length - 1]
  else {
    const delta = kind === 'next' ? 1 : -1
    next = items[(idx + delta + items.length) % items.length]
  }
  if (!next) return
  modelValue.value = next.value
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
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="ariaLabel"
    class="tw:flex tw:items-center tw:gap-1 tw:rounded-lg tw:border tw:border-divider tw:bg-sidebar tw:p-1"
    @keydown="onKeydown"
  >
    <button
      v-for="switchItem in switches"
      :key="switchItem.value"
      :ref="(el) => setBtn(switchItem.value, el)"
      type="button"
      role="radio"
      :aria-checked="modelValue === switchItem.value"
      :aria-label="switchItem.tooltip || switchItem.value"
      :title="switchItem.tooltip || undefined"
      :tabindex="modelValue === switchItem.value ? 0 : -1"
      class="tw:flex tw:size-8 tw:items-center tw:justify-center tw:rounded-md tw:transition-all tw:duration-200 tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/40"
      :class="
        modelValue === switchItem.value
          ? 'tw:bg-primary tw:text-white'
          : 'tw:text-secondary tw:hover:bg-sidebar-hover tw:hover:text-on-sidebar'
      "
      @click="modelValue = switchItem.value"
    >
      <component :is="switchItem.icon" class="tw:size-4" aria-hidden="true" />
    </button>
  </div>
</template>
