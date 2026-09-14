import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { extractPageBlocks } from '../page-blocks';
import { assembleChrome, type RenderBlockFn } from '../chrome-assembler';
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
 * (`assembleChrome`, chrome:'checkout') снимает подвал со страницы, и это
 * делают оба пути — сборка витрины
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
 * конструктора, поэтому состав панели не меняется.
 *
 * 14.09 владелец снял с чекаута и правовую полосу («УДАЛИТЬ В ЧЕКАУТЕ»),
 * которой прошлый круг вытеснял подвал витрины. Подвала на странице теперь нет
 * НИКАКОГО — см. checkout-footer-legal.spec.ts; здесь остаётся сторожить, что
 * подвал витрины не приезжает телом страницы.
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

/** Разметка: подвал витрины на чекаут не приезжает ни одним путём. */
describe('подвала витрины на чекауте нет', () => {
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

  it.each(THEMES)('тема %s на чекауте не рендерит ни подвал витрины, ни полосу', (theme) => {
    const layout = read(`themes/${theme}/src/layouts/Layout.astro`);
    // Полный <Footer /> — только у НЕ-чекаута; чекаут-ветки не существует.
    expect(layout).toMatch(/header\s*!==\s*"checkout"\s*&&\s*<Footer\s*\/>/);
    expect(layout).not.toMatch(/header\s*!==\s*"checkout"\s*\?/);
    expect(layout).not.toContain('CheckoutFooterStrip');
  });

  it('сборка хрома чекаута не зовёт подвал ни витринный, ни правовой', async () => {
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
    expect(calls.map((c) => c.blockName)).toEqual(['CheckoutHeader']);
    expect(chrome.footerHtml).toBeNull();
  });
});

/**
 * Вторая дыра того же бага, и главная: снятие подвала со СОБРАННОГО шелла.
 *
 * Прошлый круг умел только ПОДМЕНИТЬ уже стоящую правовую полосу:
 *
 *   function replaceCheckoutFooterStrip(html, target) {
 *     const m = /<footer[^>]*data-checkout-footer-strip[^>]*>…<\/footer>/i.exec(html);
 *     if (!m) return html;   // ← полосы нет → МОЛЧА ничего не делаем
 *
 * Замер тогда (jest, 14.09): шелл чекаута с подвалом витрины
 * (`<footer data-nt="rose-footer">` + «Powered by Merfy») возвращался
 * БАЙТ-В-БАЙТ прежним. 14.09 полосу сняли совсем, поэтому снятие подвала стало
 * безусловным — и проверки переехали туда, где живёт новое правило:
 *
 *   src/themes/__tests__/checkout-footer-legal.spec.ts
 *     → describe('инъекция хрома снимает подвал с любого шелла')
 *
 * Здесь их дубля намеренно нет: два гарда на одно правило расходятся первыми.
 */
