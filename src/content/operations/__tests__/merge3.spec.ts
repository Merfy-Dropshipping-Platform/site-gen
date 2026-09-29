/**
 * Трёхстороннее слияние (этап 2, кусок 2.1): `merge3(base, current, incoming,
 * policy) → { merged, overwritten[], conflicts[], applied }`.
 *
 *  - base     — версия, от которой сделана входящая правка;
 *  - current  — что лежит в магазине сейчас (там могут быть чужие правки);
 *  - incoming — что прислал пишущий.
 *
 * Правки в разных местах сливаются. Одно и то же место:
 *  - `last-writer-wins` (интерактивный конструктор) — побеждает входящая,
 *    чужое значение возвращается в `overwritten`;
 *  - `reject-conflicts` (черновики, API) — ничего не пишется, список в `conflicts`.
 */
import { diff, merge3, readAt } from "..";

type Doc = Record<string, any>;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function block(id: string, type = "Text", props: Doc = {}): Doc {
  return { type, props: { id, ...props } };
}

function base(): Doc {
  return {
    currentPageId: "home",
    lockVersion: 1,
    pages: [
      { id: "home", name: "Главная", slug: "/" },
      { id: "page-custom-1", name: "Акции", slug: "/sale" },
    ],
    pagesData: {
      home: {
        content: [
          block("Header-1", "Header", {
            navigationLinks: [{ href: "/catalog", label: "Каталог" }],
          }),
          block("Hero-1", "Hero", {
            heading: { text: "Было" },
            subtitle: "Подзаголовок",
          }),
          block("Gallery-1", "Gallery", { title: "Галерея" }),
          block("Footer-1", "Footer"),
        ],
        root: { props: { title: "Магазин" } },
        zones: {},
      },
      "page-custom-1": {
        content: [
          block("Header-c", "Header"),
          block("Page-c", "Page", { content: "Текст" }),
          block("Footer-c", "Footer"),
        ],
        root: { props: { title: "Акции" } },
        zones: {},
      },
    },
    themeSettings: { colorSchemes: [{ id: "scheme-1" }], fontHeading: "Inter" },
  };
}

function homeBlock(d: Doc, id: string): Doc {
  return d.pagesData.home.content.find((b: Doc) => b.props.id === id);
}

describe("merge3: правки в разных местах сливаются в обе", () => {
  it("разные секции одной страницы", () => {
    const b = base();
    const current = clone(b);
    homeBlock(current, "Gallery-1").props.title = "Чужая правка";
    const incoming = clone(b);
    homeBlock(incoming, "Hero-1").props.heading.text = "Моя правка";

    const r = merge3(b, current, incoming, "last-writer-wins");
    expect(r.conflicts).toEqual([]);
    expect(r.overwritten).toEqual([]);
    expect(homeBlock(r.merged!, "Gallery-1").props.title).toBe("Чужая правка");
    expect(homeBlock(r.merged!, "Hero-1").props.heading.text).toBe(
      "Моя правка",
    );
  });

  it("разные поля одной секции", () => {
    const b = base();
    const current = clone(b);
    homeBlock(current, "Hero-1").props.subtitle = "Чужой подзаголовок";
    const incoming = clone(b);
    homeBlock(incoming, "Hero-1").props.heading.text = "Мой заголовок";

    const r = merge3(b, current, incoming, "reject-conflicts");
    expect(r.conflicts).toEqual([]);
    expect(homeBlock(r.merged!, "Hero-1").props).toMatchObject({
      subtitle: "Чужой подзаголовок",
      heading: { text: "Мой заголовок" },
    });
  });

  it("чужая новая страница + пункт меню + моя правка героя", () => {
    const b = base();
    const current = clone(b);
    current.pages.push({ id: "page-custom-2", name: "Новая", slug: "/new" });
    current.pagesData["page-custom-2"] = {
      content: [block("Page-n", "Page")],
      root: { props: {} },
      zones: {},
    };
    homeBlock(current, "Header-1").props.navigationLinks.push({
      href: "/new",
      label: "Новая",
    });
    const incoming = clone(b);
    homeBlock(incoming, "Hero-1").props.heading.text = "Моя правка";

    const r = merge3(b, current, incoming, "last-writer-wins");
    expect(r.conflicts).toEqual([]);
    expect(r.overwritten).toEqual([]);
    expect((r.merged as Doc).pages.map((p: Doc) => p.id)).toEqual([
      "home",
      "page-custom-1",
      "page-custom-2",
    ]);
    expect((r.merged as Doc).pagesData["page-custom-2"]).toEqual(
      current.pagesData["page-custom-2"],
    );
    expect(homeBlock(r.merged!, "Header-1").props.navigationLinks).toHaveLength(
      2,
    );
    expect(homeBlock(r.merged!, "Hero-1").props.heading.text).toBe(
      "Моя правка",
    );
  });

  it("обе стороны добавили секции — обе на месте, каждая после своего соседа", () => {
    const b = base();
    const current = clone(b);
    current.pagesData.home.content.splice(
      3,
      0,
      block("Chuzhaya-1", "MainText"),
    );
    const incoming = clone(b);
    incoming.pagesData.home.content.splice(2, 0, block("Moya-1", "MainText"));

    const r = merge3(b, current, incoming, "reject-conflicts");
    expect(r.conflicts).toEqual([]);
    expect(readAt(r.merged!, "page:home/order")).toEqual([
      "Header-1",
      "Hero-1",
      "Moya-1",
      "Gallery-1",
      "Chuzhaya-1",
      "Footer-1",
    ]);
  });

  it("чужая перестановка + моя правка поля", () => {
    const b = base();
    const current = clone(b);
    const c = current.pagesData.home.content;
    [c[1], c[2]] = [c[2], c[1]];
    const incoming = clone(b);
    homeBlock(incoming, "Hero-1").props.heading.text = "Моя";

    const r = merge3(b, current, incoming, "reject-conflicts");
    expect(r.conflicts).toEqual([]);
    expect(readAt(r.merged!, "page:home/order")).toEqual([
      "Header-1",
      "Gallery-1",
      "Hero-1",
      "Footer-1",
    ]);
    expect(homeBlock(r.merged!, "Hero-1").props.heading.text).toBe("Моя");
  });

  it("обе стороны сделали одно и то же — это не конфликт", () => {
    const b = base();
    const current = clone(b);
    homeBlock(current, "Hero-1").props.heading.text = "Одинаково";
    const incoming = clone(current);

    const r = merge3(b, current, incoming, "reject-conflicts");
    expect(r.conflicts).toEqual([]);
    expect(r.merged).toEqual(current);
  });

  it("applied — ровно те операции, что превращают current в merged", () => {
    const b = base();
    const current = clone(b);
    homeBlock(current, "Gallery-1").props.title = "Чужая";
    const incoming = clone(b);
    homeBlock(incoming, "Hero-1").props.heading.text = "Моя";

    const r = merge3(b, current, incoming, "last-writer-wins");
    expect(r.applied).toEqual([
      {
        op: "set",
        path: "page:home/block:Hero-1/props/heading/text",
        value: "Моя",
      },
    ]);
  });
});

describe("merge3: одно и то же место — по политике", () => {
  const FIELD = "page:home/block:Hero-1/props/heading/text";

  function sameField() {
    const b = base();
    const current = clone(b);
    homeBlock(current, "Hero-1").props.heading.text = "Чужое";
    const incoming = clone(b);
    homeBlock(incoming, "Hero-1").props.heading.text = "Моё";
    return { b, current, incoming };
  }

  it("last-writer-wins: побеждает входящая, чужое — в overwritten", () => {
    const { b, current, incoming } = sameField();
    const r = merge3(b, current, incoming, "last-writer-wins");
    expect(readAt(r.merged!, FIELD)).toBe("Моё");
    expect(r.overwritten).toEqual([
      { path: FIELD, current: "Чужое", incoming: "Моё" },
    ]);
    expect(r.conflicts).toEqual([]);
  });

  it("reject-conflicts: ничего не слито, конфликт со списком значений", () => {
    const { b, current, incoming } = sameField();
    const r = merge3(b, current, incoming, "reject-conflicts");
    expect(r.merged).toBeNull();
    expect(r.conflicts).toEqual([
      { path: FIELD, current: "Чужое", incoming: "Моё" },
    ]);
    expect(r.overwritten).toEqual([]);
  });

  it("обе стороны переставили по-разному — побеждает входящий порядок", () => {
    const b = base();
    const current = clone(b);
    const cc = current.pagesData.home.content;
    [cc[1], cc[2]] = [cc[2], cc[1]];
    const incoming = clone(b);
    const ic = incoming.pagesData.home.content;
    [ic[0], ic[1]] = [ic[1], ic[0]];

    const r = merge3(b, current, incoming, "last-writer-wins");
    expect(readAt(r.merged!, "page:home/order")).toEqual([
      "Hero-1",
      "Header-1",
      "Gallery-1",
      "Footer-1",
    ]);
    expect(r.overwritten).toEqual([
      {
        path: "page:home/order",
        current: ["Header-1", "Gallery-1", "Hero-1", "Footer-1"],
        incoming: ["Hero-1", "Header-1", "Gallery-1", "Footer-1"],
      },
    ]);
  });
});

describe("merge3: удаление против правки", () => {
  it("чужое удаление секции + моя правка в ней: правка побеждает, секция возвращается на своё место", () => {
    const b = base();
    const current = clone(b);
    current.pagesData.home.content = current.pagesData.home.content.filter(
      (x: Doc) => x.props.id !== "Gallery-1",
    );
    const incoming = clone(b);
    homeBlock(incoming, "Gallery-1").props.title = "Моя";

    const lww = merge3(b, current, incoming, "last-writer-wins");
    expect(readAt(lww.merged!, "page:home/order")).toEqual([
      "Header-1",
      "Hero-1",
      "Gallery-1",
      "Footer-1",
    ]);
    expect(homeBlock(lww.merged!, "Gallery-1").props.title).toBe("Моя");
    expect(lww.overwritten).toEqual([
      {
        path: "page:home/block:Gallery-1",
        current: null,
        incoming: homeBlock(incoming, "Gallery-1"),
      },
    ]);

    const strict = merge3(b, current, incoming, "reject-conflicts");
    expect(strict.merged).toBeNull();
    expect(strict.conflicts.map((c) => c.path)).toEqual([
      "page:home/block:Gallery-1",
    ]);
  });

  it("моё удаление секции + чужая правка в ней: удаление побеждает, чужая секция — в overwritten", () => {
    const b = base();
    const current = clone(b);
    homeBlock(current, "Gallery-1").props.title = "Чужая";
    const incoming = clone(b);
    incoming.pagesData.home.content = incoming.pagesData.home.content.filter(
      (x: Doc) => x.props.id !== "Gallery-1",
    );

    const r = merge3(b, current, incoming, "last-writer-wins");
    expect(homeBlock(r.merged!, "Gallery-1")).toBeUndefined();
    expect(r.overwritten).toEqual([
      {
        path: "page:home/block:Gallery-1",
        current: homeBlock(current, "Gallery-1"),
        incoming: null,
      },
    ]);
  });

  it("чужое удаление страницы + моя правка в ней: страница возвращается целиком — и мета, и содержимое", () => {
    const b = base();
    const current = clone(b);
    current.pages = current.pages.filter((p: Doc) => p.id !== "page-custom-1");
    delete current.pagesData["page-custom-1"];
    const incoming = clone(b);
    incoming.pagesData["page-custom-1"].content[1].props.content = "Мой текст";

    const r = merge3(b, current, incoming, "last-writer-wins");
    expect((r.merged as Doc).pages.map((p: Doc) => p.id)).toEqual([
      "home",
      "page-custom-1",
    ]);
    expect(
      (r.merged as Doc).pagesData["page-custom-1"].content[1].props.content,
    ).toBe("Мой текст");
    expect(r.overwritten.map((o) => o.path).sort()).toEqual([
      "page:page-custom-1",
      "pages/page-custom-1",
    ]);

    const strict = merge3(b, current, incoming, "reject-conflicts");
    expect(strict.merged).toBeNull();
    expect(strict.conflicts.length).toBeGreaterThan(0);
  });

  it("моё удаление страницы + чужая правка в ней: страница удалена полностью", () => {
    const b = base();
    const current = clone(b);
    current.pagesData["page-custom-1"].content[1].props.content = "Чужой текст";
    const incoming = clone(b);
    incoming.pages = incoming.pages.filter(
      (p: Doc) => p.id !== "page-custom-1",
    );
    delete incoming.pagesData["page-custom-1"];

    const r = merge3(b, current, incoming, "last-writer-wins");
    expect((r.merged as Doc).pages.map((p: Doc) => p.id)).toEqual(["home"]);
    expect((r.merged as Doc).pagesData["page-custom-1"]).toBeUndefined();
  });
});

describe("merge3: служебные поля не дают конфликтов", () => {
  it.each(["last-writer-wins", "reject-conflicts"] as const)(
    "%s: currentPageId/lockVersion — берётся входящее, без overwritten и conflicts",
    (policy) => {
      const b = base();
      const current = clone(b);
      current.currentPageId = "page-custom-1";
      current.lockVersion = 7;
      const incoming = clone(b);
      incoming.currentPageId = "home-2";
      incoming.lockVersion = 3;

      const r = merge3(b, current, incoming, policy);
      expect(r.conflicts).toEqual([]);
      expect(r.overwritten).toEqual([]);
      expect((r.merged as Doc).currentPageId).toBe("home-2");
      expect((r.merged as Doc).lockVersion).toBe(3);
    },
  );

  it("служебное поле тронула только чужая сторона — остаётся чужое", () => {
    const b = base();
    const current = clone(b);
    current.currentPageId = "page-custom-1";
    const incoming = clone(b);
    const r = merge3(b, current, incoming, "reject-conflicts");
    expect((r.merged as Doc).currentPageId).toBe("page-custom-1");
  });
});

describe("merge3: список без годных id сливается одним значением, конфликт не теряется", () => {
  it("входящий список с дублем id против чужой правки секции той же страницы", () => {
    const b = base();
    const current = clone(b);
    homeBlock(current, "Hero-1").props.subtitle = "Чужое";
    const incoming = clone(b);
    incoming.pagesData.home.content.push(block("Hero-1", "Hero"));

    const r = merge3(b, current, incoming, "reject-conflicts");
    expect(r.merged).toBeNull();
    expect(r.conflicts.map((c) => c.path)).toEqual(["page:home/content"]);

    const lww = merge3(b, current, incoming, "last-writer-wins");
    expect((lww.merged as Doc).pagesData.home.content).toEqual(
      incoming.pagesData.home.content,
    );
    expect(lww.overwritten.map((o) => o.path)).toEqual(["page:home/content"]);
  });
});

describe("merge3: без чужих правок слияние = входящий документ", () => {
  it("current === base", () => {
    const b = base();
    const incoming = clone(b);
    homeBlock(incoming, "Hero-1").props.heading.text = "Моя";
    const r = merge3(b, clone(b), incoming, "reject-conflicts");
    expect(r.merged).toEqual(incoming);
    expect(r.applied).toEqual(diff(b, incoming));
  });
});
