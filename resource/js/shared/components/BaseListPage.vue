<script setup>
/**
 * BaseListPage — the list/index page shell. Wraps the
 *   <BasePage><PageHeader/>…<filter bar>…<table></BasePage>
 * scaffold that all 39+ *Home.vue pages hand-roll, so a list page declares only
 * its title, filters, and table:
 *
 *   <BaseListPage title="Documents" :icon="IconFileDescription" subtitle="…"
 *                 :loading="docs === undefined" :empty="docs.length === 0"
 *                 emptyTitle="No documents yet">
 *     <template #actions><BaseButton @click="create">Create</BaseButton></template>
 *     <template #stats><DocumentsStatsCards … /></template>
 *     <template #filters><DocumentsFilterToolbar v-model:filters="filters" /></template>
 *     <DocumentsTable :rows="docs" />
 *   </BaseListPage>
 *
 * The header (title/actions) teleports into the app bar via PageHeader. #stats
 * and #filters stay visible while the content region swaps between loading,
 * empty, and the default slot. `loading`/`empty` are opt-in — omit them and the
 * default slot always renders (the table owns its own loading/empty).
 *
 * Icons are NOT auto-imported — pass the imported component: `:icon="IconUsers"`.
 */
import { IconSearchOff } from '@tabler/icons-vue'

defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  // A @tabler/icons-vue component, imported by the consumer.
  icon: { type: [Object, Function], default: null },
  // BasePage width tier.
  width: {
    type: String,
    default: 'standard',
    validator: (v) => ['standard', 'wide', 'narrow', 'full'].includes(v),
  },
  // Opt-in content states. When neither is set, the default slot always renders.
  loading: { type: Boolean, default: false },
  empty: { type: Boolean, default: false },
  // Built-in empty-state copy (override entirely with the #empty slot).
  emptyTitle: { type: String, default: 'No results found' },
  emptyDescription: { type: String, default: '' },
  emptyIcon: { type: [Object, Function], default: () => IconSearchOff },
})
</script>

<template>
  <BasePage :width="width">
    <PageHeader :icon="icon" :title="title" :subtitle="subtitle">
      <template v-if="$slots.title" #title><slot name="title" /></template>
      <template v-if="$slots.actions" #actions><slot name="actions" /></template>
    </PageHeader>

    <slot name="stats" />
    <slot name="filters" />

    <div v-if="loading" class="tw:flex tw:items-center tw:justify-center tw:py-12">
      <slot name="loading"><BaseSpinner size="md" /></slot>
    </div>
    <slot v-else-if="empty" name="empty">
      <BaseEmptyState :icon="emptyIcon" :title="emptyTitle" :description="emptyDescription || null" />
    </slot>
    <slot v-else />
  </BasePage>
</template>
