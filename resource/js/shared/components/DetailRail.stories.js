import DetailRail from './DetailRail.vue'

export default { title: 'Detail Page/DetailRail', component: DetailRail, tags: ['autodocs'] }

export const Descriptors = {
  render: () => ({
    components: { DetailRail },
    setup: () => ({
      railCards: [
        { id: 'props', title: 'Properties', items: [{ label: 'Owner', value: 'Jane Doe' }, { label: 'Status', value: 'Active' }] },
        { id: 'dates', title: 'Dates', items: [{ label: 'Created', value: '12 Jun 2026' }, { label: 'Updated', value: '2d ago' }] },
      ],
    }),
    template: `<div class="tw:w-80"><DetailRail :railCards="railCards" /></div>`,
  }),
}
