import { defineConfig } from 'vitest/config';

// Тесты на стенде compose.stack.yml сборщика (`pnpm stack:up` из packages/storefront-builder с COMPOSE_PROJECT_NAME
// storefront-sections-test): Postgres с миграциями site-gen и MinIO. Файлы идут по одному: у них общая база. Покрытие —
// модулей, которые ходят в базу и хранилище; остальное покрывают быстрые тесты (vitest.config.ts).
export default defineConfig({
  test: {
    include: ['__tests__/stack/*.test.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/registry.ts', 'src/accept.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
