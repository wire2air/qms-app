import { defineConfig, loadEnv } from 'vite'
import { quasar, transformAssetUrls } from '@quasar/vite-plugin'
import { fileURLToPath } from 'url'
import vue from '@vitejs/plugin-vue'
import babel from 'vite-plugin-babel'
import VueRouter from 'unplugin-vue-router/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { VueRouterAutoImports } from 'unplugin-vue-router'
import tailwindcss from '@tailwindcss/vite'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import checker from 'vite-plugin-checker'
import * as process from 'node:process'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())

  // Subdomain tenancy: the backend resolves the tenant from the Host header
  // (acme.localhost:5173 → tenant "acme"). `changeOrigin: true` rewrites Host
  // to the upstream (localhost:4000), which would hide the subdomain — so we
  // forward the real browser host as X-Forwarded-Host, which resolveTenant
  // prefers. Without this, every local request resolves to no tenant.
  function forwardTenantHost(proxy) {
    proxy.on('proxyReq', (proxyReq, req) => {
      if (req.headers.host) proxyReq.setHeader('x-forwarded-host', req.headers.host)
    })
  }

  // Proxy configuration for API calls
  const proxy = {
    '/api': {
      target: env.VITE_PROXY_API_TARGET,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, ''),
      configure: forwardTenantHost,
    },
    '/auth': {
      target: env.VITE_PROXY_API_TARGET,
      changeOrigin: true,
      configure: forwardTenantHost,
    },
    '/socket.io': {
      target: env.VITE_PROXY_SYNC_TARGET,
      changeOrigin: true,
      ws: true,
      configure: forwardTenantHost,
    },
  }

  return {
    // Resolve aliases
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@resource': fileURLToPath(new URL('./resource', import.meta.url)),
        '@shared': fileURLToPath(new URL('./resource/js/shared', import.meta.url)),
        '@syncEngine': fileURLToPath(new URL('./syncEngine', import.meta.url)),
        '@models': fileURLToPath(new URL('./models', import.meta.url)),
      },
    },

    // Build target configuration
    build: {
      target: ['es2022', 'firefox115', 'chrome115', 'safari16'],
    },

    // Dev server configuration
    server: {
      open: true, // opens browser window automatically
      proxy,
    },

    // Prevent Vite from pre-bundling all optional peer deps of @vueuse/integrations
    optimizeDeps: {
      exclude: ['@vueuse/integrations'],
    },

    // Vite plugins
    plugins: [
      // TailwindCSS
      tailwindcss(),

      // Babel — needed for TC39 decorator support used by syncEngine
      babel({
        babelConfig: {
          plugins: [['@babel/plugin-proposal-decorators', { version: '2023-11' }]],
        },
      }),

      // Vue Router with file-based routing
      VueRouter({
        importMode: 'sync',
        dts: './typed-router.d.ts',
      }),

      // Vue plugin
      vue({
        template: {
          transformAssetUrls,
        },
      }),

      // Quasar plugin
      quasar({
        autoImportComponentCase: 'pascal',
        sassVariables: fileURLToPath(new URL('./src/css/quasar.variables.scss', import.meta.url)),
      }),

      // Vue I18n
      VueI18nPlugin({
        // if you want to use named tokens in your Vue I18n messages, such as 'Hello {name}',
        // you need to set `runtimeOnly: false`
        // runtimeOnly: false,
        include: [fileURLToPath(new URL('./src/i18n', import.meta.url))],
      }),

      // ESLint checker
      checker({
        eslint: {
          lintCommand: 'eslint -c ./eslint.config.js "./{src,resource}*/**/*.{js,mjs,cjs,vue}"',
          useFlatConfig: true,
        },
      }),

      // Auto-import components
      Components({
        dirs: ['src/components', 'resource/js/shared/components'],
        extensions: ['vue', 'js'],
        dts: true,
      }),

      // Auto-import composables and Vue APIs
      AutoImport({
        imports: ['vue', 'vue-router', '@vueuse/core', VueRouterAutoImports],
        dirs: ['resource/js/shared/composables', 'src/composables'],
        dts: true,
        eslintrc: {
          enabled: true,
          filepath: './eslint-auto-import.js',
        },
      }),
    ],
  }
})
