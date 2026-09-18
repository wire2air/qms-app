<script setup>
/** @deprecated Use BaseDetailLayout instead — it supersedes this shell (SP-1). */
/**
 * BaseDetailPage — the detail (*PageId.vue) page shell. Wraps the
 *   <BasePage fullHeight><PageHeader>(breadcrumbs + actions)</PageHeader>
 *     <div v-if="loading">spinner</div>
 *     <div v-else-if="!entity">not found</div>
 *     <div v-else class="…overflow-auto">content</div>
 *   </BasePage>
 * scaffold that all 30+ detail pages hand-roll, so a detail page declares only
 * its breadcrumbs, actions, and body:
 *
 *   <BaseDetailPage :breadcrumbs="breadcrumbs" :loading="loading" :notFound="!cr"
 *                   notFoundTitle="Change request not found">
 *     <template #actions><BaseButton>Submit</BaseButton></template>
 *     <ChangeRequestBody :id="id" />
 *   </BaseDetailPage>
 *
 * The header teleports into the app bar via PageHeader; pass `breadcrumbs` for
 * the standard breadcrumb title, or `title`/`icon` for a plain title. By default
 * the body owns an internal scroll region (`fullHeight`) so any sticky toolbars
 * stay put; set `fullHeight=false` to let the whole page scroll.
 *
 * Icons are NOT auto-imported — pass the imported component: `:icon="IconFile"`.
 */
import { IconFileOff } from '@tabler/icons-vue'

const props = defineProps({
  title: { type: String, default: '' },
  // A @tabler/icons-vue component, imported by the consumer.
  icon: { type: [Object, Function], default: null },
  iconSize: { type: Number, default: 22 },
  // BaseBreadcrumbs items; when set, renders the breadcrumb trail as the title.
  breadcrumbs: { type: Array, default: null },
  // BasePage width tier.
  width: {
    type: String,
    default: 'standard',
    validator: (v) => ['standard', 'wide', 'narrow', 'full'].includes(v),
  },
  // Body owns an internal scroll region (the detail-page default). false → the
  // whole page scrolls.
  fullHeight: { type: Boolean, default: true },
  // Content states.
  loading: { type: Boolean, default: false },
  notFound: { type: Boolean, default: false },
  // Built-in not-found copy (override entirely with the #notFound slot).
  notFoundTitle: { type: String, default: 'Not found' },
  notFoundDescription: { type: String, default: '' },
  notFoundIcon: { type: [Object, Function], default: () => IconFileOff },
})

onMounted(() => {
  if (import.meta.env?.DEV) {
    console.warn('[deprecation] BaseDetailPage is deprecated; migrate to BaseDetailLayout (see docs/superpowers/specs/2026-06-22-detail-template-core-config-design.md).')
  }
})

const slots = useSlots()
// Render the PageHeader #title slot only when we own the title content
// (breadcrumbs or an explicit slot); otherwise let PageHeader render `title`.
const hasTitleSlot = computed(() => !!props.breadcrumbs || !!slots.title)
</script>

<template>
  <BasePage :width="width" :fullHeight="fullHeight">
    <PageHeader :icon="icon" :title="title" :iconSize="iconSize">
      <template v-if="hasTitleSlot" #title>
        <slot name="title">
          <BaseBreadcrumbs v-if="breadcrumbs" :items="breadcrumbs" />
        </slot>
      </template>
      <template v-if="$slots.actions" #actions><slot name="actions" /></template>
    </PageHeader>

    <div
      v-if="loading"
      class="tw:flex tw:items-center tw:justify-center"
      :class="fullHeight ? 'tw:h-full' : 'tw:py-12'"
    >
      <slot name="loading"><BaseSpinner size="md" /></slot>
    </div>

    <div
      v-else-if="notFound"
      :class="fullHeight && 'tw:flex tw:h-full tw:items-center tw:justify-center'"
    >
      <slot name="notFound">
        <BaseEmptyState
          :icon="notFoundIcon"
          :title="notFoundTitle"
          :description="notFoundDescription || null"
        />
      </slot>
    </div>

    <div v-else :class="fullHeight && 'tw:flex-1 tw:min-h-0 tw:overflow-auto'">
      <slot />
    </div>
  </BasePage>
</template>
