/**
 * Phase 1e, Task 4 — visual snapshot for the Footer block (base theme, 1440px).
 * Follows the Hero pilot pattern. Snapshot is committed under
 * `__snapshots__/snapshots/base/Footer/default-1440.png` and compared
 * pixel-by-pixel with a 1% threshold (see `playwright.config.ts`).
 */
import { test, expect } from '@playwright/test';
import {
  renderBlockToHtml,
  startSnapshotServer,
  type SnapshotServer,
} from './render-utils';

const FOOTER_PROPS = {
  id: 'f1',
  newsletter: { enabled: false, heading: '', description: '', placeholder: '' },
  heading: { text: 'Merfy', size: 'medium' as const, alignment: 'left' as const },
  text: { content: 'Добро пожаловать', size: 'small' as const },
  navigationColumn: {
    title: 'Shop',
    links: [{ label: 'Catalog', href: '/catalog' }],
  },
  informationColumn: {
    title: 'About',
    links: [{ label: 'About us', href: '/about' }],
  },
  socialColumn: {
    title: 'Follow',
    email: 'info@example.com',
    socialLinks: [{ platform: 'telegram' as const, href: 'https://t.me/test' }],
  },
  colorScheme: 1,
  copyrightColorScheme: 1,
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
  --size-nav-link: 16px;
  --container-max-width: 1320px;
  --spacing-section-y: 80px;
}
.color-scheme-1 { }
`;

test.describe('Footer visual snapshot (base theme)', () => {
  let server: SnapshotServer;

  test.beforeAll(async () => {
    const html = await renderBlockToHtml('Footer', FOOTER_PROPS, BASE_TOKENS_CSS);
    server = await startSnapshotServer(html);
  });

  test.afterAll(async () => {
    if (server) await server.stop();
  });

  test('base/Footer/default-1440.png', async ({ page }) => {
    await page.goto(server.url);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('base/Footer/default-1440.png', {
      fullPage: true,
    });
  });
});
