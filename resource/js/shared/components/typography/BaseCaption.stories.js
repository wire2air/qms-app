import BaseCaption from './BaseCaption.vue'

/**
 * BaseCaption — small secondary/meta text (timestamps, counts). Renders a single
 * <span> using the shared `caption` token; consumer attrs fall through.
 */
export default {
  title: 'Typography/BaseCaption',
  component: BaseCaption,
  tags: ['autodocs'],
  args: {},
}

const render = (args) => ({
  components: { BaseCaption },
  setup: () => ({ args }),
  template: `<BaseCaption v-bind="args">Updated 3 minutes ago</BaseCaption>`,
})

export const Default = { render }

export const Count = {
  render: (args) => ({
    components: { BaseCaption },
    setup: () => ({ args }),
    template: `<BaseCaption v-bind="args">12 items</BaseCaption>`,
  }),
}

/** Attrs (e.g. `title`) fall through to the rendered <span>. */
export const WithTitleAttr = {
  render: (args) => ({
    components: { BaseCaption },
    setup: () => ({ args }),
    template: `<BaseCaption v-bind="args" title="June 18, 2026 at 09:14">2 hours ago</BaseCaption>`,
  }),
}
