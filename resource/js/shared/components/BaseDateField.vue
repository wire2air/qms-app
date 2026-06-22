<script setup>
/**
 * BaseDateField — the unified date/time field. A trigger button shows the
 * formatted value (or placeholder); clicking opens a popover with BaseCalendar
 * (+ a preset rail for range mode and a time panel for datetime/time). v-model
 * is luxon DateTime by default; valueFormat="iso" switches to ISO strings.
 *
 * mode: 'date' | 'datetime' | 'time' | 'range' | 'month' | 'year'
 *
 * Replaces BaseDatePicker / BaseDateTimePicker / BaseTimePicker / BaseDateRangeInput.
 */
import { DateTime } from 'luxon'
import { computePosition, offset, flip, shift, autoUpdate } from '@floating-ui/dom'
import { IconCalendar, IconClock, IconChevronDown, IconX } from '@tabler/icons-vue'
import { useDateField, formatField, parseManual } from '@/composables/useDateField.js'
import { PRESETS, resolvePreset } from '@/utils/dateRanges.js'

const props = defineProps({
  mode: { type: String, default: 'date' },
  valueFormat: { type: String, default: 'datetime' }, // 'datetime' | 'iso'
  displayFormat: { type: String, default: null },
  minDate: { type: [Object, String, null], default: null },
  maxDate: { type: [Object, String, null], default: null },
  disabledDates: { type: [Array, Function, null], default: null },
  disabled: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
  clearable: { type: Boolean, default: false },
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  placeholder: { type: String, default: '' },
  size: { type: String, default: 'md' }, // 'sm' | 'md' | 'lg'
  density: { type: String, default: 'comfortable' }, // 'comfortable' | 'compact'
  error: { type: [String, Boolean], default: false },
  helperText: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  autofocus: { type: Boolean, default: false },
  allowManualInput: { type: Boolean, default: true },
  weekNumbers: { type: Boolean, default: false },
  firstDayOfWeek: { type: Number, default: 1 },
  showToday: { type: Boolean, default: false },
  presets: { type: Array, default: () => PRESETS },
  timezone: { type: String, default: null },
  locale: { type: String, default: null },
})
const emit = defineEmits(['update:modelValue', 'change', 'clear', 'focus', 'blur', 'open', 'close'])

const model = defineModel({ type: [Object, Array, String, null], default: null })

const modeRef = computed(() => props.mode)
const valueFormatRef = computed(() => props.valueFormat)
const displayFormatRef = computed(() => props.displayFormat)
const { internal, commit, clear: clearInternal } = useDateField({
  model,
  mode: modeRef,
  valueFormat: valueFormatRef,
  displayFormat: displayFormatRef,
})

const open = ref(false)
const triggerEl = ref(null)
const panelEl = ref(null)

const selectionMode = computed(() => {
  if (props.mode === 'range') return 'range'
  if (props.multiple) return 'multiple'
  return 'single'
})

function coerceBound(v) {
  if (!v) return null
  return DateTime.isDateTime(v) ? v : DateTime.fromISO(String(v))
}
const minDt = computed(() => coerceBound(props.minDate))
const maxDt = computed(() => coerceBound(props.maxDate))

// Trigger display text (range shows "a – b"; otherwise the formatted value).
const displayText = computed(() => {
  if (props.mode === 'range') {
    const r = model.value || {}
    const f = r.start ? formatField(r.start, 'date', props.displayFormat) : ''
    const t = r.end ? formatField(r.end, 'date', props.displayFormat) : ''
    if (f && t) return `${f} – ${t}`
    if (f) return `From ${f}`
    return ''
  }
  return formatField(internal.value, props.mode, props.displayFormat)
})
const hasValue = computed(() =>
  props.mode === 'range' ? !!(model.value?.start || model.value?.end) : !!internal.value,
)

const sizeClass = computed(
  () => ({ sm: 'tw:h-7 tw:text-xs', md: 'tw:h-9 tw:text-sm', lg: 'tw:h-11 tw:text-base' })[props.size],
)
const TriggerIcon = computed(() => (props.mode === 'time' ? IconClock : IconCalendar))

function toggle() {
  if (props.disabled || props.readonly) return
  open.value = !open.value
  emit(open.value ? 'open' : 'close')
}
function close() {
  if (!open.value) return
  open.value = false
  emit('close')
}

function onCalendarUpdate(v) {
  // Single/datetime/month/year → DateTime; range → {start,end}; multiple → array
  if (props.mode === 'range' || props.multiple) {
    model.value = v
  } else {
    commit(v)
  }
  emit('change', model.value)
  // Close on a completed single pick (range closes only when both ends set).
  if (props.mode === 'range') {
    if (v?.start && v?.end) close()
  } else if (!props.multiple && props.mode !== 'datetime' && props.mode !== 'time') {
    close()
  }
}

function pickPreset(preset) {
  const r = resolvePreset(preset.id)
  if (!r) return // 'custom' — keep open
  model.value = { start: r.start, end: r.end }
  emit('change', model.value)
  close()
}

function clear() {
  if (props.mode === 'range') model.value = { start: null, end: null }
  else clearInternal()
  emit('clear')
  emit('change', model.value)
}

function onManualInput(e) {
  if (!props.allowManualInput) return
  const dt = parseManual(e.target.value, props.mode)
  if (dt) {
    commit(dt)
    emit('change', model.value)
  }
}

// floating positioning (mirror BaseFilterFlyout)
let stop = null
function place() {
  if (!triggerEl.value || !panelEl.value) return
  computePosition(triggerEl.value, panelEl.value, {
    strategy: 'fixed',
    placement: 'bottom-start',
    middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
  }).then(({ x, y }) => {
    if (panelEl.value) Object.assign(panelEl.value.style, { left: `${x}px`, top: `${y}px` })
  })
}
watch(open, (v) => {
  if (v) {
    nextTick(() => {
      if (typeof window !== 'undefined' && window.ResizeObserver && triggerEl.value && panelEl.value) {
        stop = autoUpdate(triggerEl.value, panelEl.value, place)
      } else {
        place()
      }
    })
  } else if (stop) {
    stop()
    stop = null
  }
})
function onDocMouseDown(e) {
  if (!open.value) return
  if (triggerEl.value?.contains(e.target)) return
  if (e.target.closest?.('[data-date-panel]')) return
  close()
}
onMounted(() => {
  document.addEventListener('mousedown', onDocMouseDown)
  if (props.autofocus) triggerEl.value?.focus()
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMouseDown)
  if (stop) stop()
})
</script>

<template>
  <div class="tw:inline-flex tw:flex-col tw:gap-1">
    <div ref="triggerEl" class="tw:inline-flex tw:items-center tw:gap-1">
      <button
        type="button"
        :disabled="disabled"
        aria-haspopup="dialog"
        :aria-expanded="open"
        class="tw:inline-flex tw:min-w-0 tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:bg-card tw:px-2.5 tw:text-on-main tw:transition-colors tw:focus:ring-2 tw:focus:ring-primary/20 tw:focus:outline-none tw:disabled:cursor-not-allowed tw:disabled:opacity-50"
        :class="[
          sizeClass,
          open ? 'tw:border-primary' : error ? 'tw:border-red-400' : 'tw:border-divider tw:hover:bg-main-hover',
        ]"
        @click="toggle"
      >
        <component :is="TriggerIcon" :size="16" class="tw:shrink-0 tw:text-secondary" aria-hidden="true" />
        <span v-if="displayText" class="tw:truncate">{{ displayText }}</span>
        <span v-else class="tw:truncate tw:text-placeholder">{{ placeholder || 'Select…' }}</span>
        <BaseSpinner v-if="loading" size="sm" class="tw:ms-auto tw:shrink-0" />
        <IconChevronDown v-else :size="14" class="tw:ms-auto tw:shrink-0 tw:text-secondary" />
      </button>
      <button
        v-if="clearable && hasValue && !disabled"
        type="button"
        aria-label="Clear"
        class="tw:shrink-0 tw:rounded tw:p-1 tw:text-secondary tw:hover:text-on-main"
        @click="clear"
      >
        <IconX :size="14" />
      </button>
    </div>

    <p v-if="error && typeof error === 'string'" class="tw:text-xs tw:text-red-500">{{ error }}</p>
    <p v-else-if="helperText" class="tw:text-xs tw:text-secondary">{{ helperText }}</p>

    <Teleport to="body">
      <div
        v-if="open"
        ref="panelEl"
        data-date-panel
        role="dialog"
        aria-label="Choose date"
        class="tw:fixed tw:left-0 tw:top-0 tw:z-popover tw:flex tw:overflow-hidden tw:rounded-xl tw:border tw:border-divider tw:bg-card tw:shadow-floating"
      >
        <!-- preset rail (range mode) -->
        <div
          v-if="mode === 'range'"
          class="tw:flex tw:min-w-36 tw:flex-col tw:gap-0.5 tw:border-r tw:border-divider tw:p-1"
        >
          <button
            v-for="p in presets"
            :key="p.id"
            type="button"
            class="tw:rounded-md tw:px-2 tw:py-1.5 tw:text-left tw:text-sm tw:text-on-main tw:hover:bg-main-hover"
            @click="pickPreset(p)"
          >
            {{ p.label }}
          </button>
        </div>

        <div class="tw:flex tw:flex-col">
          <BaseCalendar
            v-if="mode !== 'time'"
            :modelValue="mode === 'range' || multiple ? model : internal"
            :selectionMode="selectionMode"
            :minDate="minDt"
            :maxDate="maxDt"
            :disabledDates="disabledDates"
            :firstDayOfWeek="firstDayOfWeek"
            :weekNumbers="weekNumbers"
            :showToday="showToday"
            :timezone="timezone"
            :locale="locale"
            @update:modelValue="onCalendarUpdate"
          />

          <!-- manual text input -->
          <div v-if="allowManualInput && mode !== 'range' && mode !== 'time'" class="tw:border-t tw:border-divider tw:p-2">
            <input
              type="text"
              :placeholder="mode === 'datetime' ? 'yyyy-mm-dd' : 'Type a date'"
              class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-transparent tw:px-2 tw:py-1 tw:text-sm tw:outline-none tw:focus:border-primary"
              @change="onManualInput"
            />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
