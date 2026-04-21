/**
 * Phase 1e, Task 4 — visual snapshot for the Collections block (base theme, 1440px).
 * Follows the Hero pilot pattern. Snapshot is committed under
 * `__snapshots__/snapshots/base/Collections/default-1440.png` and compared
 * pixel-by-pixel with a 1% threshold (see `playwright.config.ts`).
 */
import { test, expect } from '@playwright/test';
import {
  renderBlockToHtml,
  startSnapshotServer,
  type SnapshotServer,
} from './render-utils';

const COLLECTIONS_PROPS = {
  id: 'c1',
  heading: 'Наши коллекции',
  collections: [
    { id: 'col-1', collectionId: null, heading: 'Коллекция 1', description: 'Test' },
    { id: 'col-2', collectionId: null, heading: 'Коллекция 2', description: 'Test' },
    { id: 'col-3', collectionId: null, heading: 'Коллекция 3', description: 'Test' },
  ],
  columns: 3,
  colorScheme: 1,
  padding: { top: 40, bottom: 40 },
};

const BASE_TOKENS_CSS = `
:root {
  --color-bg: 255 255 255;
  --color-heading: 17 17 17;
  --color-text: 51 51 51;
  --color-muted: 120 120 120;
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

test.describe('Collections visual snapshot (base theme)', () => {
  let server: SnapshotServer;

  test.beforeAll(async () => {
    const html = await renderBlockToHtml(
      'Collections',
      COLLECTIONS_PROPS,
      BASE_TOKENS_CSS,
    );
    server = await startSnapshotServer(html);
  });

  test.afterAll(async () => {
    if (server) await server.stop();
  });

  test('base/Collections/default-1440.png', async ({ page }) => {
    await page.goto(server.url);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('base/Collections/default-1440.png', {
      fullPage: true,
    });
  });
});
