/**
 * Phase 1e, Task 4 — visual snapshot for the Newsletter block (base theme, 1440px).
 * Follows the Hero pilot pattern. Snapshot is committed under
 * `__snapshots__/snapshots/base/Newsletter/default-1440.png` and compared
 * pixel-by-pixel with a 1% threshold (see `playwright.config.ts`).
 */
import { test, expect } from '@playwright/test';
import {
  renderBlockToHtml,
  startSnapshotServer,
  type SnapshotServer,
} from './render-utils';

const NEWSLETTER_PROPS = {
  id: 'n1',
  heading: 'Подпишись на новости',
  description: 'Узнавай о новинках первым',
  placeholder: 'Твой email',
  buttonText: 'Подписаться',
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
  --radius-input: 8px;
  --font-heading: 'Inter', sans-serif;
  --font-body: 'Inter', sans-serif;
  --size-hero-heading: 48px;
  --size-hero-button-h: 48px;
  --size-newsletter-form-w: 480px;
  --container-max-width: 1320px;
}
.color-scheme-1 { }
`;

test.describe('Newsletter visual snapshot (base theme)', () => {
  let server: SnapshotServer;

  test.beforeAll(async () => {
    const html = await renderBlockToHtml(
      'Newsletter',
      NEWSLETTER_PROPS,
      BASE_TOKENS_CSS,
    );
    server = await startSnapshotServer(html);
  });

  test.afterAll(async () => {
    if (server) await server.stop();
  });

  test('base/Newsletter/default-1440.png', async ({ page }) => {
    await page.goto(server.url);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('base/Newsletter/default-1440.png', {
      fullPage: true,
    });
  });
});
