<script setup>
import { IconSearch, IconChevronDown } from '@tabler/icons-vue'
import { computed, shallowRef, useSlots } from 'vue'

const props = defineProps({
  /** @type {import('vue').PropType<Array<{as?: string, id: string | number, name: string}>>} */
  items: {
    type: Array,
    default: () => [],
  },
  multiple: {
    type: Boolean,
    default: false,
  },
  required: {
    type: Boolean,
    default: false,
  },
  nullLabel: {
    type: String,
    default: 'All',
  },
  hideNullOption: {
    type: Boolean,
    default: false,
  },
  // Trigger appearance: 'control' = bordered input-style chrome (toolbars/forms;
  // the default so a row of selects aligns with text inputs); 'inline' = the
  // bare badge trigger (compact table cells, where input chrome is too heavy).
  variant: {
    type: String,
    default: 'control',
    validator: (v) => ['control', 'inline'].includes(v),
  },
  // Optional field chrome — when any of these are set the component renders a
  // label/instructions/error around the trigger. When none are set the wrapper
  // is `display:contents`, so existing XSelectMenu wrappers are unaffected.
  label: {
    type: String,
    default: null,
  },
  instructions: {
    type: String,
    default: null,
  },
  errorMsg: {
    type: String,
    default: null,
  },
  // 'sm' | 'md' — affects label/instruction sizing
  size: {
    type: String,
    default: 'md',
  },
})

const selected = defineModel({
  type: [String, Number, Array, null],
})

const slots = useSlots()
const hasChrome = computed(
  () => !!(props.label || props.instructions || props.errorMsg || slots.label),
)

const search = shallowRef('')

/**
 * Ensure we always work with an array in multiple mode
 */
function getArray() {
  return Array.isArray(selected.value) ? selected.value : []
}

const showNullable = computed(() => !props.required && !props.multiple && !props.hideNullOption)

// Strip the dated em-dash convention ("— All statuses —" → "All statuses").
const displayNullLabel = computed(
  () => (props.nullLabel || '').replace(/^—\s*/, '').replace(/\s*—$/, '').trim() || 'All',
)

const isNullableSelected = computed(() => {
  if (props.multiple) return getArray().length === 0
  return selected.value === null || selected.value === undefined
})

function toggleNullable(close) {
  if (props.multiple) {
    selected.value = []
  } else {
    selected.value = null
  }
  close()
}

const filtered = computed(() => {
  const query = search.value.toLowerCase()

  return props.items.filter((item) => item.name.toLowerCase().includes(query))
})

function toggleSelection(id, close) {
  if (props.multiple) {
    const arr = getArray()

    if (arr.includes(id)) {
      // Prevent removing last item if required
      if (props.required && arr.length === 1) return
      selected.value = arr.filter((item) => item !== id)
    } else {
      selected.value = [...arr, id]
    }
  } else {
    // Prevent deselect if required
    if (props.required && selected.value === id) return
    selected.value = selected.value === id ? null : id
    close()
  }
}

function clear(id) {
  if (props.multiple) {
    const arr = getArray()

    if (!arr.includes(id)) return

    // Prevent clearing last item if required
    if (props.required && arr.length === 1) return

    selected.value = arr.filter((item) => item !== id)
  } else {
    if (props.required) return
    selected.value = null
  }
}

function isSelected(id) {
  if (props.multiple) {
    return getArray().includes(id)
  }
  return selected.value === id
}

// --- Listbox keyboard a11y -------------------------------------------------
// Flat option list (the nullable "All" row, when shown, sits at index 0) drives
// arrow-key navigation + aria-activedescendant. Roles/keyboard apply to the
// DEFAULT item rendering; an #items override owns its own semantics.
const baseId = useId()
const listboxId = `${baseId}-listbox`
const activeIndex = ref(0)

const optionList = computed(() => {
  const list = []
  if (showNullable.value) list.push({ kind: 'null', id: '__null__' })
  for (const item of filtered.value) list.push({ kind: 'item', id: item.id })
  return list
})

function optionDomId(index) {
  return `${baseId}-opt-${index}`
}
// DOM index of the i-th filtered item (offset by the nullable row if present).
function itemIndex(i) {
  return (showNullable.value ? 1 : 0) + i
}
const activeDescendant = computed(() =>
  optionList.value.length ? optionDomId(activeIndex.value) : undefined,
)

// Reset the active option whenever the visible list changes.
watch([search, filtered], () => {
  activeIndex.value = 0
})

function onSearchKeydown(e, close) {
  const list = optionList.value
  if (!list.length) return
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      activeIndex.value = Math.min(activeIndex.value + 1, list.length - 1)
      break
    case 'ArrowUp':
      e.preventDefault()
      activeIndex.value = Math.max(activeIndex.value - 1, 0)
      break
    case 'Home':
      e.preventDefault()
      activeIndex.value = 0
      break
    case 'End':
      e.preventDefault()
      activeIndex.value = list.length - 1
      break
    case 'Enter': {
      e.preventDefault()
      const active = list[activeIndex.value]
      if (!active) return
      if (active.kind === 'null') toggleNullable(close)
      else toggleSelection(active.id, close)
      break
    }
  }
}

watch(
  () => props.items,
  (newItems) => {
    // Skip while items haven't loaded — preserves an upstream selection
    // until the list is actually known.
    if (!newItems || newItems.length === 0) return

    // Drop a stale selection that's no longer in the list (e.g. a dependent
    // filter like siteId changed and the previously chosen department is gone).
    const validIds = new Set(newItems.map((i) => i.id))
    if (props.multiple) {
      const arr = getArray()
      const filtered = arr.filter((id) => validIds.has(id))
      if (filtered.length !== arr.length) selected.value = filtered
    } else if (
      selected.value !== null &&
      selected.value !== undefined &&
      !validIds.has(selected.value)
    ) {
      selected.value = null
    }

    if (
      props.required &&
      !selected.value &&
      (Array.isArray(selected.value) ? selected.value.length === 0 : true)
    ) {
      if (props.multiple) {
        if (getArray().length === 0) {
          selected.value = [newItems[0].id]
        }
      } else if (selected.value === null || selected.value === undefined) {
        selected.value = newItems[0].id
      }
    }
  },
  { immediate: true },
)
</script>

<template>
  <div :class="hasChrome ? 'tw:flex tw:flex-col tw:gap-1' : 'tw:contents'">
    <label
      v-if="label || slots.label"
      class="tw:block tw:font-medium tw:text-on-main tw:dark:text-white"
      :class="size === 'sm' ? 'tw:text-12' : 'tw:text-sm'"
    >
      <slot name="label">
        {{ label }}
        <span v-if="required" class="tw:text-red">*</span>
      </slot>
    </label>
    <p
      v-if="instructions"
      class="tw:text-secondary"
      :class="size === 'sm' ? 'tw:text-11' : 'tw:text-12'"
    >
      {{ instructions }}
    </p>

    <BasePopover placement="bottom" :arrow="false" :flip="true">
      <template #button>
        <!-- 'control' — bordered input-style trigger that aligns with text
             inputs / buttons in a toolbar or form. -->
        <div
          v-if="variant === 'control'"
          class="tw:flex tw:min-h-9 tw:w-full tw:cursor-pointer tw:items-center tw:justify-between tw:gap-2 tw:rounded-lg tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm tw:transition-colors tw:hover:border-secondary/50 tw:hover:bg-main-hover tw:focus-within:border-primary tw:focus-within:ring-2 tw:focus-within:ring-primary/20"
        >
          <span class="tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-1">
            <span v-if="showNullable && isNullableSelected" class="tw:truncate tw:text-placeholder">
              {{ displayNullLabel }}
            </span>
            <slot v-else name="button" :selected="selected" :clear="clear" />
          </span>
          <IconChevronDown
            v-if="showNullable && isNullableSelected"
            :size="16"
            class="tw:shrink-0 tw:text-secondary"
            aria-hidden="true"
          />
        </div>

        <!-- 'inline' — bare badge trigger (compact cells). -->
        <template v-else>
          <BaseBadge v-if="showNullable && isNullableSelected" selectable>
            {{ displayNullLabel }}
          </BaseBadge>
          <slot v-else name="button" :selected="selected" :clear="clear" />
        </template>
      </template>

    <template #content="{ close }">
      <!-- Panel is wider than the trigger on purpose — long entity names
           (products with SKUs, suppliers) need room; the trigger may be a
           narrow inline cell. Items truncate with a title tooltip past
           the panel width. -->
      <div
        class="tw:w-80 tw:max-w-[90vw] tw:bg-card tw:rounded-xl tw:shadow-floating tw:border tw:border-divider tw:overflow-hidden"
      >
        <!-- Search Header -->
        <div class="tw:p-3 tw:border-b tw:border-divider tw:bg-sidebar/50">
          <div class="tw:relative">
            <IconSearch
              class="tw:absolute tw:left-2.5 tw:top-2.5 tw:size-4 tw:text-secondary tw:pointer-events-none"
            />
            <input
              v-model="search"
              type="text"
              autofocus
              placeholder="Search..."
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              :aria-controls="listboxId"
              :aria-activedescendant="activeDescendant"
              class="tw:w-full tw:pl-9 tw:pr-3 tw:py-2 tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:text-sm tw:focus:outline-none tw:focus:ring-2 tw:focus:ring-primary/20 tw:focus:border-primary tw:transition-all"
              @keydown="(e) => onSearchKeydown(e, close)"
            />
          </div>
        </div>

        <!-- Count Summary -->
        <div
          class="tw:px-4 tw:py-2 tw:text-[11px] tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:bg-white"
        >
          {{ search ? `${filtered.length} of ${props.items.length}` : props.items.length }}
          {{ props.items.length === 1 ? 'item' : 'items' }}
        </div>

        <!-- Items -->
        <slot
          name="items"
          :close="close"
          :isSelected="isSelected"
          :toggleSelection="toggleSelection"
        >
          <div
            :id="listboxId"
            role="listbox"
            :aria-multiselectable="multiple || undefined"
            class="tw:max-h-64 tw:overflow-y-auto tw:p-1"
          >
            <!-- Nullable "All" item -->
            <button
              v-if="showNullable"
              :id="optionDomId(0)"
              role="option"
              :aria-selected="isNullableSelected"
              class="tw:w-full tw:flex tw:items-center tw:justify-between tw:px-3 tw:py-2.5 tw:rounded-lg tw:text-sm tw:transition-colors"
              :class="[
                isNullableSelected
                  ? 'tw:bg-primary/10 tw:text-primary'
                  : 'tw:text-on-main tw:hover:bg-primary/5',
                activeIndex === 0 && 'tw:ring-2 tw:ring-inset tw:ring-primary/40',
              ]"
              @click="toggleNullable(close)"
              @mousemove="activeIndex = 0"
            >
              <span class="tw:font-medium">{{ nullLabel }}</span>
              <div
                v-if="isNullableSelected"
                class="tw:w-1.5 tw:h-1.5 tw:rounded-full tw:bg-primary tw:shrink-0"
              />
            </button>

            <button
              v-for="(item, i) in filtered"
              :id="optionDomId(itemIndex(i))"
              :key="item.id"
              role="option"
              :aria-selected="isSelected(item.id)"
              class="tw:w-full tw:flex tw:items-center tw:justify-between tw:px-3 tw:py-2.5 tw:rounded-lg tw:text-sm tw:transition-colors"
              :class="[
                isSelected(item.id)
                  ? 'tw:bg-primary/10 tw:text-primary'
                  : 'tw:text-on-main tw:hover:bg-primary/5',
                activeIndex === itemIndex(i) && 'tw:ring-2 tw:ring-inset tw:ring-primary/40',
              ]"
              @click="toggleSelection(item.id, close)"
              @mousemove="activeIndex = itemIndex(i)"
            >
              <span
                class="tw:font-medium tw:text-start tw:min-w-0 tw:flex-1 tw:truncate"
                :title="item.name"
              >
                <slot name="item" :item="item">
                  {{ item.name }}
                </slot>
              </span>
              <div
                v-if="isSelected(item.id)"
                class="tw:w-1.5 tw:h-1.5 tw:rounded-full tw:bg-primary tw:shrink-0"
              />
            </button>

            <div
              v-if="filtered.length === 0"
              class="tw:px-4 tw:py-8 tw:text-center tw:text-secondary tw:text-sm"
            >
              No matches found
            </div>
          </div>
        </slot>

        <!-- Footer slot -->
        <slot name="footer" :close="close" />
      </div>
      </template>
    </BasePopover>

    <p
      v-if="errorMsg"
      class="tw:text-12 tw:text-red-500"
      :class="size === 'sm' ? 'tw:text-11' : 'tw:text-12'"
    >
      {{ errorMsg }}
    </p>
  </div>
</template>
