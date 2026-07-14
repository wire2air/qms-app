<script setup>
import {
  ref,
  computed,
  watch,
  nextTick,
  useId,
  useSlots,
  getCurrentInstance,
} from 'vue'
import { useVirtualList, useMediaQuery, createReusableTemplate } from '@vueuse/core'
import { IconSearch, IconChevronDown, IconX, IconCheck, IconSelector } from '@tabler/icons-vue'
import { useSelectOptions } from '@shared/composables/useSelectOptions.js'
import { useSelectFilter } from '@shared/composables/useSelectFilter.js'
import { useSelectKeyboard } from '@shared/composables/useSelectKeyboard.js'

const props = defineProps({
  // --- options & value mapping ---
  options: { type: Array, default: () => [] },
  optionLabel: { type: [String, Function], default: 'label' },
  optionValue: { type: [String, Function], default: 'value' },
  optionDisabled: { type: [String, Function], default: null },
  optionGroup: { type: [String, Function], default: null },
  optionIcon: { type: [String, Function], default: null },
  optionAvatar: { type: [String, Function], default: null },
  optionDescription: { type: [String, Function], default: null },
  emitValue: { type: Boolean, default: true },

  // --- behavior ---
  multiple: { type: Boolean, default: false },
  clearable: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
  required: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  autofocus: { type: Boolean, default: false },

  // --- chrome ---
  label: { type: String, default: '' },
  placeholder: { type: String, default: 'Select…' },
  // Optional in-list "All" option for non-required (filter) selects. When set and
  // !required, a synthetic row is prepended to the list; picking it clears the
  // selection (null / []), and the trigger shows this label instead of the
  // placeholder. Mirrors BaseSelectMenu's nullLabel so filter wrappers migrate 1:1.
  nullLabel: { type: String, default: null },
  instructions: { type: String, default: '' },
  errorMsg: { type: String, default: '' },
  hint: { type: String, default: '' },
  size: { type: String, default: 'sm', validator: (v) => ['sm', 'md'].includes(v) },
  dense: { type: Boolean, default: false },

  // --- search ---
  searchable: { type: Boolean, default: true },
  inputDebounce: { type: Number, default: 300 },
  remote: { type: Boolean, default: false },

  // --- validation ---
  rules: { type: Array, default: () => [] },

  // --- performance ---
  virtualScroll: { type: [Boolean, String], default: 'auto' },

  // --- multi-select UX ---
  maxValues: { type: Number, default: null },
  showSelectAll: { type: Boolean, default: false },
  useChips: { type: Boolean, default: false },
  hideSelected: { type: Boolean, default: false },
  counter: { type: Boolean, default: false },

  // --- presentation overrides ---
  menuClass: { type: String, default: '' },
})

const emit = defineEmits(['focus', 'blur', 'clear', 'filter', 'popup-show', 'popup-hide'])

const model = defineModel({ type: [String, Number, Object, Array, null], default: null })

const slots = useSlots()
const baseId = useId()
const listboxId = `${baseId}-listbox`
const labelId = `${baseId}-label`

// Below the Tailwind `sm` breakpoint the panel becomes a bottom sheet (see template).
const isMobile = useMediaQuery('(max-width: 640px)')

// Render the trigger + menu body once, reuse them in the desktop popover and the mobile sheet.
const [DefineTrigger, ReuseTrigger] = createReusableTemplate()
const [DefineMenu, ReuseMenu] = createReusableTemplate()

// A bound @filter listener (or explicit `remote`) switches to server-side search.
const instance = getCurrentInstance()
const hasFilterListener = computed(() => !!instance?.vnode?.props?.onFilter)
function isRemote() {
  return props.remote || hasFilterListener.value
}

// --- options + selection ---------------------------------------------------
const {
  getValue,
  normalizedOptions,
  selectedOptions,
  isGrouped,
  isSelected,
  toEmitted,
} = useSelectOptions(props, model)

// --- search ----------------------------------------------------------------
const { query, filteredOptions, reset: resetQuery } = useSelectFilter(normalizedOptions, {
  remote: isRemote,
  emitFilter: (q) => emit('filter', q),
  debounce: () => props.inputDebounce,
})

// Options shown in the panel — optionally drop already-selected ones.
const visibleOptions = computed(() => {
  if (props.multiple && props.hideSelected) {
    return filteredOptions.value.filter((o) => !isSelected(o))
  }
  return filteredOptions.value
})

// --- flat display rows (headers + options) ---------------------------------
// --- nullable "All" option (filters) ---------------------------------------
// Strip the dated em-dash convention ("— All statuses —" → "All statuses").
const displayNullLabel = computed(() =>
  (props.nullLabel || '').replace(/^—\s*/, '').replace(/\s*—$/, '').trim(),
)
const showNull = computed(() => !!props.nullLabel && !props.required)

const displayRows = computed(() => {
  const rows = []
  // The "All" row sits at the top of an unfiltered list (hidden while searching,
  // since it isn't a search match). Focusable so keyboard nav can reach it.
  if (showNull.value && !query.value) {
    rows.push({ kind: 'null', key: '__null__', label: displayNullLabel.value, focusable: true })
  }
  const opts = visibleOptions.value
  if (isGrouped.value) {
    const groups = new Map()
    for (const o of opts) {
      const key = o.group ?? ''
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(o)
    }
    for (const [groupName, list] of groups) {
      rows.push({ kind: 'header', key: `h:${groupName}`, label: groupName, focusable: false })
      for (const o of list) {
        rows.push({ kind: 'option', key: `o:${o.value}`, option: o, focusable: !o.disabled })
      }
    }
  } else {
    for (const o of opts) {
      rows.push({ kind: 'option', key: `o:${o.value}`, option: o, focusable: !o.disabled })
    }
  }
  return rows
})

const optionCount = computed(() => visibleOptions.value.length)

// --- virtual scrolling -----------------------------------------------------
// Rows grow to a 44px (md: 48px) minimum touch target on mobile.
const ROW_HEIGHT = computed(() => {
  const md = props.size === 'md'
  if (isMobile.value) return md ? 48 : 44
  return md ? 44 : 38
})
const HEADER_HEIGHT = 30
function rowHeight(index) {
  const row = displayRows.value[index]
  if (!row) return ROW_HEIGHT.value
  if (row.kind === 'header') return HEADER_HEIGHT
  return row.option?.description ? ROW_HEIGHT.value + 16 : ROW_HEIGHT.value
}

const virtualEnabled = computed(() => {
  if (props.virtualScroll === true) return true
  if (props.virtualScroll === false) return false
  return displayRows.value.length > 100
})

const {
  list: virtualRows,
  containerProps,
  wrapperProps,
  scrollTo,
} = useVirtualList(displayRows, { itemHeight: rowHeight, overscan: 8 })

// --- active-descendant keyboard navigation ---------------------------------
const activeIndex = ref(-1)
function rowDomId(index) {
  return `${baseId}-row-${index}`
}
const activeDescendant = computed(() => {
  const row = displayRows.value[activeIndex.value]
  return row && row.kind === 'option' ? rowDomId(activeIndex.value) : undefined
})

const { onKeydown } = useSelectKeyboard({
  rows: displayRows,
  activeIndex,
  onSelect: (row) => (row.kind === 'null' ? selectNull() : selectOption(row.option)),
  onClose: () => closePopover(),
  onBackspace: () => {
    if (props.multiple && Array.isArray(model.value) && model.value.length) {
      const last = selectedOptions.value[selectedOptions.value.length - 1]
      if (last) removeValue(last)
    }
  },
})

// Keep the active option in view (virtual + plain list).
watch(activeIndex, (index) => {
  if (index < 0) return
  if (virtualEnabled.value) {
    scrollTo(index)
  } else {
    nextTick(() => {
      document.getElementById(rowDomId(index))?.scrollIntoView({ block: 'nearest' })
    })
  }
})

// --- selection mutation ----------------------------------------------------
function valueEquals(modelEntry, normOption) {
  const entryValue = props.emitValue ? modelEntry : getValue(modelEntry)
  return entryValue === normOption.value
}

function selectOption(normOption) {
  if (!normOption || normOption.disabled || props.readonly) return
  if (props.multiple) {
    const current = Array.isArray(model.value) ? [...model.value] : []
    const idx = current.findIndex((e) => valueEquals(e, normOption))
    if (idx >= 0) {
      if (props.required && current.length === 1) return
      current.splice(idx, 1)
    } else {
      if (props.maxValues != null && current.length >= props.maxValues) return
      current.push(toEmitted(normOption))
    }
    model.value = current
  } else {
    model.value = toEmitted(normOption)
    closePopover()
  }
  validate()
}

function removeValue(normOption) {
  if (props.readonly) return
  const current = Array.isArray(model.value) ? [...model.value] : []
  const idx = current.findIndex((e) => valueEquals(e, normOption))
  if (idx < 0) return
  if (props.required && current.length === 1) return
  current.splice(idx, 1)
  model.value = current
  validate()
}

function selectAll() {
  const selectable = visibleOptions.value.filter((o) => !o.disabled)
  const capped = props.maxValues != null ? selectable.slice(0, props.maxValues) : selectable
  model.value = capped.map(toEmitted)
  validate()
}

function clearSelection() {
  model.value = props.multiple ? [] : null
  emit('clear')
  validate()
}

const nullSelected = computed(() => !hasValue.value)

// Picking "All" is a clear-to-empty; closes on single-select like any choice.
function selectNull() {
  clearSelection()
  if (!props.multiple) closePopover()
}

// Required selects auto-fill the first option once the list is known — matches
// BaseSelectMenu and the documented select convention (`required=true` → auto-select
// first). Fires on load only (watches options, not the model), so a user choice sticks.
watch(
  normalizedOptions,
  (opts) => {
    if (!props.required || !opts.length) return
    const first = opts.find((o) => !o.disabled)
    if (!first) return
    if (props.multiple) {
      if (!Array.isArray(model.value) || model.value.length === 0) {
        model.value = [toEmitted(first)]
      }
    } else if (model.value == null) {
      model.value = toEmitted(first)
    }
  },
  { immediate: true },
)

const hasValue = computed(() =>
  props.multiple ? Array.isArray(model.value) && model.value.length > 0 : model.value != null,
)
const showClear = computed(() => props.clearable && hasValue.value && !props.disabled && !props.readonly)

// --- validation ------------------------------------------------------------
const internalError = ref('')
const displayError = computed(() => props.errorMsg || internalError.value)

function validate() {
  const rules = props.rules || []
  if (props.required && !hasValue.value) {
    internalError.value = 'This field is required'
    return false
  }
  for (const rule of rules) {
    const result = rule(model.value)
    if (result !== true && typeof result === 'string') {
      internalError.value = result
      return false
    }
  }
  internalError.value = ''
  return true
}
function resetValidation() {
  internalError.value = ''
}

// --- popup lifecycle -------------------------------------------------------
// Desktop drives `isOpen` through the popover's `open` slot (syncOpen); mobile drives
// it through `mobileOpen`. Both funnel into openMenu/closeMenu so lifecycle is identical.
const isOpen = ref(false)
const mobileOpen = ref(false)

function openMenu() {
  if (isOpen.value) return
  isOpen.value = true
  emit('popup-show')
  activeIndex.value = displayRows.value.findIndex((r) => r.focusable)
}
function closeMenu() {
  if (!isOpen.value) return
  isOpen.value = false
  emit('popup-hide')
  resetQuery()
  validate()
  emit('blur')
}

// Desktop: the popover slot tells us its open state.
function syncOpen(open) {
  if (open === isOpen.value) return ''
  if (open) openMenu()
  else closeMenu()
  return ''
}

// Mobile: the sheet's visibility is our own ref.
watch(mobileOpen, (open) => {
  if (open) openMenu()
  else closeMenu()
})

// Single-select / keyboard close — captured from the desktop popover, faked on mobile.
let desktopClose = () => {}
function closePopover() {
  if (isMobile.value) mobileOpen.value = false
  else desktopClose()
}

function onTriggerKeydown(e) {
  if (props.disabled) return
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
    e.preventDefault()
    mobileOpen.value = true
  }
}

// --- trigger display -------------------------------------------------------
const singleLabel = computed(() => selectedOptions.value[0]?.label || '')
const summaryLabel = computed(() => {
  const count = selectedOptions.value.length
  if (!count) return ''
  if (props.useChips) return ''
  return count === 1 ? selectedOptions.value[0].label : `${count} selected`
})

const sizeClasses = computed(() =>
  props.size === 'md'
    ? 'tw:min-h-11 tw:sm:min-h-10 tw:py-2 tw:text-sm'
    : 'tw:min-h-11 tw:sm:min-h-9 tw:py-1.5 tw:text-sm tw:sm:text-xs',
)

// Programmatic open/close — e.g. a parent "+ add" button that pops the menu.
// Desktop is BasePopover-controlled, so we click the trigger to toggle it open;
// mobile drives its own sheet ref.
function openProgrammatically() {
  if (isOpen.value) return
  if (isMobile.value) mobileOpen.value = true
  else document.getElementById(baseId)?.click()
}
function toggle() {
  if (isOpen.value) closePopover()
  else openProgrammatically()
}

defineExpose({
  validate,
  resetValidation,
  focus: () => {},
  open: openProgrammatically,
  close: closePopover,
  toggle,
})
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-1">
    <label
      v-if="label || slots.label"
      :id="labelId"
      class="tw:text-label tw:font-medium tw:text-on-main"
    >
      <slot name="label">
        {{ label }}
        <span v-if="required" class="tw:text-red">*</span>
      </slot>
      <span v-if="counter && multiple" class="tw:ml-1 tw:text-secondary tw:font-normal">
        ({{ selectedOptions.length }}{{ maxValues != null ? ` / ${maxValues}` : '' }})
      </span>
    </label>
    <p v-if="instructions" class="tw:text-caption tw:text-secondary">{{ instructions }}</p>

    <!-- ============================ shared trigger ============================ -->
    <DefineTrigger v-slot="{ open, focusable }">
      <!-- Full trigger override (e.g. a compact "+ Add" button that just opens
           the picker; the consumer renders the selection elsewhere). Clicking it
           bubbles to the popover wrapper and toggles the menu. -->
      <slot
        v-if="slots.trigger"
        name="trigger"
        :open="open"
        :hasValue="hasValue"
        :selectedOptions="selectedOptions"
      />
      <!-- Trigger — mirrors BaseTextInput chrome for zero layout shift. -->
      <div
        v-else
        :id="baseId"
        role="combobox"
        aria-haspopup="listbox"
        :aria-expanded="open"
        :aria-controls="listboxId"
        :aria-labelledby="label || slots.label ? labelId : undefined"
        :aria-disabled="disabled || undefined"
        :aria-invalid="displayError ? 'true' : undefined"
        :tabindex="focusable && !disabled ? 0 : undefined"
        class="tw:flex tw:w-full tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:bg-sidebar tw:px-3 tw:transition-[border-color,box-shadow] tw:duration-200"
        :class="[
          sizeClasses,
          disabled
            ? 'tw:cursor-not-allowed tw:opacity-60 tw:bg-main-unselected'
            : 'tw:cursor-pointer tw:hover:border-secondary/50',
          displayError
            ? 'tw:border-red-500 tw:focus-within:ring-2 tw:focus-within:ring-red-500/30'
            : open
              ? 'tw:border-primary tw:ring-2 tw:ring-primary/30'
              : 'tw:border-divider',
        ]"
        @keydown="focusable ? onTriggerKeydown : undefined"
      >
        <slot name="prepend" />

        <!-- Single-select shows the value as bare text: strip the badge's pill
             border so it doesn't read as a box-in-a-box inside the trigger.
             Multi-select keeps chip borders. -->
        <div
          class="tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-1"
          :class="!multiple && 'tw:[&_*]:border-transparent!'"
        >
          <slot
            v-if="hasValue"
            name="selected"
            :value="model"
            :options="selectedOptions"
            :remove="removeValue"
            :clear="clearSelection"
          >
            <!-- Chips (multiple + useChips) -->
            <div v-if="multiple && useChips" class="tw:flex tw:flex-wrap tw:gap-1">
              <BaseBadge
                v-for="opt in selectedOptions"
                :key="opt.value"
                :clearable="!readonly && !(required && selectedOptions.length === 1)"
                @clear="() => removeValue(opt)"
              >
                {{ opt.label }}
              </BaseBadge>
            </div>
            <span v-else class="tw:truncate tw:text-on-main">
              {{ multiple ? summaryLabel : singleLabel }}
            </span>
          </slot>
          <span v-else class="tw:truncate tw:text-placeholder">{{ showNull ? displayNullLabel : placeholder }}</span>
        </div>

        <BaseSpinner v-if="loading" class="tw:size-4 tw:shrink-0" />
        <button
          v-else-if="showClear"
          type="button"
          class="tw:shrink-0 tw:rounded tw:text-secondary tw:hover:text-on-main"
          aria-label="Clear selection"
          @click.stop="clearSelection"
        >
          <IconX :size="16" />
        </button>
        <!-- Single-select showing a clear ×: the × is enough affordance, so
             drop the chevron for a cleaner look. Empty or non-clearable
             (e.g. required) single-selects keep it as a dropdown cue;
             multi-select keeps IconSelector. -->
        <component
          :is="multiple ? IconSelector : IconChevronDown"
          v-if="!loading && !(showClear && !multiple)"
          :size="16"
          class="tw:shrink-0 tw:text-secondary"
          aria-hidden="true"
        />
        <slot name="append" />
      </div>
    </DefineTrigger>

    <!-- ============================ shared menu body ============================ -->
    <DefineMenu>
      <!-- Search -->
      <div v-if="searchable" class="tw:border-b tw:border-divider tw:p-2">
        <div class="tw:relative">
          <IconSearch
            class="tw:pointer-events-none tw:absolute tw:left-2.5 tw:top-2.5 tw:size-4 tw:text-secondary"
          />
          <!-- text-base (16px) on mobile prevents iOS Safari focus-zoom; sm+ tightens it. -->
          <input
            v-model="query"
            type="text"
            :autofocus="true"
            placeholder="Search…"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            :aria-controls="listboxId"
            :aria-activedescendant="activeDescendant"
            class="tw:w-full tw:rounded-lg tw:border tw:border-divider tw:bg-white tw:py-2 tw:pl-9 tw:pr-3 tw:text-base tw:sm:text-sm tw:transition-all tw:focus:border-primary tw:focus:outline-none tw:focus:ring-2 tw:focus:ring-primary/20"
            @keydown="onKeydown"
          />
        </div>
      </div>

      <!-- Select all / clear all (multiple) -->
      <div
        v-if="multiple && (showSelectAll || clearable)"
        class="tw:flex tw:items-center tw:justify-between tw:border-b tw:border-divider tw:px-3 tw:py-1.5 tw:text-label"
      >
        <button
          v-if="showSelectAll"
          type="button"
          class="tw:font-medium tw:text-primary tw:hover:underline"
          @click="selectAll"
        >
          Select all
        </button>
        <span v-else />
        <button
          v-if="clearable && hasValue"
          type="button"
          class="tw:font-medium tw:text-secondary tw:hover:text-on-main tw:hover:underline"
          @click="clearSelection"
        >
          Clear all
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="tw:flex tw:items-center tw:justify-center tw:gap-2 tw:py-8">
        <slot name="loading">
          <BaseSpinner class="tw:size-5" />
          <span class="tw:text-sm tw:text-secondary">Loading…</span>
        </slot>
      </div>

      <!-- Empty -->
      <div
        v-else-if="!displayRows.length"
        class="tw:px-4 tw:py-8 tw:text-center tw:text-sm tw:text-secondary"
      >
        <slot name="no-option">No matches found</slot>
      </div>

      <!-- Virtualized list -->
      <div
        v-else-if="virtualEnabled"
        :id="listboxId"
        role="listbox"
        :aria-multiselectable="multiple || undefined"
        v-bind="containerProps"
        class="tw:max-h-[60vh] tw:sm:max-h-64 tw:overflow-y-auto tw:p-1"
      >
        <div v-bind="wrapperProps">
          <template v-for="{ data: row, index } in virtualRows" :key="row.key">
            <div
              v-if="row.kind === 'header'"
              class="tw:px-3 tw:py-1.5 tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wider tw:text-secondary"
              role="presentation"
            >
              {{ row.label }}
            </div>
            <button
              v-else-if="row.kind === 'null'"
              :id="rowDomId(index)"
              type="button"
              role="option"
              :aria-selected="nullSelected"
              class="tw:flex tw:min-h-11 tw:sm:min-h-9 tw:w-full tw:items-center tw:justify-between tw:gap-2 tw:rounded-lg tw:px-3 tw:py-2 tw:text-start tw:text-sm tw:transition-colors"
              :class="[
                nullSelected ? 'tw:bg-primary/10 tw:text-primary' : 'tw:text-on-main tw:hover:bg-primary/5',
                activeIndex === index && 'tw:ring-2 tw:ring-inset tw:ring-primary/40',
              ]"
              @click="selectNull"
              @mousemove="activeIndex = index"
            >
              <span class="tw:font-medium">{{ row.label }}</span>
              <IconCheck v-if="nullSelected" :size="16" class="tw:shrink-0" />
            </button>
            <button
              v-else
              :id="rowDomId(index)"
              type="button"
              role="option"
              :aria-selected="isSelected(row.option)"
              :aria-disabled="row.option.disabled || undefined"
              :disabled="row.option.disabled"
              class="tw:flex tw:min-h-11 tw:sm:min-h-9 tw:w-full tw:items-center tw:gap-2 tw:rounded-lg tw:px-3 tw:py-2 tw:text-start tw:text-sm tw:transition-colors tw:active:bg-primary/10"
              :class="[
                row.option.disabled
                  ? 'tw:cursor-not-allowed tw:opacity-50'
                  : isSelected(row.option)
                    ? 'tw:bg-primary/10 tw:text-primary'
                    : 'tw:text-on-main tw:hover:bg-primary/5',
                activeIndex === index && 'tw:ring-2 tw:ring-inset tw:ring-primary/40',
              ]"
              @click="selectOption(row.option)"
              @mousemove="activeIndex = index"
            >
              <slot name="option" :opt="row.option" :selected="isSelected(row.option)">
                <slot name="option-prefix" :opt="row.option">
                  <img
                    v-if="row.option.avatar"
                    :src="row.option.avatar"
                    alt=""
                    class="tw:size-6 tw:shrink-0 tw:rounded-full tw:object-cover"
                  />
                  <component :is="row.option.icon" v-else-if="row.option.icon" :size="18" class="tw:shrink-0" />
                </slot>
                <span class="tw:min-w-0 tw:flex-1">
                  <span class="tw:block tw:truncate tw:font-medium" :title="row.option.label">
                    {{ row.option.label }}
                  </span>
                  <span
                    v-if="row.option.description"
                    class="tw:block tw:truncate tw:text-label tw:text-secondary"
                  >
                    {{ row.option.description }}
                  </span>
                </span>
                <slot name="option-suffix" :opt="row.option" />
                <IconCheck v-if="isSelected(row.option)" :size="16" class="tw:shrink-0" />
              </slot>
            </button>
          </template>
        </div>
      </div>

      <!-- Plain list -->
      <div
        v-else
        :id="listboxId"
        role="listbox"
        :aria-multiselectable="multiple || undefined"
        class="tw:max-h-[60vh] tw:sm:max-h-64 tw:overflow-y-auto tw:p-1"
      >
        <template v-for="(row, index) in displayRows" :key="row.key">
          <div
            v-if="row.kind === 'header'"
            class="tw:px-3 tw:py-1.5 tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wider tw:text-secondary"
            role="presentation"
          >
            {{ row.label }}
          </div>
          <button
            v-else-if="row.kind === 'null'"
            :id="rowDomId(index)"
            type="button"
            role="option"
            :aria-selected="nullSelected"
            class="tw:flex tw:min-h-11 tw:sm:min-h-9 tw:w-full tw:items-center tw:justify-between tw:gap-2 tw:rounded-lg tw:px-3 tw:py-2 tw:text-start tw:text-sm tw:transition-colors"
            :class="[
              nullSelected ? 'tw:bg-primary/10 tw:text-primary' : 'tw:text-on-main tw:hover:bg-primary/5',
              activeIndex === index && 'tw:ring-2 tw:ring-inset tw:ring-primary/40',
            ]"
            @click="selectNull"
            @mousemove="activeIndex = index"
          >
            <span class="tw:font-medium">{{ row.label }}</span>
            <IconCheck v-if="nullSelected" :size="16" class="tw:shrink-0" />
          </button>
          <button
            v-else
            :id="rowDomId(index)"
            type="button"
            role="option"
            :aria-selected="isSelected(row.option)"
            :aria-disabled="row.option.disabled || undefined"
            :disabled="row.option.disabled"
            class="tw:flex tw:min-h-11 tw:sm:min-h-9 tw:w-full tw:items-center tw:gap-2 tw:rounded-lg tw:px-3 tw:py-2 tw:text-start tw:text-sm tw:transition-colors tw:active:bg-primary/10"
            :class="[
              row.option.disabled
                ? 'tw:cursor-not-allowed tw:opacity-50'
                : isSelected(row.option)
                  ? 'tw:bg-primary/10 tw:text-primary'
                  : 'tw:text-on-main tw:hover:bg-primary/5',
              activeIndex === index && 'tw:ring-2 tw:ring-inset tw:ring-primary/40',
            ]"
            @click="selectOption(row.option)"
            @mousemove="activeIndex = index"
          >
            <slot name="option" :opt="row.option" :selected="isSelected(row.option)">
              <slot name="option-prefix" :opt="row.option">
                <img
                  v-if="row.option.avatar"
                  :src="row.option.avatar"
                  alt=""
                  class="tw:size-6 tw:shrink-0 tw:rounded-full tw:object-cover"
                />
                <component :is="row.option.icon" v-else-if="row.option.icon" :size="18" class="tw:shrink-0" />
              </slot>
              <span class="tw:min-w-0 tw:flex-1">
                <span class="tw:block tw:truncate tw:font-medium" :title="row.option.label">
                  {{ row.option.label }}
                </span>
                <span
                  v-if="row.option.description"
                  class="tw:block tw:truncate tw:text-label tw:text-secondary"
                >
                  {{ row.option.description }}
                </span>
              </span>
              <slot name="option-suffix" :opt="row.option" />
              <IconCheck v-if="isSelected(row.option)" :size="16" class="tw:shrink-0" />
            </slot>
          </button>
        </template>
      </div>

      <!-- Count footer -->
      <div
        v-if="!loading && displayRows.length"
        class="tw:border-t tw:border-divider tw:px-3 tw:py-1.5 tw:text-caption tw:text-secondary"
      >
        {{ query ? `${optionCount} of ${normalizedOptions.length}` : optionCount }}
        {{ optionCount === 1 ? 'option' : 'options' }}
      </div>

      <!-- Consumer footer (e.g. an inline "Add new …" create action). `close`
           dismisses the panel — desktop popover or mobile sheet alike. -->
      <slot name="footer" :close="closePopover" />
    </DefineMenu>

    <!-- ============================ desktop: anchored popover ============================ -->
    <BasePopover
      v-if="!isMobile"
      placement="bottom-start"
      :arrow="false"
      :flip="true"
      :offset="6"
      :disabled="disabled"
      fullWidth
    >
      <template #button="{ open }">
        <span class="tw:hidden">{{ syncOpen(open) }}</span>
        <ReuseTrigger :open="open" :focusable="false" />
      </template>

      <template #content="{ close }">
        <!-- Capture close() so keyboard/selection can dismiss the panel. -->
        <span class="tw:hidden">{{ ((desktopClose = close), '') }}</span>
        <div
          class="tw:w-72 tw:max-w-[90vw] tw:overflow-hidden tw:rounded-xl tw:bg-card"
          :class="menuClass"
        >
          <ReuseMenu />
        </div>
      </template>
    </BasePopover>

    <!-- ============================ mobile: bottom sheet ============================ -->
    <template v-else>
      <div @click="!disabled && (mobileOpen = true)">
        <ReuseTrigger :open="mobileOpen" :focusable="true" />
      </div>

      <Teleport to="body">
        <Transition
          enterActiveClass="tw:transition tw:duration-200 tw:ease-out"
          enterFromClass="tw:opacity-0"
          enterToClass="tw:opacity-100"
          leaveActiveClass="tw:transition tw:duration-150 tw:ease-in"
          leaveFromClass="tw:opacity-100"
          leaveToClass="tw:opacity-0"
        >
          <div
            v-if="mobileOpen"
            class="tw:fixed tw:inset-0 tw:z-[60] tw:bg-black/40"
            @click="mobileOpen = false"
          />
        </Transition>
        <Transition
          enterActiveClass="tw:transition tw:duration-300 tw:ease-out"
          enterFromClass="tw:translate-y-full"
          enterToClass="tw:translate-y-0"
          leaveActiveClass="tw:transition tw:duration-200 tw:ease-in"
          leaveFromClass="tw:translate-y-0"
          leaveToClass="tw:translate-y-full"
        >
          <div
            v-if="mobileOpen"
            role="dialog"
            aria-modal="true"
            class="tw:fixed tw:inset-x-0 tw:bottom-0 tw:z-[60] tw:flex tw:max-h-[85vh] tw:flex-col tw:overflow-hidden tw:rounded-t-2xl tw:bg-card tw:shadow-floating tw:overscroll-contain"
            :class="menuClass"
          >
            <div class="tw:mx-auto tw:mt-2 tw:mb-1 tw:h-1 tw:w-10 tw:shrink-0 tw:rounded-full tw:bg-divider" />
            <ReuseMenu />
          </div>
        </Transition>
      </Teleport>
    </template>

    <BaseErrorText v-if="displayError">{{ displayError }}</BaseErrorText>
    <p v-else-if="hint || slots.hint" class="tw:text-caption tw:text-secondary">
      <slot name="hint">{{ hint }}</slot>
    </p>
  </div>
</template>
