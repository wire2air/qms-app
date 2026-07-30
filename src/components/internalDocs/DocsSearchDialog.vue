<script setup>
/**
 * Docs search dialog — MiniSearch over the full corpus (titles, headings,
 * table text) with a fast path for the corpus's stable reference ids
 * (BS-07, TC-12, PW-J3 …). Keyboard: ↑/↓ to move, Enter to open.
 */
import { IconSearch } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const { searchOpen, searchDocs, closeSearch, recentIds, docsById } = useInternalDocs()
const router = useRouter()

const query = ref('')
const results = ref([])
const activeIndex = ref(0)
const searching = ref(false)
const inputEl = ref(null)

const recentDocs = computed(() =>
  recentIds.value.map((id) => docsById.value.get(id)).filter(Boolean).slice(0, 5),
)

const runSearch = useDebounceFn(async () => {
  const q = query.value
  if (!q.trim()) {
    results.value = []
    searching.value = false
    return
  }
  searching.value = true
  try {
    const hits = await searchDocs(q)
    // A newer keystroke may have superseded this run — only apply the latest.
    if (q === query.value) {
      results.value = hits
      activeIndex.value = 0
    }
  } finally {
    searching.value = false
  }
}, 150)

watch(query, () => {
  searching.value = true
  runSearch()
})

watch(searchOpen, (open) => {
  if (open) {
    query.value = ''
    results.value = []
    activeIndex.value = 0
  }
})

function move(delta) {
  const n = results.value.length
  if (!n) return
  activeIndex.value = (activeIndex.value + delta + n) % n
}

function open(id) {
  if (!id) return
  closeSearch()
  router.push(getCompanyPath(`/docs/${id}`))
}

function onKeydown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    move(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    move(-1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    open(results.value[activeIndex.value]?.id)
  }
}
</script>

<template>
  <BaseDialog v-model="searchOpen" size="3xl" ariaLabel="Search internal docs" :initialFocus="inputEl">
    <div class="tw:flex tw:flex-col tw:gap-3">
      <div class="tw:flex tw:items-center tw:gap-2 tw:border-b tw:border-divider tw:pb-3">
        <IconSearch :size="18" class="tw:shrink-0 tw:text-secondary" />
        <input
          ref="inputEl"
          v-model="query"
          type="text"
          placeholder="Search docs — titles, headings, tables, ids (TC-12, BS-07…)"
          class="tw:w-full tw:bg-transparent tw:text-on-main tw:outline-none tw:placeholder:text-secondary"
          role="combobox"
          aria-expanded="true"
          aria-controls="docs-search-results"
          @keydown="onKeydown"
        />
      </div>

      <div id="docs-search-results" class="tw:max-h-96 tw:overflow-y-auto" role="listbox">
        <!-- Results -->
        <template v-if="results.length">
          <button
            v-for="(result, i) in results"
            :key="result.id"
            type="button"
            role="option"
            :aria-selected="i === activeIndex"
            class="tw:flex tw:w-full tw:flex-col tw:gap-0.5 tw:rounded-lg tw:px-3 tw:py-2 tw:text-left tw:transition-colors"
            :class="i === activeIndex ? 'tw:bg-main-selected' : 'tw:hover:bg-main-hover'"
            @mouseenter="activeIndex = i"
            @click="open(result.id)"
          >
            <span class="tw:flex tw:items-baseline tw:gap-2">
              <span class="tw:text-sm tw:font-medium tw:text-on-main">{{ result.title }}</span>
              <span class="tw:text-caption tw:text-secondary">
                {{ result.moduleName }}<template v-if="result.groupLabel"> · {{ result.groupLabel }}</template>
              </span>
            </span>
            <span v-if="result.snippet" class="tw:line-clamp-2 tw:text-caption tw:text-secondary">
              {{ result.snippet }}
            </span>
          </button>
        </template>

        <!-- Empty query: recents -->
        <template v-else-if="!query.trim() && recentDocs.length">
          <p class="tw:px-3 tw:pb-1 tw:pt-2 tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary">
            Recently viewed
          </p>
          <button
            v-for="doc in recentDocs"
            :key="doc.id"
            type="button"
            class="tw:flex tw:w-full tw:items-baseline tw:gap-2 tw:rounded-lg tw:px-3 tw:py-2 tw:text-left tw:transition-colors tw:hover:bg-main-hover"
            @click="open(doc.id)"
          >
            <span class="tw:text-sm tw:text-on-main">{{ doc.title }}</span>
            <span class="tw:text-caption tw:text-secondary">
              {{ doc.flat ? doc.groupLabel : doc.moduleName }}
            </span>
          </button>
        </template>

        <p v-else-if="query.trim() && !searching" class="tw:px-3 tw:py-6 tw:text-center tw:text-sm tw:text-secondary">
          No results for “{{ query }}”.
        </p>
        <p v-else-if="searching" class="tw:px-3 tw:py-6 tw:text-center tw:text-sm tw:text-secondary">
          Searching…
        </p>
        <p v-else class="tw:px-3 tw:py-6 tw:text-center tw:text-sm tw:text-secondary">
          Search across every module pack and platform doc.
        </p>
      </div>
    </div>
  </BaseDialog>
</template>
