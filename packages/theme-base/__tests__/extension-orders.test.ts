/**
 * extension-orders-view — чистые функции точки `orders`: точки из карты,
 * разбор списка и страницы записи (внешние данные не доверены), адрес страницы
 * записи, дата, порядок и разметка строкой. Моков нет. Поведение в браузере —
 * extension-orders.dom.test.ts.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { replyData, sitePath } from "../runtime/extension-call";
import {
  entryHref,
  entryTargetOf,
  findOrdersPoints,
  formatWhen,
  readEntryView,
  readListItems,
  renderEntryHtml,
  renderRowHtml,
  sortNewestFirst,
  type RecordRow,
} from "../runtime/extension-orders-view";
import {
  STAND_EXTENSION_ID,
  STAND_STATES,
  standEntry,
  standItem,
} from "../stand/extension-orders/stand-data";

const NOW = new Date(2026, 9, 13, 8, 0);
const AT_0746 = new Date(2026, 9, 13, 7, 46).toISOString();
const row = (patch: Partial<RecordRow> = {}): RecordRow => ({
  ...standItem("new", AT_0746),
  extensionId: STAND_EXTENSION_ID,
  ...patch,
});

describe("точки orders в карте расширений", () => {
  it("берёт каждое расширение, у которого orders называет list и get", () => {
    const map = {
      alpha: { orders: { list: "listA", get: "getA" } },
      beta: { product: { form: "f", submit: "s" } },
      gamma: { orders: { list: "listG", get: "getG" }, product: {} },
    };
    expect(findOrdersPoints(map)).toEqual([
      { extensionId: "alpha", list: "listA", get: "getA" },
      { extensionId: "gamma", list: "listG", get: "getG" },
    ]);
  });

  it("без list или get, с пустым именем и не объект — точек нет", () => {
    expect(findOrdersPoints({ a: { orders: { list: "l" } } })).toEqual([]);
    expect(findOrdersPoints({ a: { orders: { list: "", get: "g" } } })).toEqual(
      [],
    );
    expect(findOrdersPoints({ success: true, data: {} })).toEqual([]);
    expect(findOrdersPoints(null)).toEqual([]);
    expect(findOrdersPoints([])).toEqual([]);
  });
});

describe("список записей из ответа расширения", () => {
  it("верная запись проходит как есть", () => {
    const item = standItem("wait", AT_0746);
    expect(readListItems({ items: [item] })).toEqual([item]);
  });

  it("неверные записи пропускаются, верные остаются", () => {
    const good = standItem("new", AT_0746);
    const items = [
      good,
      { ...good, id: "" },
      { ...good, date: "вчера" },
      { ...good, status: 5 },
      "строка",
    ];
    expect(readListItems({ items })).toEqual([good]);
  });

  it("незнакомый цвет статуса не мешает записи: цвета нет", () => {
    const [item] = readListItems({
      items: [{ ...standItem("new", AT_0746), tone: "purple" }],
    });
    expect(item.tone).toBeUndefined();
  });

  it("не объект и нет items — пусто", () => {
    expect(readListItems(undefined)).toEqual([]);
    expect(readListItems({ items: "x" })).toEqual([]);
  });
});

describe("страница записи из ответа расширения", () => {
  it.each(STAND_STATES)("состояние %s стенда разбирается целиком", (state) => {
    const view = standEntry(state, AT_0746);
    expect(readEntryView(view)).toEqual(view);
  });

  it("неизвестный блок и кнопка на чужой протокол пропускаются", () => {
    const view = standEntry("new", AT_0746);
    const blocks = [
      { type: "html", html: "<b>x</b>" },
      { type: "button", label: "Оплатить", url: "javascript:alert(1)" },
      { type: "button", label: "Оплатить", url: "//evil.example" },
      ...view.blocks,
    ];
    expect(readEntryView({ ...view, blocks })?.blocks).toEqual(view.blocks);
  });

  it("без шапки или без блоков — null", () => {
    const view = standEntry("new", AT_0746);
    expect(readEntryView({ ...view, number: "" })).toBeNull();
    expect(readEntryView({ ...view, blocks: undefined })).toBeNull();
    expect(readEntryView(null)).toBeNull();
  });
});

describe("ответ функции шлюза", () => {
  it("data берётся из любого 2xx с success: true, иначе undefined", () => {
    expect(
      replyData({ status: 201, body: { success: true, data: { a: 1 } } }),
    ).toEqual({ a: 1 });
    expect(
      replyData({ status: 200, body: { success: true, data: null } }),
    ).toBeNull();
    expect(
      replyData({ status: 401, body: { success: false } }),
    ).toBeUndefined();
    expect(
      replyData({ status: 200, body: { success: false, data: {} } }),
    ).toBeUndefined();
    expect(replyData(null)).toBeUndefined();
  });
});

describe("адрес страницы записи", () => {
  it("ссылка и разбор адреса — одна пара расширение + запись", () => {
    const href = entryHref(
      "/account/entry",
      row({ extensionId: "a b", id: "r/1&x" }),
    );
    expect(href).toBe("/account/entry?ext=a+b&id=r%2F1%26x");
    expect(entryTargetOf(href.slice(href.indexOf("?")))).toEqual({
      extensionId: "a b",
      id: "r/1&x",
    });
  });

  it("без ext или id — null", () => {
    expect(entryTargetOf("?ext=a")).toBeNull();
    expect(entryTargetOf("?id=1")).toBeNull();
    expect(entryTargetOf("")).toBeNull();
  });
});

describe("дата записи по часам покупателя", () => {
  it("сегодня и вчера — со временем, раньше — число и месяц, другой год — с годом", () => {
    expect(formatWhen(AT_0746, NOW)).toBe("сегодня, 07:46");
    expect(formatWhen(new Date(2026, 9, 12, 16, 20).toISOString(), NOW)).toBe(
      "вчера, 16:20",
    );
    expect(formatWhen(new Date(2026, 9, 2, 9, 0).toISOString(), NOW)).toBe(
      "2 октября",
    );
    expect(formatWhen(new Date(2025, 0, 5, 9, 0).toISOString(), NOW)).toBe(
      "5 января 2025",
    );
  });

  it("нечитаемая дата — пустая строка", () => {
    expect(formatWhen("когда-то", NOW)).toBe("");
  });

  it("новые записи сверху", () => {
    const older = row({ id: "old", date: new Date(2026, 9, 1).toISOString() });
    const newer = row({ id: "new", date: AT_0746 });
    expect(sortNewestFirst([older, newer]).map((item) => item.id)).toEqual([
      "new",
      "old",
    ]);
  });
});

describe("разметка", () => {
  it("строка списка: номер · заголовок, дата, статус с цветом, ссылка и дата для порядка", () => {
    const html = renderRowHtml(
      row(),
      "/account/entry?ext=test-ext&id=r2096",
      NOW,
    );
    expect(html).toContain('href="/account/entry?ext=test-ext&amp;id=r2096"');
    expect(html).toContain(`data-date="${AT_0746}"`);
    expect(html).toContain("И-2096 · Стол из массива по размеру");
    expect(html).toContain("сегодня, 07:46");
    expect(html).toContain('data-tone="info">Отправлен<');
  });

  it("строка без цвета статуса — нейтральная", () => {
    expect(renderRowHtml(row({ tone: undefined }), "/x", NOW)).toContain(
      'data-tone="neutral"',
    );
  });

  it("текст расширения экранируется везде", () => {
    const evil = '<img src=x onerror="alert(1)">';
    const html = renderRowHtml(row({ title: evil, status: evil }), "/x", NOW);
    expect(html).not.toContain("<img");
    const page = renderEntryHtml(
      {
        kind: "view",
        view: {
          ...standEntry("new", AT_0746),
          number: evil,
          blocks: [
            { type: "text", text: evil },
            { type: "pairs", rows: [{ label: evil, value: evil }] },
          ],
        },
      },
      "/account/orders",
      NOW,
    );
    expect(page).not.toContain("<img");
    expect(page).toContain("&lt;img");
  });

  it("страница: «← Мои заказы», номер, статус, товар · дата, каждая строка текста — отдельно", () => {
    const html = renderEntryHtml(
      { kind: "view", view: standEntry("disc", AT_0746) },
      "/account/orders",
      NOW,
    );
    expect(html).toContain(
      '<a class="xo-back" href="/account/orders">← Мои заказы</a>',
    );
    expect(html).toContain('<h1 class="xo-number">И-2096</h1>');
    expect(html).toContain('data-tone="info">Обсуждаем<');
    expect(html).toContain("Стол из массива по размеру · сегодня, 07:46");
    expect(html).toContain(
      '<p class="xo-text"><span class="xo-line">Ваш индивидуальный заказ И-2096 в магазине «Верстак»</span><span class="xo-line">сегодня, 07:50</span></p><p class="xo-text">',
    );
  });

  it("строки с итогом, пары и кнопка оплаты", () => {
    const html = renderEntryHtml(
      { kind: "view", view: standEntry("wait", AT_0746) },
      "/account/orders",
      NOW,
    );
    expect(html).toContain(
      '<div class="xo-lines-row"><span class="xo-label"><span class="xo-line">Выезд на замер × 1</span></span><span class="xo-value">1 500 ₽</span></div>',
    );
    expect(html).toContain(
      '<div class="xo-lines-total"><span class="xo-label"><span class="xo-line">Итого</span></span><span class="xo-value">55 500 ₽</span></div>',
    );
    expect(html).toContain(
      '<a class="xo-button" href="https://pay.example.ru/l/2096">Перейти к оплате</a>',
    );
    expect(html).toContain('<span class="xo-value">3 файл.</span>');
  });

  it("не найдена и сбой — свой текст под «← Мои заказы»", () => {
    expect(renderEntryHtml({ kind: "missing" }, "/o", NOW)).toContain(
      "Запись не найдена",
    );
    expect(renderEntryHtml({ kind: "failed" }, "/o", NOW)).toContain(
      "Не удалось загрузить. Обновите страницу.",
    );
  });
});

describe("свой путь сайта", () => {
  it("только /…: не //, не /\\, без пробелов и управляющих символов", () => {
    expect(sitePath("/account/orders?x=1")).toBe("/account/orders?x=1");
    expect(sitePath("//evil.example")).toBeNull();
    expect(sitePath("/\\evil.example")).toBeNull();
    expect(sitePath("/\t/evil.example")).toBeNull();
    expect(sitePath("https://shop.example")).toBeNull();
    expect(sitePath(undefined)).toBeNull();
  });
});

describe("слов предметной области в общем коде нет (Р8)", () => {
  it.each([
    "runtime/extension-call.ts",
    "runtime/extension-orders-view.ts",
    "runtime/extension-orders.ts",
    "runtime/extension-orders.styles.ts",
    "runtime/next-path.ts",
  ])("%s", (file) => {
    const source = readFileSync(resolve(__dirname, "..", file), "utf8");
    expect(source).not.toMatch(/заявк|\brequests?\b|requestId/i);
  });
});
