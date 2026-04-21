/**
 * Phase 2a visual snapshot for the Newsletter block rendered with vanilla
 * design tokens. Vanilla has no Newsletter override, so this verifies the
 * base Newsletter component renders correctly when wired to the vanilla
 * token set (Bitter/Arsenal fonts, flat square inputs, olive button).
 *
 * Snapshot path: `__snapshots__/snapshots/vanilla/Newsletter/default-1440.png`.
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
  colorScheme: 3,
  padding: { top: 80, bottom: 80 },
};

const VANILLA_TOKENS_CSS = `
:root {
  --color-bg: 238 238 238;
  --color-heading: 38 49 28;
  --color-text: 38 49 28;
  --color-button-bg: 58 69 48;
  --color-button-text: 255 255 255;
  --color-button-border: 58 69 48;
  --radius-button: 0px;
  --radius-input: 0px;
  --font-heading: 'Bitter', serif;
  --font-body: 'Arsenal', sans-serif;
  --size-hero-heading: 72px;
  --size-hero-button-h: 48px;
  --size-newsletter-form-w: 480px;
  --container-max-width: 1320px;
}
.color-scheme-3 { }
`;

test.describe('Newsletter visual snapshot (vanilla tokens, base block)', () => {
  let server: SnapshotServer;

  test.beforeAll(async () => {
    const html = await renderBlockToHtml(
      'Newsletter',
      'base',
      NEWSLETTER_PROPS,
      VANILLA_TOKENS_CSS,
    );
    server = await startSnapshotServer(html);
  });

  test.afterAll(async () => {
    if (server) await server.stop();
  });

  test('vanilla/Newsletter/default-1440.png', async ({ page }) => {
    await page.goto(server.url);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('vanilla/Newsletter/default-1440.png', {
      fullPage: true,
    });
  });
});
