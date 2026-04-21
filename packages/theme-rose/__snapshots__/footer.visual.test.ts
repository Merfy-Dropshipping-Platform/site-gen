/**
 * Phase 1e, Task 5 — visual snapshot for the rose Footer override. Rose
 * ships a 3-column footer with its own social-icon SVG set, distinct from
 * the base Footer markup; this test pins that rose-specific compiled
 * module.
 *
 * Snapshot path: `__snapshots__/snapshots/rose/Footer/default-1440.png`.
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
    heading: 'Подпишитесь на нашу рассылку',
    description: 'Введите электронную почту и получайте новости.',
    placeholder: 'rose@example.ru',
  },
  heading: { text: 'Rose Shop', size: 'medium' as const, alignment: 'left' as const },
  text: { content: 'Добро пожаловать в Rose Shop', size: 'small' as const },
  navigationColumn: {
    title: 'Навигация',
    links: [
      { label: 'Главная', href: '/' },
      { label: 'Каталог', href: '/catalog' },
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
    email: 'rose@example.ru',
    socialLinks: [
      { platform: 'telegram' as const, href: 'https://t.me/rose' },
      { platform: 'vk' as const, href: 'https://vk.com/rose' },
    ],
  },
  colorScheme: 1,
  copyrightColorScheme: 1,
  padding: { top: 80, bottom: 80 },
};

const ROSE_TOKENS_CSS = `
:root {
  --color-bg: 255 255 255;
  --color-heading: 18 18 18;
  --color-text: 18 18 18;
  --color-muted: 153 153 153;
  --font-heading: 'Bitter', serif;
  --font-body: 'Arsenal', sans-serif;
  --size-nav-link: 16px;
  --radius-input: 10px;
  --footer-layout: '3-column';
  --container-max-width: 1280px;
  --spacing-section-y: 96px;
}
.color-scheme-1 { }
`;

test.describe('Footer visual snapshot (rose override)', () => {
  let server: SnapshotServer;

  test.beforeAll(async () => {
    const html = await renderBlockToHtml(
      'Footer',
      'rose',
      FOOTER_PROPS,
      ROSE_TOKENS_CSS,
    );
    server = await startSnapshotServer(html);
  });

  test.afterAll(async () => {
    if (server) await server.stop();
  });

  test('rose/Footer/default-1440.png', async ({ page }) => {
    await page.goto(server.url);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('rose/Footer/default-1440.png', {
      fullPage: true,
    });
  });
});
