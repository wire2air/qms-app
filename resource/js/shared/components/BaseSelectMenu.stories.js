import { ref } from 'vue'
import BaseSelectMenu from './BaseSelectMenu.vue'

/**
 * BaseSelectMenu — the low-level select primitive. Entity pickers should go
 * through an XSelectMenu triad (see CLAUDE.md); use this directly only for
 * non-entity lists, supplying a `#button` slot for the trigger content.
 */
const items = [
  { id: 'LOW', name: 'Low' },
  { id: 'MEDIUM', name: 'Medium' },
  { id: 'HIGH', name: 'High' },
]

export default {
  title: 'Forms/BaseSelectMenu',
  component: BaseSelectMenu,
  tags: ['autodocs'],
}

export const Default = {
  render: () => ({
    components: { BaseSelectMenu },
    setup: () => ({ items, model: ref(null) }),
    template: `
      <div class="tw:max-w-xs">
        <BaseSelectMenu v-model="model" :items="items">
          <template #button="{ selected }">
            <span class="tw:text-sm tw:font-medium" :class="selected ? 'tw:text-on-main' : 'tw:text-placeholder'">
              {{ items.find((i) => i.id === selected)?.name ?? 'Select priority' }}
            </span>
          </template>
        </BaseSelectMenu>
      </div>`,
  }),
}

export const WithFieldChrome = {
  render: () => ({
    components: { BaseSelectMenu },
    setup: () => ({ items, model: ref('MEDIUM') }),
    template: `
      <div class="tw:max-w-xs">
        <BaseSelectMenu
          v-model="model"
          :items="items"
          label="Priority"
          instructions="Drives SLA timers."
        >
          <template #button="{ selected }">
            <span class="tw:text-sm tw:font-medium">{{ items.find((i) => i.id === selected)?.name ?? 'Select' }}</span>
          </template>
        </BaseSelectMenu>
      </div>`,
  }),
}

export const WithError = {
  render: () => ({
    components: { BaseSelectMenu },
    setup: () => ({ items, model: ref(null) }),
    template: `
      <div class="tw:max-w-xs">
        <BaseSelectMenu
          v-model="model"
          :items="items"
          label="Priority"
          errorMsg="Priority is required."
          required
        >
          <template #button="{ selected }">
            <span class="tw:text-sm tw:font-medium" :class="selected ? 'tw:text-on-main' : 'tw:text-placeholder'">
              {{ items.find((i) => i.id === selected)?.name ?? 'Select priority' }}
            </span>
          </template>
        </BaseSelectMenu>
      </div>`,
  }),
}
