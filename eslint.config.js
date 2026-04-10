import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  {
    files: ['**/*.ts'],
    plugins: { js },
    extends: ['js/recommended'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  globalIgnores(['dist/', 'coverage/', 'node_modules/', 'tests/protocol/fixtures/']),
  tseslint.configs.recommended,
]);
