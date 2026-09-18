import BasePage from './BasePage.vue'

/**
 * BasePage — the single container that owns page width, horizontal padding, and
 * vertical rhythm for every authenticated app page. Pages never hand-pick
 * max-width / padding / section gap.
 *
 * (PageHeader, which teleports into the app top-bar, is omitted here — it has no
 * teleport target inside the isolated Storybook canvas.)
 */
export default {
  title: 'Layout/BasePage',
  component: BasePage,
  tags: ['autodocs'],
  argTypes: {
    width: { control: 'inline-radio', options: ['narrow', 'standard', 'wide', 'full'] },
    density: { control: 'inline-radio', options: ['comfortable', 'compact'] },
    padded: { control: 'boolean' },
  },
  args: { width: 'standard', density: 'comfortable', padded: true, fullHeight: false },
  parameters: { layout: 'fullscreen' },
}

const render = (args) => ({
  components: { BasePage },
  setup: () => ({ args }),
  template: `
    <BasePage v-bind="args">
      <div class="tw:rounded-xl tw:border tw:border-divider tw:bg-card tw:p-4">Section one — content fills the page width and shares one gutter.</div>
      <div class="tw:rounded-xl tw:border tw:border-divider tw:bg-card tw:p-4">Section two — note the consistent vertical rhythm above.</div>
    </BasePage>`,
})

export const Standard = { render }
export const Narrow = { render, args: { width: 'narrow' } }
export const Wide = { render, args: { width: 'wide' } }
