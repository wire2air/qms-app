import BaseBreadcrumbs from './BaseBreadcrumbs.vue'

// Non-terminal items with `to` render as <RouterLink>. Stub it so no router is needed.
const RouterLinkStub = {
  name: 'RouterLink',
  props: { to: { type: [String, Object], default: '' } },
  template: `<a href="#" @click.prevent><slot /></a>`,
}

/** Breadcrumb trail; items are { label, to? }. The last item renders as plain text. */
export default {
  title: 'Navigation/BaseBreadcrumbs',
  component: BaseBreadcrumbs,
  tags: ['autodocs'],
}

export const Default = {
  render: (args) => ({
    components: { BaseBreadcrumbs, RouterLink: RouterLinkStub },
    setup() {
      const items = [
        { label: 'Home', to: '/' },
        { label: 'Documents', to: '/documents' },
        { label: 'Quality Manual' },
      ]
      return { args, items }
    },
    template: `<BaseBreadcrumbs v-bind="args" :items="items" />`,
  }),
}

export const PlainText = {
  render: (args) => ({
    components: { BaseBreadcrumbs },
    setup() {
      // No `to` anywhere — every segment renders as a <span>, no router needed.
      const items = [{ label: 'Home' }, { label: 'Documents' }, { label: 'Quality Manual' }]
      return { args, items }
    },
    template: `<BaseBreadcrumbs v-bind="args" :items="items" />`,
  }),
}

export const TwoLevels = {
  render: (args) => ({
    components: { BaseBreadcrumbs, RouterLink: RouterLinkStub },
    setup() {
      const items = [{ label: 'Settings', to: '/settings' }, { label: 'Profile' }]
      return { args, items }
    },
    template: `<BaseBreadcrumbs v-bind="args" :items="items" />`,
  }),
}

export const DeepTrail = {
  render: (args) => ({
    components: { BaseBreadcrumbs, RouterLink: RouterLinkStub },
    setup() {
      const items = [
        { label: 'Home', to: '/' },
        { label: 'Sites', to: '/sites' },
        { label: 'London', to: '/sites/london' },
        { label: 'Departments', to: '/sites/london/departments' },
        { label: 'Quality Assurance' },
      ]
      return { args, items }
    },
    template: `<BaseBreadcrumbs v-bind="args" :items="items" />`,
  }),
}
