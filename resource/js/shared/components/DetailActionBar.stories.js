// DetailActionBar.stories.js
import DetailActionBar from './DetailActionBar.vue'
import { IconCheck, IconArchive, IconTrash, IconDownload } from '@tabler/icons-vue'

export default { title: 'Detail Page/DetailActionBar', component: DetailActionBar, tags: ['autodocs'] }

export const Default = {
  render: () => ({
    components: { DetailActionBar },
    setup: () => ({
      actions: [
        { id: 'approve', label: 'Approve', icon: IconCheck, variant: 'primary', priority: 100, onSelect: () => {} },
        { id: 'archive', label: 'Archive', icon: IconArchive, priority: 50, onSelect: () => {} },
        { id: 'export', label: 'Export', icon: IconDownload, priority: 30, onSelect: () => {} },
        { id: 'delete', label: 'Delete', icon: IconTrash, variant: 'danger', priority: 10, onSelect: () => {} },
      ],
    }),
    template: `<DetailActionBar :actions="actions" />`,
  }),
}
