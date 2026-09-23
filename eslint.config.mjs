import js from '@eslint/js';
import ts from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import a11y from 'eslint-plugin-jsx-a11y';
import i18next from 'eslint-plugin-i18next';

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
      'site/**',
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
    files: ['src/renderer/**/*.tsx'],
    plugins: { 'react-hooks': hooks, 'jsx-a11y': a11y, i18next },
    rules: {
      ...hooks.configs.recommended.rules,
      ...a11y.configs.recommended.rules,
      'i18next/no-literal-string': ['error', { markupOnly: true }],
    },
  },
  {
    files: ['**/*.mjs', '**/*.cjs'],
    ...ts.configs.disableTypeChecked,
    languageOptions: { globals: { process: 'readonly', console: 'readonly', module: 'readonly' } },
  },
  { files: ['src/domain/templates.ts', 'src/renderer/locales/**'], rules: { 'max-lines': 'off' } },
);
