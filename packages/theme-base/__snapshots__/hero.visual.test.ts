/**
 * Phase 1e, Task 3 — pilot visual snapshot for the Hero block (base theme,
 * centered variant, 1440px). Acts as the reference implementation other
 * blocks copy. The snapshot is committed under
 * `__snapshots__/snapshots/base/Hero/centered-1440.png` and compared
 * pixel-by-pixel with a 1% threshold (see `playwright.config.ts`).
 */
import { test, expect } from '@playwright/test';
import {
  renderBlockToHtml,
  startSnapshotServer,
  type SnapshotServer,
} from './render-utils';

const HERO_PROPS = {
  id: 'h1',
  title: 'Visual Snapshot Hero',
  subtitle: 'Testing the Phase 1e visual diff pipeline',
  image: {
    // Solid-color placeholder — avoids network flake from random picsum.
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="100%" height="100%" fill="%23f4f4f4"/></svg>',
    alt: 'Test',
  },
  cta: { text: 'Go', href: '/catalog' },
  variant: 'centered' as const,
  colorScheme: 1,
  padding: { top: 80, bottom: 80 },
};

const BASE_TOKENS_CSS = `
:root {
  --color-bg: 255 255 255;
  --color-heading: 17 17 17;
  --color-text: 51 51 51;
  --color-button-bg: 17 17 17;
  --color-button-text: 255 255 255;
  --color-button-border: 17 17 17;
  --radius-button: 8px;
  --font-heading: 'Inter', sans-serif;
  --font-body: 'Inter', sans-serif;
  --size-hero-heading: 48px;
  --size-hero-button-h: 48px;
  --container-max-width: 1320px;
}
.color-scheme-1 { }
`;

test.describe('Hero visual snapshot (base theme)', () => {
  let server: SnapshotServer;

  test.beforeAll(async () => {
    const html = await renderBlockToHtml('Hero', HERO_PROPS, BASE_TOKENS_CSS);
    server = await startSnapshotServer(html);
  });

  test.afterAll(async () => {
    if (server) await server.stop();
  });

  test('base/Hero/centered-1440.png', async ({ page }) => {
    await page.goto(server.url);
    // Wait for fonts + images so we never screenshot a half-rendered hero.
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('base/Hero/centered-1440.png', {
      fullPage: true,
    });
  });
});
