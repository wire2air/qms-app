<script setup>
/**
 * Friendly schedule picker. Three modes:
 *
 *   1. Frequency  — pick "Daily / Weekly / Monthly / Quarterly /
 *                   Semi-annually / Annually" + a time of day (and
 *                   weekday(s) / day-of-month / month, where relevant).
 *                   Emits the matching 5-field cron expression.
 *   2. Preset     — a handful of canned patterns ("Daily at 8am",
 *                   "Weekly: Monday 8am", etc.) for users who want
 *                   one click.
 *   3. Advanced   — raw 5-field cron entry for power users.
 *
 * Emits a v-model cron string in standard 5-field form
 * ("minute hour day-of-month month day-of-week"). The backend uses
 * cron-parser to validate + iterate; this picker doesn't preview the
 * actual occurrence times (the FormAssignment create endpoint validates
 * the syntax on submit and reports errors).
 *
 * Notes on the frequency → cron mapping:
 *   Daily              → "M H * * *"
 *   Weekly             → "M H * * DOW[,DOW...]"
 *   Monthly            → "M H D * *"
 *   Quarterly          → "M H D 1,4,7,10 *"
 *   Semi-annually      → "M H D 1,7 *"
 *   Annually           → "M H D MM *"
 *
 * Day-of-month values > 28 silently skip shorter months (e.g. D=31 on
 * February). For Inspections & Logs we surface a hint next to the input.
 */

defineProps({
  timezone: { type: String, default: 'UTC' },
})

defineEmits(['update:modelValue'])

const modelValue = defineModel({ type: String, default: '0 8 * * *' })
// Second v-model so the parent can drive frequency-aware UI (e.g.
// rendering window/grace inputs in days vs hours vs minutes). Stays
// in sync regardless of which picker tab is active — Preset and
// Advanced modes derive the frequency from the cron string.
const frequencyModel = defineModel('frequency', { type: String, default: 'daily' })

const PRESETS = [
  { label: 'Daily at 6am', value: '0 6 * * *' },
  { label: 'Daily at 8am', value: '0 8 * * *' },
  { label: 'Daily at 6pm', value: '0 18 * * *' },
  { label: 'Weekly: Monday 8am', value: '0 8 * * MON' },
  { label: 'Weekly: Friday 4pm', value: '0 16 * * FRI' },
  { label: 'Monthly: 1st at 9am', value: '0 9 1 * *' },
  { label: 'Quarterly: 1st of Jan/Apr/Jul/Oct at 9am', value: '0 9 1 1,4,7,10 *' },
  { label: 'Semi-annually: 1st of Jan/Jul at 9am', value: '0 9 1 1,7 *' },
  { label: 'Annually: 1 Jan at 9am', value: '0 9 1 1 *' },
]

const MODE = { FREQUENCY: 'frequency', PRESET: 'preset', ADVANCED: 'advanced' }
const mode = ref(MODE.FREQUENCY)

// ─── Frequency builder state ───────────────────────────────────────
const FREQ = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  SEMI_ANNUAL: 'semi_annual',
  ANNUAL: 'annual',
}

const frequency = ref(FREQ.DAILY)
const time = ref('08:00') // HH:MM (24h)
const weekdays = ref(['MON']) // Weekly
const dayOfMonth = ref(1) // Monthly / Quarterly / Semi-annually / Annually
const month = ref(1) // Annually only (1–12)

const WEEKDAY_OPTIONS = [
  { value: 'MON', label: 'Mon' },
  { value: 'TUE', label: 'Tue' },
  { value: 'WED', label: 'Wed' },
  { value: 'THU', label: 'Thu' },
  { value: 'FRI', label: 'Fri' },
  { value: 'SAT', label: 'Sat' },
  { value: 'SUN', label: 'Sun' },
]

const MONTH_OPTIONS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
]

function parseHM(s) {
  const [hh, mm] = (s ?? '08:00').split(':').map((n) => parseInt(n, 10))
  return {
    hour: Number.isFinite(hh) ? hh : 8,
    minute: Number.isFinite(mm) ? mm : 0,
  }
}

// Build a cron string from the current frequency picker state.
function cronFromFrequency() {
  const { hour, minute } = parseHM(time.value)
  const dom = Math.max(1, Math.min(31, Number(dayOfMonth.value) || 1))
  const M = String(minute)
  const H = String(hour)
  switch (frequency.value) {
    case FREQ.DAILY:
      return `${M} ${H} * * *`
    case FREQ.WEEKLY: {
      const dow = (weekdays.value?.length ? weekdays.value : ['MON']).join(',')
      return `${M} ${H} * * ${dow}`
    }
    case FREQ.MONTHLY:
      return `${M} ${H} ${dom} * *`
    case FREQ.QUARTERLY:
      return `${M} ${H} ${dom} 1,4,7,10 *`
    case FREQ.SEMI_ANNUAL:
      return `${M} ${H} ${dom} 1,7 *`
    case FREQ.ANNUAL: {
      const mm = Math.max(1, Math.min(12, Number(month.value) || 1))
      return `${M} ${H} ${dom} ${mm} *`
    }
    default:
      return modelValue.value
  }
}

// Push the picker's selection into modelValue whenever it changes.
// This is the single sink in frequency mode.
watch(
  [frequency, time, weekdays, dayOfMonth, month],
  () => {
    if (mode.value === MODE.FREQUENCY) {
      modelValue.value = cronFromFrequency()
    }
  },
  { deep: true },
)

// When switching INTO frequency mode, seed the controls from whatever
// is currently in modelValue (best-effort — falls back to defaults if
// the cron expression is too complex to reverse-engineer).
function seedFrequencyFromCron(cron) {
  const parts = (cron ?? '').trim().split(/\s+/)
  if (parts.length !== 5) return
  const [minuteF, hourF, domF, monthF, dowF] = parts
  const minuteN = parseInt(minuteF, 10)
  const hourN = parseInt(hourF, 10)
  if (Number.isFinite(minuteN) && Number.isFinite(hourN)) {
    time.value = `${String(hourN).padStart(2, '0')}:${String(minuteN).padStart(2, '0')}`
  }
  if (domF === '*' && monthF === '*' && dowF === '*') {
    frequency.value = FREQ.DAILY
  } else if (domF === '*' && monthF === '*') {
    frequency.value = FREQ.WEEKLY
    weekdays.value = dowF.split(',')
  } else if (monthF === '*') {
    frequency.value = FREQ.MONTHLY
    const d = parseInt(domF, 10)
    if (Number.isFinite(d)) dayOfMonth.value = d
  } else if (monthF === '1,4,7,10') {
    frequency.value = FREQ.QUARTERLY
    const d = parseInt(domF, 10)
    if (Number.isFinite(d)) dayOfMonth.value = d
  } else if (monthF === '1,7') {
    frequency.value = FREQ.SEMI_ANNUAL
    const d = parseInt(domF, 10)
    if (Number.isFinite(d)) dayOfMonth.value = d
  } else if (/^\d+$/.test(monthF)) {
    frequency.value = FREQ.ANNUAL
    const d = parseInt(domF, 10)
    const m = parseInt(monthF, 10)
    if (Number.isFinite(d)) dayOfMonth.value = d
    if (Number.isFinite(m)) month.value = m
  }
}

watch(mode, (m) => {
  if (m === MODE.FREQUENCY) seedFrequencyFromCron(modelValue.value)
})

// Seed the frequency controls from modelValue — at setup AND whenever it
// changes from the OUTSIDE (the editor loads an existing plan's cron
// asynchronously, after this component mounts). Without this the clock
// stays on the default and editing a saved schedule shows the wrong time.
//
// Guards:
//  - Skip when the incoming value already matches what our controls
//    produce (it's our own emit) — avoids a feedback loop with the sink
//    watcher above.
//  - If the cron isn't representable in frequency mode (the re-seeded
//    controls would produce a different cron), drop to Advanced so the
//    sink doesn't clobber the raw expression.
watch(
  modelValue,
  (cron) => {
    if (mode.value !== MODE.FREQUENCY) return
    if (cron === cronFromFrequency()) return
    seedFrequencyFromCron(cron)
    if (cronFromFrequency() !== cron) mode.value = MODE.ADVANCED
  },
  { immediate: true },
)

// Best-effort cron → frequency category. Stays in sync from any of the
// three picker modes; the parent reads this via v-model:frequency to
// pick the right unit (minutes vs hours vs days) for window/grace.
function inferFrequency(cron) {
  const parts = (cron ?? '').trim().split(/\s+/)
  if (parts.length !== 5) return FREQ.DAILY
  const [, , domF, monthF, dowF] = parts
  if (domF === '*' && monthF === '*' && dowF === '*') return FREQ.DAILY
  if (domF === '*' && monthF === '*') return FREQ.WEEKLY
  if (monthF === '*') return FREQ.MONTHLY
  if (monthF === '1,4,7,10') return FREQ.QUARTERLY
  if (monthF === '1,7') return FREQ.SEMI_ANNUAL
  if (/^\d+$/.test(monthF)) return FREQ.ANNUAL
  return FREQ.DAILY
}

watch(
  [() => mode.value, () => frequency.value, () => modelValue.value],
  () => {
    const next = mode.value === MODE.FREQUENCY ? frequency.value : inferFrequency(modelValue.value)
    if (frequencyModel.value !== next) frequencyModel.value = next
  },
  { immediate: true },
)

// ─── Advanced (raw 5-field) state ──────────────────────────────────
const fields = computed({
  get() {
    const parts = (modelValue.value ?? '').trim().split(/\s+/)
    return {
      minute: parts[0] ?? '*',
      hour: parts[1] ?? '*',
      dom: parts[2] ?? '*',
      month: parts[3] ?? '*',
      dow: parts[4] ?? '*',
    }
  },
  set(v) {
    modelValue.value = [v.minute, v.hour, v.dom, v.month, v.dow].join(' ')
  },
})

function setField(name, value) {
  fields.value = { ...fields.value, [name]: value }
}

function pickPreset(value) {
  modelValue.value = value
}

function toggleWeekday(d) {
  const set = new Set(weekdays.value ?? [])
  if (set.has(d)) set.delete(d)
  else set.add(d)
  // Don't allow zero weekdays — fall back to MON to keep the cron valid.
  weekdays.value = set.size === 0 ? ['MON'] : [...set]
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-2">
    <div class="tw:flex tw:items-center tw:justify-between">
      <label class="tw:text-xs tw:font-semibold tw:text-secondary">Schedule</label>
      <div class="tw:flex tw:items-center tw:gap-1 tw:text-xs">
        <button
          type="button"
          class="tw:px-2 tw:py-0.5 tw:rounded"
          :class="
            mode === MODE.FREQUENCY
              ? 'tw:bg-primary/10 tw:text-primary tw:font-semibold'
              : 'tw:text-secondary tw:hover:text-on-main'
          "
          @click="mode = MODE.FREQUENCY"
        >
          Frequency
        </button>
        <button
          type="button"
          class="tw:px-2 tw:py-0.5 tw:rounded"
          :class="
            mode === MODE.PRESET
              ? 'tw:bg-primary/10 tw:text-primary tw:font-semibold'
              : 'tw:text-secondary tw:hover:text-on-main'
          "
          @click="mode = MODE.PRESET"
        >
          Presets
        </button>
        <button
          type="button"
          class="tw:px-2 tw:py-0.5 tw:rounded"
          :class="
            mode === MODE.ADVANCED
              ? 'tw:bg-primary/10 tw:text-primary tw:font-semibold'
              : 'tw:text-secondary tw:hover:text-on-main'
          "
          @click="mode = MODE.ADVANCED"
        >
          Advanced
        </button>
      </div>
    </div>

    <!-- Frequency mode — the default. Each radio reveals just the
         controls relevant to that frequency. -->
    <template v-if="mode === MODE.FREQUENCY">
      <div class="tw:flex tw:items-center tw:gap-2">
        <span class="tw:text-xs tw:font-semibold tw:text-secondary">Frequency</span>
        <select
          v-model="frequency"
          class="tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
        >
          <option :value="FREQ.DAILY">Daily</option>
          <option :value="FREQ.WEEKLY">Weekly</option>
          <option :value="FREQ.MONTHLY">Monthly</option>
          <option :value="FREQ.QUARTERLY">Quarterly</option>
          <option :value="FREQ.SEMI_ANNUAL">Semi-annually</option>
          <option :value="FREQ.ANNUAL">Annually</option>
        </select>

        <span class="tw:text-xs tw:font-semibold tw:text-secondary tw:ml-2">at</span>
        <input
          v-model="time"
          type="time"
          class="tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
        />
      </div>

      <div v-if="frequency === FREQ.WEEKLY" class="tw:flex tw:items-center tw:gap-1 tw:flex-wrap">
        <span class="tw:text-xs tw:font-semibold tw:text-secondary tw:mr-1">On</span>
        <button
          v-for="d in WEEKDAY_OPTIONS"
          :key="d.value"
          type="button"
          class="tw:px-2 tw:py-1 tw:text-xs tw:rounded tw:border"
          :class="
            weekdays.includes(d.value)
              ? 'tw:bg-primary tw:text-white tw:border-primary'
              : 'tw:bg-card tw:text-on-main tw:border-divider tw:hover:bg-main-hover'
          "
          @click="toggleWeekday(d.value)"
        >
          {{ d.label }}
        </button>
      </div>

      <div
        v-if="
          [FREQ.MONTHLY, FREQ.QUARTERLY, FREQ.SEMI_ANNUAL, FREQ.ANNUAL].includes(frequency)
        "
        class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap"
      >
        <span class="tw:text-xs tw:font-semibold tw:text-secondary">On day</span>
        <input
          v-model.number="dayOfMonth"
          type="number"
          min="1"
          max="31"
          class="tw:w-20 tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
        />
        <span class="tw:text-caption tw:text-secondary tw:italic">
          of the month (29–31 are skipped in shorter months)
        </span>
      </div>

      <div v-if="frequency === FREQ.ANNUAL" class="tw:flex tw:items-center tw:gap-2">
        <span class="tw:text-xs tw:font-semibold tw:text-secondary">In</span>
        <select
          v-model.number="month"
          class="tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
        >
          <option v-for="m in MONTH_OPTIONS" :key="m.value" :value="m.value">
            {{ m.label }}
          </option>
        </select>
      </div>
    </template>

    <!-- Preset mode — quick picks. -->
    <select
      v-if="mode === MODE.PRESET"
      :value="PRESETS.find((p) => p.value === modelValue) ? modelValue : ''"
      class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:text-on-main tw:px-3 tw:py-1.5 tw:text-sm"
      @change="(e) => pickPreset(e.target.value)"
    >
      <option value="" disabled>Pick a preset…</option>
      <option v-for="p in PRESETS" :key="p.value" :value="p.value">{{ p.label }}</option>
    </select>

    <!-- Advanced mode — raw five fields. -->
    <div v-if="mode === MODE.ADVANCED" class="tw:grid tw:grid-cols-2 tw:sm:grid-cols-3 tw:lg:grid-cols-5 tw:gap-1.5">
      <div class="tw:flex tw:flex-col">
        <span class="tw:text-micro tw:text-secondary tw:uppercase">Minute</span>
        <input
          type="text"
          :value="fields.minute"
          class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-xs tw:font-mono"
          @change="(e) => setField('minute', e.target.value)"
        />
      </div>
      <div class="tw:flex tw:flex-col">
        <span class="tw:text-micro tw:text-secondary tw:uppercase">Hour</span>
        <input
          type="text"
          :value="fields.hour"
          class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-xs tw:font-mono"
          @change="(e) => setField('hour', e.target.value)"
        />
      </div>
      <div class="tw:flex tw:flex-col">
        <span class="tw:text-micro tw:text-secondary tw:uppercase">Dom</span>
        <input
          type="text"
          :value="fields.dom"
          class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-xs tw:font-mono"
          @change="(e) => setField('dom', e.target.value)"
        />
      </div>
      <div class="tw:flex tw:flex-col">
        <span class="tw:text-micro tw:text-secondary tw:uppercase">Month</span>
        <input
          type="text"
          :value="fields.month"
          class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-xs tw:font-mono"
          @change="(e) => setField('month', e.target.value)"
        />
      </div>
      <div class="tw:flex tw:flex-col">
        <span class="tw:text-micro tw:text-secondary tw:uppercase">Dow</span>
        <input
          type="text"
          :value="fields.dow"
          class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-xs tw:font-mono"
          @change="(e) => setField('dow', e.target.value)"
        />
      </div>
    </div>

    <div class="tw:flex tw:items-center tw:gap-2 tw:text-xs tw:text-secondary tw:font-mono">
      <span class="tw:text-on-main tw:font-bold">{{ modelValue || '—' }}</span>
      <span v-if="timezone" class="tw:text-secondary">({{ timezone }})</span>
    </div>
    <div class="tw:text-caption tw:text-secondary tw:italic">
      Backend validates the expression on save; invalid syntax is rejected with a clear error.
    </div>
  </div>
</template>
