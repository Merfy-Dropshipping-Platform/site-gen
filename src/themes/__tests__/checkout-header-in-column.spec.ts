/**
 * Эталон владельца (Shopify-подобный чекаут): ШАПКИ НАД КОЛОНКАМИ НЕТ.
 * Логотип стоит ВНУТРИ левой колонки, поэтому правая колонка — сплошная
 * поверхность от самого верха окна до самого низа, без белой полосы сверху.
 *
 * Замер «до» (собранные витрины пяти тем, Chromium, 1440×900, 2026-09-13):
 *   rose    — header 0..134.39, обе колонки начинаются с top=134.39;
 *   vanilla — header 0..132,    колонки с top=132;
 *   flux    — header 0..132,    колонки с top=132;
 *   satin   — header 0..132,    колонки с top=132;
 *   bloom   — header 0..132,    колонки с top=132.
 * То есть над цветной колонкой сводки во всех пяти темах висела белая полоса
 * высотой 132-134px — её владелец и обвёл на скриншоте («надо чтобы по
 * цветовым схемам встало»).
 *
 * Замера геометрии в CI нет (браузера нет), поэтому гард стоит на том, ЧЕМ
 * геометрия определяется: шапка обязана лежать ВНУТРИ колонки формы —
 * первым узлом её контентной обёртки, до формы; перед колонкой формы внутри
 * `.mfy-checkout-split` не должно быть НИЧЕГО. Пока это так, верх правой
 * колонки физически не может быть ниже верха левой.
 *
 * Саботаж-проверки повторяют прежнюю раскладку (шапка перед сплитом) и
 * требуют, чтобы тот же предикат её ОТВЕРГ.
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
 * упоминают `data-checkout-slot="header"`, и подсчёт вхождений по всей строке
 * врал бы.
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
 * Предикат эталона: шапка чекаута лежит внутри колонки формы, и перед этой
 * колонкой внутри сплита ничего нет. Один и тот же предикат применяется и к
 * новой разметке (обязан пропустить), и к прежней (обязан отвергнуть).
 */
function headerIsInFormColumn(html: string): boolean {
  const split = html.indexOf('<div class="mfy-checkout-split"');
  if (split < 0) return false;
  const header = html.search(/<header\b[^>]*\bdata-checkout-slot="header"/);
  if (header < 0) return false;
  // 1. Шапка — внутри колонки формы и НЕ внутри колонки сводки.
  if (!pane(html, 'form').includes('data-checkout-slot="header"')) return false;
  if (pane(html, 'summary').includes('data-checkout-slot="header"')) return false;
  // 2. Между открытием сплита и открытием колонки формы — только пробелы.
  const formOpen = new RegExp('<div\\b[^>]*\\bdata-checkout-pane="form"[^>]*>').exec(html)!;
  const splitOpenEnd = html.indexOf('>', split) + 1;
  if (html.slice(splitOpenEnd, formOpen.index).trim() !== '') return false;
  // 3. Шапка идёт ДО формы внутри колонки.
  const inner = pane(html, 'form');
  return inner.indexOf('data-checkout-slot="header"') < inner.indexOf('checkout-form');
}

// ── 1. Общая разметка сплита кладёт шапку внутрь колонки формы ─────────────

describe('шапка оформления живёт внутри левой колонки', () => {
  const html = checkoutSplitMarkup(FORM, SUMMARY, HEADER);

  it('шапка внутри колонки формы', () => {
    expect(pane(html, 'form')).toContain('data-checkout-slot="header"');
  });

  it('в колонке сводки шапки нет (не задвоилась)', () => {
    expect(pane(html, 'summary')).not.toContain('data-checkout-slot="header"');
    expect((body(html).match(/data-checkout-slot="header"/g) ?? []).length).toBe(1);
  });

  it('перед колонкой формы внутри сплита нет ничего', () => {
    expect(headerIsInFormColumn(html)).toBe(true);
  });

  it('порядок в колонке: сначала логотип, потом форма', () => {
    const inner = pane(html, 'form');
    expect(inner.indexOf('data-checkout-slot="header"')).toBeLessThan(
      inner.indexOf('checkout-form'),
    );
  });

  it('шапку не передали — разметка прежняя, колонки не ломаются', () => {
    const bare = checkoutSplitMarkup(FORM, SUMMARY);
    expect(body(bare)).not.toContain('data-checkout-slot="header"');
    expect(body(bare)).not.toContain('mfy-checkout-pane__inner--brand');
    expect(bare).toContain('data-checkout-pane="form"');
    expect(bare).toContain('data-checkout-pane="summary"');
  });

  it('САБОТАЖ: прежняя раскладка (шапка полосой НАД колонками) отвергается', () => {
    const old = HEADER + checkoutSplitMarkup(FORM, SUMMARY);
    expect(headerIsInFormColumn(old)).toBe(false);
  });

  it('САБОТАЖ: шапка внутри колонки сводки отвергается', () => {
    const wrong = checkoutSplitMarkup(FORM, SUMMARY).replace(
      SUMMARY,
      HEADER + SUMMARY,
    );
    expect(headerIsInFormColumn(wrong)).toBe(false);
  });

  it('САБОТАЖ: шапка ПОСЛЕ формы в той же колонке отвергается', () => {
    const wrong = checkoutSplitMarkup(FORM + HEADER, SUMMARY);
    expect(headerIsInFormColumn(wrong)).toBe(false);
  });
});

// ── 2. Общий компонент витрины кладёт слот туда же ─────────────────────────

describe('CheckoutSplit.astro: слот шапки — в колонке формы', () => {
  const src = read('packages/theme-base/blocks/CheckoutLayout/CheckoutSplit.astro');

  it('слот шапки объявлен', () => {
    expect(src).toContain('name="header"');
  });

  it('слот шапки стоит внутри колонки формы, до слота формы', () => {
    const formPane = src.indexOf('data-checkout-pane="form"');
    const summaryPane = src.indexOf('data-checkout-pane="summary"');
    const headerSlot = src.indexOf('name="header"');
    const formSlot = src.indexOf('name="form"');
    expect(headerSlot).toBeGreaterThan(formPane);
    expect(headerSlot).toBeLessThan(formSlot);
    expect(headerSlot).toBeLessThan(summaryPane);
  });
});

// ── 3. Пять тем: шапка ушла из Layout в колонку страницы чекаута ───────────

describe.each(THEMES)('тема %s: шапки над колонками нет', (theme) => {
  const layout = read(`themes/${theme}/src/layouts/Layout.astro`);
  const page = read(`themes/${theme}/src/pages/checkout.astro`);

  it('Layout больше не рисует CheckoutHeader полосой над контентом', () => {
    expect(layout).not.toMatch(/<CheckoutHeader\b/);
  });

  it('жёсткой обёртки color-scheme-2 вокруг шапки в Layout не осталось', () => {
    // Она перебивала схему колонки: логотип оставался в scheme-2 на любой
    // поверхности (на тёмной колонке — белая полоса под логотипом).
    expect(layout).not.toMatch(/color-scheme-2[^>]*--size-checkout-brand/);
  });

  it('страница чекаута отдаёт шапку в слот колонки', () => {
    expect(page).toMatch(/<CheckoutHeader[^>]*slot="header"/s);
  });

  it('правовая полоса подвала осталась (баг 18-А не откатывается)', () => {
    expect(layout).toMatch(/<CheckoutFooterStrip\b/);
  });
});

// ── 4. Стили: логотип в отступах формы, без липкости и без своей полосы ────

describe('общая split-таблица стилей знает про шапку в колонке', () => {
  it('колонка с шапкой не добавляет свой верхний отступ поверх её padding', () => {
    expect(CHECKOUT_SPLIT_CSS).toMatch(
      /\.mfy-checkout-pane__inner--brand[^}]*padding-top:\s*0/,
    );
  });

  it('на десктопе ноль повторён внутри медиазапроса (сокращённый padding колонки его перебивал)', () => {
    const desktop = CHECKOUT_SPLIT_CSS.slice(
      CHECKOUT_SPLIT_CSS.indexOf('@media (min-width: 1024px)'),
    );
    expect(desktop).toMatch(
      /\[data-checkout-pane="form"\]\s+\.mfy-checkout-pane__inner--brand[^}]*padding-top:\s*0/,
    );
  });

  it('шапка в колонке не липкая (иначе логотип висит над полями формы)', () => {
    expect(CHECKOUT_SPLIT_CSS).toMatch(
      /\[data-checkout-pane\][^{]*\[data-checkout-slot="header"\][^}]*position:\s*static/,
    );
  });

  it('логотип в тех же отступах, что форма: контейнер шапки без своих полей', () => {
    expect(CHECKOUT_SPLIT_CSS).toMatch(/max-width:\s*none/);
    expect(CHECKOUT_SPLIT_CSS).toMatch(/padding-left:\s*0/);
    expect(CHECKOUT_SPLIT_CSS).toMatch(/padding-right:\s*0/);
  });

  it('шапка в колонке не красит свою поверхность (иначе «пятно» под логотипом)', () => {
    expect(CHECKOUT_SPLIT_CSS).toMatch(
      /\[data-checkout-pane\][^{]*\[data-checkout-slot="header"\][^}]*background:\s*transparent/,
    );
  });

  it('цвет логотипа считается НА КОЛОНКЕ, а не в шапке (иначе своя схема шапки его перекрасит)', () => {
    // var() подставляется в момент объявления: переменная объявлена на
    // [data-checkout-pane], поэтому внутри шапки она уже несёт значение
    // колонки, а не значение собственного класса схемы шапки.
    expect(CHECKOUT_SPLIT_CSS).toMatch(
      /\[data-checkout-pane\]\s*\{[^}]*--checkout-pane-heading:\s*var\(--color-heading/,
    );
    expect(CHECKOUT_SPLIT_CSS).toMatch(
      /\[data-checkout-slot="header"\]\s+a[^{]*\{[^}]*color:\s*rgb\(var\(--checkout-pane-heading/,
    );
  });

  it('липкость сводки не тронута (баги 17/18-Б)', () => {
    expect(CHECKOUT_SPLIT_CSS).toContain('position: sticky');
    expect(CHECKOUT_SPLIT_CSS).toContain('--checkout-summary-top');
  });

  it('поверхности колонок на месте (п.4 третьего круга)', () => {
    expect(CHECKOUT_SPLIT_CSS).toMatch(
      /\[data-checkout-pane="summary"\][^}]*background:\s*rgb\(var\(--color-surface/,
    );
    expect(CHECKOUT_SPLIT_CSS).toMatch(/min-height:\s*100dvh/);
  });
});

// ── 5. Сборка подменяет шапку ВНУТРИ колонки, а не над ней ────────────────

describe('мерчантская шапка садится на место прежней — внутри колонки', () => {
  const MERCHANT =
    '<header data-checkout-slot="header"><img src="/logo.svg" alt="Лого"></header>';

  it('подменённая шапка остаётся в колонке формы', () => {
    const out = injectCheckoutChromeIntoHtml(
      checkoutSplitMarkup(FORM, SUMMARY, HEADER),
      { headerHtml: MERCHANT, footerHtml: null },
    );
    expect(out).toContain('/logo.svg');
    expect(pane(out, 'form')).toContain('/logo.svg');
    expect(headerIsInFormColumn(out)).toBe(true);
  });

  // Уточнение владельца после третьего круга: красится только ПРАВАЯ колонка,
  // левая остаётся на палитре темы («Левая часть от нас… всё остальное наше»).
  // Здесь это важно ещё и потому, что шапка теперь ВНУТРИ левой колонки:
  // залитая колонка перекрашивала бы и логотип.
  it('схема сводки применяется одновременно с подменой шапки, левая колонка чистая', () => {
    const out = injectCheckoutChromeIntoHtml(
      checkoutSplitMarkup(FORM, SUMMARY, HEADER),
      { headerHtml: MERCHANT, footerHtml: null },
      { form: { scheme: 'scheme-1' }, summary: { scheme: 4 } },
    );
    expect(/<div\b[^>]*data-checkout-pane="form"/.exec(out)![0]).not.toMatch(
      /color-scheme-\d/,
    );
    expect(/<div\b[^>]*data-checkout-pane="summary"/.exec(out)![0]).toContain(
      'color-scheme-4',
    );
    expect(headerIsInFormColumn(out)).toBe(true);
  });

  it('шапка не собралась — колонка остаётся со своей, полоса над ней не появляется', () => {
    const out = injectCheckoutChromeIntoHtml(
      checkoutSplitMarkup(FORM, SUMMARY, HEADER),
      { headerHtml: null, footerHtml: null },
    );
    expect(headerIsInFormColumn(out)).toBe(true);
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
