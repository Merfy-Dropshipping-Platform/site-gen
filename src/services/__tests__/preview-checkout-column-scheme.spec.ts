/**
 * Живая правка «Цветовой схемы» на чекауте (п.4 третьего круга + уточнение
 * владельца после него).
 *
 * Общее для обеих колонок: у мега-блоков чекаута нет scheme-обёртки, и общая
 * ветка агента создавала её САМА — внутри колонки появлялся цветной
 * прямоугольник под контентом («пятно»). Поэтому секцию внутри колонки агент
 * заменяет разметкой как есть.
 *
 * Дальше — класс `color-scheme-N` на `[data-checkout-pane="…"]`, и с 14.09 на
 * ОБЕИХ колонках (п.5 владельца, см. ниже). Схема снята → класс снят; прошлая
 * схема заменяется, а не копится — иначе ревизия, сохранённая до правки,
 * держала бы старую заливку до перезагрузки, и превью расходилось бы с
 * витриной.
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
 * САМОЕ ВАЖНОЕ МЕСТО ФАЙЛА — граница «что красит схема» на ЛЕВОЙ колонке. Её
 * двигали дважды:
 *   • третий круг покраску выключил («левая часть от нас… только цвет кнопки и
 *     юр инфа цвет») — потому что секция «Оформление заказа» была карточкой
 *     394px по центру колонки и класс схемы давал «пятно»;
 *   • 14.09 карточки не стало (секция заняла колонку целиком), и владелец
 *     вернулся с п.5: «к секции Оформление закаказа не применяется никакая
 *     цветовая схема». Замер «до» по пяти темам: выбор схемы-4 не менял на
 *     левой половине НИЧЕГО у 4 тем из 5 (кнопка rose 0,0,0→0,0,0;
 *     vanilla 255,255,255→255,255,255; flux 30,41,82→30,41,82;
 *     satin 0,0,0→8,2,0; менялся только bloom).
 * Итог: агент красит ОБЕ колонки, и красит их так же, как первичный рендер
 * (`chrome-assembler.patchCheckoutColumnScheme`) — иначе конструктор показывал
 * бы одно, а витрина другое (баг 18-В).
 */
describe('горячая смена схемы: ЛЕВАЯ колонка красится тоже', () => {
  const apply = loadApply();

  it('класс схемы садится на колонку формы', () => {
    const { pane, section } = frame('form', 'mfy-checkout-pane mfy-checkout-pane--form');
    expect(apply(section, '4')).toBe(pane);
    expect(pane.className).toContain('color-scheme-4');
    expect(pane.className).toContain('mfy-checkout-pane--form');
  });

  it('класс из ревизии, сохранённой ДО правки, заменяется, а не копится', () => {
    const { pane, section } = frame(
      'form',
      'mfy-checkout-pane mfy-checkout-pane--form color-scheme-2',
    );
    apply(section, '4');
    expect(pane.className).toContain('color-scheme-4');
    expect(pane.className).not.toContain('color-scheme-2');
    expect((pane.className.match(/color-scheme-\d+/g) ?? []).length).toBe(1);
    expect(pane.className).toContain('mfy-checkout-pane--form');
  });

  it('снятие схемы оставляет колонку чистой', () => {
    const { pane, section } = frame('form', 'mfy-checkout-pane color-scheme-3');
    apply(section, '');
    expect(pane.className).not.toContain('color-scheme-');
    expect(pane.className).toContain('mfy-checkout-pane');
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
