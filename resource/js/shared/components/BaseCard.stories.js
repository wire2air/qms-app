import BaseCard from './BaseCard.vue'

/**
 * BaseCard — the standard surface primitive (rounded-xl border + theme-aware
 * bg-card + padding). The home for ad-hoc card divs.
 */
export default {
  title: 'Layout/BaseCard',
  component: BaseCard,
  tags: ['autodocs'],
  argTypes: { padding: { control: 'inline-radio', options: ['none', 'sm', 'md', 'lg'] } },
  args: { padding: 'md' },
}

export const Default = {
  render: (args) => ({
    components: { BaseCard },
    setup: () => ({ args }),
    template: `<BaseCard v-bind="args" class="tw:max-w-sm"><p class="tw:text-sm tw:text-on-main">Card content sits on a theme-aware surface.</p></BaseCard>`,
  }),
}

export const Paddings = {
  render: () => ({
    components: { BaseCard },
    template: `
      <div class="tw:flex tw:flex-col tw:gap-3 tw:max-w-sm">
        <BaseCard padding="sm" class="tw:text-xs tw:text-secondary">padding="sm"</BaseCard>
        <BaseCard padding="md" class="tw:text-xs tw:text-secondary">padding="md"</BaseCard>
        <BaseCard padding="lg" class="tw:text-xs tw:text-secondary">padding="lg"</BaseCard>
      </div>`,
  }),
}
