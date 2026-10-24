// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

// Правила кода этапа (storefront-shell/RULES.md, раздел 3) — линтером, как у пакетов блоков 4–6: вложенность не глубже
// двух уровней, без вложенных тернарников, без `as` (кроме `as const`), без `!`, без console. Журнал приёма — функция
// log из зависимостей, как у сборщика. Комментарии-отключения не действуют: noInlineConfig.
export default tseslint.config(
  { ignores: ['eslint.config.mjs', 'coverage/**', 'fixtures/**', 'dist-render/**', 'e2e/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
    rules: {
      'max-depth': ['error', 2],
      'no-nested-ternary': 'error',
      'no-console': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  {
    files: ['src/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      'max-lines-per-function': ['error', { max: 30, skipBlankLines: true, skipComments: true }],
    },
  },
);
