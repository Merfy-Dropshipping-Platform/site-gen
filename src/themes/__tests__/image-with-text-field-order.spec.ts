/**
 * «Изображение с текстом»: порядок заголовка/текста/кнопки, который
 * конструктор пишет перетаскиванием (тестер 24.09: «в левом сайдбаре слетели
 * дрэг-н-дропы в секции Изображение с текстом»).
 *
 * Конструктор (PR constructor #38) кладёт порядок в `props.fieldOrder:
 * string[]` — имена панели `image`/`heading`/`text`/`button`. Порт читает его
 * общим помощником `orderTextFields` (packages/theme-base/lib/field-order.ts)
 * и рисует заголовок/текст/кнопку текстовой колонки в этом порядке; `image`
 * не переставляется — свою сторону задаёт `imagePosition`.
 *
 * Проверяем РЕНДЕРОМ настоящего скомпилированного модуля темы (того, что
 * уходит на витрину и в превью) — grep по исходнику ловил ровно половину поля
 * (feedback_agent_guard_covers_only_touched_path): порядок ВСТАВКИ в DOM это
 * не то же самое, что порядок объявления в исходном файле.
 *
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all.
 */

import { orderTextFields, TEXT_COLUMN_FIELDS } from "../../../packages/theme-base/lib/field-order";
import { renderSections } from "../../../scripts/qa/lib/render";

const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;

const base = { colorScheme: "1", padding: { top: 40, bottom: 40 } };
const HEAD = "MK_FO_HEAD";
const TEXT = "MK_FO_TEXT";
const BTN = "MK_FO_BTN";

/**
 * Индексы полей в HTML — по `data-puck-subsection-field="…"`, НЕ по тексту
 * маячка: заголовок попадает в `alt` картинки (fallback у нескольких тем) и в
 * `aria-label` секции (satin), а значит текстовый маячок встречается РАНЬШЕ
 * своего реального узла — ложно «обгоняя» соседей. Атрибут стоит СТРОГО на
 * узле поля и встречается один раз.
 * -1, если узла нет (поле спрятано «глазом»).
 */
function позиции(html: string): { heading: number; text: number; button: number } {
  return {
    heading: html.indexOf('data-puck-subsection-field="heading"'),
    text: html.indexOf('data-puck-subsection-field="text"'),
    button: html.indexOf('data-puck-subsection-field="button"'),
  };
}

function отрисовать(
  theme: string,
  extra: Record<string, unknown>,
): string {
  const [row] = renderSections(theme, [
    {
      block: "ImageWithText",
      props: {
        ...base,
        image: { url: "/MK-FO-IMG.png", alt: "" },
        heading: HEAD,
        text: { content: TEXT },
        button: { text: BTN, href: "/catalog" },
        imagePosition: "left",
        ...extra,
      },
    },
  ]);
  if (row.error) throw new Error(`${theme}: ${row.error}`);
  return row.html ?? "";
}

describe("orderTextFields — общий помощник (packages/theme-base/lib/field-order.ts)", () => {
  it("нет fieldOrder → порядок реестра (heading, text, button)", () => {
    expect(orderTextFields({})).toEqual(["heading", "text", "button"]);
  });

  it("fieldOrder не массив → порядок реестра", () => {
    expect(orderTextFields({ fieldOrder: "heading,text,button" })).toEqual([
      "heading",
      "text",
      "button",
    ]);
  });

  it("полный порядок из fieldOrder — как задано", () => {
    expect(
      orderTextFields({ fieldOrder: ["button", "text", "heading"] }),
    ).toEqual(["button", "text", "heading"]);
  });

  it("image и неизвестные имена отбрасываются", () => {
    expect(
      orderTextFields({ fieldOrder: ["image", "button", "ghost", "heading"] }),
    ).toEqual(["button", "heading", "text"]);
  });

  it("недостающие поля — следом в порядке реестра", () => {
    expect(orderTextFields({ fieldOrder: ["button"] })).toEqual([
      "button",
      "heading",
      "text",
    ]);
  });

  it("дубли в fieldOrder не плодят повторов", () => {
    expect(
      orderTextFields({ fieldOrder: ["text", "text", "button"] }),
    ).toEqual(["text", "button", "heading"]);
  });

  it("реестр по умолчанию — heading, text, button", () => {
    expect(TEXT_COLUMN_FIELDS).toEqual(["heading", "text", "button"]);
  });
});

describe.each(THEMES)("«Изображение с текстом» — порядок полей, тема %s", (theme) => {
  it("без fieldOrder — прежний порядок (заголовок, текст, кнопка)", () => {
    const html = отрисовать(theme, {});
    const p = позиции(html);
    expect(p.heading).toBeGreaterThan(-1);
    expect(p.text).toBeGreaterThan(-1);
    expect(p.button).toBeGreaterThan(-1);
    expect(p.heading).toBeLessThan(p.text);
    expect(p.text).toBeLessThan(p.button);
  });

  it("fieldOrder=[button,text,heading] — кнопка раньше текста раньше заголовка", () => {
    const html = отрисовать(theme, {
      fieldOrder: ["button", "text", "heading"],
    });
    const p = позиции(html);
    expect(p.button).toBeGreaterThan(-1);
    expect(p.text).toBeGreaterThan(-1);
    expect(p.heading).toBeGreaterThan(-1);
    expect(p.button).toBeLessThan(p.text);
    expect(p.text).toBeLessThan(p.heading);
  });

  it("fieldOrder=[text,button,heading] — текст раньше кнопки раньше заголовка", () => {
    const html = отрисовать(theme, {
      fieldOrder: ["text", "button", "heading"],
    });
    const p = позиции(html);
    expect(p.text).toBeLessThan(p.button);
    expect(p.button).toBeLessThan(p.heading);
  });

  it("hiddenFields + перестановка — «глаз» прячет поле независимо от порядка", () => {
    const html = отрисовать(theme, {
      fieldOrder: ["button", "text", "heading"],
      hiddenFields: ["text"],
    });
    const p = позиции(html);
    expect(p.text).toBe(-1);
    expect(p.button).toBeGreaterThan(-1);
    expect(p.heading).toBeGreaterThan(-1);
    expect(p.button).toBeLessThan(p.heading);
  });
});

// Конструктор выбирает панель по НОМЕРУ подсекции: 100 + место поля в реестре
// (image, heading, text, button — constructor src/lib/utils/arrayField.ts).
// У vanilla номера были сдвинуты (heading=100), и клик по заголовку открывал
// панель «Изображение». Номер должен совпадать с реестром при любом порядке.
const НОМЕР_ПОЛЯ = { image: "100", heading: "101", text: "102", button: "103" } as const;

describe("номер подсекции = место поля в реестре конструктора", () => {
  const пары = (html: string) =>
    [...html.matchAll(/data-puck-subsection-index="(\d+)"[^>]*?data-puck-subsection-field="([a-z]+)"/gs)]
      .map(([, номер, поле]) => [поле, номер]);

  describe.each(THEMES)("%s", (theme) => {
    it.each([[undefined], [["button", "text", "heading"]]])("порядок %j", (fieldOrder) => {
      const найдено = пары(отрисовать(theme, fieldOrder ? { fieldOrder } : {}));
      expect(найдено.length).toBeGreaterThanOrEqual(4);
      for (const [поле, номер] of найдено) {
        expect([поле, номер]).toEqual([поле, НОМЕР_ПОЛЯ[поле as keyof typeof НОМЕР_ПОЛЯ]]);
      }
    });
  });
});
