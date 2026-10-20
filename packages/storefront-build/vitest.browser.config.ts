import { defineConfig } from 'vitest/config';

// Тесты скрипта превью в настоящем Chromium (playwright) — отдельно от быстрых тестов пакета.
export default defineConfig({
  test: { include: ['__tests__/browser/**/*.test.ts'], testTimeout: 60_000, hookTimeout: 60_000 },
});
