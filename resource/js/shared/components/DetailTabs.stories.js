import DetailTabs from './DetailTabs.vue'
import { ref } from 'vue'

export default { title: 'Detail Page/DetailTabs', component: DetailTabs, tags: ['autodocs'] }

export const Default = {
  render: () => ({
    components: { DetailTabs },
    setup() {
      const active = ref('overview')
      const tabs = [
        { value: 'overview', label: 'Overview' },
        { value: 'docs', label: 'Documents', count: 12 },
        { value: 'activity', label: 'Activity' },
      ]
      return { active, tabs }
    },
    template: `<DetailTabs v-model="active" :tabs="tabs" ariaLabel="Demo">
      <template #tab-overview><div class="tw:py-4">Overview content</div></template>
      <template #tab-docs><div class="tw:py-4">Documents content</div></template>
      <template #tab-activity><div class="tw:py-4">Activity content</div></template>
    </DetailTabs>`,
  }),
}
