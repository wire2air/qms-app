import { IconEdit, IconCopy, IconTrash, IconArchive } from '@tabler/icons-vue'
import BaseMenu from './BaseMenu.vue'

/** Dropdown action menu driven by an `items` array ({ name, icon, click, disabled, title }). */
export default {
  title: 'Overlays/BaseMenu',
  component: BaseMenu,
  tags: ['autodocs'],
}

export const Default = {
  render: () => ({
    components: { BaseMenu },
    setup() {
      const items = [
        { name: 'Edit', icon: IconEdit, click: () => {} },
        { name: 'Duplicate', icon: IconCopy, click: () => {} },
        { name: 'Delete', icon: IconTrash, click: () => {} },
      ]
      return { items }
    },
    template: `
      <div class="tw:flex tw:justify-center tw:py-16">
        <BaseMenu :items="items" />
      </div>`,
  }),
}

export const WithDisabledItem = {
  render: () => ({
    components: { BaseMenu },
    setup() {
      const items = [
        { name: 'Edit', icon: IconEdit, click: () => {} },
        { name: 'Archive', icon: IconArchive, click: () => {}, disabled: true, title: 'Already archived' },
        { name: 'Delete', icon: IconTrash, click: () => {} },
      ]
      return { items }
    },
    template: `
      <div class="tw:flex tw:justify-center tw:py-16">
        <BaseMenu :items="items" />
      </div>`,
  }),
}

export const CustomTrigger = {
  render: () => ({
    components: { BaseMenu },
    setup() {
      const items = [
        { name: 'Edit', icon: IconEdit, click: () => {} },
        { name: 'Delete', icon: IconTrash, click: () => {} },
      ]
      return { items }
    },
    template: `
      <div class="tw:flex tw:justify-center tw:py-16">
        <BaseMenu :items="items">
          <template #trigger>
            <button class="tw:rounded-lg tw:bg-primary tw:text-on-primary tw:px-3 tw:py-1.5 tw:text-sm">Actions</button>
          </template>
        </BaseMenu>
      </div>`,
  }),
}
