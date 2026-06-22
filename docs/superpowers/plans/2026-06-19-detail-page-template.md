# Detail Page Template (`BaseDetailLayout`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a configurable, composable Detail Page template (`BaseDetailLayout`) and its L1 composable + L3 primitives, proven in Storybook across the simple→complex entity range, without touching the live app.

**Architecture:** Three layers (per spec §3): **L1** a headless composable (`useDetailLayout` + pure helpers) owning state/behavior; **L3** five droppable Vue primitives (`DetailHeader`, `DetailActionBar`, `DetailTabs`, `DetailRail`, `BaseRailCard`); **L2** the `BaseDetailLayout` shell that composes them via descriptors + slots + flags. Everything is optional and degrades gracefully.

**Tech Stack:** Vue 3 (`<script setup>`, `defineModel`), Tailwind v4 (`tw:` prefix), `@vueuse/core` (`useScroll`, `useBreakpoints`, `useStorage`), Vitest + `@vue/test-utils` + happy-dom, Storybook 10 (CSF3 + `autodocs` + `addon-a11y`), `@tabler/icons-vue`.

## Global Constraints

Copied verbatim from spec + CLAUDE.md. Every task implicitly includes these.

- **Tokens frozen.** Use existing tokens/utilities only. No new color/space/type/elevation tokens.
- **App untouched.** Create only new files under `resource/js/shared/components/` and `resource/js/shared/composables/`. Do NOT modify any `src/**` page or `BaseDetailPage.vue` in this plan (migration is a later spec).
- **Tailwind prefix:** every Tailwind class carries `tw:` (e.g. `tw:flex tw:gap-4`).
- **Icons:** `@tabler/icons-vue`, explicitly imported. Never auto-imported. Never another icon lib.
- **Functions:** `function foo() {}`, never `const foo = () => {}` (except inline callbacks).
- **v-model:** use `defineModel`, never the computed getter/setter pattern.
- **No `<form>` elements.** Clickable non-buttons use `BaseClickableRow`; single inline actions use real `<button>`.
- **PascalCase** component usage in templates.
- **`function` keyword** for component-level functions.
- **No entity vocabulary in any L1/L2/L3 API** (spec §3.2) — no "supplier"/"code"/"evaluate" in props/types; entity concepts live only in consumer slot content and the Storybook example fixtures.
- **Auto-imports (verified against `vite.config.js`):** Vue APIs (`ref`/`computed`/`watch`/`onMounted`/`useSlots`), `vueuse`, `vue-router`, `Base*`/`Detail*` components, **and composables in `resource/js/shared/composables/`** are all auto-imported in component/app code — do NOT write explicit imports for them (e.g. `useDetailLayout` is used bare, like `usePagination` in `BasePagination.vue`). The alias `@shared` → `resource/js/shared`. DO write explicit imports: `@tabler/icons-vue` icons everywhere; and in `.spec.js` test files, import the composables/helpers/components under test explicitly (Vitest does not apply auto-import). Inside `useDetailLayout.js`, import its sibling `./detailLayoutHelpers.js` with a relative path.
- **Test runner:** `npm test` = `vitest run`. Single file: `npx vitest run <path>`.
- **Story build check:** `npm run build-storybook` must stay green.

## Shared type shapes (referenced across tasks — JSDoc only, this is a pure-JS project)

```js
/** @typedef {Object} ActionDescriptor
 *  @property {string} id
 *  @property {string} label
 *  @property {object} [icon]                      // @tabler/icons-vue component
 *  @property {'primary'|'secondary'|'danger'} [variant]  // default 'secondary'
 *  @property {number} [priority]                  // default 0; higher = kept out of overflow
 *  @property {boolean|(() => boolean)} [visible]  // default true
 *  @property {boolean|(() => boolean)} [disabled] // default false
 *  @property {boolean|(() => boolean)} [loading]  // default false
 *  @property {() => void} [onSelect]
 *  @property {string} [to]                        // router target (nav action)
 */

/** @typedef {Object} TabDescriptor
 *  @property {string} value
 *  @property {string} label
 *  @property {object} [icon]
 *  @property {number|(() => number)} [count]      // → BaseTabs item `badge`
 *  @property {boolean|(() => boolean)} [visible]  // default true
 *  @property {boolean} [lazy]                     // default true (BaseTabPanel default)
 *  @property {boolean} [disabled]
 */

/** @typedef {Object} RailCardDescriptor
 *  @property {string} id
 *  @property {string} title
 *  @property {object} [icon]
 *  @property {boolean} [collapsible]              // default true
 *  @property {Array<{label: string, value: string}>} [items]  // simple description rows
 */
```

`bucketActions`/`resolveDetailState` consume **already-resolved** descriptors (predicates flattened to booleans). The composable does the flattening so the pure helpers stay trivially testable.

---

### Task 1: Pure helpers — `resolveDetailState` + `bucketActions`

**Files:**
- Create: `resource/js/shared/composables/detailLayoutHelpers.js`
- Test: `resource/js/shared/composables/detailLayoutHelpers.spec.js`

**Interfaces:**
- Produces: `resolveDetailState({ loading, notFound, error }) => 'loading' | 'error' | 'notFound' | 'ready'` (precedence in that order). `bucketActions(resolvedActions, maxVisible = 3) => { visible: ActionDescriptor[], overflow: ActionDescriptor[] }` — input pre-filtered/flattened; filters `visible === false`, sorts by `priority` desc (stable), and when more than `maxVisible` remain keeps `maxVisible - 1` visible (reserving one slot for the overflow trigger).

- [ ] **Step 1: Write the failing test**

```js
// detailLayoutHelpers.spec.js
import { describe, it, expect } from 'vitest'
import { resolveDetailState, bucketActions } from './detailLayoutHelpers.js'

describe('resolveDetailState', () => {
  it('prefers loading over everything', () => {
    expect(resolveDetailState({ loading: true, error: true, notFound: true })).toBe('loading')
  })
  it('error before notFound', () => {
    expect(resolveDetailState({ error: true, notFound: true })).toBe('error')
  })
  it('notFound before ready', () => {
    expect(resolveDetailState({ notFound: true })).toBe('notFound')
  })
  it('defaults to ready', () => {
    expect(resolveDetailState({})).toBe('ready')
  })
})

describe('bucketActions', () => {
  const a = (id, priority, variant = 'secondary', visible = true) => ({ id, priority, variant, visible })

  it('returns empty buckets for no actions', () => {
    expect(bucketActions([], 3)).toEqual({ visible: [], overflow: [] })
  })
  it('shows all when at or under the cap', () => {
    const r = bucketActions([a('x', 1), a('y', 2)], 3)
    expect(r.visible.map((d) => d.id)).toEqual(['y', 'x']) // priority desc
    expect(r.overflow).toEqual([])
  })
  it('reserves one slot for overflow when over the cap', () => {
    const r = bucketActions([a('a', 5), a('b', 4), a('c', 3), a('d', 2), a('e', 1)], 3)
    expect(r.visible.map((d) => d.id)).toEqual(['a', 'b']) // maxVisible - 1
    expect(r.overflow.map((d) => d.id)).toEqual(['c', 'd', 'e'])
  })
  it('drops actions with visible === false', () => {
    const r = bucketActions([a('a', 5), a('b', 4, 'secondary', false)], 3)
    expect(r.visible.map((d) => d.id)).toEqual(['a'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resource/js/shared/composables/detailLayoutHelpers.spec.js`
Expected: FAIL — "Failed to resolve import './detailLayoutHelpers.js'".

- [ ] **Step 3: Write minimal implementation**

```js
// detailLayoutHelpers.js
/** Pure layout-state precedence: loading > error > notFound > ready. */
export function resolveDetailState({ loading, error, notFound } = {}) {
  if (loading) return 'loading'
  if (error) return 'error'
  if (notFound) return 'notFound'
  return 'ready'
}

/**
 * Bucket resolved action descriptors into visible buttons + an overflow list.
 * Input must already be flattened (predicates → booleans).
 */
export function bucketActions(actions = [], maxVisible = 3) {
  const shown = actions
    .filter((a) => a.visible !== false)
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (y.a.priority ?? 0) - (x.a.priority ?? 0) || x.i - y.i)
    .map(({ a }) => a)

  if (shown.length <= maxVisible) return { visible: shown, overflow: [] }
  return { visible: shown.slice(0, maxVisible - 1), overflow: shown.slice(maxVisible - 1) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run resource/js/shared/composables/detailLayoutHelpers.spec.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add resource/js/shared/composables/detailLayoutHelpers.js resource/js/shared/composables/detailLayoutHelpers.spec.js
git commit -m "feat(ds): detail-layout pure helpers (state precedence + action bucketing)"
```

---

### Task 2: L1 composable — `useDetailLayout`

**Files:**
- Create: `resource/js/shared/composables/useDetailLayout.js`
- Test: `resource/js/shared/composables/useDetailLayout.spec.js`

**Interfaces:**
- Consumes: `resolveDetailState`, `bucketActions` (Task 1); `useScroll`, `useBreakpoints` (`@vueuse/core`).
- Produces: `useDetailLayout({ loading, notFound, error, actions, maxVisibleActions = 3, scrollTarget }) => { state, actionBuckets, scrolled, isMobile, isTablet }`. Every option may be a ref, a getter, or a plain value (normalized via `toValue`). `state`/`actionBuckets`/`scrolled`/`isMobile`/`isTablet` are all reactive (computed/refs). `actionBuckets` flattens each descriptor's `visible`/`disabled`/`loading` (boolean OR `() => boolean`) to booleans before bucketing.

- [ ] **Step 1: Write the failing test**

```js
// useDetailLayout.spec.js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, h } from 'vue'
import { useDetailLayout } from './useDetailLayout.js'

// Mount inside a component so onMounted-based VueUse hooks (useScroll) run.
function harness(options) {
  let api
  const Comp = {
    setup() {
      api = useDetailLayout(options)
      return () => h('div')
    },
  }
  const wrapper = mount(Comp, { attachTo: document.body })
  return { api, wrapper }
}

describe('useDetailLayout', () => {
  it('derives state from flags', () => {
    const loading = ref(true)
    const { api } = harness({ loading, notFound: false, error: false, actions: [] })
    expect(api.state.value).toBe('loading')
    loading.value = false
    expect(api.state.value).toBe('ready')
  })

  it('flattens action predicates then buckets', () => {
    const actions = [
      { id: 'a', priority: 5, variant: 'primary', visible: () => true },
      { id: 'hidden', priority: 9, visible: () => false },
      { id: 'b', priority: 1, disabled: () => true },
    ]
    const { api } = harness({ loading: false, actions, maxVisibleActions: 3 })
    expect(api.actionBuckets.value.visible.map((d) => d.id)).toEqual(['a', 'b'])
    // resolved booleans are exposed for the renderer
    expect(api.actionBuckets.value.visible.find((d) => d.id === 'b').disabled).toBe(true)
  })

  it('exposes scrolled / breakpoint refs', () => {
    const { api } = harness({ loading: false, actions: [] })
    expect(typeof api.scrolled.value).toBe('boolean')
    expect(typeof api.isMobile.value).toBe('boolean')
    expect(typeof api.isTablet.value).toBe('boolean')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resource/js/shared/composables/useDetailLayout.spec.js`
Expected: FAIL — cannot resolve `./useDetailLayout.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// useDetailLayout.js
import { computed, toValue } from 'vue'
import { useScroll, useBreakpoints } from '@vueuse/core'
import { resolveDetailState, bucketActions } from './detailLayoutHelpers.js'

function flag(v) {
  return typeof v === 'function' ? !!v() : !!toValue(v)
}

/**
 * Headless core for the detail-page layout (spec §3.1 L1).
 * @param {Object} o
 * @param {*} o.loading @param {*} o.notFound @param {*} o.error  ref|getter|value
 * @param {*} o.actions  ref|getter|ActionDescriptor[]
 * @param {number} [o.maxVisibleActions]
 * @param {import('vue').Ref<HTMLElement|null>} [o.scrollTarget]
 */
export function useDetailLayout(o = {}) {
  const state = computed(() =>
    resolveDetailState({
      loading: flag(o.loading),
      error: flag(o.error),
      notFound: flag(o.notFound),
    }),
  )

  const resolvedActions = computed(() =>
    (toValue(o.actions) || []).map((a) => ({
      ...a,
      visible: a.visible === undefined ? true : flag(a.visible),
      disabled: flag(a.disabled),
      loading: flag(a.loading),
      variant: a.variant || 'secondary',
      priority: a.priority ?? 0,
    })),
  )

  const actionBuckets = computed(() =>
    bucketActions(resolvedActions.value, o.maxVisibleActions ?? 3),
  )

  // Scroll-aware chrome: true once the scroll region has moved.
  const { y } = useScroll(o.scrollTarget ?? (() => null))
  const scrolled = computed(() => (y?.value ?? 0) > 4)

  // Project Tailwind breakpoints (px). md=768, lg=1024.
  const bp = useBreakpoints({ md: 768, lg: 1024 })
  const isMobile = bp.smaller('md') // < 768
  const isTablet = bp.between('md', 'lg') // 768–1024

  return { state, actionBuckets, scrolled, isMobile, isTablet }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run resource/js/shared/composables/useDetailLayout.spec.js`
Expected: PASS (3 tests). Scroll/breakpoint *values* are environment-driven and only type-checked here; real behavior is verified in Storybook (Task 11).

- [ ] **Step 5: Commit**

```bash
git add resource/js/shared/composables/useDetailLayout.js resource/js/shared/composables/useDetailLayout.spec.js
git commit -m "feat(ds): useDetailLayout headless core (state + action buckets + scroll/breakpoint refs)"
```

---

### Task 3: `BaseRailCard` — collapsible titled rail card

**Files:**
- Create: `resource/js/shared/components/BaseRailCard.vue`
- Test: `resource/js/shared/components/BaseRailCard.spec.js`
- Story: `resource/js/shared/components/BaseRailCard.stories.js`

**Interfaces:**
- Produces: `<BaseRailCard title icon? collapsible?(default true) defaultOpen?(default true)>` with default slot = body. When `collapsible`, the title is a `<button aria-expanded aria-controls>` toggling body visibility.

- [ ] **Step 1: Write the failing test**

```js
// BaseRailCard.spec.js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseRailCard from './BaseRailCard.vue'

describe('BaseRailCard', () => {
  it('renders title and body', () => {
    const w = mount(BaseRailCard, { props: { title: 'Properties' }, slots: { default: '<p>x</p>' } })
    expect(w.text()).toContain('Properties')
    expect(w.text()).toContain('x')
  })

  it('toggle button has aria-expanded and hides body when collapsed', async () => {
    const w = mount(BaseRailCard, { props: { title: 'Properties' }, slots: { default: '<p data-test="b">x</p>' } })
    const btn = w.get('button')
    expect(btn.attributes('aria-expanded')).toBe('true')
    await btn.trigger('click')
    expect(btn.attributes('aria-expanded')).toBe('false')
    expect(w.find('[data-test="b"]').exists()).toBe(false)
  })

  it('non-collapsible renders title as heading, no button', () => {
    const w = mount(BaseRailCard, { props: { title: 'Properties', collapsible: false }, slots: { default: '<p/>' } })
    expect(w.find('button').exists()).toBe(false)
    expect(w.find('h3').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resource/js/shared/components/BaseRailCard.spec.js`
Expected: FAIL — cannot resolve `./BaseRailCard.vue`.

- [ ] **Step 3: Write minimal implementation**

```vue
<!-- BaseRailCard.vue -->
<script setup>
import { IconChevronDown } from '@tabler/icons-vue'

const props = defineProps({
  title: { type: String, required: true },
  icon: { type: [Object, Function], default: null },
  collapsible: { type: Boolean, default: true },
  defaultOpen: { type: Boolean, default: true },
})

const open = ref(props.defaultOpen)
const bodyId = `railcard-${Math.random().toString(36).slice(2, 9)}`
function toggle() {
  if (props.collapsible) open.value = !open.value
}
</script>

<template>
  <BaseCard padding="sm" class="tw:flex tw:flex-col tw:gap-2">
    <button
      v-if="collapsible"
      type="button"
      class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:text-label tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="bodyId"
      @click="toggle"
    >
      <span class="tw:flex tw:items-center tw:gap-2">
        <component :is="icon" v-if="icon" :size="14" aria-hidden="true" />
        {{ title }}
      </span>
      <IconChevronDown
        :size="16"
        class="tw:transition-transform tw:duration-150 tw:motion-reduce:transition-none"
        :class="open ? '' : 'tw:-rotate-90'"
        aria-hidden="true"
      />
    </button>
    <h3
      v-else
      class="tw:flex tw:items-center tw:gap-2 tw:text-label tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary"
    >
      <component :is="icon" v-if="icon" :size="14" aria-hidden="true" />
      {{ title }}
    </h3>
    <div v-show="open" :id="bodyId">
      <slot />
    </div>
  </BaseCard>
</template>
```

Note: `v-show` keeps body mounted (test asserts `exists() === false` when collapsed — adjust to `v-if`). Use `v-if="open"` so the collapsed test passes.

- [ ] **Step 4: Make the collapse test pass — switch `v-show` to `v-if`**

Change the body wrapper to:

```vue
    <div v-if="open" :id="bodyId">
      <slot />
    </div>
```

Run: `npx vitest run resource/js/shared/components/BaseRailCard.spec.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Add the story**

```js
// BaseRailCard.stories.js
import BaseRailCard from './BaseRailCard.vue'
import { IconInfoCircle } from '@tabler/icons-vue'

export default {
  title: 'Detail Page/BaseRailCard',
  component: BaseRailCard,
  tags: ['autodocs'],
  argTypes: { collapsible: { control: 'boolean' }, defaultOpen: { control: 'boolean' } },
}

export const Default = {
  args: { title: 'Properties', collapsible: true, defaultOpen: true },
  render: (args) => ({
    components: { BaseRailCard },
    setup: () => ({ args, IconInfoCircle }),
    template: `<div class="tw:w-80"><BaseRailCard v-bind="args" :icon="IconInfoCircle">
      <dl class="tw:text-body"><div class="tw:flex tw:justify-between tw:py-1"><dt class="tw:text-secondary">Owner</dt><dd>Jane Doe</dd></div></dl>
    </BaseRailCard></div>`,
  }),
}

export const NonCollapsible = { ...Default, args: { ...Default.args, collapsible: false } }
```

- [ ] **Step 6: Commit**

```bash
git add resource/js/shared/components/BaseRailCard.vue resource/js/shared/components/BaseRailCard.spec.js resource/js/shared/components/BaseRailCard.stories.js
git commit -m "feat(ds): BaseRailCard collapsible rail card primitive"
```

---

### Task 4: `DetailRail` — sticky rail region

**Files:**
- Create: `resource/js/shared/components/DetailRail.vue`
- Test: `resource/js/shared/components/DetailRail.spec.js`
- Story: `resource/js/shared/components/DetailRail.stories.js`

**Interfaces:**
- Consumes: `BaseRailCard` (Task 3).
- Produces: `<DetailRail :railCards collapsedOnMobile? >` with `#default` slot (wins over `railCards`). Renders `railCards` descriptors as `BaseRailCard`s with simple `items` description rows. Root is `<aside aria-label="Details">`. Sticky positioning + responsive collapse are applied by `BaseDetailLayout` via the grid (this component is presentational + semantic).

- [ ] **Step 1: Write the failing test**

```js
// DetailRail.spec.js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DetailRail from './DetailRail.vue'

describe('DetailRail', () => {
  it('renders the default slot when provided (slot wins)', () => {
    const w = mount(DetailRail, {
      props: { railCards: [{ id: 'p', title: 'Properties', items: [{ label: 'Owner', value: 'Jane' }] }] },
      slots: { default: '<div data-test="slot">custom</div>' },
    })
    expect(w.find('[data-test="slot"]').exists()).toBe(true)
    expect(w.text()).not.toContain('Owner')
  })

  it('renders railCards descriptors when no slot', () => {
    const w = mount(DetailRail, {
      props: { railCards: [{ id: 'p', title: 'Properties', items: [{ label: 'Owner', value: 'Jane' }] }] },
    })
    expect(w.text()).toContain('Properties')
    expect(w.text()).toContain('Owner')
    expect(w.text()).toContain('Jane')
  })

  it('uses an aside landmark labelled Details', () => {
    const w = mount(DetailRail, { props: { railCards: [] }, slots: { default: '<div/>' } })
    const aside = w.get('aside')
    expect(aside.attributes('aria-label')).toBe('Details')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resource/js/shared/components/DetailRail.spec.js`
Expected: FAIL — cannot resolve `./DetailRail.vue`.

- [ ] **Step 3: Write minimal implementation**

```vue
<!-- DetailRail.vue -->
<script setup>
const props = defineProps({
  railCards: { type: Array, default: () => [] },
})
const slots = useSlots()
const useSlot = computed(() => !!slots.default)
</script>

<template>
  <aside aria-label="Details" class="tw:flex tw:flex-col tw:gap-4">
    <slot v-if="useSlot" />
    <template v-else>
      <BaseRailCard
        v-for="card in railCards"
        :key="card.id"
        :title="card.title"
        :icon="card.icon || null"
        :collapsible="card.collapsible !== false"
      >
        <dl class="tw:flex tw:flex-col tw:gap-1.5 tw:text-body">
          <div
            v-for="(row, i) in card.items || []"
            :key="i"
            class="tw:flex tw:items-baseline tw:justify-between tw:gap-3"
          >
            <dt class="tw:text-secondary">{{ row.label }}</dt>
            <dd class="tw:text-right tw:font-medium">{{ row.value }}</dd>
          </div>
        </dl>
      </BaseRailCard>
    </template>
  </aside>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run resource/js/shared/components/DetailRail.spec.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Add the story**

```js
// DetailRail.stories.js
import DetailRail from './DetailRail.vue'

export default { title: 'Detail Page/DetailRail', component: DetailRail, tags: ['autodocs'] }

export const Descriptors = {
  render: () => ({
    components: { DetailRail },
    setup: () => ({
      railCards: [
        { id: 'props', title: 'Properties', items: [{ label: 'Owner', value: 'Jane Doe' }, { label: 'Status', value: 'Active' }] },
        { id: 'dates', title: 'Dates', items: [{ label: 'Created', value: '12 Jun 2026' }, { label: 'Updated', value: '2d ago' }] },
      ],
    }),
    template: `<div class="tw:w-80"><DetailRail :railCards="railCards" /></div>`,
  }),
}
```

- [ ] **Step 6: Commit**

```bash
git add resource/js/shared/components/DetailRail.vue resource/js/shared/components/DetailRail.spec.js resource/js/shared/components/DetailRail.stories.js
git commit -m "feat(ds): DetailRail region (slot-or-descriptor rail cards, aside landmark)"
```

---

### Task 5: `DetailActionBar` — descriptor-driven action bar

**Files:**
- Create: `resource/js/shared/components/DetailActionBar.vue`
- Test: `resource/js/shared/components/DetailActionBar.spec.js`
- Story: `resource/js/shared/components/DetailActionBar.stories.js`

**Interfaces:**
- Consumes: `useDetailLayout` (Task 2) for buckets; `BaseButton`, `BaseMenu`.
- Produces: `<DetailActionBar :actions :maxVisible?(default 3) />`. Renders `buckets.visible` as `BaseButton`s (variant from descriptor, `loading`/`disabled` bound, click → `onSelect`) and, if `buckets.overflow.length`, a `BaseMenu` whose `items` map overflow descriptors to `{ name, icon, click, disabled }`.

- [ ] **Step 1: Write the failing test**

```js
// DetailActionBar.spec.js
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DetailActionBar from './DetailActionBar.vue'

describe('DetailActionBar', () => {
  it('renders visible action buttons and fires onSelect', async () => {
    const onSelect = vi.fn()
    const w = mount(DetailActionBar, {
      props: { actions: [{ id: 'save', label: 'Save', variant: 'primary', priority: 9, onSelect }] },
    })
    const btn = w.get('button')
    expect(btn.text()).toContain('Save')
    await btn.trigger('click')
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('moves overflow actions into a menu when over the cap', () => {
    const w = mount(DetailActionBar, {
      props: {
        maxVisible: 3,
        actions: [
          { id: 'a', label: 'A', priority: 5 },
          { id: 'b', label: 'B', priority: 4 },
          { id: 'c', label: 'C', priority: 3 },
          { id: 'd', label: 'D', priority: 2 },
        ],
      },
      global: { stubs: { BaseMenu: { name: 'BaseMenu', props: ['items'], template: '<div data-test="menu" :data-count="items.length" />' } } },
    })
    // visible = maxVisible - 1 = 2 buttons; overflow = 2 in the menu
    expect(w.findAll('button').length).toBe(2)
    expect(w.get('[data-test="menu"]').attributes('data-count')).toBe('2')
  })

  it('renders nothing when no visible actions', () => {
    const w = mount(DetailActionBar, { props: { actions: [{ id: 'x', label: 'X', visible: false }] } })
    expect(w.find('button').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resource/js/shared/components/DetailActionBar.spec.js`
Expected: FAIL — cannot resolve `./DetailActionBar.vue`.

- [ ] **Step 3: Write minimal implementation**

```vue
<!-- DetailActionBar.vue -->
<script setup>
// useDetailLayout is auto-imported (resource/js/shared/composables is in AutoImport.dirs).
const props = defineProps({
  actions: { type: Array, default: () => [] },
  maxVisible: { type: Number, default: 3 },
})

const { actionBuckets } = useDetailLayout({
  loading: false,
  actions: () => props.actions,
  maxVisibleActions: props.maxVisible,
})

const overflowItems = computed(() =>
  actionBuckets.value.overflow.map((a) => ({
    name: a.label,
    icon: a.icon,
    disabled: a.disabled,
    click: () => a.onSelect && a.onSelect(),
  })),
)
</script>

<template>
  <div class="tw:flex tw:items-center tw:gap-2">
    <BaseButton
      v-for="a in actionBuckets.visible"
      :key="a.id"
      :variant="a.variant"
      size="sm"
      :loading="a.loading"
      :disabled="a.disabled"
      :as="a.to ? 'RouterLink' : 'button'"
      :to="a.to || undefined"
      @click="a.onSelect && a.onSelect()"
    >
      <component :is="a.icon" v-if="a.icon" :size="16" aria-hidden="true" />
      {{ a.label }}
    </BaseButton>
    <BaseMenu v-if="overflowItems.length" :items="overflowItems" />
  </div>
</template>
```

`BaseButton` variants `primary | danger | secondary | outline` are all valid (verified from `BaseButton.vue`), so `:variant="a.variant"` binds directly — the default `'secondary'` is applied by the composable when a descriptor omits `variant`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run resource/js/shared/components/DetailActionBar.spec.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Add the story**

```js
// DetailActionBar.stories.js
import DetailActionBar from './DetailActionBar.vue'
import { IconCheck, IconArchive, IconTrash, IconDownload } from '@tabler/icons-vue'

export default { title: 'Detail Page/DetailActionBar', component: DetailActionBar, tags: ['autodocs'] }

export const Default = {
  render: () => ({
    components: { DetailActionBar },
    setup: () => ({
      actions: [
        { id: 'approve', label: 'Approve', icon: IconCheck, variant: 'primary', priority: 100, onSelect: () => {} },
        { id: 'archive', label: 'Archive', icon: IconArchive, priority: 50, onSelect: () => {} },
        { id: 'export', label: 'Export', icon: IconDownload, priority: 30, onSelect: () => {} },
        { id: 'delete', label: 'Delete', icon: IconTrash, variant: 'danger', priority: 10, onSelect: () => {} },
      ],
    }),
    template: `<DetailActionBar :actions="actions" />`,
  }),
}
```

- [ ] **Step 6: Commit**

```bash
git add resource/js/shared/components/DetailActionBar.vue resource/js/shared/components/DetailActionBar.spec.js resource/js/shared/components/DetailActionBar.stories.js
git commit -m "feat(ds): DetailActionBar (descriptor-driven primary/secondary/overflow)"
```

---

### Task 6: `DetailTabs` — descriptor-driven tabs + panels

**Files:**
- Create: `resource/js/shared/components/DetailTabs.vue`
- Test: `resource/js/shared/components/DetailTabs.spec.js`
- Story: `resource/js/shared/components/DetailTabs.stories.js`

**Interfaces:**
- Consumes: `BaseTabs`, `BaseTabPanel` (lazy by default; `keepAlive` to keep mounted).
- Produces: `<DetailTabs v-model :tabs ariaLabel?>` with `#tab-{value}` slots per panel. Maps `TabDescriptor` → `BaseTabs` item `{ value, label, icon, badge: count, disabled }`, filtering `visible === false`. `lazy === false` sets `keepAlive` on that panel. Exposes `v-model` (active tab value).

- [ ] **Step 1: Write the failing test**

```js
// DetailTabs.spec.js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DetailTabs from './DetailTabs.vue'

const tabs = [
  { value: 'overview', label: 'Overview' },
  { value: 'docs', label: 'Documents', count: 12 },
  { value: 'secret', label: 'Secret', visible: false },
]

describe('DetailTabs', () => {
  it('renders only visible tabs with count → badge', () => {
    const w = mount(DetailTabs, {
      props: { tabs, modelValue: 'overview' },
      slots: { 'tab-overview': '<div data-test="ov">OV</div>', 'tab-docs': '<div>D</div>' },
    })
    expect(w.text()).toContain('Overview')
    expect(w.text()).toContain('Documents')
    expect(w.text()).toContain('12') // badge
    expect(w.text()).not.toContain('Secret')
  })

  it('shows the active panel slot', () => {
    const w = mount(DetailTabs, {
      props: { tabs, modelValue: 'overview' },
      slots: { 'tab-overview': '<div data-test="ov">OV</div>' },
    })
    expect(w.find('[data-test="ov"]').exists()).toBe(true)
  })

  it('emits update:modelValue handled by v-model (default first tab when null)', () => {
    const w = mount(DetailTabs, { props: { tabs, modelValue: null }, slots: { 'tab-overview': '<div/>' } })
    // BaseTabs auto-selects first visible tab when model is null
    expect(w.emitted('update:modelValue')?.[0]?.[0]).toBe('overview')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resource/js/shared/components/DetailTabs.spec.js`
Expected: FAIL — cannot resolve `./DetailTabs.vue`.

- [ ] **Step 3: Write minimal implementation**

```vue
<!-- DetailTabs.vue -->
<script setup>
const props = defineProps({
  tabs: { type: Array, required: true },
  ariaLabel: { type: String, default: undefined },
})
const model = defineModel({ type: [String, Number], default: null })

function val(v) {
  return typeof v === 'function' ? v() : v
}
const visibleTabs = computed(() => props.tabs.filter((t) => t.visible !== false))
const baseTabs = computed(() =>
  visibleTabs.value.map((t) => ({
    value: t.value,
    label: t.label,
    icon: t.icon,
    badge: t.count != null ? val(t.count) : undefined,
    disabled: !!t.disabled,
  })),
)
</script>

<template>
  <BaseTabs v-model="model" :tabs="baseTabs" :ariaLabel="ariaLabel">
    <BaseTabPanel
      v-for="t in visibleTabs"
      :key="t.value"
      :value="t.value"
      :keepAlive="t.lazy === false"
    >
      <slot :name="`tab-${t.value}`" />
    </BaseTabPanel>
  </BaseTabs>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run resource/js/shared/components/DetailTabs.spec.js`
Expected: PASS (3 tests). (`BaseTabPanel` accepts `keepAlive` — default `false`, i.e. lazy — verified from source; `:keepAlive="t.lazy === false"` makes a `lazy:false` descriptor keep its panel mounted.)

- [ ] **Step 5: Add the story**

```js
// DetailTabs.stories.js
import DetailTabs from './DetailTabs.vue'
import { ref } from 'vue'

export default { title: 'Detail Page/DetailTabs', component: DetailTabs, tags: ['autodocs'] }

export const Default = {
  render: () => ({
    components: { DetailTabs },
    setup() {
      const active = ref('overview')
      const tabs = [
        { value: 'overview', label: 'Overview' },
        { value: 'docs', label: 'Documents', count: 12 },
        { value: 'activity', label: 'Activity' },
      ]
      return { active, tabs }
    },
    template: `<DetailTabs v-model="active" :tabs="tabs" ariaLabel="Demo">
      <template #tab-overview><div class="tw:py-4">Overview content</div></template>
      <template #tab-docs><div class="tw:py-4">Documents content</div></template>
      <template #tab-activity><div class="tw:py-4">Activity content</div></template>
    </DetailTabs>`,
  }),
}
```

- [ ] **Step 6: Commit**

```bash
git add resource/js/shared/components/DetailTabs.vue resource/js/shared/components/DetailTabs.spec.js resource/js/shared/components/DetailTabs.stories.js
git commit -m "feat(ds): DetailTabs (descriptor-driven tabs, visibility + count badges + lazy panels)"
```

---

### Task 7: `DetailHeader` — identity row + scroll-aware chrome

**Files:**
- Create: `resource/js/shared/components/DetailHeader.vue`
- Test: `resource/js/shared/components/DetailHeader.spec.js`
- Story: `resource/js/shared/components/DetailHeader.stories.js`

**Interfaces:**
- Consumes: `BaseAvatar`, `DetailActionBar` (Task 5).
- Produces: `<DetailHeader title icon? avatarName? variant?('full'|'compact') :actions :scrolled? >` with slots `#title` (override the title node, e.g. inline-edit), `#status` (badges after title), `#meta` (muted sub-line), `#actions` (override the action bar). `variant="compact"` hides avatar + meta. Applies a bottom border when `scrolled`.

- [ ] **Step 1: Write the failing test**

```js
// DetailHeader.spec.js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DetailHeader from './DetailHeader.vue'

describe('DetailHeader', () => {
  it('renders title, status slot, and meta slot in full variant', () => {
    const w = mount(DetailHeader, {
      props: { title: 'Acme Corp', variant: 'full' },
      slots: { status: '<span data-test="st">Active</span>', meta: '<span data-test="mt">code · 2d</span>' },
    })
    expect(w.text()).toContain('Acme Corp')
    expect(w.find('[data-test="st"]').exists()).toBe(true)
    expect(w.find('[data-test="mt"]').exists()).toBe(true)
  })

  it('compact variant hides the meta slot', () => {
    const w = mount(DetailHeader, {
      props: { title: 'Acme Corp', variant: 'compact' },
      slots: { meta: '<span data-test="mt">x</span>' },
    })
    expect(w.find('[data-test="mt"]').exists()).toBe(false)
  })

  it('renders the action bar from the actions prop', () => {
    const w = mount(DetailHeader, {
      props: { title: 'X', actions: [{ id: 'a', label: 'Approve', variant: 'primary', priority: 9, onSelect() {} }] },
    })
    expect(w.text()).toContain('Approve')
  })

  it('applies a bottom border when scrolled', () => {
    const w = mount(DetailHeader, { props: { title: 'X', scrolled: true } })
    expect(w.get('header').classes().join(' ')).toContain('tw:border-b')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resource/js/shared/components/DetailHeader.spec.js`
Expected: FAIL — cannot resolve `./DetailHeader.vue`.

- [ ] **Step 3: Write minimal implementation**

```vue
<!-- DetailHeader.vue -->
<script setup>
const props = defineProps({
  title: { type: String, default: '' },
  icon: { type: [Object, Function], default: null },
  avatarName: { type: String, default: '' },
  variant: { type: String, default: 'full', validator: (v) => ['full', 'compact'].includes(v) },
  actions: { type: Array, default: () => [] },
  scrolled: { type: Boolean, default: false },
})
const isFull = computed(() => props.variant === 'full')
</script>

<template>
  <header
    class="tw:flex tw:flex-col tw:gap-2 tw:bg-card tw:px-1 tw:py-3 tw:transition-shadow tw:duration-150 tw:motion-reduce:transition-none"
    :class="scrolled ? 'tw:border-b tw:border-divider tw:shadow-raised' : ''"
  >
    <div class="tw:flex tw:items-start tw:justify-between tw:gap-4">
      <div class="tw:flex tw:items-center tw:gap-3 tw:min-w-0">
        <BaseAvatar v-if="isFull && (avatarName || icon)" :name="avatarName || title" shape="square" size="md" />
        <component :is="icon" v-else-if="icon" :size="22" aria-hidden="true" />
        <div class="tw:flex tw:items-center tw:gap-2 tw:min-w-0">
          <slot name="title">
            <h1 class="tw:truncate tw:text-section-title tw:font-bold tw:text-on-main">{{ title }}</h1>
          </slot>
          <slot name="status" />
        </div>
      </div>
      <div class="tw:shrink-0">
        <slot name="actions"><DetailActionBar :actions="actions" /></slot>
      </div>
    </div>
    <p v-if="isFull" class="tw:text-body tw:text-secondary">
      <slot name="meta" />
    </p>
  </header>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run resource/js/shared/components/DetailHeader.spec.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the story**

```js
// DetailHeader.stories.js
import DetailHeader from './DetailHeader.vue'
import { IconCheck } from '@tabler/icons-vue'

export default { title: 'Detail Page/DetailHeader', component: DetailHeader, tags: ['autodocs'] }

const actions = [{ id: 'approve', label: 'Approve', icon: IconCheck, variant: 'primary', priority: 100, onSelect: () => {} }]

export const Full = {
  render: () => ({
    components: { DetailHeader },
    setup: () => ({ actions }),
    template: `<DetailHeader title="Acme Corp" avatarName="Acme Corp" :actions="actions">
      <template #status><span class="tw:rounded-md tw:bg-green-100 tw:px-2 tw:py-0.5 tw:text-caption tw:text-green-700">Active</span></template>
      <template #meta>ACM-001 · Supplier · updated 2d ago</template>
    </DetailHeader>`,
  }),
}

export const Compact = {
  render: () => ({
    components: { DetailHeader },
    setup: () => ({ actions }),
    template: `<DetailHeader title="Finished Goods" variant="compact" :actions="actions" />`,
  }),
}
```

- [ ] **Step 6: Commit**

```bash
git add resource/js/shared/components/DetailHeader.vue resource/js/shared/components/DetailHeader.spec.js resource/js/shared/components/DetailHeader.stories.js
git commit -m "feat(ds): DetailHeader (identity row, full/compact, scroll-aware chrome)"
```

---

### Task 8: `BaseDetailLayout` — the L2 shell

**Files:**
- Create: `resource/js/shared/components/BaseDetailLayout.vue`
- Test: `resource/js/shared/components/BaseDetailLayout.spec.js`

**Interfaces:**
- Consumes: `BasePage`, `PageHeader`, `BaseBreadcrumbs`, `DetailHeader`, `DetailTabs`, `DetailRail`, `BaseSkeleton`, `BaseStatusState`, `useDetailLayout`.
- Produces: `<BaseDetailLayout>` public API per spec §8. Props: `title`, `icon`, `avatarName`, `breadcrumbs`, `actions` (ActionDescriptor[]), `tabs` (TabDescriptor[]), `railCards`, `rail` (Boolean, default = has `#rail`/`railCards`), `width` (default `standard`), `headerVariant` (default `full`), `loading`/`notFound`/`error`, `notFoundTitle`, `errorTitle`. `v-model:tab` for the active tab. Slots: `#title`, `#status`, `#meta`, `#actions`, `#rail`, `#tab-{value}`, `#default` (body when no tabs), `#loading`/`#notFound`/`#error`. All content slots receive `{ state, isMobile, activeTab }`.

- [ ] **Step 1: Write the failing test**

```js
// BaseDetailLayout.spec.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, h } from 'vue'
import BaseDetailLayout from './BaseDetailLayout.vue'

const RouterLinkStub = { name: 'RouterLink', props: ['to'], template: '<a><slot /></a>' }
function mountLayout(options = {}) {
  return mount(BaseDetailLayout, {
    attachTo: document.body,
    ...options,
    global: { stubs: { RouterLink: RouterLinkStub }, ...(options.global || {}) },
  })
}

describe('BaseDetailLayout', () => {
  let title, actions
  beforeEach(() => {
    title = Object.assign(document.createElement('div'), { id: 'main-header-title' })
    actions = Object.assign(document.createElement('div'), { id: 'main-header-actions' })
    document.body.append(title, actions)
  })
  afterEach(() => { title.remove(); actions.remove() })

  it('shows the layout skeleton while loading and hides the body', () => {
    const w = mountLayout({ props: { loading: true }, slots: { default: '<div data-test="body" />' } })
    expect(w.find('[data-test="body"]').exists()).toBe(false)
    expect(w.find('[data-test="detail-skeleton"]').exists()).toBe(true)
  })

  it('shows not-found state', () => {
    const w = mountLayout({ props: { notFound: true, notFoundTitle: 'No record' }, slots: { default: '<div data-test="body"/>' } })
    expect(w.find('[data-test="body"]').exists()).toBe(false)
    expect(w.text()).toContain('No record')
  })

  it('shows error state distinct from not-found', () => {
    const w = mountLayout({ props: { error: true, errorTitle: 'Load failed' }, slots: { default: '<div/>' } })
    expect(w.text()).toContain('Load failed')
  })

  it('renders body in default slot when no tabs', () => {
    const w = mountLayout({ props: { title: 'X' }, slots: { default: '<div data-test="body">B</div>' } })
    expect(w.find('[data-test="body"]').exists()).toBe(true)
  })

  it('renders the rail region when railCards provided', () => {
    const w = mountLayout({
      props: { title: 'X', railCards: [{ id: 'p', title: 'Properties', items: [{ label: 'Owner', value: 'Jane' }] }] },
      slots: { default: '<div/>' },
    })
    expect(w.find('aside[aria-label="Details"]').exists()).toBe(true)
    expect(w.text()).toContain('Properties')
  })

  it('omits the rail when rail=false', () => {
    const w = mountLayout({
      props: { title: 'X', rail: false, railCards: [{ id: 'p', title: 'Properties' }] },
      slots: { default: '<div/>' },
    })
    expect(w.find('aside[aria-label="Details"]').exists()).toBe(false)
  })

  it('teleports breadcrumbs into the app header', async () => {
    mountLayout({ props: { breadcrumbs: [{ label: 'Suppliers', to: '/s' }, { label: 'Acme' }] }, slots: { default: '<div/>' } })
    await nextTick(); await nextTick()
    expect(title.textContent).toContain('Suppliers')
    expect(title.textContent).toContain('Acme')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resource/js/shared/components/BaseDetailLayout.spec.js`
Expected: FAIL — cannot resolve `./BaseDetailLayout.vue`.

- [ ] **Step 3: Write minimal implementation**

```vue
<!-- BaseDetailLayout.vue -->
<script setup>
import { IconFileOff, IconAlertTriangle } from '@tabler/icons-vue'
// useDetailLayout is auto-imported (resource/js/shared/composables is in AutoImport.dirs).
const props = defineProps({
  title: { type: String, default: '' },
  icon: { type: [Object, Function], default: null },
  avatarName: { type: String, default: '' },
  breadcrumbs: { type: Array, default: null },
  actions: { type: Array, default: () => [] },
  tabs: { type: Array, default: () => [] },
  railCards: { type: Array, default: () => [] },
  rail: { type: Boolean, default: undefined },
  width: { type: String, default: 'standard', validator: (v) => ['narrow', 'standard', 'wide', 'full'].includes(v) },
  headerVariant: { type: String, default: 'full', validator: (v) => ['full', 'compact'].includes(v) },
  loading: { type: Boolean, default: false },
  notFound: { type: Boolean, default: false },
  error: { type: Boolean, default: false },
  notFoundTitle: { type: String, default: 'Not found' },
  notFoundDescription: { type: String, default: '' },
  errorTitle: { type: String, default: 'Something went wrong' },
  errorDescription: { type: String, default: '' },
})
const activeTab = defineModel('tab', { type: [String, Number], default: null })

const slots = useSlots()
const scrollEl = ref(null)
const { state, scrolled, isMobile } = useDetailLayout({
  loading: () => props.loading,
  notFound: () => props.notFound,
  error: () => props.error,
  actions: () => props.actions,
  scrollTarget: scrollEl,
})

const hasTabs = computed(() => props.tabs.some((t) => t.visible !== false))
const showRail = computed(() => {
  if (props.rail === false) return false
  if (props.rail === true) return true
  return !!slots.rail || props.railCards.length > 0
})
const slotState = computed(() => ({ state: state.value, isMobile: isMobile.value, activeTab: activeTab.value }))
</script>

<template>
  <BasePage :width="width" :fullHeight="true">
    <PageHeader :icon="breadcrumbs ? null : icon" :title="breadcrumbs ? '' : title">
      <template v-if="breadcrumbs" #title>
        <BaseBreadcrumbs :items="breadcrumbs" />
      </template>
    </PageHeader>

    <!-- Loading skeleton mirrors the layout -->
    <div v-if="state === 'loading'" data-test="detail-skeleton" class="tw:flex tw:flex-1 tw:min-h-0 tw:flex-col tw:gap-4 tw:py-4">
      <slot name="loading">
        <div class="tw:flex tw:items-center tw:gap-3">
          <BaseSkeleton variant="rect" width="40px" height="40px" rounded="tw:rounded-lg" />
          <BaseSkeleton width="240px" height="24px" />
        </div>
        <div class="tw:flex tw:gap-2"><BaseSkeleton width="90px" height="32px" /><BaseSkeleton width="90px" height="32px" /></div>
        <div class="tw:grid tw:grid-cols-[minmax(0,1fr)_340px] tw:gap-6 max-lg:tw:grid-cols-1">
          <BaseSkeleton :lines="6" />
          <div class="tw:flex tw:flex-col tw:gap-3"><BaseSkeleton :lines="3" /><BaseSkeleton :lines="3" /></div>
        </div>
      </slot>
    </div>

    <div v-else-if="state === 'notFound'" class="tw:flex tw:flex-1 tw:items-center tw:justify-center">
      <slot name="notFound">
        <BaseStatusState variant="notfound" :icon="IconFileOff" :title="notFoundTitle" :description="notFoundDescription || null" />
      </slot>
    </div>

    <div v-else-if="state === 'error'" class="tw:flex tw:flex-1 tw:items-center tw:justify-center">
      <slot name="error">
        <BaseStatusState variant="error" :icon="IconAlertTriangle" :title="errorTitle" :description="errorDescription || null" />
      </slot>
    </div>

    <!-- Ready: sticky header + tabs + 2-col body -->
    <div v-else ref="scrollEl" class="tw:flex tw:flex-1 tw:min-h-0 tw:flex-col tw:overflow-auto">
      <div class="tw:sticky tw:top-0 tw:z-raised tw:bg-main">
        <DetailHeader
          :title="title"
          :icon="icon"
          :avatarName="avatarName"
          :variant="headerVariant"
          :actions="actions"
          :scrolled="scrolled"
        >
          <template v-if="$slots.title" #title><slot name="title" v-bind="slotState" /></template>
          <template v-if="$slots.status" #status><slot name="status" v-bind="slotState" /></template>
          <template v-if="$slots.meta" #meta><slot name="meta" v-bind="slotState" /></template>
          <template v-if="$slots.actions" #actions><slot name="actions" v-bind="slotState" /></template>
        </DetailHeader>
      </div>

      <div
        class="tw:grid tw:gap-6 tw:py-4 max-lg:tw:grid-cols-1"
        :class="showRail ? 'tw:grid-cols-[minmax(0,1fr)_340px]' : 'tw:grid-cols-1'"
      >
        <div class="tw:min-w-0">
          <DetailTabs v-if="hasTabs" v-model="activeTab" :tabs="tabs" :ariaLabel="title || 'Sections'">
            <template v-for="t in tabs" :key="t.value" #[`tab-${t.value}`]>
              <slot :name="`tab-${t.value}`" v-bind="slotState" />
            </template>
          </DetailTabs>
          <slot v-else v-bind="slotState" />
        </div>

        <DetailRail v-if="showRail" :railCards="railCards" class="lg:tw:sticky lg:tw:top-20 lg:tw:self-start">
          <slot v-if="$slots.rail" name="rail" v-bind="slotState" />
        </DetailRail>
      </div>
    </div>
  </BasePage>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run resource/js/shared/components/BaseDetailLayout.spec.js`
Expected: PASS (8 tests). (`BaseSkeleton` variants are `text|rect|circle` and `rounded` takes a utility class string like `tw:rounded-lg` — both verified from source.) If the sticky `lg:tw:top-20` utility on the rail visually overlaps the header during the Task 11 review, replace it with an inline `:style="{ top: 'var(--detail-sticky-top)' }"` driven off the measured header height — a refinement, not a test failure.

- [ ] **Step 5: Run the layout linter (this shell is `PageHeader`-based, so it must pass `lint:layout`)**

Run: `npm run lint:layout`
Expected: PASS. If it flags `BaseDetailLayout.vue`, add it to the allowlist in `scripts/check-page-layout.mjs` ONLY if it legitimately owns its own width/structure (it wraps `BasePage`, so it should pass without allowlisting). Fix violations rather than allowlisting where possible.

- [ ] **Step 6: Commit**

```bash
git add resource/js/shared/components/BaseDetailLayout.vue resource/js/shared/components/BaseDetailLayout.spec.js
git commit -m "feat(ds): BaseDetailLayout L2 shell (header+tabs+rail+states, descriptor/slot/flag API)"
```

---

### Task 9: Storybook — fixtures + Anatomy + Supplier (standard) example

**Files:**
- Create: `resource/js/shared/components/detailLayout.fixtures.js` (mock data — no syncEngine)
- Create: `resource/js/shared/components/BaseDetailLayout.stories.js`

**Interfaces:**
- Consumes: `BaseDetailLayout` + all primitives. Produces the `Templates/Detail Page` story set; this task adds the `Anatomy` docs intro + `Supplier` standard-record story.

- [ ] **Step 1: Create fixtures (mock data through the slot/descriptor contract)**

```js
// detailLayout.fixtures.js
import { IconCheck, IconArchive, IconDownload, IconTrash, IconBuildingFactory2 } from '@tabler/icons-vue'

export const supplierActions = [
  { id: 'evaluate', label: 'Evaluate', icon: IconCheck, variant: 'primary', priority: 100, onSelect: () => {} },
  { id: 'archive', label: 'Archive', icon: IconArchive, priority: 60, onSelect: () => {} },
  { id: 'export', label: 'Export', icon: IconDownload, priority: 40, onSelect: () => {} },
  { id: 'delete', label: 'Delete', icon: IconTrash, variant: 'danger', priority: 10, onSelect: () => {} },
]

export const supplierTabs = [
  { value: 'overview', label: 'Overview' },
  { value: 'profile', label: 'Company Profile' },
  { value: 'locations', label: 'Locations', count: 4 },
  { value: 'documents', label: 'Documents', count: 12 },
  { value: 'evaluations', label: 'Evaluations', count: 3 },
  { value: 'activity', label: 'Activity' },
]

export const supplierRailCards = [
  { id: 'props', title: 'Properties', items: [
    { label: 'Owner', value: 'Jane Doe' }, { label: 'Status', value: 'Active' }, { label: 'Type', value: 'Manufacturer' },
  ] },
  { id: 'dates', title: 'Dates', items: [
    { label: 'Created', value: '12 Jun 2026' }, { label: 'Updated', value: '2d ago' }, { label: 'Next review', value: '12 Dec 2026' },
  ] },
  { id: 'related', title: 'Related', items: [
    { label: 'CAPAs', value: '2' }, { label: 'Non-conformances', value: '1' }, { label: 'Documents', value: '12' },
  ] },
]

export const supplierIcon = IconBuildingFactory2
```

- [ ] **Step 2: Create the story file with Anatomy + Supplier**

```js
// BaseDetailLayout.stories.js
import BaseDetailLayout from './BaseDetailLayout.vue'
import { ref } from 'vue'
import { supplierActions, supplierTabs, supplierRailCards, supplierIcon } from './detailLayout.fixtures.js'

export default {
  title: 'Templates/Detail Page',
  component: BaseDetailLayout,
  tags: ['autodocs'],
  parameters: {
    docs: { description: { component:
      'Configurable detail-page template (spec §3). One shell renders simple → complex entities via descriptors (actions/tabs), slots (content), and flags (structure). See the Simple / Supplier / CAPA stories for the complexity range.' } },
  },
}

export const Supplier = {
  name: 'Supplier — standard record',
  render: () => ({
    components: { BaseDetailLayout },
    setup() {
      const tab = ref('overview')
      return { tab, supplierActions, supplierTabs, supplierRailCards, supplierIcon }
    },
    template: `
      <div style="height: 640px">
        <BaseDetailLayout
          v-model:tab="tab"
          title="Acme Corp"
          avatarName="Acme Corp"
          :icon="supplierIcon"
          :actions="supplierActions"
          :tabs="supplierTabs"
          :railCards="supplierRailCards"
          :breadcrumbs="[{ label: 'Suppliers', to: '/suppliers' }, { label: 'Acme Corp' }]"
        >
          <template #status><span class="tw:rounded-md tw:bg-green-100 tw:px-2 tw:py-0.5 tw:text-caption tw:font-semibold tw:text-green-700">Active</span></template>
          <template #meta>ACM-001 · Manufacturer · updated 2d ago</template>
          <template #tab-overview><div class="tw:py-4 tw:text-body">Overview sections…</div></template>
          <template #tab-profile><div class="tw:py-4 tw:text-body">Company profile…</div></template>
          <template #tab-locations><div class="tw:py-4 tw:text-body">Locations table…</div></template>
          <template #tab-documents><div class="tw:py-4 tw:text-body">Documents table…</div></template>
          <template #tab-evaluations><div class="tw:py-4 tw:text-body">Evaluations…</div></template>
          <template #tab-activity><div class="tw:py-4 tw:text-body">Activity timeline + comments (later spec)…</div></template>
        </BaseDetailLayout>
      </div>`,
  }),
}
```

- [ ] **Step 3: Verify it renders in Storybook**

Run: `npm run build-storybook`
Expected: build completes green; `Templates/Detail Page` compiles. (Visual check happens in `npm run storybook` during review — note for the reviewer.)

- [ ] **Step 4: Commit**

```bash
git add resource/js/shared/components/detailLayout.fixtures.js resource/js/shared/components/BaseDetailLayout.stories.js
git commit -m "docs(ds): Detail Page story set — fixtures + Anatomy + Supplier standard record"
```

---

### Task 10: Storybook — Simple, CAPA, and raw-L3 stories (prove the anti-fork range)

**Files:**
- Modify: `resource/js/shared/components/BaseDetailLayout.stories.js` (append exports)
- Modify: `resource/js/shared/components/detailLayout.fixtures.js` (append CAPA fixtures)

**Interfaces:**
- Consumes Task 9 fixtures + the L3 primitives directly for the raw-composition story.

- [ ] **Step 1: Append CAPA fixtures to `detailLayout.fixtures.js`**

```js
// append to detailLayout.fixtures.js
import { IconShieldCheck, IconClipboardCheck, IconX } from '@tabler/icons-vue'

export const capaActions = [
  { id: 'approve', label: 'Approve', icon: IconShieldCheck, variant: 'primary', priority: 100, onSelect: () => {} },
  { id: 'reject', label: 'Reject', icon: IconX, variant: 'danger', priority: 90, onSelect: () => {} },
  { id: 'verify', label: 'Verify effectiveness', icon: IconClipboardCheck, priority: 50, onSelect: () => {} },
]
export const capaTabs = [
  { value: 'overview', label: 'Overview' },
  { value: 'rootcause', label: 'Root cause' },
  { value: 'actions', label: 'Actions', count: 5 },
  { value: 'verification', label: 'Verification', visible: () => true },
  { value: 'approvals', label: 'Approvals' },
  { value: 'activity', label: 'Activity' },
]
export const capaRailCards = [
  { id: 'props', title: 'Properties', items: [{ label: 'Owner', value: 'Sam Lee' }, { label: 'Priority', value: 'High' }, { label: 'Stage', value: 'Verification' }] },
  { id: 'approval', title: 'Approval', items: [{ label: 'Approver', value: 'QA Manager' }, { label: 'Status', value: 'Pending' }] },
  { id: 'dates', title: 'Dates', items: [{ label: 'Opened', value: '01 Jun 2026' }, { label: 'Due', value: '30 Jun 2026' }] },
]
```

- [ ] **Step 2: Append the Simple, CAPA, and L3 stories**

```js
// append to BaseDetailLayout.stories.js
import DetailHeader from './DetailHeader.vue'
import DetailRail from './DetailRail.vue'
import { capaActions, capaTabs, capaRailCards } from './detailLayout.fixtures.js'

export const SimpleEntity = {
  name: 'Simple entity — compact, no tabs/rail',
  render: () => ({
    components: { BaseDetailLayout },
    template: `
      <div style="height: 480px">
        <BaseDetailLayout title="Finished Goods" headerVariant="compact" :rail="false"
          :actions="[{ id: 'edit', label: 'Edit', variant: 'primary', priority: 9, onSelect: () => {} }]"
          :breadcrumbs="[{ label: 'Option Sets', to: '/option-sets' }, { label: 'Finished Goods' }]">
          <div class="tw:py-4 tw:text-body">A few read-only fields — no tabs, no rail. Same shell.</div>
        </BaseDetailLayout>
      </div>`,
  }),
}

export const CAPA = {
  name: 'CAPA — complex workflow',
  render: () => ({
    components: { BaseDetailLayout },
    setup() {
      const tab = ref('overview')
      return { tab, capaActions, capaTabs, capaRailCards }
    },
    template: `
      <div style="height: 640px">
        <BaseDetailLayout v-model:tab="tab" title="CAPA-2026-014" :actions="capaActions" :tabs="capaTabs" :railCards="capaRailCards"
          :breadcrumbs="[{ label: 'CAPAs', to: '/capas' }, { label: 'CAPA-2026-014' }]">
          <template #status><span class="tw:rounded-md tw:bg-amber-100 tw:px-2 tw:py-0.5 tw:text-caption tw:font-semibold tw:text-amber-700">Pending approval</span></template>
          <template #meta>High priority · opened 01 Jun 2026 · due 30 Jun 2026</template>
          <template #tab-overview><div class="tw:py-4 tw:text-body">Problem statement…</div></template>
          <template #tab-rootcause><div class="tw:py-4 tw:text-body">Root-cause analysis…</div></template>
          <template #tab-actions><div class="tw:py-4 tw:text-body">Corrective actions table…</div></template>
          <template #tab-verification><div class="tw:py-4 tw:text-body">Effectiveness verification…</div></template>
          <template #tab-approvals><div class="tw:py-4 tw:text-body">Approval chain…</div></template>
          <template #tab-activity><div class="tw:py-4 tw:text-body">Activity…</div></template>
        </BaseDetailLayout>
      </div>`,
  }),
}

export const RawL3Composition = {
  name: 'L3 primitives — escape hatch',
  render: () => ({
    components: { DetailHeader, DetailRail },
    setup: () => ({ capaActions, capaRailCards }),
    template: `
      <div class="tw:flex tw:flex-col tw:gap-4">
        <DetailHeader title="Custom arrangement" :actions="capaActions"><template #meta>Built from L3 primitives — no BaseDetailLayout</template></DetailHeader>
        <div class="tw:grid tw:grid-cols-[minmax(0,1fr)_340px] tw:gap-6 max-lg:tw:grid-cols-1">
          <div class="tw:text-body">Bespoke middle region.</div>
          <DetailRail :railCards="capaRailCards" />
        </div>
      </div>`,
  }),
}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build-storybook`
Expected: green; all four stories (Supplier, SimpleEntity, CAPA, RawL3Composition) compile.

- [ ] **Step 4: Commit**

```bash
git add resource/js/shared/components/BaseDetailLayout.stories.js resource/js/shared/components/detailLayout.fixtures.js
git commit -m "docs(ds): Detail Page stories — Simple, CAPA, and raw-L3 (proves no-fork range)"
```

---

### Task 11: Storybook — Variants, States, Responsive + a11y verification

**Files:**
- Modify: `resource/js/shared/components/BaseDetailLayout.stories.js` (append exports)

**Interfaces:**
- Consumes Task 9/10 fixtures.

- [ ] **Step 1: Append States + Variants + Responsive stories**

```js
// append to BaseDetailLayout.stories.js

export const Loading = {
  render: () => ({ components: { BaseDetailLayout },
    template: `<div style="height:640px"><BaseDetailLayout title="Loading…" :loading="true" /></div>` }),
}
export const NotFound = {
  render: () => ({ components: { BaseDetailLayout },
    template: `<div style="height:480px"><BaseDetailLayout :notFound="true" notFoundTitle="Supplier not found" /></div>` }),
}
export const ErrorState = {
  name: 'Error',
  render: () => ({ components: { BaseDetailLayout },
    template: `<div style="height:480px"><BaseDetailLayout :error="true" errorTitle="Couldn’t load this record" errorDescription="Try again in a moment." /></div>` }),
}
export const NoRail = {
  render: () => ({ components: { BaseDetailLayout },
    setup: () => ({ supplierTabs }),
    template: `<div style="height:640px"><BaseDetailLayout title="No rail" :tabs="supplierTabs" :rail="false">
      <template #tab-overview><div class="tw:py-4">Full-width content, no rail.</div></template>
    </BaseDetailLayout></div>` }),
}

// Mobile viewport — proves rail collapse + header compression
export const Mobile = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  render: () => ({ components: { BaseDetailLayout },
    setup: () => ({ supplierActions, supplierTabs, supplierRailCards }),
    template: `<div style="height:720px"><BaseDetailLayout title="Acme Corp" :actions="supplierActions" :tabs="supplierTabs" :railCards="supplierRailCards">
      <template #meta>ACM-001 · updated 2d ago</template>
      <template #tab-overview><div class="tw:py-4">Overview…</div></template>
    </BaseDetailLayout></div>` }),
}
```

Add the missing fixture import at the top of the file if not already present:

```js
import { supplierTabs } from './detailLayout.fixtures.js' // ensure included in the existing import line
```

- [ ] **Step 2: Verify the build**

Run: `npm run build-storybook`
Expected: green.

- [ ] **Step 3: Run the full unit suite + lint for the new surface**

Run: `npx vitest run resource/js/shared/components/Base{DetailLayout,RailCard}.spec.js resource/js/shared/components/Detail*.spec.js resource/js/shared/composables/{detailLayoutHelpers,useDetailLayout}.spec.js`
Expected: all PASS.

Run: `npm run lint`
Expected: PASS (eslint + lint:layout + lint:ds). Fix any flagged issues in the new files.

- [ ] **Step 4: Manual a11y + visual review note (run, don't assume)**

Run: `npm run storybook`
Then in the browser:
- Open `Templates/Detail Page → Supplier`. Tab through: action buttons reachable, tabs arrow-navigable, rail-card toggles operable by Enter/Space with visible focus rings.
- Open the **a11y addon** panel on Supplier, CAPA, Simple, Loading, NotFound, Error — confirm **no violations**.
- Resize / use the viewport addon (Mobile) — confirm the rail moves below content and the header compresses, with no horizontal scroll.

This is the human review gate (per project memory: verify by running, not just building). Capture a screenshot of Supplier desktop + mobile for the reviewer.

- [ ] **Step 5: Commit**

```bash
git add resource/js/shared/components/BaseDetailLayout.stories.js
git commit -m "docs(ds): Detail Page stories — states, no-rail variant, responsive (mobile)"
```

---

## Self-Review

**Spec coverage:**
- §3.1 three layers → L1 (Tasks 1–2), L3 primitives (Tasks 3–7), L2 (Task 8). ✅
- §3.2 governing rules (slots/descriptors/flags, everything optional, no entity vocab, scoped slots) → enforced in Task 8 API + Global Constraints. ✅
- §3.3 descriptor models → JSDoc preamble + Tasks 1/5/6. ✅
- §3.4 capability flags (`rail`/`density`/`width`/`headerVariant`/`stickyHeader`) → Task 8 props. ⚠️ `density`/`stickyHeader`/`stickyTabs` are declared in the spec but only `rail`/`width`/`headerVariant` are implemented in v1; `density` inherits ambiently and `sticky*` default true (always sticky). **Documented gap:** add `stickyHeader`/`stickyTabs` props + a `density` passthrough as a fast-follow if review wants them togglable — not blocking the anti-fork proof. Listed here so it isn't a silent omission.
- §3.5 complexity range → Stories: Simple (Task 10), Supplier (Task 9), CAPA (Task 10), raw-L3 (Task 10). ✅
- §4 anatomy zones → Task 8 template. ✅
- §5 states (loading skeleton/notFound/error/empty) → Task 8 + Task 11 stories. ✅
- §6 responsive → grid `max-lg:grid-cols-1` + Mobile story (Task 11). ⚠️ Tablet "stacks above as collapsible Details" is approximated by the single-column stack; the explicit "collapsible Details summary" affordance on tablet is **not** built in v1 — flagged for the reviewer, easy fast-follow on `DetailRail`.
- §8 component architecture + public API → Tasks 1–8. ✅
- §9 Storybook deliverable → Tasks 9–11. ✅
- §10 a11y checklist → component-level (button/aria-expanded/landmarks) + Task 11 manual gate. ✅

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". Each code step has full code, with no conditional branches — the four prop/alias facts that were open at draft time were verified against source and the code uses the confirmed values directly.

**Type consistency:** `resolveDetailState`/`bucketActions` signatures match between Task 1 (definition) and Task 2 (consumer). `ActionDescriptor`/`TabDescriptor`/`RailCardDescriptor` field names consistent across the JSDoc preamble, `DetailActionBar` (Task 5), `DetailTabs` (Task 6), `DetailRail` (Task 4), and `BaseDetailLayout` (Task 8). `v-model:tab` name consistent between Task 8 and the stories. `count → badge` mapping consistent (Task 6 + fixtures). `BaseStatusState` `notfound`/`error` variant strings match the component's validator (verified from source).

**Facts verified against source at plan time (no longer open):**
1. Composables in `resource/js/shared/composables/` are auto-imported (`AutoImport.dirs` in `vite.config.js`; `usePagination` used bare in `BasePagination.vue`) — `useDetailLayout` needs no import in components. Alias `@shared` → `resource/js/shared`.
2. `BaseSkeleton` variants = `text|rect|circle`; `rounded` takes a utility class string (`tw:rounded-lg`).
3. `BaseTabPanel` accepts `keepAlive` (default `false` = lazy).
4. `BaseButton` variants include `primary|danger|secondary|outline` — `:variant="a.variant"` binds directly.
