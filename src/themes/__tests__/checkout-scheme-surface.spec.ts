/**
 * П.4 третьего круга («очень плохо работают цветовые схемы») + УТОЧНЕНИЕ
 * владельца после него, которое отменяет половину прошлого эталона:
 *
 *   «Левая часть от нас. Там только меняется цвет кнопки и юр инфа цвет.
 *    Всё остальное наше. А правая часть как в скрине».
 *
 * Значит:
 *   ПРАВАЯ колонка — поверхность, покрашенная схемой «Сводки заказа»: сплошной
 *     цвет от верха до низа окна и до правого края, текст из той же схемы.
 *     Это прошлый круг, он в силе и НЕ трогается.
 *   ЛЕВАЯ колонка — фон ТЕМЫ (палитра страницы чекаута). Из схемы «Оформления
 *     заказа» она берёт РОВНО один элемент — кнопку оформления. Второго
 *     «схемного» элемента внизу больше нет: правовую полосу с копирайтом
 *     владелец снял 14.09 («УДАЛИТЬ В ЧЕКАУТЕ»), см.
 *     checkout-footer-legal.spec.ts.
 *
 * Замер снятия заливки — собранные витрины пяти тем, Chromium, 1440×900 и
 * 390×844, корзина 1/3/30, 13-14.09. Колонка формы 0..720:
 *                 ДО (схема формы красила)               ПОСЛЕ (любая схема)
 *   rose      scheme-3 245,240,235 / scheme-4 0,0,0       255,255,255
 *   flux      scheme-3 250,250,250 / scheme-1 0,0,0       255,255,255
 *   satin     scheme-3 245,245,245 / scheme-4 8,2,0       255,255,255
 *   bloom     scheme-3 255,255,255 / scheme-1 207,122,139 255,255,255
 *   vanilla   scheme-3 238,238,238 / scheme-4 255,255,255 58,69,48
 * «ПОСЛЕ» = значение при НЕ выбранной схеме, то есть картина до cb182717.
 * Правая колонка в обоих замерах одинакова; кнопка цвета схемы не потеряла.
 *
 * Проверяем ровно это: схема сводки — на колонке; схема формы — на кнопке, и
 * ни на колонке, ни на секции формы; разметка и стили одни на пять тем и на
 * превью.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  injectCheckoutChromeIntoHtml,
  patchCheckoutColumnScheme,
} from '../chrome-assembler';
import { PREVIEW_CHECKOUT_COLUMN_SCHEME_SOURCE } from '../../services/preview.service';

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

// ── 1б. У формы схема садится на КНОПКУ, а не на корень секции ─────────────
//
// Уточнение владельца: «левая часть от нас… только цвет кнопки». Корень формы
// несёт `bg-[rgb(var(--color-bg))]` — класс схемы на нём заливал бы всю форму
// «пятном» (это и был замер «до»: 0..720 `rgb(0,0,0)` на scheme-1). Корень
// «Кнопки оплаты» — `w-full`, он не красит ничего, поэтому схема на нём меняет
// ровно цвет кнопки (`--color-button-bg`/`--color-button-text`).

const tagOf = (html: string, block: string) =>
  new RegExp(`<section\\b[^>]*\\bdata-block="${block}"[^>]*>`).exec(html)?.[0] ?? '';

describe('схема «Оформления заказа» красит кнопку, а не форму', () => {
  it.each([['scheme-3'], [3], ['3']])('%p → класс на секции кнопки', (value) => {
    const html = renderBaseBlock('CheckoutForm', { id: 'CheckoutForm-1', colorScheme: value });
    expect(tagOf(html, 'checkout-submit')).toContain('color-scheme-3');
  });

  it('корень формы остаётся БЕЗ класса схемы (иначе — пятно под контентом)', () => {
    const html = renderBaseBlock('CheckoutForm', {
      id: 'CheckoutForm-1',
      colorScheme: 'scheme-3',
    });
    expect(tagOf(html, 'checkout-form')).not.toMatch(/color-scheme-\d/);
  });

  it('САБОТАЖ: схемы нет — нет и класса на кнопке', () => {
    const html = renderBaseBlock('CheckoutForm', { id: 'CheckoutForm-1' });
    expect(tagOf(html, 'checkout-submit')).not.toMatch(/color-scheme-\d/);
  });

  it('корень кнопки ничего не красит: ни фона, ни цвета текста', () => {
    const classes = read('packages/theme-base/blocks/CheckoutSubmit/CheckoutSubmit.classes.ts');
    expect(classes).toMatch(/root:\s*'w-full'/);
  });

  it('кнопка берёт цвет токенами схемы — тем же, чем в обычных секциях', () => {
    const classes = read('packages/theme-base/blocks/CheckoutSubmit/CheckoutSubmit.classes.ts');
    expect(classes).toContain('--color-button-bg');
    expect(classes).toContain('--color-button-text');
  });
});

// ── 2. Схема едет на КОЛОНКУ, а не только на секцию ────────────────────────

const PANE_HTML = `<!doctype html><html><body>
<div class="mfy-checkout-split">
  <div class="mfy-checkout-pane mfy-checkout-pane--form" data-checkout-pane="form">
    <div class="mfy-checkout-pane__inner" data-checkout-column="form">
      <section class="relative w-full" data-block="checkout-form">форма
        <section class="w-full" data-block="checkout-submit">кнопка</section>
      </section>
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
const sectionTag = (html: string, block: string) =>
  new RegExp(`<section\\b[^>]*\\bdata-block="${block}"[^>]*>`).exec(html)?.[0] ?? '';

describe('класс схемы сводки — на правой колонке', () => {
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
});

/**
 * САМОЕ ВАЖНОЕ МЕСТО ЭТОГО ФАЙЛА.
 *
 * Границу «что красит схема» двигали дважды, поэтому она здесь зафиксирована
 * поимённо:
 *   • третий круг сузил покраску до правой колонки («левая часть от нас…
 *     только цвет кнопки и юр инфа цвет») — потому что секция «Оформление
 *     заказа» была карточкой 394px по центру колонки и класс схемы на ней
 *     красил «пятно»;
 *   • 14.09 карточки не стало (checkout-form-fills-column), и владелец
 *     вернулся с п.5 «к секции Оформление закаказа не применяется никакая
 *     цветовая схема». Замер подтвердил цену сужения: выбор схемы не менял на
 *     левой половине НИЧЕГО у 4 тем из 5.
 * Итог, который сторожит гард: КОЛОНКИ красятся обе, СЕКЦИИ внутри них — нет
 * (иначе полосы сверху и снизу), кнопка оформления по-прежнему со схемой.
 */
describe('общая доводка чекаута: обе колонки красятся своей схемой', () => {
  const out = injectCheckoutChromeIntoHtml(
    PANE_HTML,
    { headerHtml: null, footerHtml: null },
    { form: { scheme: 'scheme-1' }, summary: { scheme: 4 } },
  );

  it('правая колонка красится схемой «Сводки заказа»', () => {
    expect(paneTag(out, 'summary')).toContain('color-scheme-4');
  });

  it('ЛЕВАЯ колонка красится схемой «Оформления заказа»', () => {
    // 14.09, п.5 владельца: «к секции Оформление закаказа не применяется
    // никакая цветовая схема». Третий круг сужал её до одной кнопки, потому что
    // секция была карточкой 394px по центру колонки и класс схемы на ней давал
    // «пятно»; карточки больше нет (checkout-form-fills-column), поэтому схема
    // снова красит КОЛОНКУ — как и у сводки.
    expect(paneTag(out, 'form')).toContain('color-scheme-1');
  });

  it('секция формы тоже без класса схемы (красит КОЛОНКА, не секция)', () => {
    // На корне секции класс дал бы полосы сверху и снизу: у колонки свои
    // вертикальные отступы, и секция короче её на 64+64px.
    expect(sectionTag(out, 'checkout-form')).not.toMatch(/color-scheme-\d/);
  });

  it('схема формы доезжает до кнопки оформления', () => {
    expect(sectionTag(out, 'checkout-submit')).toContain('color-scheme-1');
  });

  it('идемпотентно: повторная доводка ничего не дублирует', () => {
    const twice = injectCheckoutChromeIntoHtml(
      out,
      { headerHtml: null, footerHtml: null },
      { form: { scheme: 'scheme-1' }, summary: { scheme: 4 } },
    );
    expect(twice).toBe(out);
  });

  it('САБОТАЖ: схем нет — ни один класс не появляется', () => {
    const bare = injectCheckoutChromeIntoHtml(
      PANE_HTML,
      { headerHtml: null, footerHtml: null },
      {},
    );
    expect(bare).not.toMatch(/color-scheme-\d/);
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
    // 14.09, п.4: поверх `--color-surface` появился `--color-checkout-surface`
    // — его считает buildTokensCss, когда мерчант перекрасил «Фон» схемы
    // (поля `surfaceBg` в редакторе схем нет). Фолбэк прежний, поэтому
    // магазины, где схему не трогали, выглядят как раньше.
    expect(css).toMatch(
      /\[data-checkout-pane="summary"\][^}]*background:\s*rgb\(var\(--color-checkout-surface,\s*var\(--color-surface/,
    );
  });

  it('колонка формы красится токеном схемы', () => {
    // Без выбранной схемы `--color-bg` приходит от палитры страницы — это фон
    // темы; с выбранной — «Фон» схемы (п.5).
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

  /**
   * Живая правка схемы в конструкторе (`update-block`) обязана давать то же,
   * что перезагрузка: правую колонку красим, левую — нет. Исполняем РОВНО ту
   * строку, что уходит в кадр, а не её копию.
   */
  describe('агент превью красит обе колонки', () => {
    const applyCheckoutColumnScheme = new Function(
      `${PREVIEW_CHECKOUT_COLUMN_SCHEME_SOURCE}; return applyCheckoutColumnScheme;`,
    )() as (el: unknown, schemeId: string) => unknown;

    const paneStub = (kind: 'form' | 'summary', className: string) => {
      const pane = {
        className,
        getAttribute: (name: string) => (name === 'data-checkout-pane' ? kind : null),
      };
      return { pane, el: { closest: () => pane } };
    };

    it('сводка: класс схемы садится на колонку', () => {
      const { pane, el } = paneStub('summary', 'mfy-checkout-pane');
      applyCheckoutColumnScheme(el, '4');
      expect(pane.className).toContain('color-scheme-4');
    });

    it('сводка: схему сняли — класс снят', () => {
      const { pane, el } = paneStub('summary', 'mfy-checkout-pane color-scheme-4');
      applyCheckoutColumnScheme(el, '');
      expect(pane.className).not.toMatch(/color-scheme-\d/);
    });

    it('форма: класс схемы появляется (п.5, 14.09)', () => {
      const { pane, el } = paneStub('form', 'mfy-checkout-pane');
      applyCheckoutColumnScheme(el, '4');
      expect(pane.className).toContain('color-scheme-4');
    });

    it('форма: прошлая схема заменяется, а не копится', () => {
      const { pane, el } = paneStub('form', 'mfy-checkout-pane color-scheme-2');
      applyCheckoutColumnScheme(el, '4');
      expect(pane.className).toContain('color-scheme-4');
      expect(pane.className).not.toContain('color-scheme-2');
      expect(pane.className).toContain('mfy-checkout-pane');
    });

    it('форма: схему сняли — класс снят', () => {
      const { pane, el } = paneStub('form', 'mfy-checkout-pane color-scheme-2');
      applyCheckoutColumnScheme(el, '');
      expect(pane.className).not.toMatch(/color-scheme-\d/);
      expect(pane.className).toContain('mfy-checkout-pane');
    });

    it('вне колонок чекаута агент не вмешивается', () => {
      expect(applyCheckoutColumnScheme({ closest: () => null }, '4')).toBeNull();
    });
  });
});

// ── 6. Вспомогательные элементы колонки берут цвет из схемы ────────────────

describe('в колонке нет элементов с браузерным цветом', () => {
  const css = read(SPLIT_CSS);

  it('кнопка снятия промокода красится токеном схемы', () => {
    // <button> не наследует color (UA buttontext) — на тёмной поверхности
    // кнопка «Убрать ×» оставалась чёрной во всех пяти темах
    expect(css).toMatch(
      /\[data-checkout-pane\]\s*\[data-checkout-promo-remove\][^}]*color:\s*rgb\(var\(--color-/,
    );
  });

  it('правило живёт рядом с поверхностью, а не в теме', () => {
    for (const theme of THEMES) {
      const page = read(`themes/${theme}/src/pages/checkout.astro`);
      expect(page).not.toContain('data-checkout-promo-remove');
    }
  });
});
