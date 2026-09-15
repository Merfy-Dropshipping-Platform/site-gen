/**
 * ШАПКА ОФОРМЛЕНИЯ — ОТДЕЛЬНАЯ ПОЛОСА НАД ОБЕИМИ КОЛОНКАМИ.
 *
 * Владелец, 14.09, п.3: «На странице Оформление заказа секция шапка
 * неправильно отображена. Ожидаемый результат: отделить от левой и правой
 * части и придать свои размеры». Эталон, который он приложил, показывает шапку
 * во всю ширину над двумя колонками.
 *
 * ЭТО ОТМЕНА РЕШЕНИЯ ТРЕТЬЕГО КРУГА, и файл раньше сторожил ровно обратное
 * (`checkout-header-in-column.spec.ts`). Тогда шапку увели ВНУТРЬ левой колонки,
 * потому что полоса над цветной сводкой была БЕЛОЙ: её собственную схему гасили,
 * а палитру брали у колонки. Причина белизны снята здесь же — полоса снова
 * несёт свою «Цветовую схему» (контрол в её панели всегда был, третий круг его
 * обесценил).
 *
 * ЗАМЕР «ДО» (собранные витрины пяти тем + доводка хрома, Chromium, 1440×900,
 * корзина 3 позиции, origin/main ed3d5948): шапка x=274 y=0 w=446 h=84-86 —
 * внутри колонки формы (0..720), обе колонки от y=0.
 * ЗАМЕР «ПОСЛЕ» (та же цепочка): шапка x=0 y=0 w=1440 h=84-86 над обеими
 * колонками; колонки начинаются с y=84-86 и идут до низа. Все пять тем.
 *
 * Замера геометрии в CI нет (браузера нет), поэтому гард стоит на том, ЧЕМ
 * геометрия определяется: шапка обязана лежать ПЕРЕД строкой колонок и не
 * внутри ни одной из них. Саботаж повторяет прежнюю раскладку (шапка внутри
 * колонки формы) и требует, чтобы тот же предикат её ОТВЕРГ.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CHECKOUT_SPLIT_CSS,
  checkoutSplitMarkup,
} from '../../../packages/theme-base/blocks/CheckoutLayout/checkout-split';
import { injectCheckoutChromeIntoHtml } from '../chrome-assembler';

const SITES_ROOT = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(SITES_ROOT, rel), 'utf8');
const THEMES = ['rose', 'vanilla', 'bloom', 'satin', 'flux'] as const;

const HEADER = '<header data-checkout-slot="header"><a href="/">Магазин</a></header>';

/**
 * Только разметка, без `<style>`: в самой таблице стилей селекторы тоже
 * упоминают `data-checkout-slot="header"` и `data-checkout-pane`, и подсчёт по
 * всей строке врал бы (на этом уже спотыкался первый вариант предиката п.3).
 */
const body = (html: string) => html.slice(html.indexOf('</style>') + 8);
const FORM = '<section data-block="checkout-form">форма</section>';
const SUMMARY = '<section data-block="checkout-summary">сводка</section>';

/**
 * Вырезает элемент `<div … data-checkout-pane="<pane>" …>…</div>` целиком,
 * считая вложенные `<div>`. Нужен без jsdom: у sites-сьюта окружение node.
 */
function pane(html: string, name: 'form' | 'summary'): string {
  const open = new RegExp(`<div\\b[^>]*\\bdata-checkout-pane="${name}"[^>]*>`);
  const m = open.exec(html);
  if (!m) throw new Error(`колонка ${name} не найдена`);
  let i = m.index + m[0].length;
  let depth = 1;
  const tag = /<\/?div\b[^>]*>/g;
  tag.lastIndex = i;
  let t: RegExpExecArray | null;
  while ((t = tag.exec(html))) {
    depth += t[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(m.index, t.index + t[0].length);
  }
  throw new Error(`колонка ${name} не закрыта`);
}

/**
 * Предикат эталона: шапка чекаута — СВОЯ полоса над строкой колонок. Один и тот
 * же предикат применяется и к новой разметке (обязан пропустить), и к прежней
 * раскладке третьего круга (обязан отвергнуть).
 */
function headerIsOwnStrip(html: string): boolean {
  const m = body(html);
  const split = m.indexOf('<div class="mfy-checkout-split"');
  if (split < 0) return false;
  const header = m.search(/<header\b[^>]*\bdata-checkout-slot="header"/);
  if (header < 0) return false;
  // 1. Шапки нет ни в одной из колонок.
  if (pane(m, 'form').includes('data-checkout-slot="header"')) return false;
  if (pane(m, 'summary').includes('data-checkout-slot="header"')) return false;
  // 2. Полоса объявлена и стоит ДО строки колонок.
  const strip = m.indexOf('data-checkout-topbar');
  const cols = m.indexOf('data-checkout-cols');
  if (strip < 0 || cols < 0 || strip > cols) return false;
  // 3. Шапка лежит внутри полосы, а полоса — первым узлом сплита.
  if (header < strip || header > cols) return false;
  const splitOpenEnd = m.indexOf('>', split) + 1;
  return m.slice(splitOpenEnd, strip).trim().replace(/^<div[^>]*$/, '') === '';
}

// ── 1. Общая разметка сплита выносит шапку в свою полосу ───────────────────

describe('шапка оформления — отдельная полоса над колонками', () => {
  const html = checkoutSplitMarkup(FORM, SUMMARY, HEADER);

  it('шапки нет ни в одной колонке', () => {
    expect(pane(body(html), 'form')).not.toContain('data-checkout-slot="header"');
    expect(pane(body(html), 'summary')).not.toContain('data-checkout-slot="header"');
  });

  it('шапка не задвоилась', () => {
    expect((body(html).match(/data-checkout-slot="header"/g) ?? []).length).toBe(1);
  });

  it('полоса стоит первым узлом сплита, до строки колонок', () => {
    expect(headerIsOwnStrip(html)).toBe(true);
  });

  it('порядок: сначала полоса, потом обе колонки', () => {
    const m = body(html);
    expect(m.indexOf('data-checkout-topbar')).toBeLessThan(
      m.indexOf('data-checkout-pane="form"'),
    );
    expect(m.indexOf('data-checkout-pane="form"')).toBeLessThan(
      m.indexOf('data-checkout-pane="summary"'),
    );
  });

  it('шапку не передали — полосы нет, колонки не ломаются', () => {
    const bare = checkoutSplitMarkup(FORM, SUMMARY);
    expect(body(bare)).not.toContain('data-checkout-slot="header"');
    expect(body(bare)).not.toContain('data-checkout-topbar');
    expect(bare).toContain('data-checkout-pane="form"');
    expect(bare).toContain('data-checkout-pane="summary"');
  });

  it('САБОТАЖ: прежняя раскладка (шапка ВНУТРИ колонки формы) отвергается', () => {
    const old =
      '<style></style><div class="mfy-checkout-split">' +
      '<div class="mfy-checkout-cols" data-checkout-cols>' +
      '<div class="mfy-checkout-pane" data-checkout-pane="form">' +
      '<div class="mfy-checkout-pane__inner" data-checkout-column="form">' +
      HEADER +
      FORM +
      '</div></div>' +
      '<div class="mfy-checkout-pane" data-checkout-pane="summary">' +
      SUMMARY +
      '</div></div></div>';
    expect(headerIsOwnStrip(old)).toBe(false);
  });

  it('САБОТАЖ: шапка внутри колонки сводки отвергается', () => {
    const wrong = checkoutSplitMarkup(FORM, HEADER + SUMMARY);
    expect(headerIsOwnStrip(wrong)).toBe(false);
  });

  it('САБОТАЖ: полоса ПОСЛЕ колонок отвергается', () => {
    const wrong = checkoutSplitMarkup(FORM, SUMMARY).replace(
      '</div></div>',
      `</div><div class="mfy-checkout-topbar" data-checkout-topbar>${HEADER}</div></div>`,
    );
    expect(headerIsOwnStrip(wrong)).toBe(false);
  });
});

// ── 2. Общий компонент витрины кладёт слот туда же ─────────────────────────

describe('CheckoutSplit.astro: слот шапки — своя полоса', () => {
  const src = read('packages/theme-base/blocks/CheckoutLayout/CheckoutSplit.astro');

  it('слот шапки объявлен', () => {
    expect(src).toContain('name="header"');
  });

  it('слот шапки стоит в полосе, до строки колонок', () => {
    const strip = src.indexOf('data-checkout-topbar');
    const cols = src.indexOf('data-checkout-cols');
    const formPane = src.indexOf('data-checkout-pane="form"');
    const headerSlot = src.indexOf('name="header"');
    expect(strip).toBeGreaterThan(-1);
    expect(headerSlot).toBeGreaterThan(strip);
    expect(headerSlot).toBeLessThan(cols);
    expect(headerSlot).toBeLessThan(formPane);
  });
});

// ── 3. Пять тем: шапка идёт слотом, Layout её не рисует ────────────────────

describe.each(THEMES)('тема %s: шапка приходит слотом сплита', (theme) => {
  const layout = read(`themes/${theme}/src/layouts/Layout.astro`);
  const page = read(`themes/${theme}/src/pages/checkout.astro`);

  it('Layout больше не рисует CheckoutHeader сам', () => {
    expect(layout).not.toMatch(/<CheckoutHeader\b/);
  });

  it('жёсткой обёртки color-scheme-2 вокруг шапки в Layout не осталось', () => {
    // Она перебивала выбранную схему: логотип оставался в scheme-2 на любой
    // поверхности.
    expect(layout).not.toMatch(/color-scheme-2[^>]*--size-checkout-brand/);
  });

  it('страница чекаута отдаёт шапку в слот', () => {
    expect(page).toMatch(/<CheckoutHeader[^>]*slot="header"/s);
  });

  it('подвала на чекауте нет вообще (владелец, 14.09)', () => {
    // Правило целиком и цена возврата — checkout-footer-legal.spec.ts.
    expect(layout).not.toMatch(/<CheckoutFooterStrip\b/);
    expect(layout).not.toContain('CheckoutFooterStrip');
  });
});

// ── 4. Стили полосы: свои размеры, своя палитра ────────────────────────────

describe('общая split-таблица стилей знает про полосу шапки', () => {
  it('полоса во всю ширину и не сжимается строкой колонок', () => {
    expect(CHECKOUT_SPLIT_CSS).toMatch(/\.mfy-checkout-topbar\s*\{[^}]*width:\s*100%/);
    expect(CHECKOUT_SPLIT_CSS).toMatch(/\.mfy-checkout-topbar\s*\{[^}]*flex:\s*none/);
  });

  it('полоса не липкая — иначе наезжает на липкую сводку', () => {
    expect(CHECKOUT_SPLIT_CSS).toMatch(
      /\.mfy-checkout-topbar\s+\[data-checkout-slot="header"\][^}]*position:\s*static/,
    );
  });

  it('размеры логотипа остались в общей таблице, а не вернулись в Layout', () => {
    expect(CHECKOUT_SPLIT_CSS).toContain('--size-checkout-brand:');
    expect(CHECKOUT_SPLIT_CSS).toContain('--size-checkout-brand-image:');
  });

  it('палитру у полосы больше не отнимают — своя схема снова работает', () => {
    // Третий круг гасил её фон и подменял цвет переменной колонки
    // (`--checkout-pane-heading`). Полоса стоит отдельно — гасить нечего.
    expect(CHECKOUT_SPLIT_CSS).not.toContain('--checkout-pane-heading');
    expect(CHECKOUT_SPLIT_CSS).not.toMatch(
      /\[data-checkout-slot="header"\][^}]*background:\s*transparent/,
    );
  });

  it('контейнер шапки больше не расплющивают под ширину формы', () => {
    // «Придать свои размеры»: контейнер блока (max-w-[var(--container-max-width)]
    // + px-4/md:px-8) остаётся его собственным.
    expect(CHECKOUT_SPLIT_CSS).not.toMatch(
      /\[data-checkout-slot="header"\]\s*>\s*div[^}]*max-width:\s*none/,
    );
  });

  it('строка колонок делит экран пополам только на десктопе', () => {
    const desktop = CHECKOUT_SPLIT_CSS.slice(
      CHECKOUT_SPLIT_CSS.indexOf('@media (min-width: 1024px)'),
    );
    expect(desktop).toMatch(/\.mfy-checkout-cols\s*\{[^}]*flex-direction:\s*row/);
    expect(desktop).toMatch(/\.mfy-checkout-pane\s*\{[^}]*width:\s*50%/);
  });

  it('липкость сводки не тронута (баги 17/18-Б)', () => {
    expect(CHECKOUT_SPLIT_CSS).toContain('position: sticky');
    expect(CHECKOUT_SPLIT_CSS).toContain('--checkout-summary-top');
  });

  it('поверхности колонок на месте (16.09: сводка = «Фон», отдельной поверхности больше нет)', () => {
    expect(CHECKOUT_SPLIT_CSS).toMatch(
      /\[data-checkout-pane="summary"\][^}]*background:\s*rgb\(var\(--color-bg/,
    );
    expect(CHECKOUT_SPLIT_CSS).toMatch(/min-height:\s*100dvh/);
  });
});

// ── 5. Сборка подменяет шапку В ПОЛОСЕ, а не в колонке ────────────────────

describe('мерчантская шапка садится на место прежней — в полосе', () => {
  const MERCHANT =
    '<header data-checkout-slot="header"><img src="/logo.svg" alt="Лого"></header>';

  it('подменённая шапка остаётся полосой', () => {
    const out = injectCheckoutChromeIntoHtml(
      checkoutSplitMarkup(FORM, SUMMARY, HEADER),
      { headerHtml: MERCHANT, footerHtml: null },
    );
    expect(out).toContain('/logo.svg');
    expect(headerIsOwnStrip(out)).toBe(true);
  });

  it('схемы обеих колонок применяются одновременно с подменой шапки', () => {
    // п.5 владельца (14.09): левая колонка тоже красится своей схемой.
    const out = injectCheckoutChromeIntoHtml(
      checkoutSplitMarkup(FORM, SUMMARY, HEADER),
      { headerHtml: MERCHANT, footerHtml: null },
      { form: { scheme: 'scheme-1' }, summary: { scheme: 4 } },
    );
    expect(/<div\b[^>]*data-checkout-pane="form"/.exec(out)![0]).toContain(
      'color-scheme-1',
    );
    expect(/<div\b[^>]*data-checkout-pane="summary"/.exec(out)![0]).toContain(
      'color-scheme-4',
    );
    expect(headerIsOwnStrip(out)).toBe(true);
  });

  it('шапка не собралась — полоса остаётся со своей', () => {
    const out = injectCheckoutChromeIntoHtml(
      checkoutSplitMarkup(FORM, SUMMARY, HEADER),
      { headerHtml: null, footerHtml: null },
    );
    expect(headerIsOwnStrip(out)).toBe(true);
  });
});

// ── 6. Превью конструктора = витрина ───────────────────────────────────────

describe('превью конструктора собирает ту же раскладку', () => {
  const preview = read('src/services/preview.service.ts');

  it('шапка едет в общую разметку слотом, а не отдельной частью перед сеткой', () => {
    const grid = preview.slice(preview.indexOf('private wrapCheckoutGrid'));
    expect(grid).toContain('checkoutSplitMarkup');
    expect(grid).toMatch(/headerHtml/);
  });

  it('CheckoutHeader на чекауте не выкладывается в общий поток', () => {
    const walk = preview.slice(
      preview.indexOf('if (isMegaCheckout)'),
      preview.indexOf('const previewTailwind'),
    );
    expect(walk).toContain("type === 'CheckoutHeader'");
  });
});
