import { defineConfig } from 'vitest/config';

// Быстрые тесты приёма: __tests__/*.test.ts, без базы и сети. Порог покрытия — от 80 % (решение владельца 23.09).
// Запросы к базе и приём целиком (registry.ts, accept.ts, release.ts) покрывают тесты на стенде (`pnpm test:stack`,
// vitest.stack.config.ts); процесс сборки (worker.ts) — тесты sandbox.ts: он идёт в отдельном процессе.
export default defineConfig({
  test: {
    include: ['__tests__/*.test.ts'],
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/worker.ts', 'src/registry.ts', 'src/accept.ts', 'src/release.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
