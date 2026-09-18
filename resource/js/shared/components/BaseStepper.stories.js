import { ref } from 'vue'
import { IconUser, IconSettings, IconCheck } from '@tabler/icons-vue'
import BaseStepper from './BaseStepper.vue'

/** Progress through an ordered set of steps (wizards, approvals). Horizontal or vertical. */
export default {
  title: 'Data/BaseStepper',
  component: BaseStepper,
  tags: ['autodocs'],
  args: {
    orientation: 'horizontal',
    clickable: false,
  },
}

// step: { title, description?, icon?, status?, disabled? }
// status ∈ 'complete' | 'current' | 'upcoming' | 'error' (else derived from index)
const steps = [
  { title: 'Account', description: 'Basic details' },
  { title: 'Profile', description: 'Personal info' },
  { title: 'Review', description: 'Confirm & submit' },
]

export const Default = {
  render: (args) => ({
    components: { BaseStepper },
    setup() {
      const current = ref(1)
      return { args, current, steps }
    },
    template: `<BaseStepper v-bind="args" v-model="current" :steps="steps" />`,
  }),
}

export const Vertical = {
  args: { orientation: 'vertical' },
  render: (args) => ({
    components: { BaseStepper },
    setup() {
      const current = ref(1)
      return { args, current, steps }
    },
    template: `<BaseStepper v-bind="args" v-model="current" :steps="steps" />`,
  }),
}

export const Clickable = {
  args: { clickable: true },
  render: (args) => ({
    components: { BaseStepper },
    setup() {
      const current = ref(0)
      const iconSteps = [
        { title: 'Account', description: 'Sign up', icon: IconUser },
        { title: 'Settings', description: 'Preferences', icon: IconSettings },
        { title: 'Done', description: 'All set', icon: IconCheck },
      ]
      return { args, current, iconSteps }
    },
    template: `<BaseStepper v-bind="args" v-model="current" :steps="iconSteps" />`,
  }),
}

export const WithError = {
  render: (args) => ({
    components: { BaseStepper },
    setup() {
      const current = ref(2)
      const errorSteps = [
        { title: 'Account', status: 'complete' },
        { title: 'Payment', status: 'error', description: 'Card declined' },
        { title: 'Review', status: 'current' },
      ]
      return { args, current, errorSteps }
    },
    template: `<BaseStepper v-bind="args" v-model="current" :steps="errorSteps" />`,
  }),
}

export const VerticalWithContent = {
  args: { orientation: 'vertical', clickable: true },
  render: (args) => ({
    components: { BaseStepper },
    setup() {
      const current = ref(1)
      return { args, current, steps }
    },
    template: `
      <BaseStepper v-bind="args" v-model="current" :steps="steps">
        <template #content="{ step }">
          <div class="tw:rounded-lg tw:border tw:border-divider tw:p-3 tw:text-sm tw:text-secondary">
            Content for the "{{ step.title }}" step goes here.
          </div>
        </template>
      </BaseStepper>`,
  }),
}
