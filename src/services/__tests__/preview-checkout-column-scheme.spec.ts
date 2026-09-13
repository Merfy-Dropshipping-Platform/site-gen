/**
 * Живая правка «Цветовой схемы» на чекауте (п.4 третьего круга + уточнение
 * владельца после него).
 *
 * Общее для обеих колонок: у мега-блоков чекаута нет scheme-обёртки, и общая
 * ветка агента создавала её САМА — внутри колонки появлялся цветной
 * прямоугольник под контентом («пятно»). Поэтому секцию внутри колонки агент
 * заменяет разметкой как есть.
 *
 * Дальше колонки РАЗНЫЕ, и это главное, что сторожит файл:
 *   summary — красится схемой «Сводки заказа»: класс `color-scheme-N` вешается
 *             на `[data-checkout-pane="summary"]`. Схема снята → класс снят;
 *   form    — НЕ красится. Дословно: «Левая часть от нас. Там только меняется
 *             цвет кнопки и юр инфа цвет. Всё остальное наше. А правая часть
 *             как в скрине». Класс с левой колонки снимается ВСЕГДА — иначе
 *             ревизия, сохранённая до правки, держала бы заливку до
 *             перезагрузки, и превью расходилось бы с витриной. Цвет кнопки
 *             приезжает внутри свежего HTML секции (класс схемы печатается на
 *             корне «Кнопки оплаты», см. CheckoutForm.astro).
 *
 * Замер «до» снятия заливки (собранные витрины пяти тем, Chromium, 1440×900,
 * корзина 1/3/30, 13.09): колонка формы 0..720 заливалась `rgb(0,0,0)` (rose
 * scheme-4, flux scheme-1), `rgb(8,2,0)` (satin scheme-4), `rgb(207,122,139)`
 * (bloom scheme-1). После: у всех пяти — фон страницы темы.
 *
 * Исполняется РОВНО тот текст функции, который уходит в кадр
 * (`PREVIEW_CHECKOUT_COLUMN_SCHEME_SOURCE` подставляется в агента
 * интерполяцией) — копия разъехалась бы с оригиналом молча.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PREVIEW_CHECKOUT_COLUMN_SCHEME_SOURCE } from '../preview.service';

type Node = { className: string; getAttribute: (name: string) => string | null };
type Section = { closest: (sel: string) => Node | null };
type Apply = (el: Section | null, schemeId: string) => Node | null;

const loadApply = (): Apply => {
  const factory = new Function(
    `${PREVIEW_CHECKOUT_COLUMN_SCHEME_SOURCE}\nreturn applyCheckoutColumnScheme;`,
  ) as () => Apply;
  return factory();
};

/**
 * jsdom в этом сервисе нет (`testEnvironment: 'node'`), поэтому кадр
 * изображаем минимальными двойниками: функции нужны ровно `closest`,
 * `className` и `getAttribute('data-checkout-pane')` — по последнему агент и
 * отличает левую колонку от правой. Проверяется логика класс-листа — ровно то,
 * что ломалось.
 */
const frame = (kind: 'form' | 'summary', paneClass: string) => {
  const pane: Node = {
    className: paneClass,
    getAttribute: (name: string) => (name === 'data-checkout-pane' ? kind : null),
  };
  const section: Section = {
    closest: (sel: string) => (sel === '[data-checkout-pane]' ? pane : null),
  };
  return { pane, section };
};

const outsideCheckout = (): Section => ({ closest: () => null });

describe('горячая смена схемы: ПРАВАЯ колонка красится', () => {
  const apply = loadApply();

  it('класс уезжает на колонку, служебные классы целы', () => {
    const { pane, section } = frame('summary', 'mfy-checkout-pane mfy-checkout-pane--summary');
    expect(apply(section, '3')).toBe(pane);
    expect(pane.className).toContain('color-scheme-3');
    expect(pane.className).toContain('mfy-checkout-pane--summary');
  });

  it('прошлая схема снимается, а не копится', () => {
    const { pane, section } = frame(
      'summary',
      'mfy-checkout-pane mfy-checkout-pane--summary color-scheme-2',
    );
    apply(section, '4');
    expect(pane.className).toContain('color-scheme-4');
    expect(pane.className).not.toContain('color-scheme-2');
    expect((pane.className.match(/color-scheme-\d+/g) ?? []).length).toBe(1);
  });

  it('схема снята — класса нет, колонка остаётся колонкой', () => {
    const { pane, section } = frame(
      'summary',
      'mfy-checkout-pane mfy-checkout-pane--summary color-scheme-2',
    );
    apply(section, '');
    // ни `color-scheme-N`, ни осиротевший `color-scheme-` — класс-обрубок
    // тоже мусор: он остаётся в разметке и путает следующую правку.
    expect(pane.className).not.toContain('color-scheme-');
    expect(pane.className).toContain('mfy-checkout-pane--summary');
  });

  it('двойной прогон одной схемы не плодит классы (идемпотентность)', () => {
    const { pane, section } = frame('summary', 'mfy-checkout-pane color-scheme-3');
    apply(section, '3');
    apply(section, '3');
    expect((pane.className.match(/color-scheme-3/g) ?? []).length).toBe(1);
  });

  it('секция вне чекаута не трогается — за ней прежняя ветка агента', () => {
    expect(apply(outsideCheckout(), '3')).toBeNull();
  });
});

/**
 * САМОЕ ВАЖНОЕ МЕСТО ФАЙЛА. Прошлый круг красил схемой ОБЕ колонки; уточнение
 * владельца это отменило — левая колонка наша, из схемы там только кнопка.
 */
describe('горячая смена схемы: ЛЕВАЯ колонка остаётся нашей', () => {
  const apply = loadApply();

  it('класс схемы на колонку формы НЕ ставится', () => {
    const { pane, section } = frame('form', 'mfy-checkout-pane mfy-checkout-pane--form');
    expect(apply(section, '4')).toBe(pane);
    expect(pane.className).not.toMatch(/color-scheme-\d/);
    expect(pane.className).toContain('mfy-checkout-pane--form');
  });

  it('класс из ревизии, сохранённой ДО правки, снимается', () => {
    // Иначе у сайтов, где мерчант уже выбрал схему форме, заливка держалась бы
    // до перезагрузки — превью расходилось бы с витриной.
    const { pane, section } = frame(
      'form',
      'mfy-checkout-pane mfy-checkout-pane--form color-scheme-2',
    );
    apply(section, '4');
    expect(pane.className).not.toContain('color-scheme-');
    expect(pane.className).toContain('mfy-checkout-pane--form');
  });

  it('снятие схемы тоже оставляет колонку чистой', () => {
    const { pane, section } = frame('form', 'mfy-checkout-pane color-scheme-3');
    apply(section, '');
    expect(pane.className).not.toContain('color-scheme-');
  });

  it('САБОТАЖ: та же схема на правой колонке — класс есть', () => {
    // Страховка от «починки», которая выключит заливку у обеих колонок сразу.
    const { pane, section } = frame('summary', 'mfy-checkout-pane');
    apply(section, '4');
    expect(pane.className).toContain('color-scheme-4');
  });
});

describe('горячая смена схемы: разводка агента', () => {
  it('агент зовёт хелпер ДО ветки с обёрткой', () => {
    // порядок важен: обёртка вокруг секции чекаута вернула бы «пятно»
    const service = readFileSync(join(__dirname, '..', 'preview.service.ts'), 'utf8');
    const call = service.indexOf('applyCheckoutColumnScheme(el, newSchemeId)');
    const wrapperBranch = service.indexOf('if (hasSchemeWrapper) {');
    expect(call).toBeGreaterThan(-1);
    expect(call).toBeLessThan(wrapperBranch);
  });

  it('хелпер уходит в кадр вместе с агентом, а не лежит рядом', () => {
    const service = readFileSync(join(__dirname, '..', 'preview.service.ts'), 'utf8');
    expect(service).toContain('${PREVIEW_CHECKOUT_COLUMN_SCHEME_SOURCE}');
  });
});
