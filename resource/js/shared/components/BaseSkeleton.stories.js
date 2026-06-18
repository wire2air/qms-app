import BaseSkeleton from './BaseSkeleton.vue'

/** Content-shaped loading placeholder. Text lines, rectangles and circles. */
export default {
  title: 'Primitives/BaseSkeleton',
  component: BaseSkeleton,
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['text', 'rect', 'circle'] },
    width: { control: 'text' },
    height: { control: 'text' },
    rounded: { control: 'text' },
    lines: { control: 'number' },
  },
  args: {
    variant: 'text',
    lines: 1,
  },
}

const render = (args) => ({
  components: { BaseSkeleton },
  setup: () => ({ args }),
  template: `<div class="tw:w-64"><BaseSkeleton v-bind="args" /></div>`,
})

export const Default = { render }

export const Paragraph = {
  render: () => ({
    components: { BaseSkeleton },
    template: `<div class="tw:w-64"><BaseSkeleton :lines="3" /></div>`,
  }),
}

export const Circle = {
  render: () => ({
    components: { BaseSkeleton },
    template: `<BaseSkeleton variant="circle" width="40px" height="40px" />`,
  }),
}

export const Card = {
  render: () => ({
    components: { BaseSkeleton },
    template: `<div class="tw:w-64 tw:flex tw:flex-col tw:gap-3">
      <BaseSkeleton variant="rect" height="120px" />
      <BaseSkeleton variant="text" width="8rem" />
      <BaseSkeleton :lines="2" />
    </div>`,
  }),
}
