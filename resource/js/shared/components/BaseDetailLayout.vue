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
        <div class="tw:grid tw:grid-cols-[minmax(0,1fr)_340px] tw:gap-6 tw:max-lg:grid-cols-1">
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
        class="tw:grid tw:gap-6 tw:py-4 tw:max-lg:grid-cols-1"
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

        <DetailRail v-if="showRail" :railCards="railCards" class="tw:lg:sticky tw:lg:top-20 tw:lg:self-start">
          <template v-if="$slots.rail" #default><slot name="rail" v-bind="slotState" /></template>
        </DetailRail>
      </div>
    </div>
  </BasePage>
</template>
