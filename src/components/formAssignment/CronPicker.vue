<script setup>
/**
 * Minimal cron picker. Two modes:
 *   - Preset: pick from common patterns (daily, weekly, hourly, etc.).
 *   - Advanced: edit the five cron fields directly.
 *
 * Emits a v-model string in standard 5-field cron form
 * ("minute hour day-of-month month day-of-week"). The backend
 * uses cron-parser to validate + iterate; this picker doesn't
 * preview occurrences inline (the form_assignments create endpoint
 * validates the syntax on submit and reports any errors).
 */

// `timezone` is referenced in the template; no need to bind to a
// `const props` since the script doesn't read it.
defineProps({
  timezone: { type: String, default: 'UTC' },
})

defineEmits(['update:modelValue'])

const modelValue = defineModel({ type: String, default: '0 8 * * MON' })

const PRESETS = [
  { label: 'Daily at 6am', value: '0 6 * * *' },
  { label: 'Daily at 8am', value: '0 8 * * *' },
  { label: 'Daily at 6pm', value: '0 18 * * *' },
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Weekly: Monday 8am', value: '0 8 * * MON' },
  { label: 'Weekly: Friday 4pm', value: '0 16 * * FRI' },
  { label: 'First of the month 9am', value: '0 9 1 * *' },
]

const advanced = ref(false)

// When in advanced mode, edit the five fields directly and reflect
// back to modelValue. When in preset mode, the model is whatever
// preset the user picked.
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

const isPresetMatch = computed(
  () => PRESETS.find((p) => p.value === modelValue.value)?.label ?? null,
)
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-2">
    <div class="tw:flex tw:items-center tw:justify-between">
      <label class="tw:text-xs tw:font-semibold tw:text-secondary">Schedule (cron)</label>
      <button
        type="button"
        class="tw:text-xs tw:text-primary tw:hover:underline"
        @click="advanced = !advanced"
      >
        {{ advanced ? 'Use presets' : 'Advanced' }}
      </button>
    </div>

    <select
      v-if="!advanced"
      :value="isPresetMatch ? modelValue : ''"
      class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:text-on-main tw:px-3 tw:py-1.5 tw:text-sm"
      @change="(e) => (modelValue = e.target.value)"
    >
      <option value="" disabled>Pick a preset…</option>
      <option v-for="p in PRESETS" :key="p.value" :value="p.value">{{ p.label }}</option>
    </select>

    <div v-else class="tw:grid tw:grid-cols-5 tw:gap-1.5">
      <div class="tw:flex tw:flex-col">
        <span class="tw:text-[10px] tw:text-secondary tw:uppercase">Minute</span>
        <input
          type="text"
          :value="fields.minute"
          class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-xs tw:font-mono"
          @change="(e) => setField('minute', e.target.value)"
        />
      </div>
      <div class="tw:flex tw:flex-col">
        <span class="tw:text-[10px] tw:text-secondary tw:uppercase">Hour</span>
        <input
          type="text"
          :value="fields.hour"
          class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-xs tw:font-mono"
          @change="(e) => setField('hour', e.target.value)"
        />
      </div>
      <div class="tw:flex tw:flex-col">
        <span class="tw:text-[10px] tw:text-secondary tw:uppercase">Dom</span>
        <input
          type="text"
          :value="fields.dom"
          class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-xs tw:font-mono"
          @change="(e) => setField('dom', e.target.value)"
        />
      </div>
      <div class="tw:flex tw:flex-col">
        <span class="tw:text-[10px] tw:text-secondary tw:uppercase">Month</span>
        <input
          type="text"
          :value="fields.month"
          class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-xs tw:font-mono"
          @change="(e) => setField('month', e.target.value)"
        />
      </div>
      <div class="tw:flex tw:flex-col">
        <span class="tw:text-[10px] tw:text-secondary tw:uppercase">Dow</span>
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
    <div class="tw:text-[11px] tw:text-secondary tw:italic">
      Backend validates the expression on save; invalid syntax is rejected with a clear error.
    </div>
  </div>
</template>
