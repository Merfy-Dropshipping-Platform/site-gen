import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { extractPageBlocks } from '../page-blocks';
import {
  assembleChrome,
  checkoutFooterScheme,
  injectCheckoutChromeIntoHtml,
  type RenderBlockFn,
} from '../chrome-assembler';
import { getChromeKind, getChromeKindByPageId } from '../page-registry';

const SITES_ROOT = join(__dirname, '..', '..', '..');
const RENDERER = resolve(__dirname, 'render-theme-sections.mjs');
const read = (rel: string) => readFileSync(join(SITES_ROOT, rel), 'utf8');

const THEMES = ['rose', 'vanilla', 'flux', 'satin', 'bloom'] as const;

/**
 * Баг тестировщика 14.09 (повтор пункта 18-А): «Во вкладке Оформление заказа
 * убрать подвал, где идёт Powered by merfy. Ожидаемый результат: подвал на
 * этой странице — это юр. информация, ссылки». На скриншоте внизу чекаута —
 * ПОЛНЫЙ подвал витрины: колонки «Навигация»/«Информация», телефон, иконки
 * платёжных систем.
 *
 * Прошлый круг (afb944ea → 0ded2677 → af46c212) лечил РЕНДЕР: сборка хрома
 * (`assembleChrome`, chrome:'checkout') подменяет последний <footer> правовой
 * полосой `CheckoutFooterStrip`, и это делают оба пути — сборка витрины
 * (`unifyChromeInDist`) и превью конструктора (блоб-путь preview.controller).
 * Причина при этом осталась на месте: миграция ревизии `migrateCheckoutPage`
 * ДОПИСЫВАЕТ в страницу чекаута блок `Footer` — копию подвала главной (тот же
 * объект, тот же id). Замер на текущем main (jest, 2026-09-14):
 *
 *   extractPageBlocks(ревизия, 'page-checkout')
 *     → ["CheckoutHeader", "CheckoutForm", "CheckoutSummary", "Footer"]
 *
 * То есть любой рендер, который идёт ПО БЛОКАМ страницы, а не через хром,
 * рисует на чекауте подвал витрины. Такой путь в проде живой: фолбэк превью
 * (`preview.controller.ts` — когда у темы нет собранного шелла
 * `theme-preview/<тема>/checkout/index.html`, блоб-путь отдаёт null и страница
 * собирается из блоков). Именно поэтому «прошлая правка не сработала» у
 * тестировщика: правку клали в хром, а подвал приезжал из сборки страницы.
 *
 * Сторожим ПРИЧИНУ, а не симптом: на странице с хромом `checkout` блоки хрома
 * витрины (Header/Footer/PromoBanner) не являются телом страницы. Блок при
 * этом ОСТАЁТСЯ в ревизии — на нём держится узел «Подвал» в дереве
 * конструктора и выбор «Цветовой схемы» полосы (`checkoutFooterScheme`),
 * поэтому состав панели не меняется.
 *
 * Саботаж: вернуть `Footer` в тело чекаута (снять фильтр в page-blocks) —
 * первый describe обязан покраснеть.
 */

/** Ревизия «как в проде»: у чекаута в конце дописан подвал главной. */
const revisionWithCheckoutFooter = () => ({
  pagesData: {
    home: {
      content: [
        { type: 'Header', props: { id: 'Header-1', siteTitle: 'Мой магазин' } },
        { type: 'Hero', props: { id: 'Hero-1' } },
        {
          type: 'Footer',
          props: {
            id: 'Footer-1',
            phone: '+7 900 000-00-00',
            paymentEnabled: true,
            navigationColumn: {
              title: 'Навигация',
              links: [{ label: 'Каталог', href: '/catalog' }],
            },
            informationColumn: {
              title: 'Информация',
              links: [
                { label: 'Политика возврата', href: '/legal/refund' },
                { label: 'Условия обслуживания', href: '/legal/tos' },
              ],
            },
          },
        },
      ],
    },
    'page-checkout': {
      content: [
        { type: 'CheckoutHeader', props: { id: 'CheckoutHeader-1' } },
        { type: 'CheckoutForm', props: { id: 'CheckoutForm-1' } },
        { type: 'CheckoutSummary', props: { id: 'CheckoutSummary-1' } },
        // Тот же объект, что у главной — migrateCheckoutPage копирует блок вместе с id.
        {
          type: 'Footer',
          props: {
            id: 'Footer-1',
            colorScheme: 'scheme-3',
            phone: '+7 900 000-00-00',
            paymentEnabled: true,
            navigationColumn: {
              title: 'Навигация',
              links: [{ label: 'Каталог', href: '/catalog' }],
            },
          },
        },
      ],
    },
    'page-about': {
      content: [
        { type: 'Header', props: { id: 'Header-1' } },
        { type: 'Page', props: { id: 'Page-1' } },
        { type: 'Footer', props: { id: 'Footer-1' } },
      ],
    },
  },
});

const typesOf = async (page: string) => {
  const blocks = await extractPageBlocks(
    revisionWithCheckoutFooter() as unknown as Record<string, unknown>,
    page,
    null,
    null,
    'site-1',
  );
  return (blocks ?? []).map((b) => b.type);
};

describe('на странице чекаута нет узлов подвала витрины', () => {
  it('блоки страницы чекаута не содержат Footer (ключ page-checkout)', async () => {
    const types = await typesOf('page-checkout');
    expect(types).not.toContain('Footer');
    // Каркас оплаты на месте — фильтр не съел лишнего.
    expect(types).toEqual(['CheckoutHeader', 'CheckoutForm', 'CheckoutSummary']);
  });

  it('то же для витринного ключа `checkout` (старые ревизии)', async () => {
    const rev = revisionWithCheckoutFooter() as unknown as {
      pagesData: Record<string, unknown>;
    };
    rev.pagesData['checkout'] = rev.pagesData['page-checkout'];
    delete rev.pagesData['page-checkout'];
    const blocks = await extractPageBlocks(
      rev as unknown as Record<string, unknown>,
      'checkout',
      null,
      null,
      'site-1',
    );
    expect((blocks ?? []).map((b) => b.type)).not.toContain('Footer');
  });

  it('блоки хрома витрины на чекауте отсечены целиком, не только Footer', async () => {
    const rev = revisionWithCheckoutFooter() as unknown as {
      pagesData: Record<string, { content: Array<{ type: string; props: unknown }> }>;
    };
    rev.pagesData['page-checkout'].content.unshift(
      { type: 'Header', props: { id: 'Header-1' } },
      { type: 'PromoBanner', props: { id: 'PromoBanner-1' } },
    );
    const blocks = await extractPageBlocks(
      rev as unknown as Record<string, unknown>,
      'page-checkout',
      null,
      null,
      'site-1',
    );
    const types = (blocks ?? []).map((b) => b.type);
    expect(types).not.toContain('Header');
    expect(types).not.toContain('PromoBanner');
    expect(types).not.toContain('Footer');
  });

  it('правило не расползлось: у главной и контентных страниц подвал остаётся', async () => {
    expect(await typesOf('home')).toContain('Footer');
    expect(await typesOf('page-about')).toContain('Footer');
    expect(await typesOf('page-about')).toContain('Header');
  });

  it('«Спасибо за заказ» сохраняет подвал витрины (соседний маршрут)', async () => {
    const rev = revisionWithCheckoutFooter() as unknown as {
      pagesData: Record<string, unknown>;
    };
    rev.pagesData['page-checkout-result'] = {
      content: [
        { type: 'CheckoutHeader', props: { id: 'CheckoutHeader-2' } },
        { type: 'OrderConfirmation', props: { id: 'OrderConfirmation-1' } },
        { type: 'Footer', props: { id: 'Footer-1' } },
      ],
    };
    const blocks = await extractPageBlocks(
      rev as unknown as Record<string, unknown>,
      'page-checkout-result',
      null,
      null,
      'site-1',
    );
    expect((blocks ?? []).map((b) => b.type)).toContain('Footer');
  });

  it('правило завязано на реестр страниц, а не на строку в фильтре', () => {
    // Источник правды о хроме — page-registry. Если у чекаута поменяют chrome,
    // фильтр обязан поехать следом сам.
    expect(getChromeKind('checkout')).toBe('checkout');
    expect(getChromeKindByPageId('page-checkout')).toBe('checkout');
    expect(getChromeKindByPageId('checkout')).toBe('checkout');
    expect(getChromeKindByPageId('home')).not.toBe('checkout');
    expect(getChromeKindByPageId('page-about')).toBe('full');
    // «Спасибо за заказ» — соседний маршрут с похожим именем, но подвал
    // витрины там штатный. Порядок записей реестра не должен его съесть.
    expect(getChromeKindByPageId('page-checkout-result')).toBe('full');
    expect(getChromeKindByPageId('checkout-result')).toBe('full');
    // Несуществующая страница не должна молча притворяться чекаутом.
    expect(getChromeKindByPageId('page-unknown-xyz')).not.toBe('checkout');
  });
});

/**
 * Тело правила — в общем модуле блоков страницы, а не копией в каждом
 * потребителе. Баг 16 был ровно в том, что общую функцию НЕ ЗВАЛИ.
 */
describe('проводка: фильтр живёт в общем extractPageBlocks', () => {
  it('page-blocks спрашивает хром у реестра', () => {
    const src = read('src/themes/page-blocks.ts');
    // Правило приходит из реестра, а не переписано копией в модуле блоков.
    expect(src).toMatch(/import\s*\{[^}]*isBodyBlockOnPage[^}]*\}\s*from\s*'\.\/page-registry'/);
    expect(src).toContain('isBodyBlockOnPage(page, b.type)');
    expect(src).not.toMatch(/b\.type\s*!==\s*'Footer'/);
  });

  it('фолбэк-путь превью не рендерит страницу мимо этого фильтра', () => {
    const src = read('src/controllers/preview.controller.ts');
    // Легаси-путь (шелла темы нет) обязан брать блоки ТОЛЬКО через extractPageBlocks.
    const legacy = src.slice(src.indexOf('const blocks = await extractPageBlocks('));
    expect(legacy).toContain('renderPreviewPage');
    expect(legacy.slice(0, legacy.indexOf('renderPreviewPage'))).not.toContain(
      'pagesData',
    );
  });
});

/** Разметка: то, что реально увидит покупатель внизу чекаута. */
describe('правовая полоса цела и красится схемой', () => {
  const renderStrip = (props: Record<string, unknown>, theme = 'rose'): string => {
    const jobs = [{ block: 'CheckoutFooterStrip', pkg: 'theme-base', props }];
    const raw = execFileSync('node', [RENDERER, theme, JSON.stringify(jobs)], {
      cwd: SITES_ROOT,
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const rows = JSON.parse(raw) as { html?: string; error?: string }[];
    if (rows[0]?.error) throw new Error(rows[0].error);
    return rows[0]?.html ?? '';
  };

  const renderFooter = (theme: string): string => {
    const jobs = [
      {
        block: 'Footer',
        cascade: true,
        live: true,
        props: {
          id: 'Footer-1',
          phone: '+7 900 000-00-00',
          paymentEnabled: true,
          navigationColumn: {
            title: 'Навигация',
            links: [{ label: 'Каталог', href: '/catalog' }],
          },
          informationColumn: {
            title: 'Информация',
            links: [{ label: 'Политика возврата', href: '/legal/refund' }],
          },
        },
      },
    ];
    const raw = execFileSync('node', [RENDERER, theme, JSON.stringify(jobs)], {
      cwd: SITES_ROOT,
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const rows = JSON.parse(raw) as { html?: string; error?: string }[];
    if (rows[0]?.error) throw new Error(rows[0].error);
    return rows[0]?.html ?? '';
  };

  // Калибровка: проверка «маркеров подвала витрины нет» пуста, если самих
  // маркеров в подвале витрины не бывает. Замер показывает, что бывают —
  // и что именно их видел тестировщик внизу чекаута.
  it.each(THEMES)('калибровка: подвал витрины темы %s несёт эти маркеры', (theme) => {
    const html = renderFooter(theme);
    const markers = [
      /<footer\b/.test(html),
      /Навигация|Каталог/.test(html),
      /<ul\b|<a\b/.test(html),
    ];
    // Иначе проверки ниже сторожат пустоту.
    expect(markers.filter(Boolean).length).toBeGreaterThanOrEqual(2);
  });

  it('полоса не несёт маркеров подвала витрины', () => {
    const html = renderStrip({
      siteTitle: 'Мой магазин',
      links: [{ label: 'Политика возврата', href: '/legal/refund' }],
      colorScheme: 'scheme-3',
    });
    expect(html).toContain('data-checkout-footer-strip');
    expect(html).not.toContain('Powered by');
    expect(html).not.toContain('Навигация');
    expect(html).not.toContain('Информация');
    expect(html).not.toContain('tel:');
    expect(html).not.toMatch(/<ul\b/);
    // Правовая часть на месте.
    expect(html).toContain('Политика возврата');
    expect(html).toContain('Все права защищены');
  });

  it('цвет полосы берётся из «Цветовой схемы» подвала чекаута', () => {
    const html = renderStrip({ siteTitle: 'Магазин', colorScheme: 'scheme-3' });
    expect(html).toMatch(/<footer[^>]*\bcolor-scheme-3\b/);
    const other = renderStrip({ siteTitle: 'Магазин', colorScheme: 'scheme-5' });
    expect(other).toMatch(/<footer[^>]*\bcolor-scheme-5\b/);
    expect(other).not.toMatch(/<footer[^>]*\bcolor-scheme-3\b/);
  });

  it('схему читаем из блока «Подвал» страницы чекаута (а не из главной)', () => {
    const pagesData = revisionWithCheckoutFooter().pagesData as Record<string, unknown>;
    expect(checkoutFooterScheme(pagesData)).toBe('scheme-3');
  });

  it('сборка хрома чекаута по-прежнему отдаёт полосу, а не подвал витрины', async () => {
    const calls: Array<{ blockName: string; props: Record<string, unknown> }> = [];
    const renderBlock: RenderBlockFn = async ({ blockName, props }) => {
      calls.push({ blockName, props });
      return `<${blockName.toLowerCase()} />`;
    };
    const chrome = await assembleChrome({
      pagesData: revisionWithCheckoutFooter().pagesData as Record<string, unknown>,
      theme: 'rose',
      chrome: 'checkout',
      renderBlock,
      isPreview: false,
    });
    expect(calls.map((c) => c.blockName)).not.toContain('Footer');
    expect(calls.map((c) => c.blockName)).toContain('CheckoutFooterStrip');
    expect(chrome.footerHtml).toBe('<checkoutfooterstrip />');
    const strip = calls.find((c) => c.blockName === 'CheckoutFooterStrip')!;
    expect(strip.props.colorScheme).toBe('scheme-3');
    expect(strip.props.links).toEqual([
      { label: 'Политика возврата', href: '/legal/refund' },
      { label: 'Условия обслуживания', href: '/legal/tos' },
    ]);
  });

  it.each(THEMES)('тема %s на чекауте не рендерит подвал витрины', (theme) => {
    const layout = read(`themes/${theme}/src/layouts/Layout.astro`);
    const branch = layout.slice(layout.indexOf('header !== "checkout"'));
    // Ветка чекаута отдаёт полосу; полный <Footer /> — только у не-чекаута.
    expect(branch).toContain('CheckoutFooterStrip');
    expect(branch).toMatch(/header\s*!==\s*"checkout"\s*\?\s*\(?\s*<Footer\s*\/>/);
  });
});

/**
 * Вторая дыра того же бага, и главная: инъекция хрома чекаута умела ТОЛЬКО
 * подменять УЖЕ СТОЯЩУЮ правовую полосу.
 *
 *   function replaceCheckoutFooterStrip(html, target) {
 *     const m = /<footer[^>]*data-checkout-footer-strip[^>]*>…<\/footer>/i.exec(html);
 *     if (!m) return html;   // ← полосы нет → МОЛЧА ничего не делаем
 *
 * Замер на main (jest, 2026-09-14): шелл чекаута с подвалом витрины
 * (`<footer data-nt="rose-footer">` с колонкой навигации и «Powered by Merfy»)
 * после `injectCheckoutChromeIntoHtml` возвращался БАЙТ-В-БАЙТ прежним —
 * «Powered by»: 1, `<ul>`: 1, полосы нет.
 *
 * Отсюда и «прошлая правка не сработала»: правка умела заменить полосу на
 * полосу, но не умела УБРАТЬ подвал витрины. Любой сайт, чей собранный шелл
 * чекаута ещё нёс подвал витрины (сборка темы старше гейта `header !==
 * "checkout"` в Layout), продолжал показывать тестировщику старую картинку —
 * и на витрине, и в превью конструктора: обе стороны зовут эту же функцию.
 *
 * Молчаливая деградация: ни исключения, ни warn — результат «ok», работа не
 * сделана.
 */
describe('инъекция чекаута убирает подвал витрины, а не только подменяет полосу', () => {
  const STRIP =
    '<footer class="w-full color-scheme-3" data-checkout-footer-strip>' +
    '<a href="/legal/refund">Политика возврата</a>© 2026 Магазин. Все права защищены.</footer>';

  const storefrontFooterShell = () =>
    '<html><body><main>ФОРМА</main>' +
    '<footer class="w-full" data-nt="rose-footer">' +
    '<ul><li><a href="/catalog">Каталог</a></li></ul>' +
    '<a href="tel:+79000000000">+7 900 000-00-00</a>' +
    '<img src="/icons/pay-mir.svg" alt="МИР" />' +
    '<p>© 2026 Rose Theme. Все права защищены. Powered by Merfy</p>' +
    '</footer></body></html>';

  it('шелл несёт подвал витрины → на выходе только правовая полоса', () => {
    const out = injectCheckoutChromeIntoHtml(storefrontFooterShell(), {
      headerHtml: null,
      footerHtml: STRIP,
    });
    expect(out).not.toContain('Powered by');
    expect(out).not.toContain('data-nt="rose-footer"');
    expect(out).not.toMatch(/<ul\b/);
    expect(out).not.toContain('tel:+79000000000');
    expect(out).not.toContain('pay-mir.svg');
    expect(out).toContain('data-checkout-footer-strip');
    expect(out).toContain('Политика возврата');
    // Ровно один подвал — не «полоса рядом с подвалом витрины».
    expect((out.match(/<footer\b/g) ?? []).length).toBe(1);
    // Тело страницы не тронуто.
    expect(out).toContain('<main>ФОРМА</main>');
  });

  it('повторный прогон ничего не меняет (идемпотентно)', () => {
    const once = injectCheckoutChromeIntoHtml(storefrontFooterShell(), {
      headerHtml: null,
      footerHtml: STRIP,
    });
    expect(
      injectCheckoutChromeIntoHtml(once, { headerHtml: null, footerHtml: STRIP }),
    ).toEqual(once);
  });

  it('в шелле уже стоит полоса → подменяется на собранную', () => {
    const shell =
      '<body><footer class="w-full" data-checkout-footer-strip>СТАРАЯ</footer></body>';
    const out = injectCheckoutChromeIntoHtml(shell, {
      headerHtml: null,
      footerHtml: STRIP,
    });
    expect(out).not.toContain('СТАРАЯ');
    expect(out).toContain('Политика возврата');
    expect((out.match(/<footer\b/g) ?? []).length).toBe(1);
  });

  it('подвала в шелле нет вовсе → полоса дописывается (прежний симптом flux)', () => {
    const shell = '<html><body><main>ФОРМА</main></body></html>';
    const out = injectCheckoutChromeIntoHtml(shell, {
      headerHtml: null,
      footerHtml: STRIP,
    });
    expect(out).toContain('data-checkout-footer-strip');
    expect(out).toContain('Все права защищены');
    expect(out.indexOf('data-checkout-footer-strip')).toBeLessThan(
      out.indexOf('</body>'),
    );
    expect(
      injectCheckoutChromeIntoHtml(out, { headerHtml: null, footerHtml: STRIP }),
    ).toEqual(out);
  });

  it('полоса не собралась (footerHtml=null) → шелл не трогаем', () => {
    const shell = '<body><footer data-checkout-footer-strip>ПОЛОСА ТЕМЫ</footer></body>';
    const out = injectCheckoutChromeIntoHtml(shell, {
      headerHtml: null,
      footerHtml: null,
    });
    expect(out).toContain('ПОЛОСА ТЕМЫ');
    expect(out).toEqual(shell);
  });
});
