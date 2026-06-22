<script setup>
/**
 * BaseCalendar — headless month grid on luxon. No popover, no input. Renders a
 * focusable, ARIA-correct day grid with month nav, min/max/disabled gating, and
 * single / multiple / range selection. Used by BaseDateField; reusable on its own.
 */
import { DateTime } from 'luxon'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-vue'

const props = defineProps({
  modelValue: { type: [Object, Array, null], default: null }, // DateTime | DateTime[] | {start,end}
  selectionMode: { type: String, default: 'single' }, // 'single' | 'multiple' | 'range'
  minDate: { type: [Object, null], default: null },
  maxDate: { type: [Object, null], default: null },
  disabledDates: { type: [Array, Function, null], default: null },
  firstDayOfWeek: { type: Number, default: 1 }, // 1=Mon … 7=Sun (luxon weekday)
  weekNumbers: { type: Boolean, default: false },
  showToday: { type: Boolean, default: false },
  timezone: { type: String, default: null },
  locale: { type: String, default: null },
})
const emit = defineEmits(['update:modelValue'])

function now() {
  let dt = DateTime.now()
  if (props.timezone) dt = dt.setZone(props.timezone)
  if (props.locale) dt = dt.setLocale(props.locale)
  return dt
}

// Fix #2: apply timezone/locale to anchorOf so the grid carries the right zone/locale.
function anchorOf() {
  const v = props.modelValue
  let dt
  if (DateTime.isDateTime(v)) dt = v
  else if (Array.isArray(v) && v.length) dt = v[0]
  else if (v && v.start) dt = v.start
  else dt = now()
  if (props.timezone) dt = dt.setZone(props.timezone)
  if (props.locale) dt = dt.setLocale(props.locale)
  return dt
}

const viewMonth = ref(anchorOf().startOf('month'))

// Fix #6: only reset viewMonth when not mid-range AND the anchor is in a different month.
watch(
  () => props.modelValue,
  () => {
    if (rangeStart.value != null) return
    const anchor = anchorOf().startOf('month')
    if (!anchor.hasSame(viewMonth.value, 'month')) {
      viewMonth.value = anchor
    }
  },
)

// Pending range start while the user is mid-selection.
const rangeStart = ref(null)

// Fix #1: roving tabindex — track the focused ISO date.
function initialFocusedIso() {
  const v = props.modelValue
  if (DateTime.isDateTime(v)) return v.toISODate()
  const n = now()
  if (n.hasSame(viewMonth.value, 'month')) return n.toISODate()
  return viewMonth.value.startOf('month').toISODate()
}
const focusedIso = ref(initialFocusedIso())

// Fix #3: template ref on the grid container for scoped focus queries.
const gridEl = ref(null)

const weekdayLabels = computed(() => {
  const base = viewMonth.value.set({ weekday: props.firstDayOfWeek })
  return Array.from({ length: 7 }, (_, i) => base.plus({ days: i }).toFormat('ccc'))
})

// 6×7 grid of DateTimes covering the visible month.
const weeks = computed(() => {
  const first = viewMonth.value.startOf('month')
  // back up to the configured first day of week
  let cursor = first
  while (cursor.weekday !== props.firstDayOfWeek) cursor = cursor.minus({ days: 1 })
  const out = []
  for (let w = 0; w < 6; w++) {
    const row = []
    for (let d = 0; d < 7; d++) {
      row.push(cursor)
      cursor = cursor.plus({ days: 1 })
    }
    out.push(row)
  }
  return out
})

// Ensure focusedIso is always a day in the current rendered grid;
// if it falls outside the view month after navigation, fall back to the 1st.
const resolvedFocusedIso = computed(() => {
  const allDays = weeks.value.flat()
  if (allDays.some((d) => d.toISODate() === focusedIso.value)) return focusedIso.value
  return viewMonth.value.startOf('month').toISODate()
})

function isDisabled(day) {
  if (props.minDate && day.startOf('day') < props.minDate.startOf('day')) return true
  if (props.maxDate && day.startOf('day') > props.maxDate.startOf('day')) return true
  if (typeof props.disabledDates === 'function') return !!props.disabledDates(day)
  if (Array.isArray(props.disabledDates))
    return props.disabledDates.some((d) => DateTime.isDateTime(d) && d.hasSame(day, 'day'))
  return false
}
function isSelected(day) {
  const v = props.modelValue
  if (DateTime.isDateTime(v)) return v.hasSame(day, 'day')
  if (Array.isArray(v)) return v.some((d) => DateTime.isDateTime(d) && d.hasSame(day, 'day'))
  if (v && (v.start || v.end)) {
    if (v.start && v.start.hasSame(day, 'day')) return true
    if (v.end && v.end.hasSame(day, 'day')) return true
  }
  return false
}

// Fix #7: normalize isInRange to compare startOf('day').
function isInRange(day) {
  const v = props.modelValue
  if (props.selectionMode !== 'range' || !v?.start || !v?.end) return false
  const d = day.startOf('day')
  return d > v.start.startOf('day') && d < v.end.startOf('day')
}
function inMonth(day) {
  return day.hasSame(viewMonth.value, 'month')
}

function select(day) {
  if (isDisabled(day)) return
  focusedIso.value = day.toISODate()
  if (props.selectionMode === 'single') {
    emit('update:modelValue', day.startOf('day'))
  } else if (props.selectionMode === 'multiple') {
    const cur = Array.isArray(props.modelValue) ? props.modelValue : []
    const exists = cur.find((d) => d.hasSame(day, 'day'))
    emit(
      'update:modelValue',
      exists ? cur.filter((d) => !d.hasSame(day, 'day')) : [...cur, day.startOf('day')],
    )
  } else {
    // range
    if (!rangeStart.value) {
      rangeStart.value = day.startOf('day')
      emit('update:modelValue', { start: day.startOf('day'), end: null })
    } else {
      const a = rangeStart.value
      const b = day.startOf('day')
      const start = a <= b ? a : b
      const end = a <= b ? b : a
      rangeStart.value = null
      emit('update:modelValue', { start, end })
    }
  }
}

function prevMonth() {
  viewMonth.value = viewMonth.value.minus({ months: 1 })
}
function nextMonth() {
  viewMonth.value = viewMonth.value.plus({ months: 1 })
}

// Fix #3: scoped focus query within gridEl.
function focusDay(iso) {
  focusedIso.value = iso
  nextTick(() => {
    gridEl.value?.querySelector(`[data-day="${iso}"]`)?.focus()
  })
}
function onKey(day, e) {
  const moves = {
    ArrowRight: { days: 1 },
    ArrowLeft: { days: -1 },
    ArrowDown: { days: 7 },
    ArrowUp: { days: -7 },
  }
  if (moves[e.key]) {
    e.preventDefault()
    const next = day.plus(moves[e.key])
    if (!next.hasSame(viewMonth.value, 'month')) viewMonth.value = next.startOf('month')
    focusDay(next.toISODate())
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    select(day)
  } else if (e.key === 'PageUp') {
    e.preventDefault()
    prevMonth()
  } else if (e.key === 'PageDown') {
    e.preventDefault()
    nextMonth()
  }
}
function selectToday() {
  select(now())
}
</script>

<template>
  <div class="tw:w-72 tw:select-none tw:p-2" role="application" aria-label="Calendar">
    <div class="tw:mb-2 tw:flex tw:items-center tw:justify-between tw:px-1">
      <button
        type="button"
        aria-label="Previous month"
        class="tw:rounded tw:p-1 tw:text-secondary tw:hover:bg-main-hover"
        @click="prevMonth"
      >
        <IconChevronLeft :size="16" />
      </button>
      <span class="tw:text-sm tw:font-semibold tw:text-on-main">
        {{ viewMonth.toFormat('LLLL yyyy') }}
      </span>
      <button
        type="button"
        aria-label="Next month"
        class="tw:rounded tw:p-1 tw:text-secondary tw:hover:bg-main-hover"
        @click="nextMonth"
      >
        <IconChevronRight :size="16" />
      </button>
    </div>

    <!-- Fix #3: bind gridEl ref; Fix #5: per-row structure with role="row" -->
    <div ref="gridEl" role="grid" class="tw:text-center">
      <!-- Weekday header row — Fix #5: match col count when weekNumbers enabled; Fix #4: key by index -->
      <div
        role="row"
        class="tw:grid tw:gap-0.5"
        :class="weekNumbers ? 'tw:grid-cols-8' : 'tw:grid-cols-7'"
      >
        <!-- blank corner cell when week numbers are shown -->
        <span v-if="weekNumbers" aria-hidden="true" />
        <span
          v-for="(lbl, i) in weekdayLabels"
          :key="i"
          class="tw:py-1 tw:text-micro tw:font-medium tw:uppercase tw:text-secondary"
        >
          {{ lbl }}
        </span>
      </div>

      <!-- Fix #5: each week is a role="row" div; optional leading week-number cell -->
      <div
        v-for="(week, wi) in weeks"
        :key="wi"
        role="row"
        class="tw:grid tw:gap-0.5"
        :class="weekNumbers ? 'tw:grid-cols-8' : 'tw:grid-cols-7'"
      >
        <!-- week number — not a gridcell, not focusable -->
        <span
          v-if="weekNumbers"
          class="tw:flex tw:h-9 tw:items-center tw:justify-center tw:text-micro tw:text-secondary"
          aria-hidden="true"
        >
          {{ week[0].weekNumber }}
        </span>

        <button
          v-for="day in week"
          :key="day.toISODate()"
          type="button"
          role="gridcell"
          :data-day="day.toISODate()"
          :tabindex="day.toISODate() === resolvedFocusedIso ? 0 : -1"
          :disabled="isDisabled(day)"
          :aria-selected="isSelected(day) ? 'true' : 'false'"
          :aria-disabled="isDisabled(day) ? 'true' : 'false'"
          class="tw:flex tw:h-9 tw:items-center tw:justify-center tw:rounded-md tw:text-sm tw:outline-none tw:transition-colors tw:focus:ring-2 tw:focus:ring-primary/30 tw:disabled:cursor-not-allowed tw:disabled:opacity-30"
          :class="[
            isSelected(day)
              ? 'tw:bg-primary tw:text-on-primary tw:font-semibold'
              : isInRange(day)
                ? 'tw:bg-primary/10 tw:text-primary'
                : inMonth(day)
                  ? 'tw:text-on-main tw:hover:bg-main-hover'
                  : 'tw:text-placeholder tw:hover:bg-main-hover',
          ]"
          @click="select(day)"
          @keydown="onKey(day, $event)"
        >
          {{ day.day }}
        </button>
      </div>
    </div>

    <div v-if="showToday" class="tw:mt-2 tw:flex tw:justify-center">
      <button
        type="button"
        class="tw:rounded-md tw:px-3 tw:py-1 tw:text-sm tw:font-medium tw:text-primary tw:hover:bg-main-hover"
        @click="selectToday"
      >
        Today
      </button>
    </div>
  </div>
</template>
