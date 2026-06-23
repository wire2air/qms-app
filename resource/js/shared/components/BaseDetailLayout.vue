<!-- BaseDetailLayout.vue -->
<script setup>
import { IconFileOff, IconAlertTriangle } from '@tabler/icons-vue'
import { normalizeDetailConfig } from '../composables/defineDetailConfig.js'
import { morphHeaderVariant } from '../composables/detailVariantHelpers.js'
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
  variant: { type: String, default: 'standard' },
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

const effVariant = computed(() => cfg.value?.variant ?? props.variant)
const effSections = computed(() => cfg.value?.sections ?? [])
const visibleSections = computed(() => effSections.value.filter((s) => s.visible !== false))

const slots = useSlots()
const scrollEl = ref(null)
const { state, scrolled, isMobile, variantDescriptor } = useDetailLayout({
  loading: () => props.loading,
  notFound: () => props.notFound,
  error: () => props.error,
  actions: () => effActions.value,
  variant: () => effVariant.value,
  sections: () => effSections.value,
  tabs: () => effTabs.value,
  scrollTarget: scrollEl,
})

const vd = variantDescriptor // computed { showBreadcrumbs, stickyHeader, showNav, showRail, columns, editable, linearized, stub }
const effHeaderVariantMorphed = computed(() =>
  vd.value.stickyHeader ? morphHeaderVariant(effHeaderVariant.value, scrolled.value) : effHeaderVariant.value,
)
const hasTabs = computed(() => effTabs.value.some((t) => t.visible !== false))
const showRail = computed(() => {
  if (props.rail === false) return false
  if (props.rail === true) return true
  return !!slots.rail || effRailCards.value.length > 0
})
const showRailFinal = computed(() => {
  if (!vd.value.showRail) return false
  if (props.rail === false) return false
  return showRail.value || (aiEnabled.value && !!slots['ai-summary']) || versionEnabled.value
})
const twoCol = computed(() => vd.value.columns === 2 && showRailFinal.value)
const aiEnabled = computed(() => cfg.value?.ai?.enabled === true)
const versionEnabled = computed(() => cfg.value?.version?.enabled === true)

// scrollspy for anchor sections (guarded for jsdom)
const activeSectionId = ref('')
let observer = null
function setupSpy() {
  if (observer) { observer.disconnect(); observer = null }
  if (typeof IntersectionObserver === 'undefined' || !visibleSections.value.length) return
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible[0]) activeSectionId.value = visible[0].target.id.replace('section-', '')
    },
    { root: scrollEl.value, rootMargin: '-20% 0px -70% 0px', threshold: 0 },
  )
  visibleSections.value.forEach((s) => {
    const el = scrollEl.value?.querySelector(`#section-${s.id}`)
    if (el) observer.observe(el)
  })
}
onMounted(setupSpy)
watch([effSections, () => state.value], () => nextTick(setupSpy))
onBeforeUnmount(() => observer?.disconnect())

const slotState = computed(() => ({
  state: state.value,
  isMobile: isMobile.value,
  activeTab: activeTab.value,
  variant: vd.value.variant,
  editable: vd.value.editable,
}))
</script>

<template>
  <BasePage :width="effWidth" :fullHeight="true">
    <PageHeader
      :icon="effBreadcrumbs && vd.showBreadcrumbs ? null : effIcon"
      :title="effBreadcrumbs && vd.showBreadcrumbs ? '' : effTitle"
    >
      <template v-if="effBreadcrumbs && vd.showBreadcrumbs" #title>
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
    <!-- --detail-header-offset is the single sticky-offset source (spec §5.1); nav top and section scroll-margin derive from it.
         A fully dynamic measured value is a deferred refinement for the SP-6 page integration. -->
    <div v-else ref="scrollEl" class="tw:flex tw:flex-1 tw:min-h-0 tw:flex-col tw:overflow-auto" style="--detail-header-offset: 4rem">
      <div :class="vd.stickyHeader ? 'tw:sticky tw:top-0 tw:z-raised tw:bg-main' : 'tw:bg-main'">
        <DetailHeader
          :title="effTitle"
          :icon="effIcon"
          :avatarName="effAvatarName"
          :variant="effHeaderVariantMorphed"
          :actions="effActions"
          :scrolled="scrolled"
        >
          <template v-if="$slots.title" #title><slot name="title" v-bind="slotState" /></template>
          <template v-if="$slots.status" #status><slot name="status" v-bind="slotState" /></template>
          <template v-if="$slots.meta" #meta><slot name="meta" v-bind="slotState" /></template>
          <template v-if="$slots.actions" #actions><slot name="actions" v-bind="slotState" /></template>
        </DetailHeader>
      </div>

      <div v-if="vd.stub" data-test="variant-stub" class="tw:rounded-md tw:border tw:border-dashed tw:border-amber-300 tw:bg-amber-50 tw:px-3 tw:py-1.5 tw:text-caption tw:text-amber-800">
        Variant "{{ vd.variant }}" is not yet implemented — rendering the standard layout.
      </div>

      <BaseBannerRegion v-if="banners.length" :banners="banners" />

      <div
        class="tw:grid tw:gap-6 tw:py-4 tw:max-lg:grid-cols-1"
        :class="twoCol ? 'tw:grid-cols-[minmax(0,1fr)_340px]' : 'tw:grid-cols-1'"
      >
        <div class="tw:min-w-0">
          <template v-if="vd.showNav && visibleSections.length">
            <DetailAnchorNav v-if="visibleSections.length > 1" :sections="visibleSections" :activeId="activeSectionId" class="tw:sticky tw:top-[var(--detail-header-offset)] tw:z-raised tw:bg-main" />
            <section
              v-for="s in visibleSections"
              :id="`section-${s.id}`"
              :key="s.id"
              class="tw:scroll-mt-[calc(var(--detail-header-offset)+3rem)] tw:py-4"
            >
              <slot :name="`section-${s.id}`" v-bind="slotState" />
            </section>
          </template>
          <DetailTabs v-if="vd.showNav && hasTabs" v-model="activeTab" :tabs="effTabs" :ariaLabel="effTitle || 'Sections'">
            <template v-for="t in effTabs" :key="t.value" #[`tab-${t.value}`]>
              <slot :name="`tab-${t.value}`" v-bind="slotState" />
            </template>
          </DetailTabs>
          <slot v-else v-bind="slotState" />
          <div v-if="aiEnabled && $slots['ai-panel']" class="tw:mt-4"><slot name="ai-panel" v-bind="slotState" /></div>
        </div>

        <!-- Finding 1: print variant is linearized; rail must not be sticky in that case -->
        <DetailRail v-if="showRailFinal" :railCards="effRailCards" :class="vd.linearized ? '' : 'tw:lg:sticky tw:lg:top-20 tw:lg:self-start'">
          <template v-if="$slots.rail || aiEnabled || versionEnabled" #default>
            <BaseRailCard v-if="aiEnabled && $slots['ai-summary']" title="AI Summary">
              <slot name="ai-summary" v-bind="slotState" />
            </BaseRailCard>
            <BaseRailCard v-if="versionEnabled" title="Version" data-test="version-card">
              <slot name="version-summary" v-bind="slotState"><span class="tw:text-secondary tw:text-body">—</span></slot>
            </BaseRailCard>
            <slot v-if="$slots.rail" name="rail" v-bind="slotState" />
          </template>
        </DetailRail>
      </div>
    </div>
  </BasePage>
</template>
