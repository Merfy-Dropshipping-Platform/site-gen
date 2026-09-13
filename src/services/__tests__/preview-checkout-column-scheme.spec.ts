/**
 * Живая правка «Цветовой схемы» на чекауте (п.4 третьего круга).
 *
 * По эталону владельца схема красит КОЛОНКУ: класс `color-scheme-N` вешается на
 * `[data-checkout-pane]` при рендере страницы. Горячая замена секции про это не
 * знала: у мега-блоков чекаута нет scheme-обёртки, и общая ветка агента
 * создавала её сама — внутри колонки появлялся цветной прямоугольник под
 * контентом («пятно»), а сама колонка оставалась в старой схеме до
 * перезагрузки, то есть превью расходилось с витриной.
 *
 * Исполняется РОВНО тот текст функции, который уходит в кадр
 * (`PREVIEW_CHECKOUT_COLUMN_SCHEME_SOURCE` подставляется в агента
 * интерполяцией) — копия разъехалась бы с оригиналом молча.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PREVIEW_CHECKOUT_COLUMN_SCHEME_SOURCE } from '../preview.service';

type Node = { className: string };
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
 * изображаем минимальными двойниками: функции нужны ровно `closest` и
 * `className`. Проверяется логика класс-листа — ровно то, что ломалось.
 */
const frame = (paneClass: string) => {
  const pane: Node = { className: paneClass };
  const section: Section = {
    closest: (sel: string) => (sel === '[data-checkout-pane]' ? pane : null),
  };
  return { pane, section };
};

const outsideCheckout = (): Section => ({ closest: () => null });

describe('горячая смена схемы на чекауте красит колонку', () => {
  const apply = loadApply();

  it('класс уезжает на колонку, служебные классы целы', () => {
    const { pane, section } = frame('mfy-checkout-pane mfy-checkout-pane--summary');
    expect(apply(section, '3')).toBe(pane);
    expect(pane.className).toContain('color-scheme-3');
    expect(pane.className).toContain('mfy-checkout-pane--summary');
  });

  it('прошлая схема снимается, а не копится', () => {
    const { pane, section } = frame('mfy-checkout-pane mfy-checkout-pane--summary color-scheme-2');
    apply(section, '4');
    expect(pane.className).toContain('color-scheme-4');
    expect(pane.className).not.toContain('color-scheme-2');
    expect((pane.className.match(/color-scheme-\d+/g) ?? []).length).toBe(1);
  });

  it('схема снята — класса нет, колонка остаётся колонкой', () => {
    const { pane, section } = frame('mfy-checkout-pane mfy-checkout-pane--summary color-scheme-2');
    apply(section, '');
    // ни `color-scheme-N`, ни осиротевший `color-scheme-` — класс-обрубок
    // тоже мусор: он остаётся в разметке и путает следующую правку.
    expect(pane.className).not.toContain('color-scheme-');
    expect(pane.className).toContain('mfy-checkout-pane--summary');
  });

  it('двойной прогон одной схемы не плодит классы (идемпотентность)', () => {
    const { pane, section } = frame('mfy-checkout-pane color-scheme-3');
    apply(section, '3');
    apply(section, '3');
    expect((pane.className.match(/color-scheme-3/g) ?? []).length).toBe(1);
  });

  it('секция вне чекаута не трогается — за ней прежняя ветка агента', () => {
    expect(apply(outsideCheckout(), '3')).toBeNull();
  });

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
