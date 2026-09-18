import DetailHeader from './DetailHeader.vue'
import { IconCheck } from '@tabler/icons-vue'

export default { title: 'Detail Page/DetailHeader', component: DetailHeader, tags: ['autodocs'] }

const actions = [{ id: 'approve', label: 'Approve', icon: IconCheck, variant: 'primary', priority: 100, onSelect: () => {} }]

export const Full = {
  render: () => ({
    components: { DetailHeader },
    setup: () => ({ actions }),
    template: `<DetailHeader title="Acme Corp" avatarName="Acme Corp" :actions="actions">
      <template #status><span class="tw:rounded-md tw:bg-green-100 tw:px-2 tw:py-0.5 tw:text-caption tw:text-green-700">Active</span></template>
      <template #meta>ACM-001 · Supplier · updated 2d ago</template>
    </DetailHeader>`,
  }),
}

export const Compact = {
  render: () => ({
    components: { DetailHeader },
    setup: () => ({ actions }),
    template: `<DetailHeader title="Finished Goods" variant="compact" :actions="actions" />`,
  }),
}
