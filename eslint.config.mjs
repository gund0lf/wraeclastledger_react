import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  {
    ignores: [
      '**/node_modules', '**/dist', '**/out',
      // Separate (private, server) repo checked out inside this folder —
      // CommonJS Node code with its own conventions; never lint it from here.
      'traceuer-server-side',
      'lint-report.json'
    ]
  },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules,
      // Hot-reload quality hint, not a defect (2026-07-11 baseline):
      // UpdateBanner deliberately exports APP_VERSION next to its component
      // (single source of truth), RegexModule exports the shared tab
      // components. Worst case is a full reload instead of fast-refresh in
      // dev. Lives HERE because flat config resolves a rule against the
      // plugins of ITS OWN config object.
      'react-refresh/only-export-components': 'warn'
    }
  },
  eslintConfigPrettier,
  {
    // ── Lint baseline (2026-07-11, external-review follow-up) ────────────────
    // Deliberate rule decisions so lint can be a GREEN GATE next to typecheck.
    // Rationale per rule — change these only with a matching codebase sweep.
    files: ['**/*.{ts,tsx,mjs}'],
    rules: {
      // The codebase never adopted prettier formatting; enforcing it now would
      // be a ~6300-change reformat that destroys git blame and edit anchors.
      // Formal decision: prettier is NOT adopted. (eslintConfigPrettier above
      // still disables conflicting stylistic rules, which is all we need.)
      'prettier/prettier': 'off',
      // Style opinion, not a defect: tsc infers and CHECKS return types; the
      // typecheck gate owns type safety. ~94 hits carried no information.
      '@typescript-eslint/explicit-function-return-type': 'off',
      // Real but non-blocking debt (~35 sites, mostly flexlayout Node casts
      // and IPC payloads). Warn = visible, burned down opportunistically.
      '@typescript-eslint/no-explicit-any': 'warn',
      // [^\x00-\x7F] ASCII-filter regexes are a deliberate, load-bearing
      // pattern across parsers (strip emoji/decoration). Not accidents.
      'no-control-regex': 'off',
      // Underscore prefix = intentionally unused (catch bindings, destructure
      // placeholders) — the established convention in this codebase.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
      ],
      // Electron <webview> attribute, unknown to react-dom on purpose.
      'react/no-unknown-property': ['error', { ignore: ['allowpopups'] }]
      // (react-refresh/only-export-components -> warn lives in the plugins
      // block above — flat config needs the rule beside its plugin.)
    }
  }
)
