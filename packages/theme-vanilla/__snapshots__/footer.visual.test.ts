/**
 * Phase 2a visual snapshot for the vanilla Footer override. Vanilla ships a
 * 2-part grid (logo+nav LEFT vs contact+social+payment RIGHT) plus the unique
 * powered-by black strip at the bottom, with MC/VISA/МИР payment badges.
 *
 * Snapshot path: `__snapshots__/snapshots/vanilla/Footer/default-1440.png`.
 */
import { test, expect } from '@playwright/test';
import {
  renderBlockToHtml,
  startSnapshotServer,
  type SnapshotServer,
} from './render-utils';

const FOOTER_PROPS = {
  id: 'f1',
  newsletter: {
    enabled: true,
    heading: 'Подпишитесь на рассылку',
    description: 'Получайте новости и специальные предложения.',
    placeholder: 'email@example.ru',
  },
  heading: { text: 'Vanilla Store', size: 'medium' as const, alignment: 'left' as const },
  text: { content: '', size: 'small' as const },
  navigationColumn: {
    title: 'Навигация',
    links: [
      { label: 'Каталог', href: '/catalog' },
      { label: 'О нас', href: '/about' },
      { label: 'Контакты', href: '/contacts' },
    ],
  },
  informationColumn: {
    title: 'Информация',
    links: [
      { label: 'Политика доставки', href: '/delivery' },
      { label: 'Политика возврата', href: '/returns' },
      { label: 'Условия обслуживания', href: '/terms' },
    ],
  },
  socialColumn: {
    title: 'Социальные сети',
    email: 'info@vanilla.ru',
    socialLinks: [
      { platform: 'telegram' as const, href: 'https://t.me/vanilla' },
      { platform: 'vk' as const, href: 'https://vk.com/vanilla' },
    ],
  },
  colorScheme: 3,
  copyrightColorScheme: 1,
  padding: { top: 80, bottom: 80 },
};

// Vanilla scheme-3 (Light Gray) for main + scheme-1 fallback for powered-by.
const VANILLA_TOKENS_CSS = `
:root {
  --color-bg: 238 238 238;
  --color-heading: 38 49 28;
  --color-text: 38 49 28;
  --color-muted: 68 68 68;
  --color-button-bg: 58 69 48;
  --color-button-text: 255 255 255;
  --font-heading: 'Bitter', serif;
  --font-body: 'Arsenal', sans-serif;
  --size-nav-link: 16px;
  --radius-input: 0px;
  --radius-button: 0px;
  --footer-layout: '2-part';
  --container-max-width: 1320px;
  --spacing-section-y: 80px;
}
.color-scheme-3 { }
`;

test.describe('Footer visual snapshot (vanilla override)', () => {
  let server: SnapshotServer;

  test.beforeAll(async () => {
    const html = await renderBlockToHtml(
      'Footer',
      'vanilla',
      FOOTER_PROPS,
      VANILLA_TOKENS_CSS,
    );
    server = await startSnapshotServer(html);
  });

  test.afterAll(async () => {
    if (server) await server.stop();
  });

  test('vanilla/Footer/default-1440.png', async ({ page }) => {
    await page.goto(server.url);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('vanilla/Footer/default-1440.png', {
      fullPage: true,
    });
  });
});
