<script setup>
import { IconPlus, IconX } from '@tabler/icons-vue'

/**
 * Weekly hours editor — the `{ mon: [["09:00","17:00"]], …, holidays: [] }`
 * shape support_schedule_open() reads (spec §2.1 / §2.2). Used for a brand's
 * business hours and an agent's personal schedule. Empty object = always open.
 */
defineProps({ disabled: { type: Boolean, default: false } })
const model = defineModel({ type: Object, default: () => ({}) })

const DAYS = [
  ['mon', 'Mon'],
  ['tue', 'Tue'],
  ['wed', 'Wed'],
  ['thu', 'Thu'],
  ['fri', 'Fri'],
  ['sat', 'Sat'],
  ['sun', 'Sun'],
]

function windows(day) {
  return model.value?.[day] ?? []
}
function set(day, next) {
  const copy = { ...(model.value || {}) }
  if (next.length) copy[day] = next
  else delete copy[day]
  model.value = copy
}
function addWindow(day) {
  set(day, [...windows(day), ['09:00', '17:00']])
}
function removeWindow(day, i) {
  set(
    day,
    windows(day).filter((_, k) => k !== i),
  )
}
function update(day, i, pos, value) {
  const next = windows(day).map((w, k) =>
    k === i ? [pos === 0 ? value : w[0], pos === 1 ? value : w[1]] : w,
  )
  set(day, next)
}
function copyToWeekdays(day) {
  const src = windows(day)
  const copy = { ...(model.value || {}) }
  for (const [d] of DAYS.slice(0, 5)) copy[d] = src.map((w) => [...w])
  model.value = copy
}
const holidaysText = computed({
  get: () => (model.value?.holidays ?? []).join(', '),
  set: (v) => {
    const list = String(v || '')
      .split(/[,\s]+/)
      .map((x) => x.trim())
      .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))
    const copy = { ...(model.value || {}) }
    if (list.length) copy.holidays = list
    else delete copy.holidays
    model.value = copy
  },
})
const isAlways = computed(() => !DAYS.some(([d]) => windows(d).length))
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-2">
    <p v-if="isAlways" class="tw:text-xs tw:text-secondary">
      No hours set — treated as always open. Add windows to restrict.
    </p>
    <div v-for="[day, label] in DAYS" :key="day" class="tw:flex tw:items-start tw:gap-2">
      <span class="tw:w-9 tw:pt-1.5 tw:text-xs tw:font-semibold tw:text-secondary">{{
        label
      }}</span>
      <div class="tw:flex tw:flex-1 tw:flex-wrap tw:items-center tw:gap-2">
        <template v-for="(w, i) in windows(day)" :key="i">
          <span
            class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded-md tw:border tw:border-divider tw:px-1.5 tw:py-0.5"
          >
            <input
              type="time"
              :value="w[0]"
              :disabled="disabled"
              class="tw:bg-transparent tw:text-sm"
              @change="update(day, i, 0, $event.target.value)"
            />
            <span class="tw:text-secondary">–</span>
            <input
              type="time"
              :value="w[1]"
              :disabled="disabled"
              class="tw:bg-transparent tw:text-sm"
              @change="update(day, i, 1, $event.target.value)"
            />
            <button
              v-if="!disabled"
              type="button"
              class="tw:text-secondary tw:hover:text-red-600"
              :aria-label="`Remove ${label} window`"
              @click="removeWindow(day, i)"
            >
              <IconX :size="14" />
            </button>
          </span>
        </template>
        <button
          v-if="!disabled"
          type="button"
          class="tw:inline-flex tw:items-center tw:gap-0.5 tw:text-xs tw:text-primary tw:hover:underline"
          @click="addWindow(day)"
        >
          <IconPlus :size="12" /> hours
        </button>
        <button
          v-if="!disabled && day === 'mon' && windows('mon').length"
          type="button"
          class="tw:text-xs tw:text-secondary tw:hover:underline"
          @click="copyToWeekdays('mon')"
        >
          copy Mon → Fri
        </button>
      </div>
    </div>
    <BaseField label="Holidays (YYYY-MM-DD, comma separated)">
      <BaseTextInput
        v-model="holidaysText"
        :disabled="disabled"
        placeholder="2026-12-25, 2027-01-01"
      />
    </BaseField>
  </div>
</template>
