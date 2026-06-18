// Load the full design system (Tailwind + tokens) into the preview iframe.
import '../src/css/base.css'
// Register the project's luxon DateTime.prototype.formatDate extension so date
// components (and dt.formatDate usages) render exactly as they do in the app.
import '../src/extensions/datetime.js'

/**
 * Toggle the theme class on <html> so the .light / .dark token sets resolve,
 * exactly as the app does. Driven by the Theme toolbar control below.
 */
function applyTheme(theme) {
  const el = document.documentElement
  el.classList.toggle('dark', theme === 'dark')
  el.classList.toggle('light', theme !== 'dark')
}

/** @type {import('@storybook/vue3-vite').Preview} */
export default {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    // addon-a11y: report violations without failing the build (opt-in to error later).
    a11y: { test: 'todo' },
    backgrounds: { disable: true }, // the theme decorator owns the canvas bg
  },
  globalTypes: {
    theme: {
      description: 'Design-system theme',
      defaultValue: 'light',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'light', title: 'Light', icon: 'sun' },
          { value: 'dark', title: 'Dark', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (story, context) => {
      applyTheme(context.globals.theme)
      return {
        components: { story },
        template: '<div class="tw:bg-main tw:text-on-main tw:p-6"><story /></div>',
      }
    },
  ],
}
