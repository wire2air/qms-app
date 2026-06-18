import { ref } from 'vue'
import { IconLayoutGrid, IconList, IconLayoutKanban } from '@tabler/icons-vue'
import BaseSwitcher from './BaseSwitcher.vue'

/** Icon segmented control: pick one of several views (string v-model). */
export default {
  title: 'Forms/BaseSwitcher',
  component: BaseSwitcher,
  tags: ['autodocs'],
}

// `switches` items are { icon: <Tabler icon component>, value, tooltip? }.
const viewSwitches = [
  { icon: IconLayoutGrid, value: 'grid', tooltip: 'Grid view' },
  { icon: IconList, value: 'list', tooltip: 'List view' },
  { icon: IconLayoutKanban, value: 'kanban', tooltip: 'Kanban view' },
]

export const Default = {
  render: () => ({
    components: { BaseSwitcher },
    setup() {
      const model = ref('grid')
      return { switches: viewSwitches, model }
    },
    template: `<BaseSwitcher :switches="switches" v-model="model" />`,
  }),
}

export const ListSelected = {
  render: () => ({
    components: { BaseSwitcher },
    setup() {
      const model = ref('list')
      return { switches: viewSwitches, model }
    },
    template: `<BaseSwitcher :switches="switches" v-model="model" />`,
  }),
}

export const TwoOptions = {
  render: () => ({
    components: { BaseSwitcher },
    setup() {
      const switches = [
        { icon: IconLayoutGrid, value: 'grid', tooltip: 'Grid' },
        { icon: IconList, value: 'list', tooltip: 'List' },
      ]
      const model = ref('grid')
      return { switches, model }
    },
    template: `<BaseSwitcher :switches="switches" v-model="model" />`,
  }),
}
