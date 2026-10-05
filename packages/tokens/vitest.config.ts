import { defineConfig } from 'vitest/config';

// Порог покрытия новых модулей — от 80 % (решение владельца 23.09). Пороги проверяет `pnpm test:coverage`.
export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/types.ts', 'src/index.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
