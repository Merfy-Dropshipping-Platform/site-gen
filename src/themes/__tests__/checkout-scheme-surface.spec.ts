/**
 * П.4 третьего круга: «Во вкладке Оформление заказа очень плохо работают
 * цветовые схемы».
 *
 * Эталон владельца (Shopify-подобный чекаут): схема применяется к КОЛОНКЕ
 * целиком как к поверхности, а не к блокам внутри неё. Правая колонка — сплошной
 * цвет от верха до низа окна и до правого края экрана; текст и цифры на ней
 * берут цвет текста из той же схемы. То же для левой колонки, если мерчант
 * задал схему форме.
 *
 * Замер «до» (прод, превью конструктора, 1280px, 2026-09-13):
 *   rose  — колонка красится `.mfy-checkout-pane--summary`, но цветом ЖЁСТКО
 *           зашитой `color-scheme-2`, а не выбранной у «Сводки заказа»;
 *   bloom — то же, плюс палитра вбита литералами в разметку страницы;
 *   vanilla/satin/flux — поверхности НЕТ вовсе: колонка обрывается на 1079px
 *           из 1280 (полоса справа), фон только у общего `<main>`;
 *   все пять — выбор схемы у «Сводки заказа» СНИМАЕТ класс `color-scheme-N`
 *           (панель шлёт "1", живая нормализация отдаёт число, блок сверял
 *           `typeof === 'string'`).
 *
 * Проверяем ровно эталон: класс схемы едет на КОЛОНКУ, колонка красится
 * токенами схемы, тянется на всю высоту и до края, и всё это одинаково у пяти
 * тем и в превью.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  checkoutFooterScheme,
  injectCheckoutChromeIntoHtml,
  patchCheckoutColumnScheme,
} from '../chrome-assembler';

const SITES_ROOT = join(__dirname, '..', '..', '..');
const RENDERER = resolve(__dirname, 'render-theme-sections.mjs');
const read = (rel: string) => readFileSync(join(SITES_ROOT, rel), 'utf8');
const THEMES = ['rose', 'vanilla', 'bloom', 'satin', 'flux'] as const;

function renderBaseBlock(block: string, props: Record<string, unknown>): string {
  const jobs = [{ block, pkg: 'theme-base', props }];
  const raw = execFileSync('node', [RENDERER, 'rose', JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const rows = JSON.parse(raw) as { html?: string; error?: string }[];
  if (rows[0]?.error) throw new Error(rows[0].error);
  return rows[0]?.html ?? '';
}

// ── 1. Блоки чекаута: класс схемы печатается и для строки, и для числа ──────

describe('блоки чекаута печатают класс схемы на живом пути', () => {
  const cases: [string, Record<string, unknown>][] = [
    ['CheckoutSummary', { id: 'CheckoutSummary-1' }],
    ['CheckoutForm', { id: 'CheckoutForm-1' }],
    ['CheckoutHeader', { id: 'CheckoutHeader-1', siteTitle: 'Магазин' }],
  ];

  it.each(cases)('%s: строка "scheme-3"', (block, base) => {
    const html = renderBaseBlock(block, { ...base, colorScheme: 'scheme-3' });
    expect(html).toContain('color-scheme-3');
  });

  it.each(cases)('%s: число 3 (после нормализации ревизии)', (block, base) => {
    const html = renderBaseBlock(block, { ...base, colorScheme: 3 });
    expect(html).toContain('color-scheme-3');
  });

  it.each(cases)('%s: голая строка "3" (то, что шлёт панель)', (block, base) => {
    const html = renderBaseBlock(block, { ...base, colorScheme: '3' });
    expect(html).toContain('color-scheme-3');
  });

  it.each(cases)('САБОТАЖ %s: без схемы класса нет', (block, base) => {
    const html = renderBaseBlock(block, base);
    expect(html).not.toMatch(/color-scheme-\d/);
  });
});

// ── 2. Схема едет на КОЛОНКУ, а не только на секцию ────────────────────────

const PANE_HTML = `<!doctype html><html><body>
<div class="mfy-checkout-split">
  <div class="mfy-checkout-pane mfy-checkout-pane--form" data-checkout-pane="form">
    <div class="mfy-checkout-pane__inner" data-checkout-column="form">
      <section class="relative w-full" data-block="checkout-form">форма</section>
    </div>
  </div>
  <div class="mfy-checkout-pane mfy-checkout-pane--summary" data-checkout-pane="summary">
    <div class="mfy-checkout-pane__inner" data-checkout-column="summary">
      <section class="relative w-full" data-block="checkout-summary">сводка</section>
    </div>
  </div>
</div>
</body></html>`;

const paneTag = (html: string, pane: string) =>
  new RegExp(`<div\\b[^>]*data-checkout-pane="${pane}"[^>]*>`).exec(html)?.[0] ?? '';

describe('класс схемы — на колонке', () => {
  it('строка "scheme-3" красит колонку сводки', () => {
    const out = patchCheckoutColumnScheme(PANE_HTML, 'summary', 'scheme-3');
    expect(paneTag(out, 'summary')).toContain('color-scheme-3');
    expect(paneTag(out, 'form')).not.toMatch(/color-scheme-\d/);
  });

  it('число 3 (живая нормализация ревизии) тоже красит', () => {
    const out = patchCheckoutColumnScheme(PANE_HTML, 'summary', 3);
    expect(paneTag(out, 'summary')).toContain('color-scheme-3');
  });

  it('идемпотентно: повторный прогон не дублирует класс', () => {
    const once = patchCheckoutColumnScheme(PANE_HTML, 'summary', 3);
    const twice = patchCheckoutColumnScheme(once, 'summary', 3);
    expect(twice).toBe(once);
    expect((twice.match(/color-scheme-3/g) ?? []).length).toBe(1);
  });

  it('колонки независимы: форма своей схемой, сводка своей', () => {
    let out = patchCheckoutColumnScheme(PANE_HTML, 'form', 'scheme-1');
    out = patchCheckoutColumnScheme(out, 'summary', 'scheme-4');
    expect(paneTag(out, 'form')).toContain('color-scheme-1');
    expect(paneTag(out, 'summary')).toContain('color-scheme-4');
  });

  it('общая доводка чекаута тоже красит колонки', () => {
    const out = injectCheckoutChromeIntoHtml(
      PANE_HTML,
      { headerHtml: null, footerHtml: null },
      { form: { scheme: 'scheme-1' }, summary: { scheme: 4 } },
    );
    expect(paneTag(out, 'form')).toContain('color-scheme-1');
    expect(paneTag(out, 'summary')).toContain('color-scheme-4');
  });

  it('САБОТАЖ: без схемы колонка остаётся без класса', () => {
    const out = patchCheckoutColumnScheme(PANE_HTML, 'summary', undefined);
    expect(paneTag(out, 'summary')).not.toMatch(/color-scheme-\d/);
  });
});

// ── 3. Пять тем: одна разметка колонок и одна таблица стилей ───────────────

const SPLIT_CSS = 'packages/theme-base/blocks/CheckoutLayout/checkout-split.ts';

describe.each(THEMES)('чекаут темы %s использует общую split-колонку', (theme) => {
  const page = read(`themes/${theme}/src/pages/checkout.astro`);

  it('колонки помечены data-checkout-pane (form + summary)', () => {
    expect(page).toContain('CheckoutSplit');
    expect(page).not.toMatch(/grid-cols-\[434px_589px\]/);
  });

  it('своей копии split-CSS в странице темы не осталось', () => {
    expect(page).not.toContain('.mfy-checkout-pane--summary {');
    expect(page).not.toContain('.bloom-checkout-pane--summary');
  });
});

describe('общая split-колонка: поверхность по эталону', () => {
  const css = read(SPLIT_CSS);

  it('колонка сводки красится токеном схемы, а не литералом', () => {
    expect(css).toMatch(/\[data-checkout-pane="summary"\][^}]*background:\s*rgb\(var\(--color-surface/);
  });

  it('колонка формы красится фоном своей схемы', () => {
    expect(css).toMatch(/\[data-checkout-pane="form"\][^}]*background:\s*rgb\(var\(--color-bg/);
  });

  it('текст на колонке — из той же схемы', () => {
    expect(css).toMatch(/color:\s*rgb\(var\(--color-text/);
  });

  it('фон доходит до низа окна даже на коротком заказе', () => {
    expect(css).toMatch(/min-height:\s*100(dvh|vh)/);
  });

  it('на десктопе колонка занимает половину и уходит за край контейнера', () => {
    expect(css).toMatch(/width:\s*50%/);
    expect(css).not.toMatch(/max-width:\s*1280px/);
  });

  it('сводка липнет как раньше (баг 17/18-Б не откатывается)', () => {
    expect(css).toContain('position: sticky');
    expect(css).toContain('--checkout-summary-top');
  });
});

// ── 4. Превью конструктора собирает ту же разметку ─────────────────────────

describe('превью конструктора = витрина', () => {
  const preview = read('src/services/preview.service.ts');

  it('wrapCheckoutGrid берёт общую разметку и общий CSS, а не свою копию', () => {
    const grid = preview.slice(preview.indexOf('wrapCheckoutGrid'));
    expect(grid).toContain('checkoutSplitMarkup');
    expect(grid).not.toContain('.mfy-checkout-pane--summary { background');
  });
});

// ── 5. Подвал чекаута реагирует на свою «Цветовую схему» ───────────────────

describe('правовая полоса чекаута — своя схема', () => {
  it('класс схемы печатается на корне полосы', () => {
    const html = renderBaseBlock('CheckoutFooterStrip', {
      siteTitle: 'Магазин',
      colorScheme: 'scheme-3',
    });
    expect(html).toMatch(/<footer[^>]*class="[^"]*color-scheme-3/);
  });

  it('число (живая нормализация) тоже красит', () => {
    const html = renderBaseBlock('CheckoutFooterStrip', { siteTitle: 'Магазин', colorScheme: 3 });
    expect(html).toMatch(/<footer[^>]*class="[^"]*color-scheme-3/);
  });

  it('САБОТАЖ: без схемы класса нет', () => {
    const html = renderBaseBlock('CheckoutFooterStrip', { siteTitle: 'Магазин' });
    expect(html).not.toMatch(/color-scheme-\d/);
  });

  it('сборка берёт схему у секции «Подвал» страницы чекаута', () => {
    const pagesData = {
      home: { content: [{ type: 'Footer', props: { id: 'F-home', colorScheme: 'scheme-1' } }] },
      'page-checkout': {
        content: [{ type: 'Footer', props: { id: 'F-checkout', colorScheme: 'scheme-5' } }],
      },
    };
    expect(checkoutFooterScheme(pagesData)).toBe('scheme-5');
  });

  it('нет своей секции — берём схему подвала главной', () => {
    const pagesData = {
      home: { content: [{ type: 'Footer', props: { id: 'F-home', colorScheme: 'scheme-1' } }] },
      'page-checkout': { content: [] },
    };
    expect(checkoutFooterScheme(pagesData)).toBe('scheme-1');
  });
});
