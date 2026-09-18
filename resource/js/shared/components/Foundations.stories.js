/**
 * Foundations — a visual reference for the design tokens (colors, typography,
 * elevation, z-index). Backed by docs/design-system-tokens.md. Toggle the Theme
 * toolbar (top bar) to see light/dark.
 */
export default {
  title: 'Foundations/Tokens',
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
}

const SEMANTIC = [
  ['tw:bg-primary tw:text-on-primary', 'primary'],
  ['tw:bg-card tw:text-on-main tw:border tw:border-divider', 'card'],
  ['tw:bg-main tw:text-on-main tw:border tw:border-divider', 'main'],
  ['tw:bg-success-100 tw:text-success-700', 'success-100'],
  ['tw:bg-warning-100 tw:text-warning-700', 'warning-100'],
  ['tw:bg-danger-100 tw:text-danger-700', 'danger-100'],
  ['tw:bg-info-100 tw:text-info-700', 'info-100'],
]

export const Colors = {
  render: () => ({
    setup: () => ({ SEMANTIC }),
    template: `
      <div class="tw:p-6 tw:bg-main">
        <div class="tw:grid tw:grid-cols-2 tw:sm:grid-cols-3 tw:lg:grid-cols-4 tw:gap-3">
          <div v-for="[cls, name] in SEMANTIC" :key="name"
               class="tw:flex tw:items-center tw:justify-center tw:h-20 tw:rounded-xl tw:text-sm tw:font-medium"
               :class="cls">{{ name }}</div>
        </div>
      </div>`,
  }),
}

export const Typography = {
  render: () => ({
    template: `
      <div class="tw:p-6 tw:bg-main tw:text-on-main tw:flex tw:flex-col tw:gap-2">
        <p class="tw:text-page-title tw:font-bold">text-page-title · 28px</p>
        <p class="tw:text-section-title tw:font-semibold">text-section-title · 18px</p>
        <p class="tw:text-subheading tw:font-semibold">text-subheading · 15px</p>
        <p class="tw:text-body">text-body · 14px</p>
        <p class="tw:text-label tw:font-medium">text-label · 12px</p>
        <p class="tw:text-caption tw:text-secondary">text-caption · 11px</p>
      </div>`,
  }),
}

export const Elevation = {
  render: () => ({
    template: `
      <div class="tw:p-8 tw:bg-main tw:grid tw:grid-cols-2 tw:lg:grid-cols-4 tw:gap-6">
        <div v-for="s in ['flat','raised','floating','overlay']" :key="s"
             class="tw:flex tw:items-center tw:justify-center tw:h-24 tw:rounded-xl tw:bg-card tw:text-sm tw:text-secondary"
             :class="'tw:shadow-' + s">shadow-{{ s }}</div>
      </div>`,
  }),
}

export const ZIndex = {
  render: () => ({
    setup: () => ({
      LAYERS: [
        ['z-raised', 10],
        ['z-dropdown', 20],
        ['z-sticky', 30],
        ['z-overlay', 40],
        ['z-modal', 50],
        ['z-popover', 60],
        ['z-toast', 100],
        ['z-max', 9999],
      ],
    }),
    template: `
      <div class="tw:p-6 tw:bg-main tw:flex tw:flex-col tw:gap-1">
        <p class="tw:text-caption tw:text-secondary tw:mb-2">Use the name, never a raw z-&lt;number&gt;.</p>
        <div v-for="[name, val] in LAYERS" :key="name"
             class="tw:flex tw:justify-between tw:rounded-lg tw:bg-card tw:border tw:border-divider tw:px-3 tw:py-2 tw:text-sm">
          <span class="tw:text-primary">tw:{{ name }}</span>
          <span class="tw:text-secondary">{{ val }}</span>
        </div>
      </div>`,
  }),
}
