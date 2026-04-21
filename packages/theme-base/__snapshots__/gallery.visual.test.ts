/**
 * Phase 1e, Task 4 — visual snapshot for the Gallery block (base theme, 1440px).
 * Follows the Hero pilot pattern. Snapshot is committed under
 * `__snapshots__/snapshots/base/Gallery/default-1440.png` and compared
 * pixel-by-pixel with a 1% threshold (see `playwright.config.ts`).
 *
 * Uses inline SVG data URIs for images to avoid network flake (picsum/etc).
 */
import { test, expect } from '@playwright/test';
import {
  renderBlockToHtml,
  startSnapshotServer,
  type SnapshotServer,
} from './render-utils';

const svgPlaceholder = (color: string) =>
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="100%" height="100%" fill="%23${color}"/></svg>`;

const GALLERY_PROPS = {
  id: 'g1',
  items: [
    { type: 'image' as const, id: 'i1', url: svgPlaceholder('d0d0d0'), alt: 'Image 1' },
    { type: 'image' as const, id: 'i2', url: svgPlaceholder('c0c0c0'), alt: 'Image 2' },
    { type: 'image' as const, id: 'i3', url: svgPlaceholder('b0b0b0'), alt: 'Image 3' },
  ],
  layout: 'grid' as const,
  colorScheme: 1,
  padding: { top: 80, bottom: 80 },
};

const BASE_TOKENS_CSS = `
:root {
  --color-bg: 255 255 255;
  --color-heading: 17 17 17;
  --color-text: 51 51 51;
  --font-heading: 'Inter', sans-serif;
  --font-body: 'Inter', sans-serif;
  --size-hero-heading: 48px;
  --radius-media: 12px;
  --radius-card: 12px;
  --spacing-section-y: 80px;
  --spacing-grid-col-gap: 24px;
  --spacing-grid-row-gap: 24px;
  --container-max-width: 1320px;
}
.color-scheme-1 { }
`;

test.describe('Gallery visual snapshot (base theme)', () => {
  let server: SnapshotServer;

  test.beforeAll(async () => {
    const html = await renderBlockToHtml('Gallery', GALLERY_PROPS, BASE_TOKENS_CSS);
    server = await startSnapshotServer(html);
  });

  test.afterAll(async () => {
    if (server) await server.stop();
  });

  test('base/Gallery/default-1440.png', async ({ page }) => {
    await page.goto(server.url);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('base/Gallery/default-1440.png', {
      fullPage: true,
    });
  });
});
