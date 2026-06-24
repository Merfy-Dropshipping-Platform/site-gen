import {
  assembleChrome,
  injectChromeIntoHtml,
  type RenderBlockFn,
  type AssembledChrome,
} from '../chrome-assembler';

/**
 * Spec 108 T006 — chrome-assembler.
 *
 * assembleChrome рендерит мерчантский header/footer (full) или CheckoutHeader
 * (checkout) через ИНЪЕКТИРУЕМЫЙ renderBlock; injectChromeIntoHtml идемпотентен
 * и не трогает HTML при chrome='none'. Renderer мокается (модуль не создаёт
 * собственный Container).
 */

/**
 * Мок-renderBlock: возвращает детерминированный HTML по имени блока, маркируя
 * пропсы, чтобы тест мог проверить, что переданы правильные пропсы мерчанта.
 */
const makeMockRender = (): RenderBlockFn =>
  jest.fn(async ({ blockName, props }: Parameters<RenderBlockFn>[0]) => {
    const title = typeof props['siteTitle'] === 'string' ? props['siteTitle'] : '';
    if (blockName === 'Header') {
      return `<header data-nt="rose-header" data-title="${title}">HEADER</header>`;
    }
    if (blockName === 'CheckoutHeader') {
      return `<header data-checkout-slot="header" data-title="${title}">CHECKOUT-HEADER</header>`;
    }
    if (blockName === 'Footer') {
      return `<footer data-nt="rose-footer">FOOTER</footer>`;
    }
    return '';
  });

const PAGES_DATA = {
  home: {
    content: [
      { type: 'Header', props: { siteTitle: 'Магазин Мерчанта', logo: '/logo.svg' } },
      { type: 'Footer', props: { siteTitle: 'Магазин Мерчанта' } },
    ],
  },
  'page-checkout': {
    content: [{ type: 'CheckoutHeader', props: { backLink: '/cart-custom' } }],
  },
};

describe('assembleChrome', () => {
  it('chrome="full" → мерчантский Header + Footer (пропсы из home)', async () => {
    const renderBlock = makeMockRender();
    const chrome = await assembleChrome({
      pagesData: PAGES_DATA,
      theme: 'rose',
      chrome: 'full',
      renderBlock,
      isPreview: false,
    });

    expect(chrome.headerHtml).toContain('data-nt="rose-header"');
    expect(chrome.headerHtml).toContain('HEADER');
    // siteTitle мерчанта проброшен в Header props.
    expect(chrome.headerHtml).toContain('data-title="Магазин Мерчанта"');
    expect(chrome.footerHtml).toContain('data-nt="rose-footer"');
    expect(chrome.footerHtml).toContain('FOOTER');

    // Header вызван с пропсами из home-Header, Footer — из home-Footer.
    expect(renderBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        blockName: 'Header',
        themeId: 'rose',
        isPreview: false,
        props: expect.objectContaining({ siteTitle: 'Магазин Мерчанта', logo: '/logo.svg' }),
      }),
    );
    expect(renderBlock).toHaveBeenCalledWith(
      expect.objectContaining({ blockName: 'Footer' }),
    );
  });

  it('chrome="checkout" → CheckoutHeader, footer=null', async () => {
    const renderBlock = makeMockRender();
    const chrome = await assembleChrome({
      pagesData: PAGES_DATA,
      theme: 'rose',
      chrome: 'checkout',
      renderBlock,
      isPreview: false,
    });

    expect(chrome.headerHtml).toContain('data-checkout-slot="header"');
    expect(chrome.headerHtml).toContain('CHECKOUT-HEADER');
    // siteTitle мерчанта (из home-Header) перекрывает дефолт 'Мой магазин'.
    expect(chrome.headerHtml).toContain('data-title="Магазин Мерчанта"');
    // Checkout без обычного footer.
    expect(chrome.footerHtml).toBeNull();
  });

  it('chrome="checkout" → дефолты + page-checkout props мерчанта в CheckoutHeader', async () => {
    const captured: Array<Record<string, unknown>> = [];
    const renderBlock: RenderBlockFn = jest.fn(async ({ blockName, props }) => {
      if (blockName === 'CheckoutHeader') captured.push(props);
      return '<header data-checkout-slot="header">X</header>';
    });
    await assembleChrome({
      pagesData: PAGES_DATA,
      theme: 'rose',
      chrome: 'checkout',
      renderBlock,
      isPreview: false,
    });
    const props = captured[0];
    // Дефолты unifyChromeInDist:435-446.
    expect(props['logoMode']).toBe('text');
    expect(props['rightIcon']).toBe('cart');
    expect(props['cartLink']).toBe('/cart');
    expect(props['padding']).toEqual({ top: 24, bottom: 24 });
    // Перекрытие из page-checkout CheckoutHeader props.
    expect(props['backLink']).toBe('/cart-custom');
    // siteTitle из home-Header перекрывает дефолт.
    expect(props['siteTitle']).toBe('Магазин Мерчанта');
    // logo из home-Header (его не было в checkoutProps).
    expect(props['logo']).toBe('/logo.svg');
  });

  it('chrome="none" → {null, null}, renderBlock не вызывается', async () => {
    const renderBlock = makeMockRender();
    const chrome = await assembleChrome({
      pagesData: PAGES_DATA,
      theme: 'rose',
      chrome: 'none',
      renderBlock,
      isPreview: false,
    });
    expect(chrome).toEqual({ headerHtml: null, footerHtml: null });
    expect(renderBlock).not.toHaveBeenCalled();
  });

  it('пустой рендер слота → null (фолбэк = не подменять)', async () => {
    const renderBlock: RenderBlockFn = jest.fn(async () => '   ');
    const chrome = await assembleChrome({
      pagesData: PAGES_DATA,
      theme: 'rose',
      chrome: 'full',
      renderBlock,
      isPreview: false,
    });
    expect(chrome.headerHtml).toBeNull();
    expect(chrome.footerHtml).toBeNull();
  });

  it('упавший рендер слота → null (изоляция, не бросает)', async () => {
    const renderBlock: RenderBlockFn = jest.fn(async () => {
      throw new Error('container down');
    });
    const chrome = await assembleChrome({
      pagesData: PAGES_DATA,
      theme: 'rose',
      chrome: 'full',
      renderBlock,
      isPreview: false,
    });
    expect(chrome.headerHtml).toBeNull();
    expect(chrome.footerHtml).toBeNull();
  });
});

describe('injectChromeIntoHtml', () => {
  const FULL_CHROME: AssembledChrome = {
    headerHtml: '<header data-nt="rose-header">NEW-HEADER</header>',
    footerHtml: '<footer data-nt="rose-footer">NEW-FOOTER</footer>',
  };

  const pageHtml = (header: string, footer: string): string =>
    `<!DOCTYPE html><html><head><title>T</title></head><body>${header}<main>BODY</main>${footer}</body></html>`;

  it('подменяет <header data-nt> и <footer> на целевые (full)', () => {
    const html = pageHtml(
      '<header data-nt="rose-header">OLD-HEADER</header>',
      '<footer data-nt="rose-footer">OLD-FOOTER</footer>',
    );
    const out = injectChromeIntoHtml(html, FULL_CHROME);
    expect(out).toContain('NEW-HEADER');
    expect(out).toContain('NEW-FOOTER');
    expect(out).not.toContain('OLD-HEADER');
    expect(out).not.toContain('OLD-FOOTER');
  });

  it('идемпотентен: повторный прогон того же chrome → строка не меняется', () => {
    const html = pageHtml(
      '<header data-nt="rose-header">OLD-HEADER</header>',
      '<footer data-nt="rose-footer">OLD-FOOTER</footer>',
    );
    const once = injectChromeIntoHtml(html, FULL_CHROME);
    const twice = injectChromeIntoHtml(once, FULL_CHROME);
    expect(twice).toBe(once);
  });

  it('checkout: подменяет <header data-checkout-slot> (приоритет над data-nt)', () => {
    const checkoutChrome: AssembledChrome = {
      headerHtml: '<header data-checkout-slot="header">NEW-CHECKOUT</header>',
      footerHtml: null,
    };
    const html = pageHtml('<header data-checkout-slot="header">OLD-CHECKOUT</header>', '');
    const out = injectChromeIntoHtml(html, checkoutChrome);
    expect(out).toContain('NEW-CHECKOUT');
    expect(out).not.toContain('OLD-CHECKOUT');

    // Идемпотентность checkout.
    expect(injectChromeIntoHtml(out, checkoutChrome)).toBe(out);
  });

  it('checkout с data-nt шапкой (fallback, до раскатки theme-edit)', () => {
    const checkoutChrome: AssembledChrome = {
      headerHtml: '<header data-checkout-slot="header">NEW-CHECKOUT</header>',
      footerHtml: null,
    };
    // В дисте только data-nt header — fallback на HEADER_NT_RE.
    const html = pageHtml('<header data-nt="rose-header">OLD</header>', '');
    const out = injectChromeIntoHtml(html, checkoutChrome);
    expect(out).toContain('NEW-CHECKOUT');
    expect(out).not.toContain('OLD');
  });

  it('chrome="none" ({null,null}) → ничего не подменяет', () => {
    const html = pageHtml(
      '<header data-nt="rose-header">KEEP-HEADER</header>',
      '<footer data-nt="rose-footer">KEEP-FOOTER</footer>',
    );
    const out = injectChromeIntoHtml(html, { headerHtml: null, footerHtml: null });
    expect(out).toBe(html);
  });

  it('footerHtml=null → footer не трогается, header подменяется', () => {
    const html = pageHtml(
      '<header data-nt="rose-header">OLD-HEADER</header>',
      '<footer data-nt="rose-footer">KEEP-FOOTER</footer>',
    );
    const out = injectChromeIntoHtml(html, {
      headerHtml: '<header data-nt="rose-header">NEW-HEADER</header>',
      footerHtml: null,
    });
    expect(out).toContain('NEW-HEADER');
    expect(out).toContain('KEEP-FOOTER');
  });

  it('нет соответствующего <header> в HTML → header не подменяется (но footer да)', () => {
    const html = `<!DOCTYPE html><html><body><main>BODY</main><footer data-nt="rose-footer">OLD-FOOTER</footer></body></html>`;
    const out = injectChromeIntoHtml(html, FULL_CHROME);
    // header цели нет в HTML → не вставляется (не трогаем).
    expect(out).not.toContain('NEW-HEADER');
    // footer подменён.
    expect(out).toContain('NEW-FOOTER');
  });
});

/**
 * Spec 108 T014 — паритет превью↔live по хрому verbatim-страниц.
 *
 * Ядро US2: header/footer verbatim-страницы (товар/корзина) собираются ОДНИМ
 * `assembleChrome` и применяются ОДНИМ `injectChromeIntoHtml` в обоих путях:
 *   - live  — applyChromeToDist (build-сторона, isPreview:false)
 *   - превью — preview.controller блоб-ветка (isPreview:true)
 * Для одних pagesData итоговый header/footer на странице ОБЯЗАН совпасть, иначе
 * превью ≠ live. CheckoutHeader (chrome:'checkout') этим путём НЕ трогается.
 */
describe('verbatim chrome — паритет превью ↔ live (T014)', () => {
  // Мок-renderBlock: header/footer детерминированы пропсами мерчанта. ВАЖНО:
  // HTML слотов НЕ зависит от isPreview — единый источник даёт единый хром в
  // обоих путях (assetPrefix/режим влияет на внутренности блока, не на сам факт
  // подмены; тест фиксирует именно паритет применённого хрома).
  const merchantRender = (): RenderBlockFn =>
    jest.fn(async ({ blockName, props }: Parameters<RenderBlockFn>[0]) => {
      const title =
        typeof props['siteTitle'] === 'string' ? props['siteTitle'] : '';
      if (blockName === 'Header') {
        return `<header data-nt="rose-header" data-title="${title}">MERCHANT-HEADER</header>`;
      }
      if (blockName === 'Footer') {
        return `<footer data-nt="rose-footer" data-title="${title}">MERCHANT-FOOTER</footer>`;
      }
      if (blockName === 'CheckoutHeader') {
        return `<header data-checkout-slot="header">CHECKOUT</header>`;
      }
      return '';
    });

  const PAGES = {
    home: {
      content: [
        { type: 'Header', props: { siteTitle: 'Бренд Мерчанта' } },
        { type: 'Footer', props: { siteTitle: 'Бренд Мерчанта' } },
      ],
    },
  };

  // Verbatim-страница темы (как из SSG): дефолтная шапка/подвал темы БЕЗ пропсов
  // мерчанта (дефолтный siteTitle темы) — то, что приходит в обоих путях до инъекции.
  const verbatimPage = (): string =>
    `<!DOCTYPE html><html><head><title>Товар</title></head><body>` +
    `<header data-nt="rose-header" data-title="Rose">THEME-DEFAULT-HEADER</header>` +
    `<main>PRODUCT</main>` +
    `<footer data-nt="rose-footer" data-title="Rose">THEME-DEFAULT-FOOTER</footer>` +
    `</body></html>`;

  it('full: header/footer товарной страницы идентичны между preview-инъекцией и live-инъекцией', async () => {
    // LIVE (applyChromeToDist путь): isPreview=false.
    const liveChrome = await assembleChrome({
      pagesData: PAGES,
      theme: 'rose',
      chrome: 'full',
      renderBlock: merchantRender(),
      isPreview: false,
    });
    const liveHtml = injectChromeIntoHtml(verbatimPage(), liveChrome);

    // PREVIEW (preview.controller блоб-ветка): isPreview=true, ТЕ ЖЕ pagesData.
    const previewChrome = await assembleChrome({
      pagesData: PAGES,
      theme: 'rose',
      chrome: 'full',
      renderBlock: merchantRender(),
      isPreview: true,
    });
    const previewHtml = injectChromeIntoHtml(verbatimPage(), previewChrome);

    // Паритет: применённый header/footer совпадает байт-в-байт.
    expect(previewHtml).toBe(liveHtml);

    // И это именно мерчантский хром (а не дефолт темы): бренд проброшен, дефолт ушёл.
    expect(liveHtml).toContain('MERCHANT-HEADER');
    expect(liveHtml).toContain('data-title="Бренд Мерчанта"');
    expect(liveHtml).toContain('MERCHANT-FOOTER');
    expect(liveHtml).not.toContain('THEME-DEFAULT-HEADER');
    expect(liveHtml).not.toContain('THEME-DEFAULT-FOOTER');
  });

  it('checkout НЕ затрагивается full-ассемблером: data-checkout-slot шапка остаётся', async () => {
    // Checkout-страница темы несёт CheckoutHeader (data-checkout-slot), без data-nt.
    const checkoutPage =
      `<!DOCTYPE html><html><head></head><body>` +
      `<header data-checkout-slot="header">CHECKOUT-ORIGINAL</header>` +
      `<main>CHECKOUT</main></body></html>`;
    // chrome:'full' собирает Header(data-nt)/Footer — НЕ CheckoutHeader.
    const fullChrome = await assembleChrome({
      pagesData: PAGES,
      theme: 'rose',
      chrome: 'full',
      renderBlock: merchantRender(),
      isPreview: false,
    });
    // injectChromeIntoHtml для full-хрома ищет data-checkout-slot ПЕРВЫМ (приоритет),
    // поэтому теоретически мог бы подменить. Гарантия безопасности checkout — на
    // уровне ВЫЗОВА: applyChromeToDist/preview пропускают checkout-маршруты
    // (getChromeKind==='checkout' ≠ 'full'). Здесь фиксируем: full-хром НЕ несёт
    // CheckoutHeader-разметку (header — data-nt, не checkout-slot).
    expect(fullChrome.headerHtml).toContain('data-nt="rose-header"');
    expect(fullChrome.headerHtml).not.toContain('data-checkout-slot');
    // Если бы checkout-страница ошибочно попала в full-инъекцию — она бы потеряла
    // CheckoutHeader. Поэтому контракт «checkout идёт через chrome:checkout»:
    const checkoutChrome = await assembleChrome({
      pagesData: PAGES,
      theme: 'rose',
      chrome: 'checkout',
      renderBlock: merchantRender(),
      isPreview: false,
    });
    const out = injectChromeIntoHtml(checkoutPage, checkoutChrome);
    expect(out).toContain('CHECKOUT'); // из мерчантского CheckoutHeader
    expect(out).not.toContain('CHECKOUT-ORIGINAL');
    // footer у checkout — null (обычный footer не появляется).
    expect(checkoutChrome.footerHtml).toBeNull();
  });
});
