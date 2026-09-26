import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

/**
 * «Спасибо за заказ» есть у всех пяти тем и собирается поверх шелла темы.
 *
 * Владелец 26.09: «на ванилле ща проблема» — после оплаты корзина на странице
 * «Спасибо» не пустела. У vanilla в пакете не было страницы `/checkout-result`
 * (`packages/theme-vanilla/theme.json` pages[]): сборка её не собирала, и по
 * адресу возврата с оплаты лежала либо пустота, либо страница прошлой темы
 * магазина со скриптами чужой темы — ядро корзины vanilla на ней не работало.
 *
 * Здесь — путь сборки витрины (`composeContentPagesIntoDist`) для каждой темы:
 * в ревизии только главная, страница «Спасибо» берётся из пакета темы и
 * пересаживается в шелл темы — с его хвостом скриптов (там ядро корзины).
 */
jest.mock('../../services/preview.service', () => {
  const renderBlock = jest.fn(
    async ({ blockName, props }: { blockName: string; props: { id?: string } }) =>
      `<div data-puck-component-id="${props.id ?? ''}">${blockName}</div>`,
  );
  return {
    PreviewService: jest.fn().mockImplementation(() => ({
      renderBlock,
      hasV2Sections: jest.fn(async () => true),
      resolveBlockScheme: jest.fn(async () => null),
    })),
  };
});

import { composeContentPagesIntoDist } from '../v2-live-pages';
import { migrateRevisionData } from '../../utils/revision-migrations';

const THEMES = ['rose', 'vanilla', 'flux', 'satin', 'bloom'] as const;
const CART_RUNTIME = '<script type="module" src="/_astro/Layout.cart-runtime.js"></script>';
const SHELL = `<!DOCTYPE html><html><head><title>T</title></head><body><header>OLD</header><main>OLD</main><footer>OLD</footer>${CART_RUNTIME}</body></html>`;

describe.each(THEMES)('%s: «Спасибо за заказ»', (theme) => {
  it('страница собирается поверх шелла темы — со скриптом ядра корзины', async () => {
    const dist = await fs.mkdtemp(path.join(os.tmpdir(), 'thank-you-'));
    await fs.writeFile(path.join(dist, 'index.html'), SHELL);
    const ctx = {
      distDir: dist,
      siteId: 'site-1',
      publicUrl: 'https://shop.example',
      revisionData: {
        pages: [],
        pagesData: { home: { content: [{ type: 'Hero', props: { id: 'Hero-1' } }] } },
      },
    } as unknown as Parameters<typeof composeContentPagesIntoDist>[0];

    await composeContentPagesIntoDist(ctx, theme);

    const html = await fs.readFile(path.join(dist, 'checkout-result', 'index.html'), 'utf8').catch(() => '');
    expect(html).toContain('>OrderConfirmation<');
    expect(html).toContain(CART_RUNTIME);
  });

  it('старые ревизии получают страницу при чтении (миграция по манифесту темы)', () => {
    const out = migrateRevisionData({ pages: [{ id: 'home', slug: '/' }], pagesData: { home: { content: [] } } }, theme);
    const page = (out.pagesData as Record<string, { content: Array<{ type: string }> }>)['page-checkout-result'];
    expect(page?.content.map((b) => b.type)).toContain('OrderConfirmation');
    expect((out.pages as Array<{ id: string }>).map((p) => p.id)).toContain('page-checkout-result');
  });
});
