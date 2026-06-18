import { ref } from 'vue'
import { DateTime } from 'luxon'
import BaseDatePicker from './BaseDatePicker.vue'

/**
 * BaseDatePicker — a v-calendar date field. The v-model is a luxon `DateTime`
 * (null when empty); the trigger shows `dt.formatDate('date')`.
 */
export default {
  title: 'Forms/BaseDatePicker',
  component: BaseDatePicker,
  tags: ['autodocs'],
}

export const Empty = {
  render: () => ({
    components: { BaseDatePicker },
    setup: () => ({ model: ref(null) }),
    template: `<div class="tw:max-w-xs"><BaseDatePicker v-model="model" /></div>`,
  }),
}

export const Prefilled = {
  render: () => ({
    components: { BaseDatePicker },
    setup: () => ({ model: ref(DateTime.now()) }),
    template: `<div class="tw:max-w-xs"><BaseDatePicker v-model="model" /></div>`,
  }),
}
