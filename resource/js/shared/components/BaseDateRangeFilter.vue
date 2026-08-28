<script setup>
/**
 * BaseDateRangeFilter — calendar-first date filter for the register filter
 * menus (CAPA / NC / modules …). Replaces the operator-driven BaseDateFilter
 * INSIDE the cascading menu (2026-08-28): the on/before/after operator picker
 * read as jargon, so here it's a preset list plus a range calendar — click a
 * start day, click an end day; the same day twice filters to that one day.
 *
 * Emits the SAME token shape BaseDateFilter does ({ operator, value, value2,
 * relative, presetId }), so matchesDateFilter / resolveDateFilter and filters
 * already saved in URLs keep working unchanged. Rolling presets emit `relative`
 * tokens (they re-evaluate every run — "Last 7 days" stays last 7 days);
 * calendar-anchored picks emit a concrete `between`. The analytics advanced
 * editor keeps BaseDateFilter — operators are its point.
 */
import { DateTime } from 'luxon'

const model = defineModel({ type: Object, default: null })

function betweenTok(a, b) {
  return { operator: 'between', value: a.toISODate(), value2: b.toISODate() }
}

const PRESETS = [
  {
    id: 'today',
    label: 'Today',
    token: () => ({ operator: 'relative', relative: { dir: 'this', unit: 'day' } }),
  },
  {
    id: 'yesterday',
    label: 'Yesterday',
    token: (n) => betweenTok(n.minus({ days: 1 }), n.minus({ days: 1 })),
  },
  {
    id: 'last_7_days',
    label: 'Last 7 days',
    token: () => ({ operator: 'relative', relative: { dir: 'past', unit: 'day', count: 7 } }),
  },
  {
    id: 'last_30_days',
    label: 'Last 30 days',
    token: () => ({ operator: 'relative', relative: { dir: 'past', unit: 'day', count: 30 } }),
  },
  {
    id: 'this_month',
    label: 'This month',
    token: () => ({ operator: 'relative', relative: { dir: 'this', unit: 'month' } }),
  },
  {
    id: 'last_month',
    label: 'Last month',
    token: (n) => {
      const d = n.minus({ months: 1 })
      return betweenTok(d.startOf('month'), d.endOf('month'))
    },
  },
  {
    id: 'this_quarter',
    label: 'This quarter',
    token: () => ({ operator: 'relative', relative: { dir: 'this', unit: 'quarter' } }),
  },
  {
    id: 'this_year',
    label: 'This year',
    token: () => ({ operator: 'relative', relative: { dir: 'this', unit: 'year' } }),
  },
]

const activePresetId = computed(() => model.value?.presetId ?? null)

function pickPreset(p) {
  // Toggling the active preset off clears the filter — same affordance as the
  // quick-view pills.
  if (activePresetId.value === p.id) {
    model.value = null
    return
  }
  model.value = { ...p.token(DateTime.now()), presetId: p.id }
}

// The calendar reflects only concrete ranges; a preset pick highlights its chip
// instead. Setting a range from the calendar always produces a `between`.
const calRange = computed({
  get: () => {
    const t = model.value
    if (t?.operator !== 'between' || t.presetId) return null
    const s = t.value ? DateTime.fromISO(t.value) : null
    const e = t.value2 ? DateTime.fromISO(t.value2) : null
    return s || e ? { start: s, end: e } : null
  },
  set: (v) => {
    if (!v?.start && !v?.end) {
      model.value = null
      return
    }
    const s = v.start ?? v.end
    const e = v.end ?? v.start
    model.value = betweenTok(s < e ? s : e, s < e ? e : s)
  },
})

const summary = computed(() => {
  const t = model.value
  if (!t) return null
  if (t.presetId) return PRESETS.find((p) => p.id === t.presetId)?.label ?? null
  if (t.operator === 'between') {
    const s = t.value ? DateTime.fromISO(t.value) : null
    const e = t.value2 ? DateTime.fromISO(t.value2) : null
    if (s && e && s.hasSame(e, 'day')) return s.formatDate('date')
    if (s && e) return `${s.formatDate('date')} – ${e.formatDate('date')}`
    return null
  }
  // A token from the operator-based editor (old URLs) — applied but not
  // representable here; the user can clear it and pick again.
  return 'Custom filter'
})

function clear() {
  model.value = null
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-2 tw:p-2 tw:w-72">
    <!-- Presets -->
    <div class="tw:grid tw:grid-cols-2 tw:gap-1">
      <button
        v-for="p in PRESETS"
        :key="p.id"
        type="button"
        class="tw:rounded-md tw:px-2 tw:py-1 tw:text-xs tw:font-medium tw:text-left tw:transition-colors"
        :class="
          activePresetId === p.id
            ? 'tw:bg-primary tw:text-on-primary'
            : 'tw:text-on-main tw:hover:bg-main-hover'
        "
        @click="pickPreset(p)"
      >
        {{ p.label }}
      </button>
    </div>

    <div class="tw:border-t tw:border-divider tw:pt-2">
      <p class="tw:text-micro tw:text-secondary tw:mb-1">
        Or pick a range — start day, then end day.
      </p>
      <BaseCalendar v-model="calRange" selectionMode="range" />
    </div>

    <!-- Applied readout + clear -->
    <div
      v-if="summary"
      class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:border-t tw:border-divider tw:pt-2"
    >
      <span class="tw:text-xs tw:font-medium tw:text-on-main tw:truncate">{{ summary }}</span>
      <button
        type="button"
        class="tw:text-xs tw:font-medium tw:text-secondary tw:hover:text-bad tw:shrink-0"
        @click="clear"
      >
        Clear
      </button>
    </div>
  </div>
</template>
