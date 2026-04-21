/**
 * Phase 1e, Task 5 — visual snapshot for the rose Header override. Rose
 * ships a custom Header (unique layout, nav markup, sticky behaviour) so
 * this pins the rose-specific compiled module against regressions.
 *
 * Snapshot path: `__snapshots__/snapshots/rose/Header/default-1440.png`.
 */
import { test, expect } from '@playwright/test';
import {
  renderBlockToHtml,
  startSnapshotServer,
  type SnapshotServer,
} from './render-utils';

const HEADER_PROPS = {
  id: 'hdr1',
  siteTitle: 'Rose Theme',
  logo: '',
  logoPosition: 'top-left' as const,
  stickiness: 'scroll-up' as const,
  menuType: 'dropdown' as const,
  navigationLinks: [
    { label: 'Главная', href: '/' },
    { label: 'Каталог', href: '/catalog' },
    { label: 'О нас', href: '/about' },
    { label: 'Контакты', href: '/contacts' },
  ],
  actionButtons: { showSearch: true, showCart: true, showProfile: true },
  colorScheme: 1,
  menuColorScheme: 1,
  padding: { top: 16, bottom: 16 },
};

const ROSE_TOKENS_CSS = `
:root {
  --color-bg: 255 255 255;
  --color-heading: 18 18 18;
  --color-text: 18 18 18;
  --color-muted: 153 153 153;
  --color-primary: 0 0 0;
  --color-button-text: 255 255 255;
  --font-heading: 'Bitter', serif;
  --font-body: 'Arsenal', sans-serif;
  --size-nav-link: 16px;
  --size-logo-width: 120px;
  --container-max-width: 1280px;
}
.color-scheme-1 { }
`;

test.describe('Header visual snapshot (rose override)', () => {
  let server: SnapshotServer;

  test.beforeAll(async () => {
    const html = await renderBlockToHtml(
      'Header',
      'rose',
      HEADER_PROPS,
      ROSE_TOKENS_CSS,
    );
    server = await startSnapshotServer(html);
  });

  test.afterAll(async () => {
    if (server) await server.stop();
  });

  test('rose/Header/default-1440.png', async ({ page }) => {
    await page.goto(server.url);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('rose/Header/default-1440.png', {
      fullPage: true,
    });
  });
});
