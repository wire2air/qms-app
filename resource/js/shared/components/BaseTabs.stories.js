import { ref } from 'vue'
import { IconFileText, IconUsers, IconHistory } from '@tabler/icons-vue'
import BaseTabs from './BaseTabs.vue'
import BaseTabPanel from './BaseTabPanel.vue'

/** Accessible tab bar (WAI-ARIA). v-model is the active tab's string id; pair with BaseTabPanel children. */
export default {
  title: 'Navigation/BaseTabs',
  component: BaseTabs,
  tags: ['autodocs'],
  args: {
    variant: 'underline',
  },
}

export const Default = {
  render: (args) => ({
    components: { BaseTabs, BaseTabPanel },
    setup() {
      const active = ref('overview')
      // tab: { value, label, icon?, disabled?, badge?, indicator? }
      const tabs = [
        { value: 'overview', label: 'Overview' },
        { value: 'activity', label: 'Activity' },
        { value: 'settings', label: 'Settings' },
      ]
      return { args, active, tabs }
    },
    template: `
      <BaseTabs v-bind="args" v-model="active" :tabs="tabs" ariaLabel="Demo tabs">
        <BaseTabPanel value="overview" class="tw:pt-4">Overview content</BaseTabPanel>
        <BaseTabPanel value="activity" class="tw:pt-4">Activity content</BaseTabPanel>
        <BaseTabPanel value="settings" class="tw:pt-4">Settings content</BaseTabPanel>
      </BaseTabs>`,
  }),
}

export const Pills = {
  args: { variant: 'pills' },
  render: (args) => ({
    components: { BaseTabs, BaseTabPanel },
    setup() {
      const active = ref('details')
      const tabs = [
        { value: 'details', label: 'Details' },
        { value: 'contacts', label: 'Contacts' },
        { value: 'history', label: 'History' },
      ]
      return { args, active, tabs }
    },
    template: `
      <BaseTabs v-bind="args" v-model="active" :tabs="tabs" ariaLabel="Supplier details">
        <BaseTabPanel value="details" class="tw:pt-4">Details content</BaseTabPanel>
        <BaseTabPanel value="contacts" class="tw:pt-4">Contacts content</BaseTabPanel>
        <BaseTabPanel value="history" class="tw:pt-4">History content</BaseTabPanel>
      </BaseTabs>`,
  }),
}

export const WithIconsBadgesAndIndicator = {
  render: (args) => ({
    components: { BaseTabs, BaseTabPanel },
    setup() {
      const active = ref('docs')
      const tabs = [
        { value: 'docs', label: 'Documents', icon: IconFileText, badge: 12 },
        { value: 'members', label: 'Members', icon: IconUsers, badge: 3 },
        { value: 'audit', label: 'Audit', icon: IconHistory, indicator: true },
      ]
      return { args, active, tabs }
    },
    template: `
      <BaseTabs v-bind="args" v-model="active" :tabs="tabs" ariaLabel="Project tabs">
        <BaseTabPanel value="docs" class="tw:pt-4">Documents content</BaseTabPanel>
        <BaseTabPanel value="members" class="tw:pt-4">Members content</BaseTabPanel>
        <BaseTabPanel value="audit" class="tw:pt-4">Audit content</BaseTabPanel>
      </BaseTabs>`,
  }),
}

export const WithDisabledTab = {
  render: (args) => ({
    components: { BaseTabs, BaseTabPanel },
    setup() {
      const active = ref('general')
      const tabs = [
        { value: 'general', label: 'General' },
        { value: 'billing', label: 'Billing', disabled: true },
        { value: 'advanced', label: 'Advanced' },
      ]
      return { args, active, tabs }
    },
    template: `
      <BaseTabs v-bind="args" v-model="active" :tabs="tabs" ariaLabel="Settings tabs">
        <BaseTabPanel value="general" class="tw:pt-4">General content</BaseTabPanel>
        <BaseTabPanel value="billing" class="tw:pt-4">Billing content</BaseTabPanel>
        <BaseTabPanel value="advanced" class="tw:pt-4">Advanced content</BaseTabPanel>
      </BaseTabs>`,
  }),
}
