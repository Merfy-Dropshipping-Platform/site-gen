// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

// Правила кода этапа (storefront-shell/RULES.md, раздел 3) — линтером: вложенность не глубже двух уровней,
// без вложенных тернарников, без `as` (кроме `as const`), без `!`, без console. Комментарии-отключения
// не действуют: noInlineConfig.
// Читатель конфига работает в браузере без zod (design.md блока 3, 5.5): в src/read.ts zod и модули пакета, которые
// его тянут, можно брать только импортом типов.
const BROWSER_READER = 'src/read.ts работает в браузере без zod: отсюда можно брать только типы (import type).';
const ZOD_MODULES = ['zod', './schema', './build', './events', './generated-files', './index'];

export default tseslint.config(
  { ignores: ['eslint.config.mjs', 'coverage/**', 'generated/**', 'fixtures/**'] },
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
  {
    files: ['src/read.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { paths: ZOD_MODULES.map((name) => ({ name, message: BROWSER_READER, allowTypeImports: true })) },
      ],
    },
  },
);
