<script setup>
/**
 * BaseDateRangeFilter — the register menus' date panel (2026-08-28).
 *
 * Two views, Grafana-style (user request): the default is a compact PRESET
 * list — rows like any other filter submenu — and a "Custom range…" row that
 * swaps to a range calendar with a from/to readout and Apply / Reset. Presets
 * commit immediately and close the menu; Apply commits the calendar range.
 *
 * Emits the SAME token shape as the operator editor ({ operator, value,
 * value2, relative, presetId }), so matchesDateFilter / resolveDateFilter and
 * filters saved in URLs keep working. Rolling presets emit `relative` tokens
 * ("Last 7 days" re-evaluates every run); calendar-anchored picks emit a
 * concrete `between`. BaseDateFilter lives on in the analytics advanced
 * editor, where operators are the point.
 */
import { DateTime } from 'luxon'
import { IconCheck, IconChevronLeft, IconChevronRight } from '@tabler/icons-vue'

const model = defineModel({ type: Object, default: null })
const ctx = inject('filterMenuCtx', null)

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

const view = ref('presets') // 'presets' | 'custom'
const activePresetId = computed(() => model.value?.presetId ?? null)
const hasCustomRange = computed(() => model.value?.operator === 'between' && !model.value.presetId)

function pickPreset(p) {
  model.value = { ...p.token(DateTime.now()), presetId: p.id }
  ctx?.requestClose?.()
}

// ── Custom range (uncommitted until Apply) ──────────────────────────────────
const pending = ref(null)
function openCustom() {
  const t = model.value
  pending.value =
    hasCustomRange.value && t.value
      ? { start: DateTime.fromISO(t.value), end: t.value2 ? DateTime.fromISO(t.value2) : null }
      : null
  view.value = 'custom'
}

function fmt(dt) {
  return dt ? dt.formatDate('date') : '—'
}
const pendingLabel = computed(() => {
  const p = pending.value
  if (!p?.start && !p?.end) return 'Pick a start day, then an end day'
  return `${fmt(p?.start)}  →  ${fmt(p?.end ?? p?.start)}`
})

function applyCustom() {
  const p = pending.value
  if (!p?.start && !p?.end) return
  const s = p.start ?? p.end
  const e = p.end ?? p.start
  model.value = betweenTok(s < e ? s : e, s < e ? e : s)
  ctx?.requestClose?.()
}

function resetFilter() {
  pending.value = null
  model.value = null
}

const customSummary = computed(() => {
  if (!hasCustomRange.value) return null
  const s = model.value.value ? DateTime.fromISO(model.value.value) : null
  const e = model.value.value2 ? DateTime.fromISO(model.value.value2) : null
  if (s && e && s.hasSame(e, 'day')) return fmt(s)
  return `${fmt(s)} – ${fmt(e)}`
})
</script>

<template>
  <!-- Preset list — reads like any other value submenu. -->
  <div v-if="view === 'presets'" class="tw:w-56 tw:p-0.5">
    <button
      v-for="p in PRESETS"
      :key="p.id"
      type="button"
      class="tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-2 tw:rounded-lg tw:px-2.5 tw:py-1.5 tw:text-sm tw:text-on-main tw:hover:bg-main-hover"
      @click="pickPreset(p)"
    >
      <span>{{ p.label }}</span>
      <IconCheck v-if="activePresetId === p.id" :size="14" class="tw:text-primary tw:shrink-0" />
    </button>

    <hr class="tw:my-1 tw:border-divider" />
    <button
      type="button"
      class="tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-2 tw:rounded-lg tw:px-2.5 tw:py-1.5 tw:text-sm tw:text-on-main tw:hover:bg-main-hover"
      @click="openCustom"
    >
      <span class="tw:flex tw:flex-col tw:items-start tw:min-w-0">
        Custom range…
        <span v-if="customSummary" class="tw:text-micro tw:text-secondary tw:truncate">
          {{ customSummary }}
        </span>
      </span>
      <span class="tw:flex tw:items-center tw:gap-1 tw:shrink-0">
        <IconCheck v-if="hasCustomRange" :size="14" class="tw:text-primary" />
        <IconChevronRight :size="14" class="tw:text-secondary" />
      </span>
    </button>

    <template v-if="model">
      <hr class="tw:my-1 tw:border-divider" />
      <button
        type="button"
        class="tw:w-full tw:rounded-lg tw:px-2.5 tw:py-1.5 tw:text-left tw:text-sm tw:text-secondary tw:hover:bg-main-hover tw:hover:text-bad"
        @click="resetFilter"
      >
        Clear filter
      </button>
    </template>
  </div>

  <!-- Custom range — calendar + readout + Apply / Reset. -->
  <div v-else class="tw:w-72 tw:p-2 tw:flex tw:flex-col tw:gap-2">
    <div class="tw:flex tw:items-center tw:gap-1">
      <button
        type="button"
        class="tw:flex tw:items-center tw:gap-0.5 tw:rounded-md tw:px-1.5 tw:py-1 tw:text-xs tw:font-medium tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-main"
        @click="view = 'presets'"
      >
        <IconChevronLeft :size="14" />
        Presets
      </button>
      <span class="tw:ml-auto tw:text-xs tw:font-medium tw:text-on-main">{{ pendingLabel }}</span>
    </div>

    <BaseCalendar v-model="pending" selectionMode="range" />

    <div class="tw:flex tw:items-center tw:justify-between tw:border-t tw:border-divider tw:pt-2">
      <button
        type="button"
        class="tw:text-xs tw:font-medium tw:text-secondary tw:hover:text-bad"
        @click="resetFilter"
      >
        Reset
      </button>
      <BaseButton
        variant="primary"
        size="sm"
        :disabled="!pending?.start && !pending?.end"
        @click="applyCustom"
      >
        Apply
      </BaseButton>
    </div>
  </div>
</template>
