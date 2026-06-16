import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { VueRouterAutoImports } from 'unplugin-vue-router'
import { fileURLToPath } from 'url'

// Dedicated Vitest config — intentionally lighter than vite.config.js (no
// Quasar/i18n/eslint-checker plugins). It DOES include the auto-import plugins
// so components that rely on auto-imported Vue APIs (ref/computed/watch/
// defineModel) and Base* components mount correctly under test.
export default defineConfig({
  plugins: [
    vue(),
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
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@resource': fileURLToPath(new URL('./resource', import.meta.url)),
      '@shared': fileURLToPath(new URL('./resource/js/shared', import.meta.url)),
      '@syncEngine': fileURLToPath(new URL('./syncEngine', import.meta.url)),
      '@models': fileURLToPath(new URL('./models', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['{src,resource}/**/*.{spec,test}.{js,mjs}'],
  },
})
