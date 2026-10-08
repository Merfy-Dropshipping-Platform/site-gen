import { defineConfig } from 'vitest/config';

// Порог покрытия новых модулей — от 80 % (решение владельца 23.09). Пороги проверяет `pnpm test:coverage`.
// Здесь только тесты пакета: __tests__/*.test.ts. Тесты стенда собирают тему целиком и идут своей командой (задача 7).
export default defineConfig({
  test: {
    include: ['__tests__/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
