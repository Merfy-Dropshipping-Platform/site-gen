/**
 * Phase 2a visual snapshot for the vanilla Header override. Vanilla ships a
 * custom Header (4 logo layouts, 1320px container, Exo 2 cart-badge font,
 * logo-invert logic) so this pins the vanilla-specific compiled module
 * against regressions.
 *
 * Snapshot path: `__snapshots__/snapshots/vanilla/Header/default-1440.png`.
 */
import { test, expect } from '@playwright/test';
import {
  renderBlockToHtml,
  startSnapshotServer,
  type SnapshotServer,
} from './render-utils';

const HEADER_PROPS = {
  id: 'hdr1',
  siteTitle: 'Vanilla Store',
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
  colorScheme: 3,
  menuColorScheme: 3,
  padding: { top: 16, bottom: 16 },
};

// Vanilla scheme-3 (Light Gray) — matches theme.json colorSchemes[2].
const VANILLA_TOKENS_CSS = `
:root {
  --color-bg: 238 238 238;
  --color-heading: 38 49 28;
  --color-text: 38 49 28;
  --color-muted: 68 68 68;
  --color-primary: 38 49 28;
  --color-accent: 58 69 48;
  --color-button-text: 255 255 255;
  --font-heading: 'Bitter', serif;
  --font-body: 'Arsenal', sans-serif;
  --font-badge: 'Exo 2', sans-serif;
  --size-nav-link: 16px;
  --size-logo-width: 120px;
  --container-max-width: 1320px;
}
.color-scheme-3 { }
`;

test.describe('Header visual snapshot (vanilla override)', () => {
  let server: SnapshotServer;

  test.beforeAll(async () => {
    const html = await renderBlockToHtml(
      'Header',
      'vanilla',
      HEADER_PROPS,
      VANILLA_TOKENS_CSS,
    );
    server = await startSnapshotServer(html);
  });

  test.afterAll(async () => {
    if (server) await server.stop();
  });

  test('vanilla/Header/default-1440.png', async ({ page }) => {
    await page.goto(server.url);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('vanilla/Header/default-1440.png', {
      fullPage: true,
    });
  });
});
