import { defineConfig } from 'vitest/config';

// Порог покрытия новых модулей — от 80 % (решение владельца 23.09). Пороги проверяет `pnpm test:coverage`.
// src/cli — входы команд и печать: их проверяют прогоны команд (задачи 6 и 10), а не покрытие.
// Тесты с браузером и сборкой темы идут дольше, поэтому таймауты больше обычных.
//
// Две сборки темы nova не должны идти одновременно: nova-build и stand-page собирают themes/nova
// и делят её кэши node_modules/.vite и .astro — параллельная сборка роняет прогон (ENOTEMPTY,
// «Cannot find module .astro/.prerender/…»). Поэтому файлы со сборкой темы — отдельный проект
// в одном форке (singleFork: файлы друг за другом), остальные тесты идут параллельно, как раньше.
const NOVA_FILES = ['__tests__/nova-build.test.ts', '__tests__/stand-page.browser.test.ts'];

export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 240_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.mjs'],
      exclude: ['src/types.ts', 'src/cli/**'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
    projects: [
      {
        test: {
          name: 'nova',
          include: NOVA_FILES,
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
        },
      },
      {
        test: {
          name: 'unit',
          include: ['__tests__/**/*.test.ts'],
          exclude: NOVA_FILES,
        },
      },
    ],
  },
});
