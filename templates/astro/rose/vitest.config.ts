import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    setupFiles: [],
  },
  resolve: {
    alias: {
      // Allow storefront package imports
      '@merfy/storefront': new URL('../../packages/storefront', import.meta.url).pathname,
    },
  },
});
