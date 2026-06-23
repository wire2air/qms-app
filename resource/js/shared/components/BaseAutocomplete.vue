<script setup>
/**
 * BaseAutocomplete — typeahead / async-search combobox. The genuinely missing
 * input class: free-text query that filters a static list OR drives an async
 * `loader(query)` (debounced, with loading + empty states). For SyncEngine
 * ENTITIES keep using the XSelectMenu triad; this is for non-entity option sets
 * and remote search endpoints.
 *
 * WAI-ARIA combobox: role="combobox" input + role="listbox" popup + role="option"
 * items, aria-expanded / aria-controls / aria-activedescendant, ↑/↓ to move,
 * Enter to select, Esc to close. BaseField-compatible (spread the field payload).
 *
 *   <!-- static -->
 *   <BaseAutocomplete v-model="unit" :options="units" placeholder="Unit…" />
 *
 *   <!-- async -->
 *   <BaseAutocomplete v-model="poId" :loader="searchPurchaseOrders"
 *     placeholder="Search POs…" />
 *   // async loader: (query) => Promise<[{ value, label }]>
 */
import { IconX } from '@tabler/icons-vue'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  // Static options [{ value, label }] (or strings). Ignored when `loader` is set.
  options: { type: Array, default: null },
  // Async search: (query) => Promise<options>. Takes precedence over `options`.
  loader: { type: Function, default: null },
  optionLabel: { type: [String, Function], default: 'label' },
  optionValue: { type: [String, Function], default: 'value' },
  placeholder: { type: String, default: 'Search…' },
  disabled: { type: Boolean, default: false },
  clearable: { type: Boolean, default: true },
  // Min query length before the loader fires (async mode).
  minChars: { type: Number, default: 1 },
  debounce: { type: Number, default: 250 },
  size: { type: String, default: 'md' },
  noResultsText: { type: String, default: 'No results' },
  loadingText: { type: String, default: 'Searching…' },
})

const model = defineModel({ type: [String, Number], default: null })

const query = ref('')
const open = ref(false)
const shown = ref([])
const loading = ref(false)
const activeIndex = ref(-1)
const selectedOption = ref(null)
const inputEl = ref(null)

const listId = useId()
const optionDomId = (i) => `${listId}-opt-${i}`

function valueOf(o) {
  if (o === null || typeof o !== 'object') return o
  return typeof props.optionValue === 'function' ? props.optionValue(o) : o[props.optionValue]
}
function labelOf(o) {
  if (o === null || typeof o !== 'object') return String(o)
  return typeof props.optionLabel === 'function' ? props.optionLabel(o) : o[props.optionLabel]
}

async function runSearch(q) {
  if (props.loader) {
    if (q.length < props.minChars) {
      shown.value = []
      loading.value = false
      return
    }
    loading.value = true
    try {
      shown.value = (await props.loader(q)) || []
    } catch {
      shown.value = []
    } finally {
      loading.value = false
    }
  } else {
    const all = props.options || []
    const needle = q.trim().toLowerCase()
    shown.value = needle
      ? all.filter((o) => labelOf(o).toLowerCase().includes(needle))
      : all
  }
  activeIndex.value = shown.value.length ? 0 : -1
}

const debouncedSearch = useDebounceFn(runSearch, props.debounce)

function onInput() {
  open.value = true
  // Typing past a selection clears it until a new option is picked.
  if (selectedOption.value && query.value !== labelOf(selectedOption.value)) {
    selectedOption.value = null
    model.value = null
  }
  // Static lists filter instantly; only the remote loader is debounced.
  if (props.loader) debouncedSearch(query.value)
  else runSearch(query.value)
}

function openAndSearch() {
  if (props.disabled) return
  open.value = true
  runSearch(query.value)
}

function selectOption(opt) {
  if (!opt) return
  model.value = valueOf(opt)
  selectedOption.value = opt
  query.value = labelOf(opt)
  open.value = false
  activeIndex.value = -1
}

function clear() {
  model.value = null
  selectedOption.value = null
  query.value = ''
  shown.value = []
  inputEl.value?.focus()
  open.value = true
  runSearch('')
}

function onKeydown(e) {
  if (props.disabled) return
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      if (!open.value) return openAndSearch()
      activeIndex.value = Math.min(activeIndex.value + 1, shown.value.length - 1)
      break
    case 'ArrowUp':
      e.preventDefault()
      activeIndex.value = Math.max(activeIndex.value - 1, 0)
      break
    case 'Enter':
      if (open.value && activeIndex.value >= 0) {
        e.preventDefault()
        selectOption(shown.value[activeIndex.value])
      }
      break
    case 'Escape':
      if (open.value) {
        e.preventDefault()
        open.value = false
      }
      break
  }
}

// Resolve the display label for an externally-set value from static options.
watch(
  () => model.value,
  (v) => {
    if (v == null) {
      if (!selectedOption.value) query.value = ''
      return
    }
    if (selectedOption.value && valueOf(selectedOption.value) === v) return
    const match = (props.options || []).find((o) => valueOf(o) === v)
    if (match) {
      selectedOption.value = match
      query.value = labelOf(match)
    }
  },
  { immediate: true },
)

const sizeClass = computed(() =>
  props.size === 'sm' ? 'tw:h-8 tw:text-xs' : 'tw:h-9 tw:text-sm',
)
const activeDescendant = computed(() =>
  open.value && activeIndex.value >= 0 ? optionDomId(activeIndex.value) : undefined,
)
</script>

<template>
  <div class="tw:relative">
    <div
      class="tw:flex tw:items-center tw:rounded-lg tw:border tw:border-divider tw:bg-card tw:px-2 tw:transition-colors tw:focus-within:border-primary tw:focus-within:ring-2 tw:focus-within:ring-primary/30"
      :class="[sizeClass, disabled ? 'tw:cursor-not-allowed tw:opacity-60' : '']"
    >
      <input
        ref="inputEl"
        v-bind="$attrs"
        v-model="query"
        type="text"
        role="combobox"
        :aria-expanded="open"
        :aria-controls="listId"
        :aria-activedescendant="activeDescendant"
        aria-autocomplete="list"
        autocomplete="off"
        :placeholder="placeholder"
        :disabled="disabled"
        class="tw:min-w-0 tw:flex-1 tw:border-0 tw:bg-transparent tw:text-on-main tw:outline-none tw:placeholder:text-placeholder tw:disabled:cursor-not-allowed"
        @input="onInput"
        @focus="openAndSearch"
        @keydown="onKeydown"
        @blur="open = false"
      />
      <BaseSpinner v-if="loading" size="xs" color="secondary" class="tw:ml-1 tw:shrink-0" />
      <button
        v-else-if="clearable && model != null && !disabled"
        type="button"
        class="tw:ml-1 tw:shrink-0 tw:rounded tw:p-0.5 tw:text-secondary tw:hover:text-on-main tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/40"
        aria-label="Clear selection"
        @mousedown.prevent="clear"
      >
        <IconX :size="16" aria-hidden="true" />
      </button>
    </div>

    <ul
      v-if="open"
      :id="listId"
      role="listbox"
      class="tw:absolute tw:z-20 tw:mt-1 tw:max-h-60 tw:w-full tw:overflow-auto tw:rounded-lg tw:border tw:border-divider tw:bg-card tw:py-1 tw:shadow-lg"
    >
      <li
        v-for="(opt, i) in shown"
        :id="optionDomId(i)"
        :key="valueOf(opt)"
        role="option"
        :aria-selected="i === activeIndex"
        class="tw:cursor-pointer tw:px-3 tw:py-1.5 tw:text-sm"
        :class="
          i === activeIndex ? 'tw:bg-primary/10 tw:text-primary' : 'tw:text-on-main tw:hover:bg-sidebar-hover'
        "
        @mousedown.prevent="selectOption(opt)"
        @mousemove="activeIndex = i"
      >
        {{ labelOf(opt) }}
      </li>

      <li v-if="loading" class="tw:px-3 tw:py-2 tw:text-sm tw:text-secondary">{{ loadingText }}</li>
      <li
        v-else-if="!shown.length"
        class="tw:px-3 tw:py-2 tw:text-sm tw:text-secondary"
      >
        {{ noResultsText }}
      </li>
    </ul>
  </div>
</template>
