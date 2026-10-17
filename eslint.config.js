import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
  globalIgnores(['dist/', 'coverage/', 'playwright-report/', 'test-results/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    // コメントには日本語の文面の例（全角スペース入り）を書くことがある。コードの中は引き続き検出する
    rules: { 'no-irregular-whitespace': ['error', { skipComments: true }] },
  },
  {
    files: ['*.config.{ts,js}', 'e2e/**/*.ts', 'scripts/**/*.{ts,mjs}'],
    languageOptions: { globals: globals.node },
  },
)
