/**
 * Политика `keep-current` (этап 3 «Запись Визи в черновик nova», К2): запись
 * агента не перезаписывает то, что поменял мерчант. Спорное место остаётся
 * значением текущей стороны и уходит в `conflicts`; `overwritten` пуст;
 * непересекающиеся правки сливаются как при `last-writer-wins`.
 */
import { merge3 } from "..";

type Doc = Record<string, any>;

const hero = (id: string, settings: Doc = {}): Doc => ({
  id,
  section: "shop:hero",
  settings,
});

function shop(home: Doc[], extra: Doc = {}): Doc {
  return {
    currentPageId: "home",
    pages: [{ id: "home", name: "Главная", slug: "/" }],
    pagesData: { home: { content: [], root: { props: {} }, zones: {} } },
    sections: { home },
    ...extra,
  };
}

const ids = (doc: Doc | null): string[] =>
  (doc?.sections?.home ?? []).map((instance: Doc) => instance.id);

describe("merge3 keep-current: спорное место остаётся мерчанту", () => {
  it("одно поле: остаётся значение мерчанта, место в conflicts, overwritten пуст", () => {
    const base = shop([hero("hero-x", { heading: "Было" })]);
    const current = shop([hero("hero-x", { heading: "Мерчант" })]);
    const incoming = shop([hero("hero-x", { heading: "Визи" })]);
    const r = merge3(base, current, incoming, "keep-current");
    expect((r.merged as Doc).sections.home[0].settings.heading).toBe("Мерчант");
    expect(r.overwritten).toEqual([]);
    expect(r.conflicts).toEqual([
      {
        path: "sections/home/hero-x/settings/heading",
        current: "Мерчант",
        incoming: "Визи",
      },
    ]);
  });

  it("разные поля одной секции сливаются, конфликта нет", () => {
    const base = shop([hero("hero-x", { heading: "Было", text: "Текст" })]);
    const current = shop([
      hero("hero-x", { heading: "Мерчант", text: "Текст" }),
    ]);
    const incoming = shop([hero("hero-x", { heading: "Было", text: "Визи" })]);
    const r = merge3(base, current, incoming, "keep-current");
    expect((r.merged as Doc).sections.home[0].settings).toEqual({
      heading: "Мерчант",
      text: "Визи",
    });
    expect(r.conflicts).toEqual([]);
    expect(r.overwritten).toEqual([]);
  });

  it("спор по одному полю не мешает слиться другому полю той же правки", () => {
    const base = shop([hero("hero-x", { heading: "Было", text: "Текст" })]);
    const current = shop([
      hero("hero-x", { heading: "Мерчант", text: "Текст" }),
    ]);
    const incoming = shop([
      hero("hero-x", { heading: "Визи", text: "Визи 2" }),
    ]);
    const r = merge3(base, current, incoming, "keep-current");
    expect((r.merged as Doc).sections.home[0].settings).toEqual({
      heading: "Мерчант",
      text: "Визи 2",
    });
    expect(r.conflicts.map((item) => item.path)).toEqual([
      "sections/home/hero-x/settings/heading",
    ]);
  });

  it("мерчант удалил секцию, Визи её правил: секция не вернулась, конфликт с current: null", () => {
    const base = shop([hero("hero-x"), hero("hero-y")]);
    const current = shop([hero("hero-y")]);
    const incoming = shop([
      hero("hero-x", { heading: "Визи" }),
      hero("hero-y"),
    ]);
    const r = merge3(base, current, incoming, "keep-current");
    expect(ids(r.merged)).toEqual(["hero-y"]);
    expect(r.overwritten).toEqual([]);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0].current).toBeNull();
    expect(r.conflicts[0].incoming).not.toBeNull();
  });

  it("мерчант правил секцию, Визи её удалил: секция осталась с правкой мерчанта, конфликт с incoming: null", () => {
    const base = shop([hero("hero-x"), hero("hero-y")]);
    const current = shop([
      hero("hero-x", { heading: "Мерчант" }),
      hero("hero-y"),
    ]);
    const incoming = shop([hero("hero-y")]);
    const r = merge3(base, current, incoming, "keep-current");
    expect(ids(r.merged)).toEqual(["hero-x", "hero-y"]);
    expect((r.merged as Doc).sections.home[0].settings.heading).toBe("Мерчант");
    expect(r.overwritten).toEqual([]);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0].incoming).toBeNull();
    expect(r.conflicts[0].current).not.toBeNull();
  });

  it("Визи добавил секцию, мерчант удалил соседнюю: конфликта нет, новая секция на месте", () => {
    const base = shop([hero("hero-x"), hero("hero-y")]);
    const current = shop([hero("hero-y")]);
    const incoming = shop([hero("hero-x"), hero("hero-new"), hero("hero-y")]);
    const r = merge3(base, current, incoming, "keep-current");
    expect(r.conflicts).toEqual([]);
    expect(r.overwritten).toEqual([]);
    expect(ids(r.merged)).toEqual(["hero-new", "hero-y"]);
  });

  it("мерчант удалил секцию, Визи ничего в ней не трогал: удаление остаётся без конфликта", () => {
    const base = shop([hero("hero-x"), hero("hero-y")]);
    const current = shop([hero("hero-y")]);
    const incoming = shop([hero("hero-x"), hero("hero-y", { text: "Визи" })]);
    const r = merge3(base, current, incoming, "keep-current");
    expect(r.conflicts).toEqual([]);
    expect(ids(r.merged)).toEqual(["hero-y"]);
    expect((r.merged as Doc).sections.home[0].settings.text).toBe("Визи");
  });

  it("мерчант удалил страницу, Визи правил её: страница удалена целиком, обе половины", () => {
    const pageOf = (id: string, name: string) => ({ id, name, slug: `/${id}` });
    const tree = (title: string) => ({
      content: [],
      root: { props: { title } },
      zones: {},
    });
    const docOf = (about?: { name: string; title: string }): Doc => ({
      currentPageId: "home",
      pages: [
        pageOf("home", "Главная"),
        ...(about ? [pageOf("about", about.name)] : []),
      ],
      pagesData: {
        home: tree("Главная"),
        ...(about ? { about: tree(about.title) } : {}),
      },
    });
    const base = docOf({ name: "О нас", title: "О нас" });
    const current = docOf();
    const incoming = docOf({ name: "Про нас", title: "Про нас" });
    const r = merge3(base, current, incoming, "keep-current");
    expect((r.merged as Doc).pages.map((p: Doc) => p.id)).toEqual(["home"]);
    expect(Object.keys((r.merged as Doc).pagesData)).toEqual(["home"]);
    expect(r.conflicts.length).toBeGreaterThan(0);
    expect(r.overwritten).toEqual([]);
  });

  it("без споров результат тот же, что у last-writer-wins", () => {
    const base = shop([hero("hero-x", { heading: "Было" })]);
    const current = shop([hero("hero-x", { heading: "Было" }), hero("hero-a")]);
    const incoming = shop([hero("hero-x", { heading: "Визи" })]);
    const kept = merge3(base, current, incoming, "keep-current");
    const wins = merge3(base, current, incoming, "last-writer-wins");
    expect(kept.merged).toEqual(wins.merged);
    expect(kept.conflicts).toEqual([]);
  });
});
