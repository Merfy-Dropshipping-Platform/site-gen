/**
 * Движок операций (этап 2, кусок 2.1): `diff(base, next) → Op[]`,
 * `apply(doc, ops) → doc`, `paths(ops)`.
 *
 * Главное свойство: `apply(a, diff(a, b))` равен `b`. Адреса операций — по id
 * страниц и блоков (грамматика — README модуля).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { apply, diff, paths, readAt } from "..";
import type { Op } from "..";

type Doc = Record<string, any>;

function golden(theme: string): Doc {
  const file = resolve(
    __dirname,
    "../../../__tests__/golden",
    theme,
    "fresh-store.json",
  );
  return JSON.parse(readFileSync(file, "utf-8")).item.data;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function block(id: string, type = "Text", props: Doc = {}): Doc {
  return { type, props: { id, ...props } };
}

function doc(content: Doc[], extra: Doc = {}): Doc {
  return {
    currentPageId: "home",
    pages: [
      { id: "home", name: "Главная", slug: "/" },
      { id: "page-about", name: "О нас", slug: "/about" },
    ],
    pagesData: {
      home: { content, root: { props: { title: "Магазин" } }, zones: {} },
      "page-about": {
        content: [block("Page-about", "Page", { content: "" })],
        root: { props: {} },
        zones: {},
      },
    },
    themeSettings: { colorSchemes: [{ id: "scheme-1" }], fontHeading: "Inter" },
    ...extra,
  };
}

const HOME = () => [
  block("Header-1", "Header"),
  block("Hero-1", "Hero", {
    heading: { text: "Было" },
    padding: { top: 0, bottom: 0 },
  }),
  block("Gallery-1", "Gallery", { items: [{ image: "a.png" }] }),
  block("Footer-1", "Footer"),
];

function roundTrip(a: Doc, b: Doc): Op[] {
  const ops = diff(a, b);
  expect(apply(a, ops)).toEqual(b);
  return ops;
}

describe("diff/apply: одна правка — одна операция с читаемым адресом", () => {
  it("одинаковые документы — ноль операций", () => {
    const a = doc(HOME());
    expect(diff(a, clone(a))).toEqual([]);
  });

  it("поле секции: адрес по id блока, а не по индексу", () => {
    const a = doc(HOME());
    const b = clone(a);
    b.pagesData.home.content[1].props.heading.text = "Стало";
    expect(roundTrip(a, b)).toEqual([
      {
        op: "set",
        path: "page:home/block:Hero-1/props/heading/text",
        value: "Стало",
      },
    ]);
  });

  it("перестановка секций — ровно одна операция порядка", () => {
    const a = doc(HOME());
    const b = clone(a);
    const [hero, gallery] = [
      b.pagesData.home.content[1],
      b.pagesData.home.content[2],
    ];
    b.pagesData.home.content[1] = gallery;
    b.pagesData.home.content[2] = hero;
    expect(roundTrip(a, b)).toEqual([
      {
        op: "order",
        path: "page:home/order",
        ids: ["Header-1", "Gallery-1", "Hero-1", "Footer-1"],
      },
    ]);
  });

  it("новая секция: add с цепочкой соседей слева (ближний первым)", () => {
    const a = doc(HOME());
    const b = clone(a);
    b.pagesData.home.content.splice(
      2,
      0,
      block("Text-new", "MainText", { text: "Привет" }),
    );
    expect(roundTrip(a, b)).toEqual([
      {
        op: "add",
        path: "page:home/block:Text-new",
        value: block("Text-new", "MainText", { text: "Привет" }),
        after: ["Hero-1", "Header-1"],
      },
    ]);
  });

  it("новая секция в самом начале — пустая цепочка", () => {
    const a = doc(HOME());
    const b = clone(a);
    b.pagesData.home.content.unshift(block("Promo-1", "PromoBanner"));
    expect(roundTrip(a, b)).toEqual([
      {
        op: "add",
        path: "page:home/block:Promo-1",
        value: block("Promo-1", "PromoBanner"),
        after: [],
      },
    ]);
  });

  it("удалённая секция", () => {
    const a = doc(HOME());
    const b = clone(a);
    b.pagesData.home.content.splice(2, 1);
    expect(roundTrip(a, b)).toEqual([
      { op: "remove", path: "page:home/block:Gallery-1" },
    ]);
  });

  it("массив внутри секции — одно значение (слайды, пункты меню)", () => {
    const a = doc(HOME());
    const b = clone(a);
    b.pagesData.home.content[2].props.items.push({ image: "b.png" });
    expect(roundTrip(a, b)).toEqual([
      {
        op: "set",
        path: "page:home/block:Gallery-1/props/items",
        value: [{ image: "a.png" }, { image: "b.png" }],
      },
    ]);
  });

  it("удалённое поле секции", () => {
    const a = doc(HOME());
    const b = clone(a);
    delete b.pagesData.home.content[1].props.padding;
    expect(roundTrip(a, b)).toEqual([
      { op: "remove", path: "page:home/block:Hero-1/props/padding" },
    ]);
  });

  it("свойства страницы (root)", () => {
    const a = doc(HOME());
    const b = clone(a);
    b.pagesData.home.root.props.title = "Новый";
    expect(roundTrip(a, b)).toEqual([
      { op: "set", path: "page:home/root/props/title", value: "Новый" },
    ]);
  });

  it("новая страница: мета в pages[] и содержимое в pagesData", () => {
    const a = doc(HOME());
    const b = clone(a);
    const meta = { id: "page-custom-1", name: "Акции", slug: "/sale" };
    const data = {
      content: [block("Page-custom-1", "Page")],
      root: { props: {} },
      zones: {},
    };
    b.pages.push(meta);
    b.pagesData["page-custom-1"] = data;
    expect(roundTrip(a, b)).toEqual([
      {
        op: "add",
        path: "pages/page-custom-1",
        value: meta,
        after: ["page-about", "home"],
      },
      { op: "set", path: "page:page-custom-1", value: data },
    ]);
  });

  it("удалённая страница", () => {
    const a = doc(HOME());
    const b = clone(a);
    b.pages = b.pages.filter((p: Doc) => p.id !== "page-about");
    delete b.pagesData["page-about"];
    expect(roundTrip(a, b)).toEqual([
      { op: "remove", path: "pages/page-about" },
      { op: "remove", path: "page:page-about" },
    ]);
  });

  it("мета страницы: адрес по id страницы", () => {
    const a = doc(HOME());
    const b = clone(a);
    b.pages[1].name = "Про нас";
    expect(roundTrip(a, b)).toEqual([
      { op: "set", path: "pages/page-about/name", value: "Про нас" },
    ]);
  });

  it("порядок страниц", () => {
    const a = doc(HOME());
    const b = clone(a);
    b.pages.reverse();
    expect(roundTrip(a, b)).toEqual([
      { op: "order", path: "pages/order", ids: ["page-about", "home"] },
    ]);
  });

  it("настройки темы", () => {
    const a = doc(HOME());
    const b = clone(a);
    b.themeSettings.fontHeading = "Manrope";
    b.themeSettings.colorSchemes = [{ id: "scheme-1" }, { id: "scheme-2" }];
    expect(roundTrip(a, b)).toEqual([
      {
        op: "set",
        path: "themeSettings/colorSchemes",
        value: [{ id: "scheme-1" }, { id: "scheme-2" }],
      },
      { op: "set", path: "themeSettings/fontHeading", value: "Manrope" },
    ]);
  });

  it("секция в зоне: адрес зоны читаемый, двоеточие внутри ключа зоны не экранируется", () => {
    const a = doc(HOME());
    a.pagesData.home.zones = {
      "Columns-1:left": [block("Text-z", "MainText", { text: "a" })],
    };
    const b = clone(a);
    b.pagesData.home.zones["Columns-1:left"][0].props.text = "b";
    expect(roundTrip(a, b)).toEqual([
      {
        op: "set",
        path: "page:home/zone:Columns-1:left/block:Text-z/props/text",
        value: "b",
      },
    ]);
  });

  it("служебный ключ pagesData, который не страница (число), — одно значение", () => {
    const a = doc(HOME(), {});
    a.pagesData._vanillaHomeMigrationVersion = 2;
    const b = clone(a);
    b.pagesData._vanillaHomeMigrationVersion = 3;
    expect(roundTrip(a, b)).toEqual([
      { op: "set", path: "page:_vanillaHomeMigrationVersion", value: 3 },
    ]);
  });

  it("undefined в объекте = поля нет (документ из памяти, а не из JSON)", () => {
    const a = doc(HOME());
    const b: Doc = { ...clone(a), currentPageId: undefined };
    delete a.currentPageId;
    expect(diff(a, b)).toEqual([]);
  });
});

describe("diff/apply: безопасный откат к «одному значению», когда id не годятся", () => {
  it("повторяющиеся id секций — весь список страницы одним значением", () => {
    const a = doc(HOME());
    const b = clone(a);
    b.pagesData.home.content.push(block("Hero-1", "Hero"));
    const ops = roundTrip(a, b);
    expect(ops).toEqual([
      { op: "set", path: "page:home/content", value: b.pagesData.home.content },
    ]);
  });

  it("секция без id — весь список одним значением", () => {
    const a = doc(HOME());
    const b = clone(a);
    b.pagesData.home.content[1] = { type: "Hero", props: {} };
    const ops = roundTrip(a, b);
    expect(paths(ops)).toEqual(["page:home/content"]);
  });

  it("страница без id в pages[] — весь pages одним значением", () => {
    const a = doc(HOME());
    const b = clone(a);
    b.pages.push({ name: "без id" });
    expect(paths(roundTrip(a, b))).toEqual(["pages"]);
  });
});

describe("paths / readAt", () => {
  it("paths — адреса операций по порядку, без повторов", () => {
    const ops: Op[] = [
      { op: "set", path: "a", value: 1 },
      { op: "remove", path: "b" },
      { op: "set", path: "a", value: 2 },
    ];
    expect(paths(ops)).toEqual(["a", "b"]);
  });

  it("readAt читает значение по адресу: поле, секцию, порядок; нет — undefined", () => {
    const a = doc(HOME());
    expect(readAt(a, "page:home/block:Hero-1/props/heading/text")).toBe("Было");
    expect(readAt(a, "page:home/block:Gallery-1")).toEqual(
      a.pagesData.home.content[2],
    );
    expect(readAt(a, "page:home/order")).toEqual([
      "Header-1",
      "Hero-1",
      "Gallery-1",
      "Footer-1",
    ]);
    expect(readAt(a, "pages/page-about/slug")).toBe("/about");
    expect(readAt(a, "page:home/block:Nope-1/props/x")).toBeUndefined();
    expect(readAt(a, "page:nope")).toBeUndefined();
  });
});

describe("apply: операция в пустоту — явная ошибка, а не тихая порча", () => {
  it("поле в секции, которой нет", () => {
    const a = doc(HOME());
    expect(() =>
      apply(a, [
        { op: "set", path: "page:home/block:Nope-1/props/x", value: 1 },
      ]),
    ).toThrow("apply_target_missing");
  });

  it("apply не мутирует исходный документ", () => {
    const a = doc(HOME());
    const before = clone(a);
    apply(a, [
      {
        op: "set",
        path: "page:home/block:Hero-1/props/heading/text",
        value: "x",
      },
    ]);
    expect(a).toEqual(before);
  });
});

describe("diff/apply на золотых документах пяти тем", () => {
  it.each(["rose", "flux", "bloom", "satin", "vanilla"])(
    "%s: из пустого документа и обратно",
    (theme) => {
      const g = golden(theme);
      roundTrip({}, g);
      roundTrip(g, {});
      expect(diff(g, clone(g))).toEqual([]);
    },
  );

  it("bloom: правка заголовка героя — адрес по id блока темы", () => {
    const a = golden("bloom");
    const b = clone(a);
    const hero = b.pagesData.home.content.find((x: Doc) => x.type === "Hero");
    hero.props.heading.text = "Новый заголовок";
    expect(roundTrip(a, b)).toEqual([
      {
        op: "set",
        path: "page:home/block:Hero-1/props/heading/text",
        value: "Новый заголовок",
      },
    ]);
  });
});
