<script setup>
/**
 * BaseListLayout — the list/index page shell (Enterprise Page Framework A3 / L2).
 * Generalizes BaseListPage: pairs with the `useListLayout` composable to wire
 * the whole scaffold a collection page needs —
 *   header (teleported) · stats · filter bar · quick-filter pills ·
 *   selection-aware bulk-action bar · a state-driven content region
 *   (loading skeleton / error / empty / the table) — so a list page declares
 *   only its filters, columns, and actions.
 *
 *   const list = useListLayout({ filters: { search: '' }, total: () => rows.value.length,
 *     loading: () => rows.value === undefined, empty: () => rows.value?.length === 0, syncUrl: true })
 *
 *   <BaseListLayout title="Documents" :icon="IconFileDescription" :state="list.state.value"
 *                   :selectedCount="list.selectedCount.value">
 *     <template #actions><BaseButton @click="create">New</BaseButton></template>
 *     <template #filters><BaseFilterBar v-model:search="list.filters.value.search">…</BaseFilterBar></template>
 *     <template #bulk-actions="{ count }"><BaseButton @click="archive">Archive {{ count }}</BaseButton></template>
 *     <DocumentsTable v-model:pagination="list.pagination.value" v-model:selected="list.selected.value" :rows="rows" />
 *   </BaseListLayout>
 *
 * `state` is the single source of truth (pass `list.state.value`); if omitted it
 * is resolved from the `loading`/`error`/`empty` boolean props. Stats / filters /
 * quick-filters stay visible across every state so users can adjust the filters
 * that produced an empty result. Icons are NOT auto-imported — pass the component.
 */
import { IconSearchOff, IconAlertTriangle } from '@tabler/icons-vue'
import { resolveListState } from '../composables/listLayoutHelpers.js'
// Explicit import — the dynamic <component :is> root needs the real component
// object; resolveComponent('BasePage') can't see compile-time auto-imports and
// silently rendered a meaningless <basepage> element (every list page lost its
// width constraint — user-reported 2026-07-27).
import BasePage from './BasePage.vue'

const props = defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  icon: { type: [Object, Function], default: null },
  width: {
    type: String,
    default: 'standard',
    validator: (v) => ['standard', 'wide', 'narrow', 'full'].includes(v),
  },
  fullHeight: { type: Boolean, default: false },
  // Embedded mode: render inside a host surface (e.g. a tab panel) — plain div
  // root instead of BasePage, and a slim subtitle+actions row instead of the
  // teleporting PageHeader (the host page owns the real header).
  embedded: { type: Boolean, default: false },
  // Preferred: pass the composable's resolved state. When null, resolved from the flags below.
  state: {
    type: String,
    default: null,
    validator: (v) => v === null || ['loading', 'error', 'empty', 'ready'].includes(v),
  },
  loading: { type: Boolean, default: false },
  error: { type: Boolean, default: false },
  empty: { type: Boolean, default: false },
  // Selection-aware bulk bar appears when > 0.
  selectedCount: { type: Number, default: 0 },
  // State copy (override entirely with the matching slot).
  emptyTitle: { type: String, default: 'No results found' },
  emptyDescription: { type: String, default: '' },
  emptyIcon: { type: [Object, Function], default: () => IconSearchOff },
  errorTitle: { type: String, default: 'Something went wrong' },
  errorDescription: { type: String, default: '' },
})

const resolvedState = computed(
  () =>
    props.state ??
    resolveListState({ loading: props.loading, error: props.error, empty: props.empty }),
)

// Dynamic root: BasePage normally, a plain column when embedded in a host.
const rootIs = computed(() => (props.embedded ? 'div' : BasePage))
const rootProps = computed(() =>
  props.embedded
    ? { class: 'tw:flex tw:flex-col tw:gap-4' }
    : { width: props.width, fullHeight: props.fullHeight },
)
</script>

<template>
  <component :is="rootIs" v-bind="rootProps">
    <PageHeader v-if="!embedded" :icon="icon" :title="title" :subtitle="subtitle">
      <template v-if="$slots.title" #title><slot name="title" /></template>
      <template v-if="$slots.actions" #actions><slot name="actions" /></template>
    </PageHeader>
    <div v-else class="tw:flex tw:items-start tw:justify-between tw:gap-3">
      <span v-if="subtitle" class="tw:text-xs tw:text-secondary tw:max-w-2xl">{{ subtitle }}</span>
      <span v-else />
      <div class="tw:flex tw:items-center tw:gap-2 tw:shrink-0"><slot name="actions" /></div>
    </div>

    <slot name="stats" />
    <slot name="filters" />
    <slot name="quick-filters" />

    <!-- Bulk-action bar: appears on selection -->
    <div
      v-if="selectedCount > 0"
      role="toolbar"
      aria-label="Bulk actions"
      class="tw:sticky tw:top-0 tw:z-raised tw:flex tw:flex-wrap tw:items-center tw:gap-3 tw:rounded-lg tw:border tw:border-primary/20 tw:bg-main-selected tw:px-3 tw:py-2"
    >
      <span class="tw:text-body tw:font-semibold tw:text-on-main">
        {{ selectedCount }} selected
      </span>
      <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
        <slot name="bulk-actions" :count="selectedCount" />
      </div>
    </div>

    <!-- Content region, swapped by state -->
    <div
      v-if="resolvedState === 'loading'"
      data-test="list-skeleton"
      class="tw:flex tw:flex-col tw:gap-3 tw:py-2"
    >
      <slot name="loading">
        <BaseSkeleton v-for="n in 6" :key="n" variant="rect" height="44px" rounded="tw:rounded-lg" />
      </slot>
    </div>

    <div
      v-else-if="resolvedState === 'error'"
      class="tw:flex tw:flex-1 tw:items-center tw:justify-center tw:py-12"
    >
      <slot name="error">
        <BaseStatusState
          variant="error"
          :icon="IconAlertTriangle"
          :title="errorTitle"
          :description="errorDescription || null"
        >
          <template v-if="$slots['error-action']" #action><slot name="error-action" /></template>
        </BaseStatusState>
      </slot>
    </div>

    <div
      v-else-if="resolvedState === 'empty'"
      class="tw:flex tw:flex-1 tw:items-center tw:justify-center tw:py-12"
    >
      <slot name="empty">
        <BaseStatusState
          variant="empty"
          :icon="emptyIcon"
          :title="emptyTitle"
          :description="emptyDescription || null"
        >
          <template v-if="$slots['empty-action']" #action><slot name="empty-action" /></template>
        </BaseStatusState>
      </slot>
    </div>

    <slot v-else :state="resolvedState" />
  </component>
</template>
