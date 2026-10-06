import { defineConfig } from 'vitest/config';

// Порог покрытия новых модулей — от 80 % (решение владельца 23.09). Пороги проверяет `pnpm test:coverage`.
// src/cli — входы команд и печать: их проверяют прогоны команд (задачи 6 и 10), а не покрытие.
// Тесты с браузером и сборкой темы идут дольше, поэтому таймауты больше обычных.
export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 240_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.mjs'],
      exclude: ['src/types.ts', 'src/cli/**'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
