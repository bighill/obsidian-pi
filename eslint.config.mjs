import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'main.js', 'meta.json', 'main.js.map', 'esbuild.config.mjs'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    rules: {
      // The Pi SDK and Obsidian API surfaces use `any` in several places.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
