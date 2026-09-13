import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Баг-репорт 17: «Правая часть чекаута статична. Ожидаемый: прокручивается
 * вместе с левой при скролле» → закрыт липкой сводкой (c3a2f8f9).
 *
 * Баг-репорт 18-Б (доработка): «Правая часть чекаута не до конца скролится.
 * Ожидаемый: прокручивается вместе с левой при скролле, позиции в чекауте
 * видны даже в самом низу».
 *
 * Замер «до» (прод, 2026-09-13, пять витрин на 9871f205, 1440×900, корзина из
 * реального каталога витрины, прокрутка страницы сверху донизу):
 *   тема      1 поз.  3 поз.  10 поз.        30 поз.
 *   rose      1 из 1  3 из 3  9 из 10        9 из 30
 *   vanilla   1 из 1  3 из 3  10 из 10       10 из 30
 *   flux      1 из 1  3 из 3  9 из 10        9 из 30
 *   satin     1 из 1  3 из 3  10 из 10       10 из 30
 *   bloom     1 из 1  3 из 3  9 из 10        9 из 30
 * Причина: `max-height: calc(100vh - 48px)` + `overflow-y: auto` превращали
 * сводку в отдельный скроллер. Прокрутка СТРАНИЦЫ до него не доставала (на 30
 * позициях за кромкой оставалось +2420…+2548px), а собственную полосу прокрутки
 * внутри колонки покупатель не находит — он крутит страницу.
 *
 * Лечение: колонку больше не режем. Сводка ниже экрана → липнет НИЗОМ
 * (отрицательный `top` в `--checkout-summary-top`), то есть едет вместе со
 * страницей, пока не покажет последнюю позицию. Сводка, помещающаяся в экран,
 * ведёт себя как раньше (`top: 24px`). Высоту меряет общий инлайн-скрипт блока
 * «Сводка заказа» — один на пять тем и на превью.
 */
const THEMES = ['rose', 'vanilla', 'bloom', 'satin', 'flux'] as const;
const ROOT = join(__dirname, '..', '..', '..');
const SUMMARY_BLOCK = 'packages/theme-base/blocks/CheckoutSummary/CheckoutSummary.astro';

const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Правило `[data-checkout-column="summary"] { … }` из исходника страницы. */
function summaryRule(css: string): string {
  return /\[data-checkout-column=["']summary["']\][\s\S]{0,500}?\}/.exec(css)?.[0] ?? '';
}

describe('сводка чекаута едет вместе с формой (баг 17)', () => {
  describe.each(THEMES)('тема %s', (theme) => {
    const src = () => read(`themes/${theme}/src/pages/checkout.astro`);

    it('колонка сводки помечена для липкости', () => {
      expect(src()).toContain('data-checkout-column="summary"');
    });

    it('на десктопе сводка липкая', () => {
      const css = src();
      expect(css).toMatch(/@media\s*\(min-width:\s*1024px\)/);
      expect(css).toMatch(/\[data-checkout-column=["']summary["']\][\s\S]{0,500}position:\s*sticky/);
    });

    it('липкость включается только на десктопе (мобильная колонка — в потоке)', () => {
      const css = src();
      const i = css.search(/\[data-checkout-column=["']summary["']\][\s\S]{0,500}?position:\s*sticky/);
      expect(i).toBeGreaterThan(-1);
      // Правило обязано лежать ВНУТРИ медиазапроса ≥1024px: между его открытием
      // и правилом не должно быть конца <style> (иначе правило глобальное).
      const before = css.slice(0, i);
      const mediaAt = before.lastIndexOf('@media');
      expect(mediaAt).toBeGreaterThan(-1);
      expect(before.slice(mediaAt)).toMatch(/min-width:\s*1024px/);
      expect(before.slice(mediaAt)).not.toContain('</style>');
    });
  });

  it('превью конструктора — то же правило (зеркало wrapCheckoutGrid)', () => {
    const preview = read('src/services/preview.service.ts');
    const grid = preview.slice(preview.indexOf('wrapCheckoutGrid'));
    expect(grid).toMatch(/\[data-checkout-column=["']summary["']\][\s\S]{0,500}position:\s*sticky/);
  });
});

describe('длинный заказ виден до последней позиции (баг 18-Б)', () => {
  const sources: Array<[string, () => string]> = [
    ...THEMES.map(
      (t) => [`тема ${t}`, () => read(`themes/${t}/src/pages/checkout.astro`)] as [string, () => string],
    ),
    [
      'превью конструктора',
      () => {
        const preview = read('src/services/preview.service.ts');
        return preview.slice(preview.indexOf('wrapCheckoutGrid'));
      },
    ],
  ];

  it.each(sources)('%s: колонку сводки не режут собственным скроллом', (_name, get) => {
    const rule = summaryRule(get());
    expect(rule).not.toMatch(/max-height:/);
    expect(rule).not.toMatch(/overflow-y:\s*auto/);
    expect(rule).not.toMatch(/overscroll-behavior:/);
  });

  it.each(sources)('%s: верхний отступ приходит переменной, которую считает блок', (_name, get) => {
    const rule = summaryRule(get());
    expect(rule).toMatch(/top:\s*var\(--checkout-summary-top/);
    // Запасное значение = прежние 24px: сводка, помещающаяся в экран, ведёт
    // себя как до правки, даже если скрипт не успел отработать.
    expect(rule).toMatch(/--checkout-summary-top,\s*24px/);
  });
});

/**
 * Скрипт живёт ОДИН на пять тем — в общем блоке «Сводка заказа». Гоняем его
 * настоящее тело (как preview-nav-agent/CheckoutSubmit): вычисление отступа
 * проверяется поведением, а не наличием строки.
 */
describe('общий скрипт сводки считает отступ по высоте (баг 18-Б)', () => {
  const scriptBody = (): string => {
    const src = read(SUMMARY_BLOCK);
    const m = /<script\b[^>]*data-checkout-summary-fit-script[^>]*>([\s\S]*?)<\/script>/i.exec(src);
    if (!m) throw new Error('в CheckoutSummary.astro нет скрипта подгонки сводки');
    return m[1];
  };

  /** Минимальный DOM-стенд: столько, сколько трогает скрипт. */
  function run(opts: { summaryHeight: number; viewport: number }) {
    const styles: Record<string, string> = {};
    const attrs: Record<string, string> = {};
    let resizeCb: (() => void) | null = null;
    const column = {
      style: {
        setProperty: (k: string, v: string) => {
          styles[k] = v;
        },
      },
      getBoundingClientRect: () => ({ height: opts.summaryHeight }),
      hasAttribute: (k: string) => k in attrs,
      setAttribute: (k: string, v: string) => {
        attrs[k] = v;
      },
      closest: () => null,
    };
    const section = {
      closest: (sel: string) => (sel.includes('checkout-column') ? column : null),
    };
    const win: Record<string, unknown> = {
      innerHeight: opts.viewport,
      __merfyRoot: () => section,
      addEventListener: (type: string, cb: () => void) => {
        if (type === 'resize') resizeCb = cb;
      },
      ResizeObserver: class {
        constructor(private cb: () => void) {}
        observe() {
          /* высоту меняем вручную в тесте */
        }
        disconnect() {}
      },
      requestAnimationFrame: (cb: () => void) => {
        cb();
        return 0;
      },
      setTimeout: (cb: () => void) => {
        cb();
        return 0 as unknown as NodeJS.Timeout;
      },
    };
    const doc = {
      querySelector: () => section,
      addEventListener: () => {},
      readyState: 'complete',
    };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    new Function('window', 'document', 'blockId', scriptBody())(win, doc, 'checkout-summary');
    return { styles, attrs, fireResize: () => resizeCb?.() };
  }

  it('короткая сводка липнет к верху — прежние 24px', () => {
    const { styles } = run({ summaryHeight: 400, viewport: 900 });
    expect(styles['--checkout-summary-top']).toBe('24px');
  });

  it('сводка выше экрана липнет НИЗОМ — отступ отрицательный', () => {
    // 30 позиций ≈ 3272px при экране 900: 900 - 24 - 3272 = -2396px.
    const { styles } = run({ summaryHeight: 3272, viewport: 900 });
    expect(styles['--checkout-summary-top']).toBe('-2396px');
  });

  it('сводка ровно по экрану не уходит в минус', () => {
    const { styles } = run({ summaryHeight: 852, viewport: 900 });
    expect(styles['--checkout-summary-top']).toBe('24px');
  });

  it('пересчитывается при изменении размера окна', () => {
    const { styles, fireResize } = run({ summaryHeight: 3272, viewport: 900 });
    expect(styles['--checkout-summary-top']).toBe('-2396px');
    fireResize();
    expect(styles['--checkout-summary-top']).toBe('-2396px');
  });

  it('не навешивается дважды на одну колонку (hot-replace конструктора)', () => {
    const { attrs } = run({ summaryHeight: 400, viewport: 900 });
    expect(Object.keys(attrs)).toContain('data-checkout-summary-fit');
  });
});
