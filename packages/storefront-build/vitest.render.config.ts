import { defineConfig } from 'vitest/config';

// Тесты с настоящей серверной сборкой темы nova: перед ними Astro собирает рисовальщик, это до минуты на холодной
// установке. Поэтому своя команда (`pnpm test:render`) и таймауты больше обычных. Файлы — по одному: две сборки
// одной темы разом спорят за кэш Vite в node_modules темы (то же было у стенда блока 2).
export default defineConfig({
  test: {
    include: ['__tests__/render/*.test.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 240_000,
  },
});
