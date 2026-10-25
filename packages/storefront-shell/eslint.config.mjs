// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

// Правила кода этапа (storefront-shell/RULES.md, раздел 3) — линтером, как у пакетов блоков 4–6: вложенность не глубже
// двух уровней, без вложенных тернарников, без `as` (кроме `as const`), без `!`. Отличие одно: ядро пишет сбой секции и
// конфига в консоль браузера (design.md блока 7, п. 5 и С7-16 А) — console.error разрешён, остальная консоль нет.
// Комментарии-отключения не действуют: noInlineConfig.
// Ядро идёт в браузер каждой страницы и стоит в бюджете веса (build/build.ts): zod и главный вход пакета конфига (он
// тянет zod) — только импортом типов. Читатель конфига — отдельный вход @merfy/storefront-config/read.
const BROWSER_CORE = 'ядро работает в браузере без zod: отсюда можно брать только типы (import type).';
const ZOD_MODULES = ['zod', '@merfy/storefront-config'];

export default tseslint.config(
  { ignores: ['eslint.config.mjs', 'coverage/**', 'dist/**', 'dist-test/**', 'fixtures/**'] },
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
      'no-console': ['error', { allow: ['error'] }],
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  {
    files: ['src/**/*.ts', 'build/**/*.ts', 'scripts/**/*.ts', 'sections/**/*.ts'],
    rules: {
      'max-lines-per-function': ['error', { max: 30, skipBlankLines: true, skipComments: true }],
    },
  },
  // ctx.log ядра секций (блок 5 «Секций и SDK», раздел 3.2): в превью — console.info с именем секции. Только этот файл.
  {
    files: ['src/core/log.ts'],
    rules: { 'no-console': ['error', { allow: ['error', 'info'] }] },
  },
  // Уведомление без секции «Уведомления» на странице (блок 9, часть 9б; Р9а-20) — console.warn. Только этот файл.
  {
    files: ['src/core/notice-fallback.ts'],
    rules: { 'no-console': ['error', { allow: ['error', 'warn'] }] },
  },
  {
    files: ['src/**/*.ts', 'sections/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { paths: ZOD_MODULES.map((name) => ({ name, message: BROWSER_CORE, allowTypeImports: true })) },
      ],
    },
  },
);
