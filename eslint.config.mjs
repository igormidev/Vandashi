import js from '@eslint/js';
import ts from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import a11y from 'eslint-plugin-jsx-a11y';
import i18next from './scripts/strict-i18next.mjs';
import { localizationMachineRules, localizationRule } from './scripts/localization-policy.mjs';

export default ts.config(
  {
    ignores: [
      'node_modules/**',
      'out/**',
      'dist/**',
      'release/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.strictTypeChecked,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'max-lines': ['error', { max: 350, skipBlankLines: true, skipComments: true }],
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['error', 'warn'] }],
    },
  },
  {
    files: ['src/renderer/**/*.tsx', 'landing/src/**/*.tsx'],
    plugins: { 'react-hooks': hooks, 'jsx-a11y': a11y },
    rules: {
      ...hooks.configs.recommended.rules,
      ...a11y.configs.recommended.rules,
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}', 'landing/src/**/*.{ts,tsx}'],
    ignores: ['src/renderer/locales/**', 'landing/src/locales/**'],
    plugins: { i18next },
    rules: { 'i18next/no-literal-string': localizationRule },
  },
  ...localizationMachineRules,
  {
    files: ['**/*.mjs', '**/*.cjs'],
    ...ts.configs.disableTypeChecked,
    languageOptions: { globals: { process: 'readonly', console: 'readonly', module: 'readonly' } },
  },
  { files: ['src/domain/templates.ts', 'src/renderer/locales/**'], rules: { 'max-lines': 'off' } },
);
