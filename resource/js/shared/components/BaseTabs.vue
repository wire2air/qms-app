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
 * Overflow (enterprise UX): when the tabs are wider than the viewport the row
 * scrolls horizontally (wheel / trackpad / touch), with the native scrollbar
 * hidden. A subtle gradient fade marks each overflowing edge and a floating
 * chevron button glides the row into view — both appear only when there is
 * actually more in that direction, and vanish at the start/end. The active tab
 * is always scrolled back into view on selection, and (underline variant) a
 * sliding indicator animates between tabs. Nothing here adds layout space, so
 * the affordances never cause layout shift. Toggle with `scrollable` / `fade` /
 * `navButtons`. The fade color follows `--tabs-fade-color` (defaults to the page
 * surface) so it blends correctly inside cards too.
 *
 * Icons are NOT auto-imported — pass the imported component on a tab's `icon`.
 */
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-vue'

const props = defineProps({
  // [{ value, label, icon?, disabled?, badge?, indicator? }]
  //   badge     — count pill after the label (string|number)
  //   indicator — small attention dot (Boolean)
  tabs: { type: Array, required: true },
  // 'segmented' (default) — enclosed pill group with an elevated active tab;
  // 'underline' — classic underline row; 'pills' — solid primary active pill.
  variant: {
    type: String,
    default: 'segmented',
    validator: (v) => ['segmented', 'underline', 'pills'].includes(v),
  },
  // Accessible name for the tablist (WCAG — every tablist needs one).
  ariaLabel: { type: String, default: undefined },
  // Overflow chrome — all default-on, additive (no caller changes required).
  scrollable: { type: Boolean, default: true }, // master switch for scroll/fade/buttons
  fade: { type: Boolean, default: true }, // gradient edge fades
  navButtons: { type: Boolean, default: true }, // floating chevron buttons
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

/* ──────────────────────────── Overflow navigation ──────────────────────────── */

const scroller = ref(null) // the role="tablist" element (the scroll container)

// useScroll keeps `arrivedState.left/right` reactive on every scroll — that is
// what tells us whether there is anything left to reveal in each direction.
const { arrivedState } = useScroll(scroller)

const isOverflowing = ref(false)
function measure() {
  const el = scroller.value
  isOverflowing.value = !!el && el.scrollWidth - el.clientWidth > 1
  updateIndicator()
}

// Recompute on container resize and whenever the tab set changes — no polling.
useResizeObserver(scroller, measure)
watch(
  () => props.tabs.map((t) => t.value).join('|'),
  () => nextTick(measure),
)
onMounted(() => nextTick(measure))

const canScroll = computed(() => props.scrollable && isOverflowing.value)
const canPrev = computed(() => canScroll.value && !arrivedState.left)
const canNext = computed(() => canScroll.value && !arrivedState.right)

function scrollByDir(dir) {
  const el = scroller.value
  if (!el) return
  // ~80% of a page keeps a sliver of the previous tab as a continuity anchor.
  el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
}

// Translate vertical wheel/trackpad delta into horizontal scroll, but only when
// the gesture is vertically dominant (preserve native horizontal swipe/trackpad).
function onWheel(e) {
  const el = scroller.value
  if (!el || !canScroll.value) return
  if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
  el.scrollLeft += e.deltaY
  e.preventDefault()
}
useEventListener(scroller, 'wheel', onWheel, { passive: false })

// Keep the selected tab visible after any selection (click or keyboard).
const didInitScroll = ref(false)
function scrollActiveIntoView(smooth) {
  const el = btnEls.get(model.value)
  if (!el || typeof el.scrollIntoView !== 'function') return
  el.scrollIntoView({
    inline: 'nearest',
    block: 'nearest',
    behavior: smooth ? 'smooth' : 'auto',
  })
}

/* Sliding underline indicator — one shared bar that glides between tabs.
 * Positioned in the scroll content's coordinate space, so it tracks naturally
 * while the row scrolls (no per-scroll recompute). */
const indicatorStyle = ref({ opacity: 0 })
function updateIndicator() {
  if (props.variant !== 'underline') return
  const el = btnEls.get(model.value)
  if (!el || !scroller.value) {
    indicatorStyle.value = { opacity: 0 }
    return
  }
  indicatorStyle.value = {
    transform: `translateX(${el.offsetLeft}px)`,
    width: `${el.offsetWidth}px`,
    opacity: 1,
  }
}

watch(model, () => {
  nextTick(() => {
    updateIndicator()
    scrollActiveIntoView(didInitScroll.value)
    didInitScroll.value = true
  })
})

/* ──────────────────────────── Styling ──────────────────────────── */

// The segmented track hugs its content (and scrolls within max-width on overflow)
// so it reads as a contained control rather than a full-width bar.
const viewportClass = computed(() =>
  props.variant === 'segmented' ? 'tw:relative tw:w-fit tw:max-w-full' : 'tw:relative',
)

const listClass = computed(() => {
  const base = 'base-tabs__scroller tw:relative tw:flex tw:flex-nowrap tw:overflow-x-auto'
  if (props.variant === 'segmented')
    return [base, 'tw:gap-1 tw:rounded-xl tw:border tw:border-divider tw:bg-main-unselected tw:p-1']
  if (props.variant === 'pills') return [base, 'tw:gap-1']
  return [base, 'tw:gap-1 tw:border-b tw:border-divider']
})

function tabClass(tab) {
  const active = isActive(tab)
  if (props.variant === 'segmented') {
    return [
      'tw:inline-flex tw:items-center tw:gap-1.5 tw:whitespace-nowrap tw:rounded-lg tw:px-3.5 tw:py-1.5 tw:text-sm tw:font-medium tw:transition-all tw:duration-200 tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/30',
      active
        ? 'tw:bg-card tw:text-on-main tw:shadow-sm'
        : 'tw:text-secondary tw:hover:text-on-main',
      tab.disabled && 'tw:cursor-not-allowed tw:opacity-50',
    ]
  }
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
    'tw:relative tw:inline-flex tw:items-center tw:gap-1.5 tw:whitespace-nowrap tw:rounded-md tw:px-4 tw:py-2 tw:text-sm tw:font-medium tw:transition-colors tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/30',
    active ? 'tw:text-primary' : 'tw:text-secondary tw:hover:text-on-main',
    tab.disabled && 'tw:cursor-not-allowed tw:opacity-50',
  ]
}
</script>

<template>
  <div>
    <!-- Overflow viewport: anchors the fades + floating buttons without taking
         layout space, so they never cause layout shift. -->
    <div :class="viewportClass">
      <div
        ref="scroller"
        role="tablist"
        :aria-label="ariaLabel"
        :class="listClass"
        @keydown="onKeydown"
      >
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
          <!-- Optional count pill (e.g. "Versions 3"). -->
          <span
            v-if="tab.badge != null && tab.badge !== ''"
            class="tw:inline-flex tw:items-center tw:justify-center tw:rounded-full tw:bg-main-hover tw:px-1.5 tw:text-[10px] tw:font-bold tw:text-secondary"
            :class="isActive(tab) && 'tw:bg-primary/10 tw:text-primary'"
          >
            {{ tab.badge }}
          </span>
          <!-- Optional attention dot (e.g. unresolved warning on a tab). -->
          <span
            v-if="tab.indicator"
            class="tw:size-1.5 tw:rounded-full tw:bg-warning"
            aria-hidden="true"
          />
        </button>

        <!-- Sliding active indicator (underline variant only). Lives in scroll
             content so it tracks the row while scrolling; GPU-friendly transform. -->
        <span
          v-if="variant === 'underline'"
          class="tw:pointer-events-none tw:absolute tw:bottom-0 tw:left-0 tw:h-0.5 tw:rounded-full tw:bg-primary tw:transition-[transform,width,opacity] tw:duration-300 tw:ease-out"
          :style="indicatorStyle"
          aria-hidden="true"
        />
      </div>

      <!-- Edge fades — purely decorative, never intercept clicks. -->
      <template v-if="fade">
        <div
          class="base-tabs__fade base-tabs__fade--left tw:pointer-events-none tw:absolute tw:inset-y-0 tw:left-0 tw:w-12 tw:transition-opacity tw:duration-200"
          :class="canPrev ? 'tw:opacity-100' : 'tw:opacity-0'"
          aria-hidden="true"
        />
        <div
          class="base-tabs__fade base-tabs__fade--right tw:pointer-events-none tw:absolute tw:inset-y-0 tw:right-0 tw:w-12 tw:transition-opacity tw:duration-200"
          :class="canNext ? 'tw:opacity-100' : 'tw:opacity-0'"
          aria-hidden="true"
        />
      </template>

      <!-- Floating chevrons — mouse affordance only (keyboard already has
           Arrow/Home/End), so aria-hidden + tabindex=-1 keep the tab order clean. -->
      <template v-if="navButtons">
        <button
          type="button"
          aria-hidden="true"
          tabindex="-1"
          class="tw:absolute tw:left-1 tw:top-1/2 tw:-translate-y-1/2 tw:inline-flex tw:size-7 tw:items-center tw:justify-center tw:rounded-full tw:border tw:border-divider tw:bg-card tw:text-secondary tw:shadow-sm tw:transition tw:duration-200 tw:hover:bg-main-hover tw:hover:text-on-main tw:active:scale-95"
          :class="canPrev ? 'tw:opacity-100' : 'tw:pointer-events-none tw:opacity-0'"
          @click="scrollByDir(-1)"
        >
          <IconChevronLeft :size="16" />
        </button>
        <button
          type="button"
          aria-hidden="true"
          tabindex="-1"
          class="tw:absolute tw:right-1 tw:top-1/2 tw:-translate-y-1/2 tw:inline-flex tw:size-7 tw:items-center tw:justify-center tw:rounded-full tw:border tw:border-divider tw:bg-card tw:text-secondary tw:shadow-sm tw:transition tw:duration-200 tw:hover:bg-main-hover tw:hover:text-on-main tw:active:scale-95"
          :class="canNext ? 'tw:opacity-100' : 'tw:pointer-events-none tw:opacity-0'"
          @click="scrollByDir(1)"
        >
          <IconChevronRight :size="16" />
        </button>
      </template>
    </div>

    <slot />
  </div>
</template>

<style scoped>
/* Hide the native scrollbar while keeping the element fully scrollable. */
.base-tabs__scroller {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* legacy Edge */
  scroll-behavior: smooth;
}
.base-tabs__scroller::-webkit-scrollbar {
  display: none; /* Chrome/Safari */
}

/* Edge fades blend the row into whatever surface it sits on. Override
 * --tabs-fade-color on a parent to match a non-default background (e.g. cards). */
.base-tabs__fade {
  --tabs-fade-color: var(--color-main);
}
.base-tabs__fade--left {
  background: linear-gradient(to right, var(--tabs-fade-color), transparent);
}
.base-tabs__fade--right {
  background: linear-gradient(to left, var(--tabs-fade-color), transparent);
}

@media (prefers-reduced-motion: reduce) {
  .base-tabs__scroller {
    scroll-behavior: auto;
  }
}
</style>
