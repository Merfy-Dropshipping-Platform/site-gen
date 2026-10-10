import { defineConfig } from 'vitest/config';

// Порог покрытия новых модулей — от 80 % (решение владельца 23.09). Здесь быстрые тесты: __tests__/*.test.ts, без
// базы, брокера и хранилища, и покрытие — модулей без ввода-вывода. Всё src/ — база sites, RabbitMQ, MinIO — покрывают
// тесты на стенде, __tests__/stack/*.test.ts, команда `pnpm test:stack` (vitest.stack.config.ts).
export default defineConfig({
  test: {
    include: ['__tests__/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/{errors,parse,log,events,settings,slots,themes,indexnow,preview,inline-assets}.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
