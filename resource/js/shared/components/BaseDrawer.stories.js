import { ref } from 'vue'
import BaseDrawer from './BaseDrawer.vue'

/**
 * BaseDrawer — a side panel (BaseDialog variant) that slides in from an edge.
 * Inherits HeadlessUI focus-trap / Esc / scroll-lock.
 */
export default {
  title: 'Overlays/BaseDrawer',
  component: BaseDrawer,
  tags: ['autodocs'],
  argTypes: {
    side: { control: 'inline-radio', options: ['right', 'left'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg', 'xl'] },
  },
  args: { side: 'right', size: 'md', title: 'Filters', persistent: false },
}

export const Default = {
  render: (args) => ({
    components: { BaseDrawer },
    setup() {
      const open = ref(false)
      return { args, open }
    },
    template: `
      <div>
        <button class="tw:rounded-lg tw:bg-primary tw:text-on-primary tw:px-3 tw:py-1.5 tw:text-sm" @click="open = true">
          Open drawer
        </button>
        <BaseDrawer v-bind="args" v-model="open">
          <p class="tw:text-sm tw:text-secondary">Drawer body — filters, a detail peek, or a create form.</p>
          <template #footer>
            <button class="tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-1.5 tw:text-sm" @click="open = false">Cancel</button>
            <button class="tw:rounded-lg tw:bg-primary tw:text-on-primary tw:px-3 tw:py-1.5 tw:text-sm" @click="open = false">Apply</button>
          </template>
        </BaseDrawer>
      </div>`,
  }),
}

export const LeftSide = { ...Default, args: { side: 'left', title: 'Navigation' } }
