import { mergeConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { VueRouterAutoImports } from 'unplugin-vue-router'
import tailwindcss from '@tailwindcss/vite'

/**
 * Storybook config. The @storybook/vue3-vite framework already registers
 * @vitejs/plugin-vue, so viteFinal only adds the rest of the project's build
 * plumbing — Tailwind v4 (tw: prefix), the auto-import plugins, and the path
 * aliases — so stories mount Base* components exactly like the app does.
 *
 * @type {import('@storybook/vue3-vite').StorybookConfig}
 */
export default {
  stories: [
    '../resource/js/shared/components/**/*.stories.@(js|mjs)',
    '../src/**/*.stories.@(js|mjs)',
  ],
  addons: ['@storybook/addon-a11y'],
  framework: { name: '@storybook/vue3-vite', options: {} },
  async viteFinal(config) {
    return mergeConfig(config, {
      resolve: {
        alias: {
          '@': fileURLToPath(new URL('../src', import.meta.url)),
          '@resource': fileURLToPath(new URL('../resource', import.meta.url)),
          '@shared': fileURLToPath(new URL('../resource/js/shared', import.meta.url)),
          '@syncEngine': fileURLToPath(new URL('../syncEngine', import.meta.url)),
          '@models': fileURLToPath(new URL('../models', import.meta.url)),
        },
      },
      plugins: [
        tailwindcss(),
        AutoImport({
          imports: ['vue', 'vue-router', '@vueuse/core', VueRouterAutoImports],
          dirs: ['resource/js/shared/composables', 'src/composables'],
          dts: false,
        }),
        Components({
          dirs: ['src/components', 'resource/js/shared/components'],
          extensions: ['vue', 'js'],
          dts: false,
        }),
      ],
    })
  },
}
