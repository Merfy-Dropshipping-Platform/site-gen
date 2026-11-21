/**
 * «Отменить записи агента с ревизии R» — чистая часть (`undo-agent.ts`):
 * документ как без ревизий агента после R, кроме мест, которые после агента
 * менял кто-то другой (они в `kept`).
 */
import { undoAgentDocs } from "../undo-agent";
import type { UndoStep } from "../undo-agent";
import type { UndoAuthor } from "../store-content.port";

type Doc = Record<string, any>;

const WHO: Record<string, UndoAuthor> = {
  vizi: { actor: "agent", source: "vizi" },
  mcp: { actor: "agent", source: "mcp" },
  merchant: { actor: "merchant", source: "constructor" },
};

const sec = (id: string, settings: Doc = {}): Doc => ({
  id,
  section: "shop:hero",
  settings,
});

const doc = (home: Doc[], extra: Doc = {}): Doc => ({
  pages: [{ id: "home", name: "Главная" }],
  sections: { home },
  ...extra,
});

/** Документ новой темы, как его строит `doc`: списки секций по страницам. */
interface SectionsDoc {
  sections: Record<string, Array<{ id: string }>>;
}

const sectionIds = (document: unknown, page: string): string[] =>
  ((document as SectionsDoc).sections[page] ?? []).map((s) => s.id);

const step = (who: keyof typeof WHO, document: Doc): UndoStep => ({
  author: WHO[who],
  document,
});

const undo = (since: Doc, steps: UndoStep[], extra: Doc = {}) =>
  undoAgentDocs({ since, steps, source: "vizi", ...extra });

const HEADING = "sections/home/a/settings/heading";

describe("undoAgentDocs: одно поле", () => {
  it("агент — мерчант — агент: значение мерчанта, «оставленных» нет", () => {
    const R = doc([sec("a", { heading: "R" })]);
    const out = undo(R, [
      step("vizi", doc([sec("a", { heading: "В1" })])),
      step("merchant", doc([sec("a", { heading: "М" })])),
      step("vizi", doc([sec("a", { heading: "В2" })])),
    ]);
    expect(out.document).toEqual(doc([sec("a", { heading: "М" })]));
    expect(out.undone).toEqual([HEADING]);
    expect(out.kept).toEqual([]);
  });

  it("мерчант правил после агента: место остаётся и уходит в kept с автором", () => {
    const R = doc([sec("a", { heading: "R" })]);
    const head = doc([sec("a", { heading: "М" })]);
    const out = undo(R, [
      step("vizi", doc([sec("a", { heading: "В" })])),
      step("merchant", head),
    ]);
    expect(out.document).toEqual(head);
    expect(out.undone).toEqual([]);
    expect(out.kept).toEqual([
      { path: HEADING, reason: "changed_after_agent", by: WHO.merchant },
    ]);
  });
});

describe("undoAgentDocs: разные поля", () => {
  it("агент — мерчант — агент: поля агента к R, поле мерчанта остаётся", () => {
    const R = doc([sec("a", { heading: "R", text: "Т" })]);
    const out = undo(R, [
      step("vizi", doc([sec("a", { heading: "В1", text: "Т" })])),
      step("merchant", doc([sec("a", { heading: "В1", text: "М" })])),
      step(
        "vizi",
        doc([sec("a", { heading: "В2", text: "М", label: "Новое" })]),
      ),
    ]);
    expect(out.document).toEqual(doc([sec("a", { heading: "R", text: "М" })]));
    expect(out.undone.sort()).toEqual(
      [
        "sections/home/a/settings/heading",
        "sections/home/a/settings/label",
      ].sort(),
    );
    expect(out.kept).toEqual([]);
  });
});

describe("undoAgentDocs: секции", () => {
  it("добавленная агентом секция убирается", () => {
    const R = doc([sec("a")]);
    const out = undo(R, [
      step("vizi", doc([sec("a"), sec("new", { heading: "В" })])),
    ]);
    expect(out.document).toEqual(R);
    expect(out.undone).toEqual(["sections/home/new"]);
  });

  it("добавленная агентом секция, которую потом правил мерчант, остаётся (kept)", () => {
    const R = doc([sec("a")]);
    const head = doc([sec("a"), sec("new", { heading: "М" })]);
    const out = undo(R, [
      step("vizi", doc([sec("a"), sec("new", { heading: "В" })])),
      step("merchant", head),
    ]);
    expect(out.document).toEqual(head);
    expect(out.kept.map((k) => k.path)).toEqual(["sections/home/new"]);
    expect(out.kept[0].by).toEqual(WHO.merchant);
  });

  it("удалённая агентом секция возвращается на своё место", () => {
    const R = doc([sec("a"), sec("b", { heading: "Б" }), sec("c")]);
    const out = undo(R, [step("vizi", doc([sec("a"), sec("c")]))]);
    expect(out.document).toEqual(R);
    expect(out.undone).toEqual(["sections/home/b"]);
  });

  it("порядок агента откатывается, новая секция мерчанта остаётся на своём месте", () => {
    const R = doc([sec("a"), sec("b"), sec("c")]);
    const out = undo(R, [
      step("vizi", doc([sec("c"), sec("a"), sec("b")])),
      step("merchant", doc([sec("c"), sec("m"), sec("a"), sec("b")])),
    ]);
    expect(sectionIds(out.document, "home")).toEqual([
      "a",
      "m",
      "b",
      "c",
    ]);
    expect(out.undone).toEqual(["sections/home/order"]);
  });
});

describe("undoAgentDocs: страница", () => {
  const about = { id: "about", name: "О нас" };
  const withAbout = (home: Doc[], aboutSections: Doc[]): Doc => ({
    pages: [{ id: "home", name: "Главная" }, about],
    sections: { home, about: aboutSections },
  });

  it("страница агента уходит целиком: мета и список секций", () => {
    const R = doc([sec("a")]);
    const out = undo(R, [
      step("vizi", withAbout([sec("a")], [sec("t", { heading: "В" })])),
    ]);
    expect(out.document).toEqual(R);
    expect(out.undone.sort()).toEqual(["pages/about", "sections/about"]);
  });

  it("удалённая агентом страница возвращается с секциями", () => {
    const R = withAbout([sec("a")], [sec("t", { heading: "Т" })]);
    const out = undo(R, [step("vizi", doc([sec("a")]))]);
    expect(out.document).toEqual(R);
  });

  it("пять тем: блок агента в pagesData убирается и в scope", () => {
    const block = (id: string) => ({ type: "Hero", props: { id } });
    const old = (content: Doc[]): Doc => ({
      pages: [{ id: "home", name: "Главная" }],
      pagesData: { home: { content, root: {} } },
    });
    const R = old([block("H-1")]);
    const out = undo(R, [step("vizi", old([block("H-1"), block("H-2")]))], {
      scope: { sections: [{ page: "home", id: "H-2" }] },
    });
    expect(out.document).toEqual(R);
    expect(out.undone).toEqual(["page:home/block:H-2"]);
  });

  it("на странице агента мерчант правил секцию: секция и мета страницы остаются", () => {
    const R = doc([sec("a")]);
    const out = undo(R, [
      step(
        "vizi",
        withAbout([sec("a")], [sec("t", { heading: "В" }), sec("u")]),
      ),
      step(
        "merchant",
        withAbout([sec("a")], [sec("t", { heading: "М" }), sec("u")]),
      ),
    ]);
    expect(out.document).toEqual(
      withAbout([sec("a")], [sec("t", { heading: "М" })]),
    );
    expect(out.kept.map((k) => k.path)).toEqual(["sections/about/t"]);
  });
});

describe("undoAgentDocs: границы", () => {
  it("повтор: после ревизии отмены вторая отмена ничего не меняет", () => {
    const R = doc([sec("a", { heading: "R" })]);
    const steps = [
      step("vizi", doc([sec("a", { heading: "В" }), sec("new")])),
      step(
        "merchant",
        doc([sec("a", { heading: "В", text: "М" }), sec("new")]),
      ),
    ];
    const first = undo(R, steps);
    expect(first.undone.length).toBeGreaterThan(0);
    const second = undo(R, [...steps, step("vizi", first.document)]);
    expect(second.document).toEqual(first.document);
    expect(second.undone).toEqual([]);
  });

  it("scope одной секции: вторая секция агента не трогается", () => {
    const R = doc([sec("a", { heading: "R" }), sec("b", { heading: "R" })]);
    const out = undo(
      R,
      [
        step(
          "vizi",
          doc([sec("a", { heading: "В" }), sec("b", { heading: "В" })]),
        ),
      ],
      { scope: { sections: [{ page: "home", id: "a" }] } },
    );
    expect(out.document).toEqual(
      doc([sec("a", { heading: "R" }), sec("b", { heading: "В" })]),
    );
    expect(out.undone).toEqual([HEADING]);
  });

  it("scope: добавленная агентом секция убирается, соседняя новая — нет", () => {
    const R = doc([sec("a")]);
    const out = undo(R, [step("vizi", doc([sec("a"), sec("x"), sec("y")]))], {
      scope: { sections: [{ page: "home", id: "x" }] },
    });
    expect(out.document).toEqual(doc([sec("a"), sec("y")]));
  });

  it("записи другого source (агент MCP) не трогаются", () => {
    const R = doc([sec("a", { heading: "R" })]);
    const head = doc([sec("a", { heading: "MCP" }), sec("v")]);
    const out = undo(R, [
      step("vizi", doc([sec("a", { heading: "R" }), sec("v")])),
      step("mcp", head),
    ]);
    expect(out.document).toEqual(doc([sec("a", { heading: "MCP" })]));
    expect(out.undone).toEqual(["sections/home/v"]);
  });

  it("служебные поля агента (currentPageId) не откатываются", () => {
    const R = doc([sec("a")], { currentPageId: "home" });
    const head = doc([sec("a")], { currentPageId: "about" });
    const out = undo(R, [step("vizi", head)]);
    expect(out.document).toEqual(head);
    expect(out.undone).toEqual([]);
  });

  it("ревизий агента нет — ничего не изменилось", () => {
    const R = doc([sec("a")]);
    const head = doc([sec("a", { heading: "М" })]);
    const out = undo(R, [step("merchant", head)]);
    expect(out).toEqual({ document: head, undone: [], kept: [] });
  });
});
