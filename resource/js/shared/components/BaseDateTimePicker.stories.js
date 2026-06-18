import { ref } from 'vue'
import { DateTime } from 'luxon'
import BaseDateTimePicker from './BaseDateTimePicker.vue'

/**
 * BaseDateTimePicker — date + time field. The v-model is a luxon `DateTime`
 * (null when empty).
 */
export default {
  title: 'Forms/BaseDateTimePicker',
  component: BaseDateTimePicker,
  tags: ['autodocs'],
}

export const Empty = {
  render: () => ({
    components: { BaseDateTimePicker },
    setup: () => ({ model: ref(null) }),
    template: `<div class="tw:max-w-sm"><BaseDateTimePicker v-model="model" /></div>`,
  }),
}

export const Prefilled = {
  render: () => ({
    components: { BaseDateTimePicker },
    setup: () => ({ model: ref(DateTime.local()) }),
    template: `<div class="tw:max-w-sm"><BaseDateTimePicker v-model="model" /></div>`,
  }),
}
