/**
 * Секция «Оформление заказа» = ВСЯ ЛЕВАЯ КОЛОНКА, а не карточка внутри неё.
 *
 * Владелец, 14.09, пункт 1 из трёх по странице оформления: «Оформление заказа
 * секция идет все левое пространство до кнопки оплаты».
 *
 * ЗАМЕР «ДО» (собранные витрины пяти тем + сборка хрома, Chromium, 1440×900,
 * корзина 3 позиции, 14.09, main 63a9b672). Колонка формы и секция в ней:
 *
 *   тема      колонка формы      СЕКЦИЯ «Оформление заказа»
 *   rose      x=0   w=720        x=298 w=394
 *   vanilla   x=0   w=720        x=298 w=394
 *   flux      x=0   w=720        x=298 w=394
 *   satin     x=0   w=720        x=298 w=394
 *   bloom     x=0   w=720        x=298 w=394
 *
 * То есть секция занимала 394 из 720 — полоску по центру колонки. Это ровно
 * то, что канон чекаута запрещает («поверхность от края до края и на всю
 * высоту, а не карточка внутри»), только про границы секции, а не про заливку.
 *
 * ПРИЧИНА была не в секции, а в том, ЧТО держит меру: её держала ОБЁРТКА
 * колонки — `max-width: 446px` + прижатие вправо на `.mfy-checkout-pane__inner`.
 * Секция несёт `w-full`, поэтому шире обёртки быть физически не могла.
 *
 * ЛЕЧЕНИЕ: мера переехала на СОДЕРЖИМОЕ колонки — на шапку оформления и на
 * под-секции формы. Числа те же (446 + 24/28 на десктопе, 540 + 16 на
 * мобилке), поэтому поля не сдвинулись; сдвинулись только границы секции.
 *
 * ЗАМЕР «ПОСЛЕ» (та же цепочка): секция x=0 w=720 у всех пяти тем, при этом
 * контакты/доставка/оплата/кнопка/условия остались x=298 w=394.
 *
 * Браузера в CI нет, поэтому гард стоит на том, ЧЕМ геометрия определяется:
 * на разрешённом каскаде общего `CHECKOUT_SPLIT_CSS` (одна копия на пять тем
 * и на превью конструктора). Саботаж ниже возвращает прежнее правило и
 * требует, чтобы предикат его ОТВЕРГ.
 */
import { CheckoutFormClasses } from '../../../packages/theme-base/blocks/CheckoutForm/CheckoutForm.classes';
import { CHECKOUT_SPLIT_CSS } from '../../../packages/theme-base/blocks/CheckoutLayout/checkout-split';

// ── крошечный разрешатель каскада ──────────────────────────────────────────

interface Rule {
  selector: string;
  decls: Record<string, string>;
  /** 0 — вне медиазапроса, 1 — внутри `@media (min-width: 1024px)`. */
  media: 0 | 1;
  order: number;
}

/** Раскрытие шорткатов, которые реально встречаются в этой таблице стилей. */
function expand(prop: string, value: string): Record<string, string> {
  if (prop !== 'padding' && prop !== 'margin') return { [prop]: value };
  const p = value.trim().split(/\s+/);
  const [top, right, bottom, left] =
    p.length === 1
      ? [p[0], p[0], p[0], p[0]]
      : p.length === 2
        ? [p[0], p[1], p[0], p[1]]
        : p.length === 3
          ? [p[0], p[1], p[2], p[1]]
          : [p[0], p[1], p[2], p[3]];
  return {
    [`${prop}-top`]: top,
    [`${prop}-right`]: right,
    [`${prop}-bottom`]: bottom,
    [`${prop}-left`]: left,
  };
}

function parse(css: string): Rule[] {
  const rules: Rule[] = [];
  let order = 0;
  let media: 0 | 1 = 0;
  // Комментарии выкусываем: внутри них встречаются и `{`, и селекторы.
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  let mediaEnd = -1;
  const mediaOpen = src.indexOf('@media (min-width: 1024px)');
  if (mediaOpen !== -1) mediaEnd = src.length;
  while ((m = re.exec(src))) {
    const rawSel = m[1].trim();
    if (rawSel.startsWith('@media')) {
      media = 1;
      continue;
    }
    if (mediaOpen !== -1 && m.index > mediaOpen && m.index < mediaEnd) media = 1;
    const decls: Record<string, string> = {};
    for (const chunk of m[2].split(';')) {
      const i = chunk.indexOf(':');
      if (i === -1) continue;
      Object.assign(
        decls,
        expand(chunk.slice(0, i).trim(), chunk.slice(i + 1).trim()),
      );
    }
    for (const selector of rawSel.split(',').map((s) => s.trim())) {
      if (selector) rules.push({ selector, decls, media, order: order++ });
    }
  }
  return rules;
}

/** Специфичность (a,b,c) достаточно грубая: id / класс-атрибут-псевдо / тип. */
function specificity(selector: string): number {
  const ids = (selector.match(/#[\w-]+/g) ?? []).length;
  const classes = (selector.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g) ?? []).length;
  const types = (selector.match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
  return ids * 10000 + classes * 100 + types;
}

/**
 * Разрешённое значение свойства для «элемента», описанного списком селекторов,
 * которые на него попадают. Порядок: сначала специфичность, при равной —
 * позиция в файле; правила из медиазапроса применяются только на десктопе.
 */
function resolve(
  rules: Rule[],
  matching: string[],
  prop: string,
  viewport: 'mobile' | 'desktop',
): string | undefined {
  const hits = rules
    .filter((r) => matching.includes(r.selector))
    .filter((r) => (viewport === 'desktop' ? true : r.media === 0))
    .filter((r) => r.decls[prop] !== undefined)
    .sort((a, b) => {
      if (a.media !== b.media) return a.media - b.media;
      const s = specificity(a.selector) - specificity(b.selector);
      return s !== 0 ? s : a.order - b.order;
    });
  return hits.length ? hits[hits.length - 1].decls[prop] : undefined;
}

/** Обёртка колонки формы (со слотом шапки — как на всех живых страницах). */
const FORM_INNER = [
  '.mfy-checkout-pane__inner',
  '.mfy-checkout-pane__inner--brand',
  '[data-checkout-pane="form"] .mfy-checkout-pane__inner',
  '[data-checkout-pane="form"] .mfy-checkout-pane__inner--brand',
];
/** Под-секция формы (контакты / доставка / оплата / кнопка / условия). */
const FORM_CHILD = ['[data-checkout-pane="form"] [data-block="checkout-form"] > *'];
/** Шапка оформления внутри колонки. */
const HEADER = [
  '[data-checkout-pane] [data-checkout-slot="header"]',
  '[data-checkout-pane="form"] [data-checkout-slot="header"]',
];

const RULES = parse(CHECKOUT_SPLIT_CSS);

/** Предикат, который сторожим. Вынесен, чтобы саботаж гонял ЕГО ЖЕ. */
function columnDoesNotConstrainWidth(css: string): boolean {
  const rules = parse(css);
  const maxW = resolve(rules, FORM_INNER, 'max-width', 'desktop');
  const padL = resolve(rules, FORM_INNER, 'padding-left', 'desktop');
  const padR = resolve(rules, FORM_INNER, 'padding-right', 'desktop');
  const marL = resolve(rules, FORM_INNER, 'margin-left', 'desktop');
  return maxW === 'none' && padL === '0' && padR === '0' && marL === '0';
}

describe('калибровка: разрешатель каскада читает эту таблицу стилей', () => {
  it('правила вообще разобраны', () => {
    expect(RULES.length).toBeGreaterThan(15);
    expect(RULES.some((r) => r.media === 1)).toBe(true);
  });

  it('колонка сводки не тронута — читаем её прежнее значение', () => {
    expect(
      resolve(RULES, ['[data-checkout-pane="summary"] .mfy-checkout-pane__inner'], 'max-width', 'desktop'),
    ).toBe('556px');
  });

  it('обе колонки по-прежнему по половине экрана', () => {
    expect(resolve(RULES, ['.mfy-checkout-pane'], 'width', 'desktop')).toBe('50%');
  });
});

describe('колонка формы больше не сужает секцию', () => {
  it('десктоп: у обёртки колонки нет своей ширины и боковых отступов', () => {
    expect(resolve(RULES, FORM_INNER, 'max-width', 'desktop')).toBe('none');
    expect(resolve(RULES, FORM_INNER, 'padding-left', 'desktop')).toBe('0');
    expect(resolve(RULES, FORM_INNER, 'padding-right', 'desktop')).toBe('0');
    expect(resolve(RULES, FORM_INNER, 'margin-left', 'desktop')).toBe('0');
  });

  it('мобилка: то же самое', () => {
    expect(resolve(RULES, FORM_INNER, 'max-width', 'mobile')).toBe('none');
    expect(resolve(RULES, FORM_INNER, 'padding-left', 'mobile')).toBe('0');
    expect(resolve(RULES, FORM_INNER, 'padding-right', 'mobile')).toBe('0');
  });

  it('вертикальные отступы колонки сохранены (64/32 + ноль под шапкой)', () => {
    // Их нельзя переносить на корень секции: `CheckoutForm` печатает
    // padding-top/bottom ИНЛАЙНОМ из своего скрытого параметра «Отступы».
    expect(resolve(RULES, ['[data-checkout-pane="form"] .mfy-checkout-pane__inner'], 'padding-top', 'desktop')).toBe('64px');
    expect(resolve(RULES, FORM_INNER, 'padding-bottom', 'desktop')).toBe('64px');
    expect(resolve(RULES, FORM_INNER, 'padding-top', 'desktop')).toBe('0');
  });

  it('секция тянется на всю ширину колонки (w-full на корне)', () => {
    expect(CheckoutFormClasses.root).toContain('w-full');
  });
});

describe('мера контента переехала на содержимое колонки', () => {
  it('десктоп: под-секции формы держат прежние 446 + 24/28', () => {
    expect(resolve(RULES, FORM_CHILD, 'max-width', 'desktop')).toBe('446px');
    expect(resolve(RULES, FORM_CHILD, 'margin-left', 'desktop')).toBe('auto');
    expect(resolve(RULES, FORM_CHILD, 'margin-right', 'desktop')).toBe('0');
    expect(resolve(RULES, FORM_CHILD, 'padding-left', 'desktop')).toBe('24px');
    expect(resolve(RULES, FORM_CHILD, 'padding-right', 'desktop')).toBe('28px');
    // 446 − 24 − 28 = 394 — ширина полей из замера «до» и «после».
    expect(446 - 24 - 28).toBe(394);
  });

  it('десктоп: шапка оформления стоит по той же мере', () => {
    expect(resolve(RULES, HEADER, 'max-width', 'desktop')).toBe('446px');
    expect(resolve(RULES, HEADER, 'margin-left', 'desktop')).toBe('auto');
    expect(resolve(RULES, HEADER, 'padding-left', 'desktop')).toBe('24px');
  });

  it('мобилка: прежние 540 + 16 у содержимого', () => {
    expect(resolve(RULES, FORM_CHILD, 'max-width', 'mobile')).toBe('540px');
    expect(resolve(RULES, FORM_CHILD, 'margin-left', 'mobile')).toBe('auto');
    expect(resolve(RULES, FORM_CHILD, 'margin-right', 'mobile')).toBe('auto');
    expect(resolve(RULES, FORM_CHILD, 'padding-left', 'mobile')).toBe('16px');
    expect(resolve(RULES, HEADER, 'max-width', 'mobile')).toBe('540px');
  });

  it('мера считает ширину вместе с отступами (иначе поля разъедутся)', () => {
    expect(resolve(RULES, FORM_CHILD, 'box-sizing', 'desktop')).toBe('border-box');
  });
});

describe('правило общее — одна копия на пять тем и на превью', () => {
  it('разметку и стили колонок выдаёт общий модуль', () => {
    // Тема рендерит CheckoutSplit, превью — checkoutSplitMarkup; оба берут
    // CHECKOUT_SPLIT_CSS отсюда. Шесть копий этой разметки были причиной того,
    // что половина тем отставала (п.4 третьего круга).
    expect(CHECKOUT_SPLIT_CSS).toContain('[data-checkout-pane="form"]');
    expect(CHECKOUT_SPLIT_CSS).toContain('[data-block="checkout-form"] > *');
  });
});

describe('САБОТАЖ: прежняя раскладка обязана быть отвергнута', () => {
  it('предикат принимает текущую таблицу стилей', () => {
    expect(columnDoesNotConstrainWidth(CHECKOUT_SPLIT_CSS)).toBe(true);
  });

  it('вернули ширину на обёртку колонки → предикат краснеет', () => {
    // Дословно прежнее правило из main 63a9b672.
    const sabotaged = CHECKOUT_SPLIT_CSS.replace(
      '[data-checkout-pane="form"] .mfy-checkout-pane__inner { margin: 0; max-width: none; padding: 64px 0; }',
      '[data-checkout-pane="form"] .mfy-checkout-pane__inner { margin: 0 0 0 auto; max-width: 446px; padding: 64px 28px 64px 24px; }',
    );
    expect(sabotaged).not.toEqual(CHECKOUT_SPLIT_CSS);
    expect(columnDoesNotConstrainWidth(sabotaged)).toBe(false);
  });

  it('вернули только боковой padding обёртке → предикат всё равно краснеет', () => {
    const sabotaged =
      CHECKOUT_SPLIT_CSS +
      '\n[data-checkout-pane="form"] .mfy-checkout-pane__inner { padding-left: 24px; padding-right: 28px; }';
    expect(columnDoesNotConstrainWidth(sabotaged)).toBe(false);
  });

  it('сняли меру с под-секций → поля разъехались бы, проверка это ловит', () => {
    const sabotaged = parse(
      CHECKOUT_SPLIT_CSS.replace('max-width: 446px; margin-left: auto; margin-right: 0;', ''),
    );
    expect(resolve(sabotaged, FORM_CHILD, 'max-width', 'desktop')).not.toBe('446px');
  });
});
