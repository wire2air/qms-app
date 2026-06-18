<script setup>
/**
 * BaseAccordion — accessible collapsible sections (WAI-ARIA accordion). Each
 * header is a <button aria-expanded aria-controls> inside a heading; each panel
 * is a role="region" labelled by its header. Arrow/Home/End move between
 * headers; Enter/Space toggle (native button).
 *
 *   <BaseAccordion v-model="open" multiple :items="[
 *     { value: 'a', title: 'Overview' }, { value: 'b', title: 'History' },
 *   ]">
 *     <template #a>…panel A…</template>
 *     <template #b="{ item }">…panel B…</template>
 *   </BaseAccordion>
 *
 * v-model is the array of open item values. `multiple=false` (default) keeps one
 * section open at a time.
 *
 * Icons are NOT auto-imported — the chevron is imported here.
 */
import { IconChevronDown } from '@tabler/icons-vue'

const props = defineProps({
  // [{ value, title, disabled? }]
  items: { type: Array, required: true },
  // Allow several panels open at once (default: single-open).
  multiple: { type: Boolean, default: false },
  // Heading level for the header wrapper (document outline).
  level: { type: [Number, String], default: 3 },
})

const model = defineModel({ type: Array, default: () => [] })

const baseId = useId()
const headerId = (v) => `${baseId}-h-${v}`
const panelId = (v) => `${baseId}-p-${v}`

function isOpen(value) {
  return model.value.includes(value)
}

function toggle(item) {
  if (item.disabled) return
  if (isOpen(item.value)) {
    model.value = model.value.filter((v) => v !== item.value)
  } else {
    model.value = props.multiple ? [...model.value, item.value] : [item.value]
  }
}

// Roving focus across header buttons (Arrow/Home/End).
function onKeydown(e) {
  const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End']
  if (!keys.includes(e.key)) return
  e.preventDefault()
  const headers = Array.from(
    e.currentTarget.closest('[data-accordion]').querySelectorAll('button[data-accordion-header]'),
  )
  const i = headers.indexOf(e.currentTarget)
  let next
  if (e.key === 'Home') next = headers[0]
  else if (e.key === 'End') next = headers[headers.length - 1]
  else if (e.key === 'ArrowDown') next = headers[(i + 1) % headers.length]
  else next = headers[(i - 1 + headers.length) % headers.length]
  next?.focus()
}
</script>

<template>
  <div data-accordion class="tw:divide-y tw:divide-divider tw:overflow-hidden tw:rounded-xl tw:border tw:border-divider">
    <div v-for="item in items" :key="item.value">
      <component :is="`h${level}`" class="tw:m-0">
        <button
          :id="headerId(item.value)"
          data-accordion-header
          type="button"
          :aria-expanded="isOpen(item.value)"
          :aria-controls="panelId(item.value)"
          :disabled="item.disabled || undefined"
          class="tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-3 tw:bg-card tw:px-4 tw:py-3 tw:text-left tw:text-sm tw:font-medium tw:text-on-main tw:transition-colors tw:hover:bg-main-hover tw:disabled:cursor-not-allowed tw:disabled:opacity-50 tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-inset tw:focus-visible:ring-primary/40"
          @click="toggle(item)"
          @keydown="onKeydown"
        >
          <slot name="title" :item="item">{{ item.title }}</slot>
          <IconChevronDown
            :size="18"
            class="tw:shrink-0 tw:text-secondary tw:transition-transform tw:duration-200"
            :class="isOpen(item.value) && 'tw:rotate-180'"
            aria-hidden="true"
          />
        </button>
      </component>
      <div
        v-show="isOpen(item.value)"
        :id="panelId(item.value)"
        role="region"
        :aria-labelledby="headerId(item.value)"
        class="tw:bg-card tw:px-4 tw:py-3 tw:text-sm tw:text-on-main"
      >
        <slot :name="item.value" :item="item">{{ item.content }}</slot>
      </div>
    </div>
  </div>
</template>
