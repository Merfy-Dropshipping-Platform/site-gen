import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './__snapshots__',
  testMatch: /.*\.visual\.test\.ts/,
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // serialize for deterministic rendering
  expect: {
    toHaveScreenshot: {
      threshold: 0.01,
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    },
  },
  use: {
    viewport: { width: 1440, height: 900 },
  },
  // Snapshot artifacts go to __snapshots__/snapshots/<theme>/<block>/<variant>.png
  snapshotPathTemplate: '{testDir}/snapshots/{arg}{ext}',
});
