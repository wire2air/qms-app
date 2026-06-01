<script setup>
import { IconCalendar, IconChevronDown } from '@tabler/icons-vue'
import { DateTime } from 'luxon'

/**
 * Friendly date-range picker. v-model is a single object
 * `{ from: 'YYYY-MM-DD' | '', to: 'YYYY-MM-DD' | '' }`. Empty strings
 * = unbounded on that side (so the consumer can keep using its
 * existing "if (from)" / "if (to)" guards).
 *
 * Presets cover the bulk of real-world filtering ("last 30 days",
 * "this month", "last quarter", etc.) so users don't have to click
 * two calendars for the common case. Custom mode still exposes
 * raw date inputs.
 *
 * Why not Quasar's date utils? CLAUDE.md says no Quasar in new code;
 * luxon is the project-wide date library and `DateTime` is already
 * everywhere else.
 */

defineProps({
  // Optional label shown to the left of the trigger button.
  label: { type: String, default: '' },
  // When true, the picker shows the trigger button only and hides
  // its own label slot — useful inside a tight filter row.
  inline: { type: Boolean, default: true },
})

const modelValue = defineModel({
  type: Object,
  default: () => ({ from: '', to: '' }),
})

// Local working copy so the Custom inputs don't fire model writes
// per-keystroke; we commit on close / preset pick.
function ensureShape(v) {
  return { from: v?.from ?? '', to: v?.to ?? '' }
}
const value = computed(() => ensureShape(modelValue.value))

const open = ref(false)
const wrapperRef = ref(null)

// Selected preset id — drives the trigger label and the highlighted
// row in the dropdown. 'custom' = user-edited dates; null = all time.
const selectedPreset = ref(detectPresetFromValue(value.value))

function detectPresetFromValue(v) {
  if (!v.from && !v.to) return 'all'
  for (const p of PRESETS) {
    if (p.id === 'all' || p.id === 'custom') continue
    const r = p.range()
    if (r.from === v.from && r.to === v.to) return p.id
  }
  return 'custom'
}

watch(
  () => modelValue.value,
  (v) => {
    selectedPreset.value = detectPresetFromValue(ensureShape(v))
  },
)

function isoDay(dt) {
  return dt.toISODate()
}

const PRESETS = [
  { id: 'all', label: 'All time', range: () => ({ from: '', to: '' }) },
  {
    id: 'today',
    label: 'Today',
    range: () => {
      const d = DateTime.now()
      return { from: isoDay(d), to: isoDay(d) }
    },
  },
  {
    id: 'yesterday',
    label: 'Yesterday',
    range: () => {
      const d = DateTime.now().minus({ days: 1 })
      return { from: isoDay(d), to: isoDay(d) }
    },
  },
  {
    id: 'last_7_days',
    label: 'Last 7 days',
    range: () => ({
      from: isoDay(DateTime.now().minus({ days: 6 })),
      to: isoDay(DateTime.now()),
    }),
  },
  {
    id: 'last_30_days',
    label: 'Last 30 days',
    range: () => ({
      from: isoDay(DateTime.now().minus({ days: 29 })),
      to: isoDay(DateTime.now()),
    }),
  },
  {
    id: 'this_week',
    label: 'This week',
    range: () => ({
      from: isoDay(DateTime.now().startOf('week')),
      to: isoDay(DateTime.now()),
    }),
  },
  {
    id: 'last_week',
    label: 'Last week',
    range: () => {
      const lastWeek = DateTime.now().minus({ weeks: 1 })
      return {
        from: isoDay(lastWeek.startOf('week')),
        to: isoDay(lastWeek.endOf('week')),
      }
    },
  },
  {
    id: 'this_month',
    label: 'This month',
    range: () => ({
      from: isoDay(DateTime.now().startOf('month')),
      to: isoDay(DateTime.now()),
    }),
  },
  {
    id: 'last_month',
    label: 'Last month',
    range: () => {
      const lastMonth = DateTime.now().minus({ months: 1 })
      return {
        from: isoDay(lastMonth.startOf('month')),
        to: isoDay(lastMonth.endOf('month')),
      }
    },
  },
  {
    id: 'this_quarter',
    label: 'This quarter',
    range: () => ({
      from: isoDay(DateTime.now().startOf('quarter')),
      to: isoDay(DateTime.now()),
    }),
  },
  {
    id: 'last_quarter',
    label: 'Last quarter',
    range: () => {
      const lastQ = DateTime.now().minus({ quarters: 1 })
      return {
        from: isoDay(lastQ.startOf('quarter')),
        to: isoDay(lastQ.endOf('quarter')),
      }
    },
  },
  {
    id: 'this_year',
    label: 'This year',
    range: () => ({
      from: isoDay(DateTime.now().startOf('year')),
      to: isoDay(DateTime.now()),
    }),
  },
  {
    id: 'last_year',
    label: 'Last year',
    range: () => {
      const lastY = DateTime.now().minus({ years: 1 })
      return {
        from: isoDay(lastY.startOf('year')),
        to: isoDay(lastY.endOf('year')),
      }
    },
  },
]

function pickPreset(p) {
  selectedPreset.value = p.id
  modelValue.value = p.range()
  if (p.id !== 'custom') open.value = false
}

// Custom-mode local edits — write back on input so the consumer's
// live query re-runs immediately. selectedPreset is set to 'custom'
// so the trigger label and dropdown highlight match.
function setCustomFrom(v) {
  selectedPreset.value = 'custom'
  modelValue.value = { from: v, to: value.value.to }
}
function setCustomTo(v) {
  selectedPreset.value = 'custom'
  modelValue.value = { from: value.value.from, to: v }
}

function clear() {
  selectedPreset.value = 'all'
  modelValue.value = { from: '', to: '' }
}

function fmtDay(iso) {
  if (!iso) return ''
  const dt = DateTime.fromISO(iso)
  return dt.isValid ? dt.toFormat('LLL d, yyyy') : iso
}

const triggerLabel = computed(() => {
  if (selectedPreset.value === 'all' || (!value.value.from && !value.value.to)) {
    return 'All time'
  }
  const preset = PRESETS.find((p) => p.id === selectedPreset.value)
  if (preset && preset.id !== 'custom') return preset.label
  // Custom — show the range.
  const f = fmtDay(value.value.from)
  const t = fmtDay(value.value.to)
  if (f && t) return `${f} – ${t}`
  if (f) return `From ${f}`
  if (t) return `Until ${t}`
  return 'All time'
})

// Click-outside to close. Mounted listener; cleaned on unmount.
function onDocClick(e) {
  if (!open.value) return
  if (wrapperRef.value && !wrapperRef.value.contains(e.target)) {
    open.value = false
  }
}
onMounted(() => document.addEventListener('mousedown', onDocClick))
onUnmounted(() => document.removeEventListener('mousedown', onDocClick))
</script>

<template>
  <div ref="wrapperRef" class="tw:relative tw:flex tw:items-center tw:gap-2">
    <span v-if="label && !inline" class="tw:text-xs tw:text-secondary">{{ label }}</span>
    <button
      type="button"
      class="tw:flex tw:items-center tw:gap-2 tw:rounded tw:border tw:border-divider tw:bg-card tw:text-on-main tw:px-2.5 tw:py-1 tw:text-sm tw:hover:bg-main-hover tw:transition"
      @click="open = !open"
    >
      <IconCalendar :size="14" class="tw:text-secondary" />
      <span>{{ triggerLabel }}</span>
      <IconChevronDown :size="14" class="tw:text-secondary" />
    </button>

    <div
      v-if="open"
      class="tw:absolute tw:left-0 tw:top-full tw:mt-1 tw:z-50 tw:bg-white tw:rounded-lg tw:shadow-xl tw:border tw:border-divider tw:overflow-hidden tw:flex tw:min-w-80"
    >
      <!-- Preset list -->
      <div class="tw:flex tw:flex-col tw:py-1 tw:border-r tw:border-divider tw:min-w-40">
        <button
          v-for="p in PRESETS"
          :key="p.id"
          type="button"
          class="tw:text-left tw:px-3 tw:py-1.5 tw:text-sm tw:transition"
          :class="
            selectedPreset === p.id
              ? 'tw:bg-primary/10 tw:text-primary tw:font-semibold'
              : 'tw:text-on-main tw:hover:bg-main-hover'
          "
          @click="pickPreset(p)"
        >
          {{ p.label }}
        </button>
        <button
          type="button"
          class="tw:text-left tw:px-3 tw:py-1.5 tw:text-sm tw:transition"
          :class="
            selectedPreset === 'custom'
              ? 'tw:bg-primary/10 tw:text-primary tw:font-semibold'
              : 'tw:text-on-main tw:hover:bg-main-hover'
          "
          @click="selectedPreset = 'custom'"
        >
          Custom…
        </button>
      </div>

      <!-- Custom-range editor + summary -->
      <div class="tw:p-3 tw:flex tw:flex-col tw:gap-2 tw:min-w-60">
        <div v-if="selectedPreset === 'custom'" class="tw:flex tw:flex-col tw:gap-2">
          <div class="tw:flex tw:items-center tw:gap-2">
            <span class="tw:text-xs tw:text-secondary tw:w-10">From</span>
            <input
              type="date"
              :value="value.from"
              class="tw:flex-1 tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
              @change="(e) => setCustomFrom(e.target.value)"
            />
          </div>
          <div class="tw:flex tw:items-center tw:gap-2">
            <span class="tw:text-xs tw:text-secondary tw:w-10">To</span>
            <input
              type="date"
              :value="value.to"
              class="tw:flex-1 tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
              @change="(e) => setCustomTo(e.target.value)"
            />
          </div>
        </div>

        <div v-else class="tw:flex tw:flex-col tw:gap-1">
          <div class="tw:text-xs tw:text-secondary tw:uppercase tw:tracking-wide">
            Selected range
          </div>
          <div class="tw:text-sm tw:text-on-main">
            {{ triggerLabel }}
          </div>
          <div v-if="value.from || value.to" class="tw:text-xs tw:text-secondary tw:font-mono">
            {{ fmtDay(value.from) || '—' }} → {{ fmtDay(value.to) || '—' }}
          </div>
        </div>

        <div class="tw:flex tw:justify-between tw:items-center tw:mt-2 tw:pt-2 tw:border-t tw:border-divider">
          <button
            type="button"
            class="tw:text-xs tw:text-secondary tw:hover:text-on-main tw:underline"
            @click="clear"
          >
            Clear
          </button>
          <button
            type="button"
            class="tw:text-xs tw:text-primary tw:font-semibold tw:hover:underline"
            @click="open = false"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
