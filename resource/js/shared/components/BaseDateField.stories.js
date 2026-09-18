import { ref } from 'vue'
import { DateTime } from 'luxon'
import BaseDateField from './BaseDateField.vue'

/**
 * BaseDateField — unified date/datetime/time/range/month/year field.
 */
export default {
  title: 'Forms/Date/BaseDateField',
  component: BaseDateField,
  tags: ['autodocs'],
}

const wrap = (template, state = {}) => ({
  render: () => ({
    components: { BaseDateField },
    setup: () => ({ model: ref(state.model ?? null) }),
    template: `<div class="tw:max-w-sm tw:p-4">${template}</div>`,
  }),
})

export const Default = wrap(`<BaseDateField v-model="model" placeholder="Select date" />`)
export const Date = wrap(`<BaseDateField v-model="model" mode="date" />`, { model: DateTime.now() })
export const DateTime_ = { ...wrap(`<BaseDateField v-model="model" mode="datetime" />`, { model: DateTime.now() }), name: 'DateTime' }
export const Time = wrap(`<BaseDateField v-model="model" mode="time" />`, { model: DateTime.now() })
export const Range = { render: () => ({ components: { BaseDateField }, setup: () => ({ model: ref({ start: null, end: null }) }), template: `<div class="tw:max-w-sm tw:p-4"><BaseDateField v-model="model" mode="range" /></div>` }) }
export const Month = wrap(`<BaseDateField v-model="model" mode="month" />`)
export const Year = wrap(`<BaseDateField v-model="model" mode="year" />`)
export const Disabled = wrap(`<BaseDateField v-model="model" :disabled="true" />`, { model: DateTime.now() })
export const Readonly = wrap(`<BaseDateField v-model="model" :readonly="true" />`, { model: DateTime.now() })
export const Loading = wrap(`<BaseDateField v-model="model" :loading="true" />`)
export const ValidationError = wrap(`<BaseDateField v-model="model" error="This date is required" />`)
export const HelperText = wrap(`<BaseDateField v-model="model" helperText="Pick the inspection date" />`)
export const MinMaxDate = { render: () => ({ components: { BaseDateField }, setup: () => ({ model: ref(DateTime.now()), min: DateTime.now().startOf('month'), max: DateTime.now().endOf('month') }), template: `<div class="tw:max-w-sm tw:p-4"><BaseDateField v-model="model" :minDate="min" :maxDate="max" /></div>` }) }
export const Multiple = { render: () => ({ components: { BaseDateField }, setup: () => ({ model: ref([]) }), template: `<div class="tw:max-w-sm tw:p-4"><BaseDateField v-model="model" :multiple="true" /></div>` }) }
export const Clearable = wrap(`<BaseDateField v-model="model" :clearable="true" />`, { model: DateTime.now() })
export const Compact = wrap(`<BaseDateField v-model="model" size="sm" density="compact" />`, { model: DateTime.now() })
export const Empty = wrap(`<BaseDateField v-model="model" placeholder="Empty state" />`)
export const Prefilled = wrap(`<BaseDateField v-model="model" />`, { model: DateTime.now() })
export const IsoValueFormat = wrap(`<BaseDateField v-model="model" valueFormat="iso" />`, { model: '2026-06-22' })
