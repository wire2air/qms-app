<script setup>
/**
 * Reading view for one doc: breadcrumbs + meta bar, three-pane layout
 * (pack nav / article / ToC rail), reading-progress bar, prev/next footer,
 * scroll-spy, pin toggle, and a superseded banner where the corpus says so.
 */
import {
  IconChevronLeft,
  IconChevronRight,
  IconStar,
  IconStarFilled,
  IconLink,
  IconSearch,
} from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const props = defineProps({
  docId: { type: String, required: true },
})

const {
  docsById,
  modulesBySlug,
  navigationFor,
  trackVisit,
  isFavorite,
  toggleFavorite,
  cycleLabel,
  openSearch,
} = useInternalDocs()

const toast = useToast()

async function copyPageLink() {
  try {
    await navigator.clipboard.writeText(location.href)
    toast.success('Page link copied')
  } catch {
    toast.error('Could not copy to clipboard')
  }
}

const doc = computed(() => docsById.value.get(props.docId))
const module = computed(() => (doc.value?.moduleSlug ? modulesBySlug.value.get(doc.value.moduleSlug) : null))
const nav = computed(() => navigationFor(props.docId))
const pinned = computed(() => isFavorite(props.docId))

const supersededByPack = computed(() => {
  if (doc.value?.flat && doc.value.supersededBy) return doc.value.supersededBy
  if (doc.value?.superseded) return doc.value.moduleSlug
  return null
})

watch(
  () => props.docId,
  (id) => {
    if (docsById.value.has(id)) trackVisit(id)
  },
  { immediate: true },
)

// ── ToC + scroll spy ────────────────────────────────────────────────────────
const toc = ref([])
const activeHeadingId = ref(null)
const articleRef = ref(null)
let observer = null

function onToc(items) {
  toc.value = items
  activeHeadingId.value = items[0]?.id ?? null
  observer?.disconnect()
  if (!items.length) return
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) activeHeadingId.value = entry.target.id
      }
    },
    { rootMargin: '-80px 0px -70% 0px' },
  )
  for (const item of items) {
    const el = document.getElementById(item.id)
    if (el) observer.observe(el)
  }
}

onBeforeUnmount(() => observer?.disconnect())

function jumpTo(id) {
  articleRef.value?.scrollToId(id)
  history.replaceState(history.state, '', `#${id}`)
}

// ── Reading progress (whole-page scroll) ────────────────────────────────────
const { y: scrollY } = useWindowScroll()
const progress = computed(() => {
  const total = document.documentElement.scrollHeight - window.innerHeight
  if (total <= 0) return 0
  return Math.min(100, Math.round((scrollY.value / total) * 100))
})
</script>

<template>
  <div v-if="doc" class="tw:relative">
    <!-- Reading progress -->
    <div
      class="tw:fixed tw:left-0 tw:top-0 tw:z-sticky tw:h-0.5 tw:transition-[width]"
      :style="{ width: `${progress}%`, background: 'var(--color-primary, #2563eb)' }"
      aria-hidden="true"
    />

    <div
      class="tw:grid tw:grid-cols-1 tw:gap-8 tw:lg:grid-cols-[230px_minmax(0,1fr)] tw:xl:grid-cols-[230px_minmax(0,1fr)_220px]"
    >
      <!-- Pack nav -->
      <aside v-if="module" class="tw:hidden tw:lg:block">
        <div class="tw:sticky tw:top-20 tw:max-h-[calc(100vh-6rem)] tw:overflow-y-auto tw:pr-2">
          <DocsSidebarNav :moduleSlug="module.slug" :activeId="docId" />
        </div>
      </aside>
      <aside v-else class="tw:hidden tw:lg:block" />

      <!-- Article -->
      <div class="tw:min-w-0">
        <!-- Breadcrumbs + meta -->
        <div class="tw:mb-4 tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:text-caption tw:text-secondary">
          <RouterLink :to="getCompanyPath('/docs')" class="tw:no-underline tw:hover:text-primary">
            Internal Docs
          </RouterLink>
          <template v-if="module">
            <span>/</span>
            <RouterLink
              :to="getCompanyPath(`/docs/${module.slug}`)"
              class="tw:no-underline tw:hover:text-primary"
            >
              {{ module.name }}
            </RouterLink>
          </template>
          <span>/</span>
          <span class="tw:text-on-main">{{ doc.title }}</span>

          <span class="tw:mx-1">·</span>
          <span v-if="module?.cycle">verified {{ cycleLabel(module.cycle) }}</span>
          <span v-else-if="doc.flat">{{ doc.category }}</span>

          <div class="tw:ml-auto tw:flex tw:items-center tw:gap-1">
            <button
              type="button"
              class="tw:flex tw:items-center tw:gap-1 tw:rounded-md tw:px-2 tw:py-1 tw:text-secondary tw:transition-colors tw:hover:bg-main-hover tw:hover:text-on-main"
              aria-label="Copy link to this doc"
              @click="copyPageLink"
            >
              <IconLink :size="15" /> Copy link
            </button>
            <button
              type="button"
              class="tw:flex tw:items-center tw:gap-1 tw:rounded-md tw:px-2 tw:py-1 tw:text-secondary tw:transition-colors tw:hover:bg-main-hover tw:hover:text-on-main"
              aria-label="Search internal docs"
              @click="openSearch"
            >
              <IconSearch :size="15" /> Search
            </button>
            <button
              type="button"
              class="tw:flex tw:items-center tw:gap-1 tw:rounded-md tw:px-2 tw:py-1 tw:transition-colors tw:hover:bg-main-hover"
              :class="pinned ? 'tw:text-warn' : 'tw:text-secondary'"
              :aria-label="pinned ? 'Unpin this doc' : 'Pin this doc'"
              @click="toggleFavorite(docId)"
            >
              <component :is="pinned ? IconStarFilled : IconStar" :size="15" />
              {{ pinned ? 'Pinned' : 'Pin' }}
            </button>
          </div>
        </div>

        <!-- Superseded banner -->
        <div
          v-if="supersededByPack"
          class="tw:mb-4 tw:rounded-lg tw:border tw:border-amber-300 tw:bg-amber-50 tw:px-4 tw:py-2.5 tw:text-sm tw:text-amber-800 tw:dark:border-amber-800 tw:dark:bg-amber-950 tw:dark:text-amber-200"
        >
          This document is superseded —
          <RouterLink
            :to="getCompanyPath(`/docs/${supersededByPack}`)"
            class="tw:font-medium tw:underline"
          >
            read the current {{ modulesBySlug.get(supersededByPack)?.name ?? supersededByPack }} pack
          </RouterLink>
          instead.
        </div>

        <DocsMarkdownArticle ref="articleRef" :docId="docId" @toc="onToc" />

        <!-- Prev / next -->
        <div
          v-if="nav.prev || nav.next"
          class="tw:mt-10 tw:flex tw:items-stretch tw:justify-between tw:gap-4 tw:border-t tw:border-divider tw:pt-5"
        >
          <RouterLink
            v-if="nav.prev"
            :to="getCompanyPath(`/docs/${nav.prev.id}`)"
            class="tw:flex tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-divider tw:px-4 tw:py-2.5 tw:text-sm tw:text-on-main tw:no-underline tw:transition-colors tw:hover:bg-main-hover"
          >
            <IconChevronLeft :size="16" class="tw:text-secondary" />
            <span class="tw:flex tw:flex-col">
              <span class="tw:text-caption tw:text-secondary">Previous</span>
              {{ nav.prev.title }}
            </span>
          </RouterLink>
          <span v-else />
          <RouterLink
            v-if="nav.next"
            :to="getCompanyPath(`/docs/${nav.next.id}`)"
            class="tw:flex tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-divider tw:px-4 tw:py-2.5 tw:text-right tw:text-sm tw:text-on-main tw:no-underline tw:transition-colors tw:hover:bg-main-hover"
          >
            <span class="tw:flex tw:flex-col">
              <span class="tw:text-caption tw:text-secondary">Next</span>
              {{ nav.next.title }}
            </span>
            <IconChevronRight :size="16" class="tw:text-secondary" />
          </RouterLink>
        </div>
      </div>

      <!-- ToC rail -->
      <aside class="tw:hidden tw:xl:block">
        <div class="tw:sticky tw:top-20 tw:max-h-[calc(100vh-6rem)] tw:overflow-y-auto">
          <DocsTocRail :items="toc" :activeId="activeHeadingId" @select="jumpTo" />
        </div>
      </aside>
    </div>
  </div>
</template>
