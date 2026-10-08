import { defineConfig } from 'vitest/config';

// Тесты на настоящем MinIO той же версии, что на dev и в проде (design.md блока 5, факт 11). Перед ними —
// `pnpm minio:up` (compose.minio.yml). Покрытие считаем у того, что без MinIO не проверить: хранилище S3.
export default defineConfig({
  test: {
    include: ['__tests__/minio/*.test.ts'],
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['src/s3-store.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
