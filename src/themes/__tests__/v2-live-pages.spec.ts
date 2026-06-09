import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

// Мокаем PreviewService целиком — без реального Astro Container (ts-jest не
// парсит .astro). Shared fns между всеми инстансами → singleton в v2-live-pages
// безвреден; toggl'им hasV2Sections per-test.
jest.mock('../../services/preview.service', () => {
  const renderBlock = jest.fn(
    async ({ blockName, props }: { blockName: string; props: { id?: string } }) =>
      `<div data-puck-component-id="${props.id ?? ''}">${blockName}</div>`,
  );
  const hasV2Sections = jest.fn(async () => true);
  return {
    PreviewService: jest
      .fn()
      .mockImplementation(() => ({ renderBlock, hasV2Sections })),
  };
});

import { composeContentPagesIntoDist } from '../v2-live-pages';

// Доступ к shared-мокам для per-test toggle: любой инстанс делит одни fns.
const getMockFns = () => {
  const PS = (jest.requireMock('../../services/preview.service') as {
    PreviewService: new () => { hasV2Sections: jest.Mock; renderBlock: jest.Mock };
  }).PreviewService;
  return new PS();
};

const SHELL =
  '<!DOCTYPE html><html><head><title>T</title></head><body><header>OLD</header><main>OLD</main><footer>OLD</footer><script>tail()</script></body></html>';

// pagesData со ВСЕМИ системными ключами: home — с блоками, about/contacts —
// пустые (content: []) → blocks.length 0 → continue (детерминизм: иначе
// lazy-seed резолвер темы засеет about/contacts из packages/theme-rose/pages/*).
const revisionData = () => ({
  pages: [],
  pagesData: {
    home: {
      content: [
        { type: 'Header', props: { id: 'Header-1' } },
        { type: 'Hero', props: { id: 'Hero-1' } },
        { type: 'Footer', props: { id: 'Footer-1' } },
      ],
    },
    'page-about': { content: [] },
    'page-contacts': { content: [] },
  },
});

describe('composeContentPagesIntoDist', () => {
  beforeEach(() => {
    const { hasV2Sections, renderBlock } = getMockFns();
    hasV2Sections.mockReset();
    hasV2Sections.mockResolvedValue(true);
    renderBlock.mockClear();
  });

  it('пересаживает home из ревизии в dist, сохраняя хвост шелла; счёт = 1', async () => {
    const dist = await fs.mkdtemp(path.join(os.tmpdir(), 'v2live-'));
    await fs.writeFile(path.join(dist, 'index.html'), SHELL);
    const ctx = {
      distDir: dist,
      siteId: 'site-1',
      publicUrl: 'https://shop.example',
      revisionData: revisionData(),
    } as unknown as Parameters<typeof composeContentPagesIntoDist>[0];

    const n = await composeContentPagesIntoDist(ctx, 'rose');
    expect(n).toBe(1);

    const html = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
    // Hero пересажен из ревизии (в <main>).
    expect(html).toContain('data-puck-component-id="Hero-1"');
    // Хвост body шелла сохранён.
    expect(html).toContain('tail()');
    // Старое тело шелла заменено целиком.
    expect(html).not.toContain('OLD');
  });

  it('тема без v2-секций → no-op (0 страниц, dist не тронут)', async () => {
    const { hasV2Sections } = getMockFns();
    hasV2Sections.mockResolvedValue(false);

    const dist = await fs.mkdtemp(path.join(os.tmpdir(), 'v2live-'));
    await fs.writeFile(path.join(dist, 'index.html'), SHELL);
    const ctx = {
      distDir: dist,
      siteId: 'site-2',
      publicUrl: 'https://shop.example',
      revisionData: revisionData(),
    } as unknown as Parameters<typeof composeContentPagesIntoDist>[0];

    const n = await composeContentPagesIntoDist(ctx, 'bloom');
    expect(n).toBe(0);

    // Файл не изменён — verbatim SHELL.
    const html = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
    expect(html).toBe(SHELL);
  });

  it('live-рендер блоков идёт с isPreview:false (ошибки невидимы, не плейсхолдеры)', async () => {
    const dist = await fs.mkdtemp(path.join(os.tmpdir(), 'v2live-'));
    await fs.writeFile(path.join(dist, 'index.html'), SHELL);
    const ctx = {
      distDir: dist,
      siteId: 'site-1',
      publicUrl: 'https://shop.example',
      revisionData: revisionData(),
    } as unknown as Parameters<typeof composeContentPagesIntoDist>[0];

    await composeContentPagesIntoDist(ctx, 'rose');

    const { renderBlock } = getMockFns();
    expect(renderBlock).toHaveBeenCalled();
    for (const call of renderBlock.mock.calls) {
      expect(call[0].isPreview).toBe(false);
    }
  });

  it('гейт кастомных страниц: системные pages[] (role=null/isCustom=false) НЕ пересаживаются; isCustom=true — пересаживается с home-шеллом и title', async () => {
    const dist = await fs.mkdtemp(path.join(os.tmpdir(), 'v2live-'));
    await fs.writeFile(path.join(dist, 'index.html'), SHELL);
    const CART_SHELL = SHELL.replace('OLD', 'CART-DIST');
    await fs.mkdir(path.join(dist, 'cart'), { recursive: true });
    await fs.writeFile(path.join(dist, 'cart', 'index.html'), CART_SHELL);

    const data = revisionData() as Record<string, unknown>;
    // Прод-реальность: системные страницы в pages[] с role:null/isCustom:false,
    // и их pagesData СУЩЕСТВУЕТ (migrateRevisionData сеет cart/checkout).
    (data as { pages: unknown[] }).pages = [
      { id: 'page-cart', slug: '/cart', role: null, isCustom: false, name: 'Корзина' },
      { id: 'page-delivery', slug: '/delivery', isCustom: true, name: 'Доставка' },
      // Кастомная с маршрутом сложной страницы — ремень должен отсечь.
      { id: 'page-evil', slug: '/checkout', isCustom: true, name: 'Злая' },
    ];
    (data as { pagesData: Record<string, unknown> }).pagesData['page-cart'] = {
      content: [{ type: 'CartBody', props: { id: 'CartBody-1' } }],
    };
    (data as { pagesData: Record<string, unknown> }).pagesData['page-delivery'] = {
      content: [{ type: 'MainText', props: { id: 'MainText-1' } }],
    };
    (data as { pagesData: Record<string, unknown> }).pagesData['page-evil'] = {
      content: [{ type: 'MainText', props: { id: 'MainText-2' } }],
    };

    const ctx = {
      distDir: dist,
      siteId: 'site-1',
      publicUrl: 'https://shop.example',
      revisionData: data,
    } as unknown as Parameters<typeof composeContentPagesIntoDist>[0];

    const n = await composeContentPagesIntoDist(ctx, 'rose');
    // home + page-delivery; cart и evil-checkout — НЕ тронуты.
    expect(n).toBe(2);

    const cartHtml = await fs.readFile(path.join(dist, 'cart', 'index.html'), 'utf8');
    expect(cartHtml).toBe(CART_SHELL); // дист корзины verbatim
    await expect(
      fs.readFile(path.join(dist, 'checkout', 'index.html'), 'utf8'),
    ).rejects.toThrow(); // злой checkout не создан

    const deliveryHtml = await fs.readFile(
      path.join(dist, 'delivery', 'index.html'),
      'utf8',
    );
    expect(deliveryHtml).toContain('data-puck-component-id="MainText-1"');
    expect(deliveryHtml).toContain('tail()'); // home-шелл как источник
    expect(deliveryHtml).toContain('<title>Доставка</title>'); // titleOverride
  });
});
