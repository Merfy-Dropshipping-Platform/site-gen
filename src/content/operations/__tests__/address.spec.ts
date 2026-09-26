/**
 * Адрес поля документа магазина (этап 2, кусок 2.1).
 *
 * Адрес строится по id блока и id страницы, а не по индексу массива: так
 * перестановка секций не превращает правку в «удалить + добавить», а один и
 * тот же адрес читается человеком в логах, в `meta` ревизии и в ответах API.
 * Грамматика — `src/content/operations/README.md`.
 */
import {
  ORDER_SEGMENT,
  itemSegment,
  joinPath,
  keySegment,
  parseSegment,
  splitPath,
} from "../address";
import { overlapsPath } from "../walk";

describe("адрес поля: сегменты", () => {
  it.each([
    ["обычный ключ", "heading", "heading"],
    ["слэш экранируется", "a/b", "a~1b"],
    ["двоеточие в ключе экранируется", "page:x", "page~2x"],
    ["тильда экранируется", "a~b", "a~0b"],
    ["буквальный ключ order не путается с порядком", "order", "~3order"],
    ["пустой ключ", "", ""],
    ["кириллица как есть", "Заголовок", "Заголовок"],
  ])("%s: %j → %j и обратно", (_label, key, expected) => {
    const seg = keySegment(key);
    expect(seg).toBe(expected);
    expect(parseSegment(seg)).toEqual({ kind: "key", key });
  });

  it("элемент списка: префикс + id, двоеточие внутри id остаётся читаемым", () => {
    const seg = itemSegment("zone:", "Columns-1:left");
    expect(seg).toBe("zone:Columns-1:left");
    expect(parseSegment(seg)).toEqual({
      kind: "prefixed",
      prefix: "zone:",
      id: "Columns-1:left",
    });
  });

  it("элемент списка с пустым префиксом (страница в pages[]) — это ключ до разбора по форме документа", () => {
    expect(itemSegment("", "page-about")).toBe("page-about");
    expect(itemSegment("", "order")).toBe("~3order");
    expect(parseSegment("page-about")).toEqual({
      kind: "key",
      key: "page-about",
    });
  });

  it("сегмент порядка", () => {
    expect(ORDER_SEGMENT).toBe("order");
    expect(parseSegment("order")).toEqual({ kind: "order" });
  });

  it("слэш в id блока не рвёт адрес на лишние сегменты", () => {
    const path = joinPath(
      joinPath("", itemSegment("page:", "home")),
      itemSegment("block:", "Hero/1"),
    );
    expect(path).toBe("page:home/block:Hero~11");
    expect(splitPath(path).map(parseSegment)).toEqual([
      { kind: "prefixed", prefix: "page:", id: "home" },
      { kind: "prefixed", prefix: "block:", id: "Hero/1" },
    ]);
  });
});

describe("адрес поля: пересечение (для слияния)", () => {
  it.each([
    [
      "одно и то же поле",
      "page:home/block:Hero-1/props/heading/text",
      "page:home/block:Hero-1/props/heading/text",
      true,
    ],
    [
      "блок целиком и его поле",
      "page:home/block:Hero-1",
      "page:home/block:Hero-1/props/heading/text",
      true,
    ],
    [
      "страница целиком и порядок её секций",
      "page:home",
      "page:home/order",
      true,
    ],
    [
      "соседние поля одного блока",
      "page:home/block:Hero-1/props/a",
      "page:home/block:Hero-1/props/b",
      false,
    ],
    [
      "порядок секций и сама секция — соседи",
      "page:home/order",
      "page:home/block:Hero-1",
      false,
    ],
    [
      "граница сегмента: page:home не префикс page:home2",
      "page:home",
      "page:home2/order",
      false,
    ],
    [
      "разные страницы",
      "page:home/block:Hero-1",
      "page:page-about/block:Hero-1",
      false,
    ],
    [
      "список секций целиком содержит секцию (поднятый контейнер)",
      "page:home/content",
      "page:home/block:Hero-1/props/x",
      true,
    ],
    [
      "pagesData целиком содержит страницу",
      "pagesData",
      "page:home/order",
      true,
    ],
  ])("%s", (_label, a, b, expected) => {
    expect(overlapsPath(a, b)).toBe(expected);
    expect(overlapsPath(b, a)).toBe(expected);
  });
});
