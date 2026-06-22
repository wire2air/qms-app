<!-- BaseDetailLayout.vue -->
<script setup>
import { IconFileOff, IconAlertTriangle } from '@tabler/icons-vue'
import { normalizeDetailConfig } from '../composables/defineDetailConfig.js'
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
  config: { type: Object, default: null },
  record: { type: Object, default: null },
})
const activeTab = defineModel('tab', { type: [String, Number], default: null })

const cfg = computed(() => (props.config ? normalizeDetailConfig(props.config).config : null))
const headerData = computed(() => (cfg.value ? cfg.value.header(props.record) || {} : {}))

// config wins over discrete props
const effTitle = computed(() => headerData.value.title ?? props.title)
const effIcon = computed(() => headerData.value.icon ?? props.icon)
const effAvatarName = computed(() => headerData.value.avatarName ?? props.avatarName)
const effBreadcrumbs = computed(() =>
  cfg.value ? cfg.value.breadcrumbs(props.record) ?? props.breadcrumbs : props.breadcrumbs,
)
const effActions = computed(() => cfg.value?.actions?.length ? cfg.value.actions : props.actions)
const effTabs = computed(() => (cfg.value?.tabs?.length ? cfg.value.tabs : props.tabs))
const effRailCards = computed(() => (cfg.value?.railCards?.length ? cfg.value.railCards : props.railCards))
const effHeaderVariant = computed(() => cfg.value?.headerVariant ?? props.headerVariant)
const effWidth = computed(() => cfg.value?.width ?? props.width)
const banners = computed(() => (cfg.value ? cfg.value.banners(props.record) : []))

const slots = useSlots()
const scrollEl = ref(null)
const { state, scrolled, isMobile } = useDetailLayout({
  loading: () => props.loading,
  notFound: () => props.notFound,
  error: () => props.error,
  actions: () => effActions.value,
  scrollTarget: scrollEl,
})

const hasTabs = computed(() => effTabs.value.some((t) => t.visible !== false))
const showRail = computed(() => {
  if (props.rail === false) return false
  if (props.rail === true) return true
  return !!slots.rail || effRailCards.value.length > 0
})
const slotState = computed(() => ({ state: state.value, isMobile: isMobile.value, activeTab: activeTab.value }))
</script>

<template>
  <BasePage :width="effWidth" :fullHeight="true">
    <PageHeader :icon="effBreadcrumbs ? null : effIcon" :title="effBreadcrumbs ? '' : effTitle">
      <template v-if="effBreadcrumbs" #title>
        <BaseBreadcrumbs :items="effBreadcrumbs" />
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
          :title="effTitle"
          :icon="effIcon"
          :avatarName="effAvatarName"
          :variant="effHeaderVariant"
          :actions="effActions"
          :scrolled="scrolled"
        >
          <template v-if="$slots.title" #title><slot name="title" v-bind="slotState" /></template>
          <template v-if="$slots.status" #status><slot name="status" v-bind="slotState" /></template>
          <template v-if="$slots.meta" #meta><slot name="meta" v-bind="slotState" /></template>
          <template v-if="$slots.actions" #actions><slot name="actions" v-bind="slotState" /></template>
        </DetailHeader>
      </div>

      <BaseBannerRegion v-if="banners.length" :banners="banners" />

      <div
        class="tw:grid tw:gap-6 tw:py-4 tw:max-lg:grid-cols-1"
        :class="showRail ? 'tw:grid-cols-[minmax(0,1fr)_340px]' : 'tw:grid-cols-1'"
      >
        <div class="tw:min-w-0">
          <DetailTabs v-if="hasTabs" v-model="activeTab" :tabs="effTabs" :ariaLabel="effTitle || 'Sections'">
            <template v-for="t in effTabs" :key="t.value" #[`tab-${t.value}`]>
              <slot :name="`tab-${t.value}`" v-bind="slotState" />
            </template>
          </DetailTabs>
          <slot v-else v-bind="slotState" />
        </div>

        <DetailRail v-if="showRail" :railCards="effRailCards" class="tw:lg:sticky tw:lg:top-20 tw:lg:self-start">
          <template v-if="$slots.rail" #default><slot name="rail" v-bind="slotState" /></template>
        </DetailRail>
      </div>
    </div>
  </BasePage>
</template>
