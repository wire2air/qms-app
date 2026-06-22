<script setup>
/**
 * BaseFilterFlyout — one floating panel of a cascading filter menu. Renders its
 * nodes (search + rows); a submenu row opens a CHILD BaseFilterFlyout beside it
 * (recursive, unlimited nesting). Teleported to <body> and positioned with
 * @floating-ui/dom (`autoUpdate` + flip/shift, fixed strategy) so it's pinned to
 * its anchor, follows scroll/resize, and never overflows the viewport.
 * Selection runs through the injected `filterMenuCtx`.
 */
import { computePosition, offset, flip, shift, autoUpdate } from '@floating-ui/dom'
import { IconSearch } from '@tabler/icons-vue'
import {
  resolveChildren,
  hasChildren,
  isAsync,
  searchNodes,
  shouldSearch,
  isDateNode,
} from '../composables/filterMenuHelpers.js'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  anchorEl: { type: [Object, null], default: null },
  placement: { type: String, default: 'right-start' },
})
const emit = defineEmits(['close'])

const ctx = inject('filterMenuCtx', null)

const panelEl = ref(null)
const search = ref('')
const openId = ref(null)
const openAnchor = ref(null)
const asyncKids = ref({})
const loadingId = ref(null)
const dateNode = ref(null)
const dateAnchor = ref(null)

const enableSearch = computed(() => shouldSearch({}, props.nodes.length))
const filtered = computed(() => searchNodes(props.nodes, search.value))
const openNode = computed(() => props.nodes.find((n) => n.id === openId.value) || null)

function kidsOf(node) {
  if (!node) return []
  return isAsync(node) ? asyncKids.value[node.id] || [] : resolveChildren(node)
}
async function openSub(node, el) {
  if (!hasChildren(node) || node.disabled) return
  openId.value = node.id
  openAnchor.value = el ?? null
  if (isAsync(node) && !asyncKids.value[node.id]) {
    loadingId.value = node.id
    try {
      asyncKids.value = { ...asyncKids.value, [node.id]: (await node.children()) || [] }
    } finally {
      loadingId.value = null
    }
  }
}
function onSelect(node, ev) {
  if (node.disabled) return
  if (isDateNode(node)) {
    dateNode.value = node
    dateAnchor.value = ev?.currentTarget ?? null
    openId.value = null
    openAnchor.value = null
    return
  }
  if (hasChildren(node)) openSub(node, ev?.currentTarget)
  else if (node.onSelect) {
    node.onSelect()
    ctx?.requestClose?.()
  } else ctx?.toggle?.(node)
}
function onHover(node, ev) {
  if (isDateNode(node)) return
  dateNode.value = null
  dateAnchor.value = null
  if (hasChildren(node)) openSub(node, ev?.currentTarget)
  else openId.value = null
}
const isChecked = (node) => ctx?.isChecked?.(node) ?? false

// --- floating positioning: pinned to anchor, auto-updating, never clipped ---
let stopAutoUpdate = null
function place() {
  if (!props.anchorEl || !panelEl.value) return
  computePosition(props.anchorEl, panelEl.value, {
    strategy: 'fixed',
    placement: props.placement,
    middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
  }).then(({ x, y }) => {
    if (panelEl.value) Object.assign(panelEl.value.style, { left: `${x}px`, top: `${y}px` })
  })
}
onMounted(() => {
  nextTick(() => {
    // autoUpdate needs ResizeObserver (absent in some test envs) — fall back.
    if (props.anchorEl && panelEl.value && typeof window !== 'undefined' && window.ResizeObserver) {
      stopAutoUpdate = autoUpdate(props.anchorEl, panelEl.value, place)
    } else {
      place()
    }
    rows()[0]?.focus()
  })
})
onBeforeUnmount(() => stopAutoUpdate && stopAutoUpdate())

// --- keyboard ---
function rows() {
  return [...(panelEl.value?.querySelectorAll('[data-row]') || [])]
}
function move(delta) {
  const els = rows()
  if (!els.length) return
  const i = els.indexOf(document.activeElement)
  els[(i + delta + els.length) % els.length]?.focus()
}
function onKeydown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    move(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    move(-1)
  } else if (e.key === 'ArrowLeft' || e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    emit('close')
  } else if (e.key === 'ArrowRight') {
    const el = document.activeElement
    if (el?.getAttribute?.('aria-haspopup')) {
      e.preventDefault()
      el.click()
    }
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      ref="panelEl"
      role="menu"
      class="tw:fixed tw:left-0 tw:top-0 tw:z-popover tw:w-60 tw:overflow-hidden tw:rounded-xl tw:border tw:border-divider tw:bg-card tw:shadow-floating tw:motion-safe:transition-opacity"
      @keydown="onKeydown"
    >
      <div
        v-if="enableSearch"
        class="tw:flex tw:items-center tw:gap-2 tw:border-b tw:border-divider tw:px-2.5 tw:py-1.5"
      >
        <IconSearch :size="14" class="tw:shrink-0 tw:text-secondary" />
        <input
          v-model="search"
          type="text"
          placeholder="Search…"
          class="tw:w-full tw:bg-transparent tw:text-sm tw:text-on-main tw:outline-none tw:placeholder:text-placeholder"
        />
      </div>

      <div class="tw:max-h-80 tw:overflow-y-auto tw:p-1">
        <template v-for="node in filtered" :key="node.id || node.type">
          <hr v-if="node.type === 'divider'" class="tw:my-1 tw:border-divider" />
          <div
            v-else-if="node.type === 'section'"
            class="tw:px-2 tw:py-1 tw:text-micro tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary"
          >
            {{ node.label }}
          </div>
          <BaseFilterItem
            v-else
            :node="node"
            :checked="isChecked(node)"
            :hasSub="hasChildren(node) || isDateNode(node)"
            :loading="loadingId === node.id"
            @select="(ev) => onSelect(node, ev)"
            @hover="(ev) => onHover(node, ev)"
          />
        </template>
        <p v-if="!filtered.length" class="tw:px-2 tw:py-3 tw:text-center tw:text-xs tw:text-secondary">
          No matches
        </p>
        <slot />
      </div>

      <!-- recursive child flyout (unlimited nesting) -->
      <BaseFilterFlyout
        v-if="openNode && openAnchor"
        :nodes="kidsOf(openNode)"
        :anchorEl="openAnchor"
        placement="right-start"
        @close="openId = null"
      />

      <!-- date-filter sub-panel -->
      <BaseFilterFlyout
        v-if="dateNode && dateAnchor"
        :nodes="[]"
        :anchorEl="dateAnchor"
        placement="right-start"
        @close="dateNode = null"
      >
        <BaseDateFilter
          :modelValue="ctx?.getValue?.(dateNode.group) ?? null"
          @update:modelValue="(t) => ctx?.setValue?.(dateNode.group, t)"
        />
      </BaseFilterFlyout>
    </div>
  </Teleport>
</template>
