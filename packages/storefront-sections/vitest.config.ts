import { defineConfig } from 'vitest/config';

// Быстрые тесты приёма: __tests__/*.test.ts, без базы и сети. Порог покрытия — от 80 % (решение владельца 23.09).
// Запросы к базе и приём целиком (registry.ts, accept.ts) покрывают тесты на стенде (`pnpm test:stack`,
// vitest.stack.config.ts); процессы сборки, рендера и проба песочницы (worker.ts, render-worker.ts, sandbox-probe.ts) —
// тесты sandbox.ts, render.ts и sandbox-report.ts: они идут в отдельных процессах.
export default defineConfig({
  test: {
    include: ['__tests__/*.test.ts'],
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/worker.ts',
        'src/render-worker.ts',
        'src/sandbox-probe.ts',
        'src/registry.ts',
        'src/accept.ts',
        'src/release.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
