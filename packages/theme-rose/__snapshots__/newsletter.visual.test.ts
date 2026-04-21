/**
 * Phase 1e, Task 5 — visual snapshot for the Newsletter block rendered with
 * rose design tokens. Rose has no Newsletter override, so this verifies the
 * base Newsletter component renders correctly when wired to the rose token
 * set (Bitter/Arsenal fonts, rose button colours, 600px form width).
 *
 * Snapshot path: `__snapshots__/snapshots/rose/Newsletter/default-1440.png`.
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

const ROSE_TOKENS_CSS = `
:root {
  --color-bg: 255 255 255;
  --color-heading: 18 18 18;
  --color-text: 18 18 18;
  --color-button-bg: 0 0 0;
  --color-button-text: 255 255 255;
  --color-button-border: 0 0 0;
  --radius-button: 8px;
  --radius-input: 10px;
  --font-heading: 'Bitter', serif;
  --font-body: 'Arsenal', sans-serif;
  --size-hero-heading: 72px;
  --size-hero-button-h: 80px;
  --size-newsletter-form-w: 600px;
  --container-max-width: 1280px;
}
.color-scheme-1 { }
`;

test.describe('Newsletter visual snapshot (rose tokens, base block)', () => {
  let server: SnapshotServer;

  test.beforeAll(async () => {
    const html = await renderBlockToHtml(
      'Newsletter',
      'base',
      NEWSLETTER_PROPS,
      ROSE_TOKENS_CSS,
    );
    server = await startSnapshotServer(html);
  });

  test.afterAll(async () => {
    if (server) await server.stop();
  });

  test('rose/Newsletter/default-1440.png', async ({ page }) => {
    await page.goto(server.url);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('rose/Newsletter/default-1440.png', {
      fullPage: true,
    });
  });
});
