import { ref } from 'vue'
import { DateTime } from 'luxon'
import BaseCalendar from './BaseCalendar.vue'

/**
 * BaseCalendar — headless month grid (day selection, range, min/max, keyboard).
 */
export default {
  title: 'Forms/Date/BaseCalendar',
  component: BaseCalendar,
  tags: ['autodocs'],
}

export const Default = {
  render: () => ({
    components: { BaseCalendar },
    setup: () => ({ model: ref(DateTime.now()) }),
    template: `<BaseCalendar v-model="model" />`,
  }),
}

export const RangeSelection = {
  render: () => ({
    components: { BaseCalendar },
    setup: () => ({ model: ref({ start: null, end: null }) }),
    template: `<BaseCalendar v-model="model" selectionMode="range" />`,
  }),
}

export const MultipleSelection = {
  render: () => ({
    components: { BaseCalendar },
    setup: () => ({ model: ref([]) }),
    template: `<BaseCalendar v-model="model" selectionMode="multiple" />`,
  }),
}

export const MinAndMaxDate = {
  render: () => ({
    components: { BaseCalendar },
    setup: () => ({
      model: ref(DateTime.now()),
      min: DateTime.now().startOf('month'),
      max: DateTime.now().endOf('month'),
    }),
    template: `<BaseCalendar v-model="model" :minDate="min" :maxDate="max" />`,
  }),
}

export const WithTodayButton = {
  render: () => ({
    components: { BaseCalendar },
    setup: () => ({ model: ref(null) }),
    template: `<BaseCalendar v-model="model" :showToday="true" />`,
  }),
}
