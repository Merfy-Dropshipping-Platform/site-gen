import { defineConfig } from 'vitest/config';

// Тесты стенда (задача 7): собирают тему nova целиком через Astro, поэтому идут своей командой `pnpm test:stand`,
// а не вместе с тестами пакета. Нужны блок 2 в ветке и установка темы: pnpm install --ignore-workspace в themes/nova.
export default defineConfig({
  test: {
    include: ['__tests__/stand/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 240_000,
  },
});
