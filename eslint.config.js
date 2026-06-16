import js from '@eslint/js'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'
import pluginQuasar from '@quasar/app-vite/eslint'
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
    /**
     * Ignore the following files.
     * Please note that pluginQuasar.configs.recommended() already ignores
     * the "node_modules" folder for you (and all other Quasar project
     * relevant folders and files).
     *
     * ESLint requires "ignores" key to be the only one in this object
     */
    // ignores: []
  },

  ...pluginQuasar.configs.recommended(),
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
     * See src/css/tokens.css.
     *
     * Kept at "warn" deliberately — a handful of legacy violations remain
     * (FishboneAnalysis, risk matrices); promoting to "error" once those are
     * migrated will then prevent any new drift. The much larger arbitrary
     * font-size cleanup (tw:text-[11px] ×400+) is tracked separately.
     */
    files: ['src/components/**/*.{vue,js}', 'resource/js/shared/components/**/*.{vue,js}'],
    rules: {
      'vue/no-restricted-syntax': [
        'warn',
        {
          selector: 'VLiteral[value=/-\\[#[0-9a-fA-F]{3,8}\\]/]',
          message:
            'Hardcoded hex in a Tailwind class bypasses the design tokens and breaks dark mode. Use a token (tw:bg-card, tw:text-primary, tw:border-divider…). See src/css/tokens.css.',
        },
      ],
      'no-restricted-syntax': [
        'warn',
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
