import { defineConfig } from 'vitest/config';

// Тесты на стенде compose.stack.yml (`pnpm stack:up`): Postgres той же версии, что база sites на dev, RabbitMQ 3.13 и
// MinIO, как на dev и в проде. Файлы идут по одному: у них общие база и брокер. Покрытие — всего src/, кроме точки
// входа: её проверяет проба сборщика (задача 8).
export default defineConfig({
  test: {
    include: ['__tests__/stack/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
