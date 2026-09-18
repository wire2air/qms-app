import js from '@eslint/js'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'
import prettierSkipFormatting from '@vue/eslint-config-prettier/skip-formatting'
import eslintAutoImport from './eslint-auto-import.js'
import babelParser from '@babel/eslint-parser'

export default [
  // syncEngine uses TC39 decorators — parse with Babel
  {
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          plugins: [['@babel/plugin-proposal-decorators', { version: '2023-11' }]],
        },
      },
    },
  },
  {
    // Global ignores (previously provided by the Quasar eslint preset).
    // ESLint already ignores node_modules/ and .git/ by default.
    // ESLint requires "ignores" to be the only key in this object.
    ignores: ['dist', 'dist-ssr', 'public', '*.local'],
  },

  js.configs.recommended,

  /**
   * https://eslint.vuejs.org
   *
   * pluginVue.configs.base
   *   -> Settings and rules to enable correct ESLint parsing.
   * pluginVue.configs[ 'flat/essential']
   *   -> base, plus rules to prevent errors or unintended behavior.
   * pluginVue.configs["flat/strongly-recommended"]
   *   -> Above, plus rules to considerably improve code readability and/or dev experience.
   * pluginVue.configs["flat/recommended"]
   *   -> Above, plus rules to enforce subjective community defaults to ensure consistency.
   */
  ...pluginVue.configs['flat/strongly-recommended'],

  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',

      globals: {
        ...globals.browser,
        ...eslintAutoImport.globals,
        ...globals.node, // SSR, Electron, config files
        process: 'readonly', // process.env.*
        ga: 'readonly', // Google Analytics
        cordova: 'readonly',
        Capacitor: 'readonly',
        chrome: 'readonly', // BEX related
        browser: 'readonly', // BEX related
      },
    },

    // add your custom rules here
    rules: {
      'prefer-promise-reject-errors': 'off',

      // allow debugger during development only
      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    },
  },

  {
    files: ['src-pwa/custom-service-worker.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
      },
    },
  },

  {
    rules: {
      'no-unsafe-optional-chaining': 'warn',
      'no-console': ['error', { allow: ['warn', 'error', 'info', 'debug'] }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'vue/multi-word-component-names': 'off',
      'vue/attribute-hyphenation': ['error', 'never'],
      'vue/v-on-event-hyphenation': ['error', 'never'],
      'vue/attributes-order': [
        'error',
        {
          order: [
            'DEFINITION',
            'LIST_RENDERING',
            'CONDITIONALS',
            'RENDER_MODIFIERS',
            'GLOBAL',
            'UNIQUE',
            'TWO_WAY_BINDING',
            'OTHER_DIRECTIVES',
            'OTHER_ATTR',
            'EVENTS',
            'CONTENT',
          ],
          alphabetical: false,
        },
      ],
      'vue/no-v-html': 'off', // Disabled as we use it in some places (e.g. for rendering HTML emails)
      'vue/block-order': ['error', { order: ['script', 'template', 'style'] }],
      'vue/define-macros-order': [
        'error',
        {
          order: ['defineOptions', 'defineProps', 'defineEmits', 'defineSlots', 'defineModel'],
          defineExposeLast: true,
        },
      ],
      'vue/component-name-in-template-casing': [
        'error',
        'PascalCase',
        {
          ignores: [],
        },
      ],
      'vue/no-mutating-props': 'off',
    },
  },
  {
    files: ['syncEngine/**/*.js'], // Target the specific folder
    rules: { 'no-console': 'off' }, // Disable the rule here
  },

  {
    /**
     * Design-system guardrail: forbid hardcoded hex colors inside Tailwind
     * arbitrary-value classes (e.g. tw:bg-[#1e293b], tw:text-[#4ade80]) within
     * component code. These bypass the token system and break dark mode.
     * Use a token instead: tw:bg-card, tw:text-primary, tw:border-divider, etc.
     * See src/css/tokens.css. For an intentionally theme-independent dark
     * surface (code blocks, dark-asset previews) use tw:bg-code.
     *
     * Promoted to "error" — the scope is at zero violations, so this now
     * prevents any new drift. The larger arbitrary font-size cleanup
     * (tw:text-[11px] ×400+) is tracked separately and not enforced here.
     */
    files: ['src/components/**/*.{vue,js}', 'resource/js/shared/components/**/*.{vue,js}'],
    rules: {
      'vue/no-restricted-syntax': [
        'error',
        {
          selector: 'VLiteral[value=/-\\[#[0-9a-fA-F]{3,8}\\]/]',
          message:
            'Hardcoded hex in a Tailwind class bypasses the design tokens and breaks dark mode. Use a token (tw:bg-card, tw:text-primary, tw:border-divider…). See src/css/tokens.css.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/-\\[#[0-9a-fA-F]{3,8}\\]/]',
          message:
            'Hardcoded hex in a Tailwind class bypasses the design tokens and breaks dark mode. Use a token (tw:bg-card, tw:text-primary, tw:border-divider…). See src/css/tokens.css.',
        },
      ],
    },
  },

  prettierSkipFormatting,
]
