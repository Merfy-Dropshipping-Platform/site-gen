import { migrateRevisionData } from '../revision-migrations';

describe('migrateCartPage', () => {
  // Корзина = ОДНА секция CartSection (вся ванильная логика корзины) + chrome;
  // мерчант добавляет вокруг другие секции, как на главной. Прежние 081-блоки
  // (CartBody/CartSummary/CartTotals/CartCheckoutButton — были на React-островах)
  // схлопываются в одну CartSection. CartSection — КАНОН (не удаляется).
  it('seeds [Header, CartSection, Footer] when page-cart missing', () => {
    const result = migrateRevisionData({ pagesData: {} }) as {
      pagesData: Record<string, any>;
    };
    const cart = result.pagesData['page-cart'];
    expect(cart).toBeDefined();
    expect(cart.content.map((b: any) => b.type)).toEqual([
      'Header',
      'CartSection',
      'Footer',
    ]);
  });

  it('reuses Header/Footer from home page when available', () => {
    const homeHeader = { type: 'Header', props: { id: 'Header-home', siteTitle: 'My Shop' } };
    const homeFooter = { type: 'Footer', props: { id: 'Footer-home' } };
    const result = migrateRevisionData({
      pagesData: {
        home: { content: [homeHeader, { type: 'Hero', props: {} }, homeFooter] },
      },
    }) as { pagesData: Record<string, any> };
    const content = result.pagesData['page-cart'].content;
    expect(content[0]).toBe(homeHeader);
    expect(content[content.length - 1]).toBe(homeFooter);
  });

  it('migrates old 081 cart blocks → single CartSection, keeps custom sections', () => {
    const result = migrateRevisionData({
      pagesData: {
        'page-cart': {
          content: [
            { type: 'CartBody', props: { id: 'pre-094' } },
            { type: 'CartSummary', props: {} },
            { type: 'Collections', props: {} },
          ],
        },
      },
    }) as { pagesData: Record<string, any> };
    const types = result.pagesData['page-cart'].content.map((b: any) => b.type);
    // Старые cart-блоки → одна CartSection (в позиции первого); кастомная
    // секция Collections сохраняется; chrome (Header/Footer) добавляется.
    expect(types).toEqual(['Header', 'CartSection', 'Collections', 'Footer']);
  });

  it('дропает PopularProducts старого сида (демо-кросс-селл) → чистая корзина', () => {
    const result = migrateRevisionData({
      pagesData: {
        'page-cart': {
          content: [
            { type: 'Header', props: {} },
            { type: 'CartBody', props: { id: 'cb' } },
            { type: 'CartSummary', props: {} },
            { type: 'CartTotals', props: {} },
            { type: 'CartCheckoutButton', props: {} },
            { type: 'PopularProducts', props: { heading: 'Возможно вам понравится' } },
            { type: 'Footer', props: {} },
          ],
        },
      },
    }) as { pagesData: Record<string, any> };
    const types = result.pagesData['page-cart'].content.map((b: any) => b.type);
    // Полный старый сид (5 cart-блоков + демо-PopularProducts) → чистый
    // [Header, CartSection, Footer]. Мерчант добавит кросс-селл сам, если нужен.
    expect(types).toEqual(['Header', 'CartSection', 'Footer']);
    expect(types).not.toContain('PopularProducts');
  });

  it('is idempotent (running twice = no-op)', () => {
    const initial = { pagesData: {} };
    const first = migrateRevisionData(initial);
    const second = migrateRevisionData(first);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('migrates chromed CartBody page → CartSection between Header/Footer', () => {
    const existing = {
      pagesData: {
        'page-cart': {
          content: [
            { type: 'Header', props: {} },
            { type: 'CartBody', props: { id: 'custom-cart', colorScheme: 'scheme-2' } },
            { type: 'Footer', props: {} },
          ],
          root: { props: { title: 'Корзина' } },
          zones: {},
        },
      },
    };
    const result = migrateRevisionData(existing) as {
      pagesData: Record<string, any>;
    };
    const content = result.pagesData['page-cart'].content;
    expect(content.map((b: any) => b.type)).toEqual([
      'Header',
      'CartSection',
      'Footer',
    ]);
  });

  it('inserts CartSection before Footer when page-cart exists without cart blocks', () => {
    const existing = {
      pagesData: {
        'page-cart': {
          content: [
            { type: 'Header', props: {} },
            { type: 'Footer', props: {} },
          ],
          root: { props: {} },
          zones: {},
        },
      },
    };
    const result = migrateRevisionData(existing) as {
      pagesData: Record<string, any>;
    };
    const content = result.pagesData['page-cart'].content;
    expect(content.map((b: any) => b.type)).toEqual([
      'Header',
      'CartSection',
      'Footer',
    ]);
  });

  it('adds Footer when page-cart exists without Footer', () => {
    const existing = {
      pagesData: {
        'page-cart': {
          content: [{ type: 'Header', props: {} }],
          root: { props: {} },
          zones: {},
        },
      },
    };
    const result = migrateRevisionData(existing) as {
      pagesData: Record<string, any>;
    };
    const content = result.pagesData['page-cart'].content;
    expect(content.map((b: any) => b.type)).toEqual([
      'Header',
      'CartSection',
      'Footer',
    ]);
    expect(content[content.length - 1].type).toBe('Footer');
  });

  it('handles missing pagesData entirely', () => {
    const result = migrateRevisionData({}) as { pagesData?: Record<string, any> };
    expect(result.pagesData).toBeUndefined();
  });

  it('CartSection is canonical — old blocks collapse into single CartSection', () => {
    const existing = {
      pagesData: {
        'page-cart': {
          content: [
            { type: 'Header', props: {} },
            { type: 'CartSection', props: { id: 'existing' } },
            { type: 'CartBody', props: { id: 'cart-body-1' } },
            { type: 'CartSummary', props: { id: 'cart-summary-1' } },
            { type: 'Footer', props: {} },
          ],
          root: { props: {} },
          zones: {},
        },
      },
    };
    const result = migrateRevisionData(existing) as {
      pagesData: Record<string, any>;
    };
    const types = result.pagesData['page-cart'].content.map((b: any) => b.type);
    expect(types).toEqual(['Header', 'CartSection', 'Footer']);
    expect(types.filter((t: string) => t === 'CartSection')).toHaveLength(1);
  });

  it('page with only CartSection + chrome = idempotent no-op', () => {
    const existing = {
      pagesData: {
        'page-cart': {
          content: [
            { type: 'Header', props: {} },
            { type: 'CartSection', props: { id: 'existing' } },
            { type: 'Footer', props: {} },
          ],
          root: { props: {} },
          zones: {},
        },
      },
    };
    const result = migrateRevisionData(existing) as {
      pagesData: Record<string, any>;
    };
    const types = result.pagesData['page-cart'].content.map((b: any) => b.type);
    expect(types).toEqual(['Header', 'CartSection', 'Footer']);
  });

  it('preserves other pages (catalog, product) and seeds page-cart alongside', () => {
    const existing = {
      pagesData: {
        'page-catalog': {
          content: [{ type: 'Catalog', props: {} }],
          root: { props: {} },
          zones: {},
        },
      },
    };
    const result = migrateRevisionData(existing) as {
      pagesData: Record<string, any>;
    };
    expect(result.pagesData['page-catalog']).toBeDefined();
    expect(result.pagesData['page-cart']).toBeDefined();
  });
});

describe('migrateCartPage — split themes (rose, Spec 110)', () => {
  // Для тем из CART_SPLIT_THEMES (rose) корзина = ЧЕТЫРЕ блока (полный сплит per
  // Figma 1:20818): CartBody («Корзина») + CartSummary («Промежуточный итог») +
  // CartTotals («Итоговая цена») + CartCheckoutButton («Кнопка оформления заказа»).
  // Прочие темы — монолит CartSection.
  const SPLIT_CART = ['CartBody', 'CartSummary', 'CartTotals', 'CartCheckoutButton'];
  it('seeds [Header, ...4 cart blocks, Footer] when page-cart missing (rose)', () => {
    const result = migrateRevisionData({ pagesData: {} }, 'rose') as {
      pagesData: Record<string, any>;
    };
    expect(result.pagesData['page-cart'].content.map((b: any) => b.type)).toEqual([
      'Header',
      ...SPLIT_CART,
      'Footer',
    ]);
  });

  it('decomposes monolith CartSection → 4 cart blocks, carries colorScheme/padding', () => {
    const result = migrateRevisionData(
      {
        pagesData: {
          'page-cart': {
            content: [
              { type: 'Header', props: {} },
              { type: 'CartSection', props: { id: 'mono', colorScheme: 'scheme-4', padding: { top: 24, bottom: 24 } } },
              { type: 'Footer', props: {} },
            ],
          },
        },
      },
      'rose',
    ) as { pagesData: Record<string, any> };
    const content = result.pagesData['page-cart'].content;
    expect(content.map((b: any) => b.type)).toEqual(['Header', ...SPLIT_CART, 'Footer']);
    const body = content.find((b: any) => b.type === 'CartBody');
    expect(body.props.colorScheme).toBe('scheme-4');
    expect(body.props.padding).toEqual({ top: 24, bottom: 24 });
  });

  it('upgrades legacy 2-block split (CartBody+CartSummary) → full 4-block split (rose)', () => {
    const result = migrateRevisionData(
      {
        pagesData: {
          'page-cart': {
            content: [
              { type: 'Header', props: {} },
              { type: 'CartBody', props: { id: 'cb', colorScheme: 'scheme-2', padding: { top: 80, bottom: 40 } } },
              { type: 'CartSummary', props: { id: 'cs' } },
              { type: 'Footer', props: {} },
            ],
          },
        },
      },
      'rose',
    ) as { pagesData: Record<string, any> };
    const content = result.pagesData['page-cart'].content;
    expect(content.map((b: any) => b.type)).toEqual(['Header', ...SPLIT_CART, 'Footer']);
    // Настройки существующего CartBody переносятся (не теряются).
    const body = content.find((b: any) => b.type === 'CartBody');
    expect(body.props.colorScheme).toBe('scheme-2');
    expect(body.props.padding).toEqual({ top: 80, bottom: 40 });
  });

  it('is idempotent on already 4-split cart (rose no-op)', () => {
    const split = {
      pagesData: {
        'page-cart': {
          content: [
            { type: 'Header', props: {} },
            { type: 'CartBody', props: { id: 'cb' } },
            { type: 'CartSummary', props: { id: 'cs' } },
            { type: 'CartTotals', props: { id: 'ct' } },
            { type: 'CartCheckoutButton', props: { id: 'ccb' } },
            { type: 'Footer', props: {} },
          ],
          root: { props: { title: 'Корзина' } },
          zones: {},
        },
      },
    };
    const first = migrateRevisionData(split, 'rose');
    const second = migrateRevisionData(first, 'rose');
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    const types = (first as any).pagesData['page-cart'].content.map((b: any) => b.type);
    expect(types).toEqual(['Header', ...SPLIT_CART, 'Footer']);
  });

  it('drops demo PopularProducts when decomposing (rose)', () => {
    const result = migrateRevisionData(
      {
        pagesData: {
          'page-cart': {
            content: [
              { type: 'Header', props: {} },
              { type: 'CartSection', props: { id: 'mono' } },
              { type: 'PopularProducts', props: { heading: 'Возможно вам понравится' } },
              { type: 'Footer', props: {} },
            ],
          },
        },
      },
      'rose',
    ) as { pagesData: Record<string, any> };
    const types = result.pagesData['page-cart'].content.map((b: any) => b.type);
    expect(types).toEqual(['Header', ...SPLIT_CART, 'Footer']);
    expect(types).not.toContain('PopularProducts');
  });

  it('non-split theme (vanilla) keeps monolith CartSection', () => {
    const result = migrateRevisionData(
      {
        pagesData: {
          'page-cart': {
            content: [
              { type: 'Header', props: {} },
              { type: 'CartSection', props: { id: 'mono' } },
              { type: 'Footer', props: {} },
            ],
          },
        },
      },
      'vanilla',
    ) as { pagesData: Record<string, any> };
    expect(result.pagesData['page-cart'].content.map((b: any) => b.type)).toEqual([
      'Header',
      'CartSection',
      'Footer',
    ]);
  });
});
