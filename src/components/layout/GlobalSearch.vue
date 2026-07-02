<script setup>
/**
 * Global full-text search box — lives in the header's #main-header-search slot.
 *
 * Lexical search over Documents / Nonconformances / CAPA via the core
 * /v1/services/search endpoint (Postgres FTS — no AI). Distinct from the
 * "Ask AI" assistant on the right of the header: this finds records, the
 * assistant reasons over them.
 */
import { IconSearch, IconFileText, IconAlertTriangle, IconClipboardCheck, IconX } from '@tabler/icons-vue'
import { get } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { companyCode } from '@/utils/currentSession'
import { getCompanyPath } from '@/utils/routeHelpers'

const TYPE_META = {
  Document: { label: 'Documents', path: 'documents', icon: IconFileText },
  Nonconformance: { label: 'Nonconformances', path: 'nonconformances', icon: IconAlertTriangle },
  Capa: { label: 'CAPA', path: 'capas', icon: IconClipboardCheck },
}
const TYPE_ORDER = ['Document', 'Nonconformance', 'Capa']

const router = useRouter()
const rootEl = ref(null)
const inputEl = ref(null)

const query = ref('')
const results = ref([])
const loading = ref(false)
const open = ref(false)
const activeIndex = ref(-1)

// Flat, rank-ordered list (matches what the keyboard cursor walks) and the
// grouped view the dropdown renders.
const grouped = computed(() => {
  const byType = new Map()
  for (const r of results.value) {
    if (!byType.has(r.entityType)) byType.set(r.entityType, [])
    byType.get(r.entityType).push(r)
  }
  return TYPE_ORDER.filter((t) => byType.has(t)).map((t) => ({
    type: t,
    meta: TYPE_META[t],
    rows: byType.get(t),
  }))
})

// Stable flat order used for arrow-key navigation, grouped-then-ranked.
const flat = computed(() => grouped.value.flatMap((g) => g.rows))

const fetchResults = useDebounceFn(async () => {
  const q = query.value.trim()
  if (q.length < 2) {
    results.value = []
    loading.value = false
    return
  }
  loading.value = true
  try {
    const data = await get('/v1/services/search', {
      params: { q, limit: 25 },
      showError: false,
    })
    // Ignore a stale response if the box changed while in flight.
    if (q !== query.value.trim()) return
    results.value = data?.results ?? []
    activeIndex.value = results.value.length ? 0 : -1
    open.value = true
  } catch {
    results.value = []
  } finally {
    loading.value = false
  }
}, 250)

watch(query, (val) => {
  if (val.trim().length >= 2) {
    open.value = true
    fetchResults()
  } else {
    results.value = []
    open.value = false
  }
})

/**
 * ts_headline returns user content with @@HL_S@@/@@HL_E@@ sentinels. Escape
 * the whole string first, then swap sentinels for <mark> — never trust the
 * raw body in v-html.
 */
function renderSnippet(snippet) {
  if (!snippet) return ''
  const escaped = snippet
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .replaceAll('@@HL_S@@', '<mark class="tw:bg-amber-200 tw:text-inherit tw:rounded tw:px-0.5">')
    .replaceAll('@@HL_E@@', '</mark>')
}

function goTo(row) {
  if (!row || !companyCode.value) return
  const path = TYPE_META[row.entityType]?.path
  if (!path) return
  // Routes are flat under subdomain tenancy — the company lives in the host,
  // NOT the URL path. Prefixing companyCode produced /ACME/documents/:id, which
  // matches no route and fell through to the 404 catch-all.
  router.push(getCompanyPath(`/${path}/${row.entityId}`))
  close()
}

function close() {
  open.value = false
  activeIndex.value = -1
}

function clearQuery() {
  query.value = ''
  results.value = []
  close()
  inputEl.value?.focus()
}

function onKeydown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (!flat.value.length) return
    activeIndex.value = (activeIndex.value + 1) % flat.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (!flat.value.length) return
    activeIndex.value = (activeIndex.value - 1 + flat.value.length) % flat.value.length
  } else if (e.key === 'Enter') {
    if (activeIndex.value >= 0) goTo(flat.value[activeIndex.value])
  } else if (e.key === 'Escape') {
    close()
    inputEl.value?.blur()
  }
}

// '/' focuses search from anywhere (the text-field guard is built into
// useHotkeys). ⌘K/⌘P now open the command palette; AI is on ⌘J.
useHotkeys({
  keys: '/',
  description: 'Focus search',
  group: 'Global',
  handler: () => inputEl.value?.focus(),
})

onClickOutside(rootEl, () => close())
</script>

<template>
  <div ref="rootEl" class="tw:relative tw:w-full tw:max-w-xl">
    <div class="tw:relative">
      <IconSearch
        :size="18"
        class="tw:absolute tw:left-3 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary tw:pointer-events-none"
      />
      <input
        ref="inputEl"
        v-model="query"
        type="text"
        placeholder="Search documents, NCs, CAPA…  (press /)"
        class="tw:w-full tw:rounded-full tw:border tw:border-divider tw:bg-main tw:py-2 tw:ps-10 tw:pe-9 tw:text-sm tw:text-primary tw:outline-none tw:focus:border-primary tw:transition-colors"
        @keydown="onKeydown"
        @focus="query.trim().length >= 2 && (open = true)"
      />
      <button
        v-if="query"
        class="tw:absolute tw:right-2 tw:top-1/2 tw:-translate-y-1/2 tw:p-1 tw:rounded-full tw:text-secondary tw:hover:bg-main-hover"
        title="Clear"
        @click="clearQuery"
      >
        <IconX :size="16" />
      </button>
    </div>

    <!-- Results dropdown -->
    <div
      v-if="open && query.trim().length >= 2"
      class="tw:absolute tw:left-0 tw:right-0 tw:mt-2 tw:max-h-[70vh] tw:overflow-y-auto tw:rounded-xl tw:border tw:border-divider tw:bg-main tw:shadow-lg tw:z-dropdown"
    >
      <div v-if="loading && !results.length" class="tw:px-4 tw:py-6 tw:text-center tw:text-sm tw:text-secondary">
        Searching…
      </div>

      <div
        v-else-if="!results.length"
        class="tw:px-4 tw:py-6 tw:text-center tw:text-sm tw:text-secondary"
      >
        No matches for “{{ query.trim() }}”.
      </div>

      <template v-else>
        <div v-for="group in grouped" :key="group.type" class="tw:py-1">
          <div
            class="tw:flex tw:items-center tw:gap-2 tw:px-4 tw:pt-2 tw:pb-1 tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wider tw:text-secondary"
          >
            <component :is="group.meta.icon" :size="14" />
            {{ group.meta.label }}
          </div>
          <button
            v-for="row in group.rows"
            :key="row.entityType + row.entityId"
            class="tw:w-full tw:text-left tw:px-4 tw:py-2 tw:flex tw:flex-col tw:gap-0.5 tw:transition-colors"
            :class="
              flat[activeIndex] && flat[activeIndex].entityId === row.entityId && flat[activeIndex].entityType === row.entityType
                ? 'tw:bg-main-hover'
                : 'tw:hover:bg-main-hover'
            "
            @click="goTo(row)"
            @mouseenter="activeIndex = flat.findIndex((f) => f.entityId === row.entityId && f.entityType === row.entityType)"
          >
            <div class="tw:flex tw:items-center tw:gap-2">
              <span v-if="row.code" class="tw:text-xs tw:text-primary tw:shrink-0">{{ row.code }}</span>
              <span class="tw:text-sm tw:font-medium tw:text-primary tw:truncate">{{ row.title || '—' }}</span>
            </div>
            <!-- eslint-disable-next-line vue/no-v-html — server escapes; only @@HL@@ sentinels become <mark> -->
            <p v-if="row.snippet" class="tw:text-xs tw:text-secondary tw:line-clamp-2" v-html="renderSnippet(row.snippet)"></p>
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
