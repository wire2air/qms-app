import BaseAvatar from './BaseAvatar.vue'

/** BaseAvatar — image / initials / icon fallback with a deterministic tint. */
export default {
  title: 'Media/BaseAvatar',
  component: BaseAvatar,
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'inline-radio', options: ['xs', 'sm', 'md', 'lg', 'xl'] },
    shape: { control: 'inline-radio', options: ['circle', 'square'] },
  },
  args: { name: 'Madeline Cote', src: '', size: 'md', shape: 'circle' },
}

export const Initials = {
  render: (args) => ({
    components: { BaseAvatar },
    setup: () => ({ args }),
    template: `<BaseAvatar v-bind="args" />`,
  }),
}

export const WithImage = { ...Initials, args: { name: 'Madeline Cote', src: 'https://i.pravatar.cc/100?img=5' } }

export const Sizes = {
  render: () => ({
    components: { BaseAvatar },
    template: `
      <div class="tw:flex tw:items-center tw:gap-3">
        <BaseAvatar name="Ada Lovelace" size="xs" />
        <BaseAvatar name="Grace Hopper" size="sm" />
        <BaseAvatar name="Jane Doe" size="md" />
        <BaseAvatar name="Sam Park" size="lg" />
        <BaseAvatar name="No Image" size="xl" />
        <BaseAvatar size="lg" />
      </div>`,
  }),
}
