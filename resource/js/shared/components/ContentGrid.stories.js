import ContentGrid from './ContentGrid.vue'

/** Responsive auto-fill grid for card/stat/tile lists. `min` sets the column floor; `gap` is comfortable|compact. */
export default {
  title: 'Layout/ContentGrid',
  component: ContentGrid,
  tags: ['autodocs'],
  args: {
    min: '16rem',
    gap: 'comfortable',
  },
}

const cardTemplate = `
  <ContentGrid v-bind="args">
    <div
      v-for="n in 6"
      :key="n"
      class="tw:rounded-xl tw:border tw:border-divider tw:bg-card tw:p-4"
    >
      <div class="tw:text-xs tw:text-secondary">Metric {{ n }}</div>
      <div class="tw:mt-1 tw:text-2xl tw:font-bold tw:text-on-main">{{ n * 12 }}</div>
    </div>
  </ContentGrid>`

export const Default = {
  render: (args) => ({
    components: { ContentGrid },
    setup() {
      return { args }
    },
    template: cardTemplate,
  }),
}

export const CompactGap = {
  args: { gap: 'compact' },
  render: (args) => ({
    components: { ContentGrid },
    setup() {
      return { args }
    },
    template: cardTemplate,
  }),
}

export const WideColumns = {
  args: { min: '22rem' },
  render: (args) => ({
    components: { ContentGrid },
    setup() {
      return { args }
    },
    template: cardTemplate,
  }),
}

export const NarrowColumns = {
  args: { min: '12rem' },
  render: (args) => ({
    components: { ContentGrid },
    setup() {
      return { args }
    },
    template: cardTemplate,
  }),
}
