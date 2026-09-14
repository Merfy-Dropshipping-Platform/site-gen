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
 * ЛЕЧЕНИЕ: мера переехала на СОДЕРЖИМОЕ колонки — на под-секции формы. Числа
 * те же (446 + 24/28 на десктопе, 540 + 16 на мобилке), поэтому поля не
 * сдвинулись; сдвинулись только границы секции.
 *
 * 14.09 из этой меры ушла шапка оформления: по п.3 владельца она стала
 * ОТДЕЛЬНОЙ полосой над колонками (checkout-header-strip.spec.ts), и вместе с
 * ней из колонки ушёл её отступ — верхние 64px снова держит сама колонка.
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

// ── разрешатель каскада ────────────────────────────────────────────────────
// Общий с `checkout-sections-round4.spec.ts` (п.2-5 четвёртого круга): вторая
// копия разъехалась бы с первой молча, поэтому он вынесен в
// `src/themes/checkout-split-cascade.ts` (в `__tests__` нельзя — jest считает
// тестом любой `.ts` в этой папке).
import { parse, resolve, type Rule } from '../checkout-split-cascade';

/** Обёртка колонки формы. */
const FORM_INNER = [
  '.mfy-checkout-pane__inner',
  '[data-checkout-pane="form"] .mfy-checkout-pane__inner',
];
/** Под-секция формы (контакты / доставка / оплата / кнопка / условия). */
const FORM_CHILD = ['[data-checkout-pane="form"] [data-block="checkout-form"] > *'];

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

  it('колонка сводки читается тем же разрешателем', () => {
    // Мера правой колонки 14.09 уехала с обёртки на содержимое — тем же
    // приёмом, что и здесь у левой (п.2 четвёртого круга,
    // checkout-sections-round4.spec.ts). Обёртка меры больше не держит.
    expect(
      resolve(RULES, ['[data-checkout-pane="summary"] .mfy-checkout-pane__inner'], 'max-width', 'desktop'),
    ).toBe('none');
    expect(
      resolve(RULES, ['[data-checkout-pane="summary"] [data-checkout-column="summary"]'], 'max-width', 'desktop'),
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

  it('вертикальные отступы колонки сохранены (64 десктоп / 32 мобилка)', () => {
    // Их нельзя переносить на корень секции: `CheckoutForm` печатает
    // padding-top/bottom ИНЛАЙНОМ из своего скрытого параметра «Отступы».
    // Ноль сверху был нужен, пока шапка стояла ПЕРВЫМ узлом этой же колонки и
    // приносила свой отступ; 14.09 она уехала в собственную полосу над
    // колонками (п.3), и колонка снова держит свои 64px.
    expect(resolve(RULES, FORM_INNER, 'padding-top', 'desktop')).toBe('64px');
    expect(resolve(RULES, FORM_INNER, 'padding-bottom', 'desktop')).toBe('64px');
    expect(resolve(RULES, FORM_INNER, 'padding-top', 'mobile')).toBe('32px');
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

  it('мобилка: прежние 540 + 16 у содержимого', () => {
    expect(resolve(RULES, FORM_CHILD, 'max-width', 'mobile')).toBe('540px');
    expect(resolve(RULES, FORM_CHILD, 'margin-left', 'mobile')).toBe('auto');
    expect(resolve(RULES, FORM_CHILD, 'margin-right', 'mobile')).toBe('auto');
    expect(resolve(RULES, FORM_CHILD, 'padding-left', 'mobile')).toBe('16px');
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
