/**
 * Какие изменения документа — правка мерчанта, а какие — производные
 * (дополнение главного агента к этапу 2):
 *  - автозначение панели: ключ свойства секции появился со значением по
 *    умолчанию панели конструктора или пропал, имея его;
 *  - копия служебного блока (шапка, подвал, промо-баннер, шапка чекаута) на
 *    внутренней странице — её раскатывают с главной конструктор и чтение.
 */
import { isChromeCopy, makeAutoValueRule } from "../change-kinds";
import type { Op } from "../operations";

type Doc = Record<string, any>;

const DEFAULTS = {
  Hero: {
    alignment: "center",
    heading: { text: "Заголовок", size: "m" },
    padding: { top: 80, bottom: 80 },
  },
  Header: { sticky: "false" },
};

function doc(heroProps: Doc): Doc {
  return {
    pagesData: {
      home: {
        content: [
          { type: "Header", props: { id: "Header-1" } },
          { type: "Hero", props: { id: "Hero-1", ...heroProps } },
        ],
      },
      "page-about": {
        content: [
          { type: "Header", props: { id: "Header-about" } },
          { type: "Page", props: { id: "Page-about" } },
        ],
      },
    },
  };
}

const isAuto = makeAutoValueRule(DEFAULTS);
const set = (path: string, value: unknown): Op => ({ op: "set", path, value });
const HERO = "page:home/block:Hero-1/props";

describe("автозначение панели", () => {
  it.each<[string, Op, Doc, boolean]>([
    [
      "ключ появился со значением по умолчанию",
      set(`${HERO}/alignment`, "center"),
      {},
      true,
    ],
    [
      "ключ появился с другим значением — правка",
      set(`${HERO}/alignment`, "left"),
      {},
      false,
    ],
    [
      "ключ был и стал равен дефолту — правка (сброс)",
      set(`${HERO}/alignment`, "center"),
      { alignment: "left" },
      false,
    ],
    [
      "вложенный ключ появился дефолтом",
      set(`${HERO}/heading/size`, "m"),
      { heading: { text: "Мой" } },
      true,
    ],
    [
      "объект целиком появился дефолтом",
      set(`${HERO}/padding`, { top: 80, bottom: 80 }),
      {},
      true,
    ],
    [
      "объект появился не дефолтом",
      set(`${HERO}/padding`, { top: 0, bottom: 80 }),
      {},
      false,
    ],
    ["ключ без дефолта панели", set(`${HERO}/testField`, "x"), {}, false],
    [
      "не свойство секции (корень страницы)",
      set("page:home/root/props/title", "x"),
      {},
      false,
    ],
    [
      "пропал ключ, который был дефолтом",
      { op: "remove", path: `${HERO}/alignment` },
      { alignment: "center" },
      true,
    ],
    [
      "пропал ключ с настоящим значением — правка",
      { op: "remove", path: `${HERO}/alignment` },
      { alignment: "left" },
      false,
    ],
  ])("%s", (_label, op, heroBase, expected) => {
    const base = doc(heroBase);
    expect(isAuto(op, base, doc({}))).toBe(expected);
  });

  it("нет дефолтов для темы (сбой загрузки) — автозначений нет", () => {
    const none = makeAutoValueRule({});
    expect(none(set(`${HERO}/alignment`, "center"), doc({}), doc({}))).toBe(
      false,
    );
  });
});

describe("копия служебного блока на внутренней странице", () => {
  it.each<[string, string, boolean]>([
    [
      "шапка внутренней страницы",
      "page:page-about/block:Header-about/props/logo",
      true,
    ],
    [
      "шапка внутренней страницы целиком",
      "page:page-about/block:Header-about",
      true,
    ],
    ["шапка главной — правка", "page:home/block:Header-1/props/logo", false],
    [
      "секция внутренней страницы — правка",
      "page:page-about/block:Page-about/props/content",
      false,
    ],
    ["порядок секций — правка", "page:page-about/order", false],
  ])("%s", (_label, path, expected) => {
    expect(isChromeCopy({ op: "set", path, value: 1 }, doc({}))).toBe(expected);
  });
});
