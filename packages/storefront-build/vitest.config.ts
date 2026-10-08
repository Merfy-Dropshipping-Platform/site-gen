import { defineConfig } from 'vitest/config';

// Порог покрытия новых модулей — от 80 % (решение владельца 23.09). Пороги проверяет `pnpm test:coverage`.
// Здесь быстрые тесты пакета: __tests__/*.test.ts. Тесты с настоящей серверной сборкой темы собирают её через Astro
// и идут своей командой `pnpm test:render`; src/theme-build.ts зовёт astro build, поэтому его покрывают они.
export default defineConfig({
  test: {
    include: ['__tests__/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/locals.ts', 'src/theme-build.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
