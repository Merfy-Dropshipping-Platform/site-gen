/**
 * Слияние секций новой темы (ключ ревизии `sections`, блок 1 «Секций и SDK»,
 * риск 4): экземпляры страницы сливаются по id, как секции пяти тем в
 * `pagesData.<страница>.content`.
 */
import { apply, diff, merge3 } from "..";

type Doc = Record<string, any>;

const hero = (id: string, settings: Doc = {}): Doc => ({
  id,
  section: "shop:hero",
  settings,
});

function shop(home?: Doc[]): Doc {
  return {
    currentPageId: "home",
    pages: [{ id: "home", name: "Главная", slug: "/" }],
    pagesData: { home: { content: [], root: { props: {} }, zones: {} } },
    ...(home === undefined ? {} : { sections: { home } }),
  };
}

const ids = (doc: Doc | null): string[] =>
  (doc?.sections?.home ?? []).map((instance: Doc) => instance.id);

describe("merge3: секции новой темы сливаются по id", () => {
  it("две вкладки добавили по секции — после слияния обе на месте", () => {
    const base = shop([hero("hero-x")]);
    const current = shop([hero("hero-x"), hero("hero-a")]);
    const incoming = shop([hero("hero-x"), hero("hero-b")]);
    for (const policy of ["last-writer-wins", "reject-conflicts"] as const) {
      const r = merge3(base, current, incoming, policy);
      expect(r.conflicts).toEqual([]);
      expect(r.overwritten).toEqual([]);
      expect(ids(r.merged)).toEqual(["hero-x", "hero-b", "hero-a"]);
    }
  });

  it("первые секции магазина: ключа sections в базе нет — обе на месте", () => {
    const r = merge3(
      shop(),
      shop([hero("hero-a")]),
      shop([hero("hero-b")]),
      "last-writer-wins",
    );
    expect(r.overwritten).toEqual([]);
    expect(ids(r.merged)).toEqual(["hero-b", "hero-a"]);
  });

  it("разные поля одной секции — оба на месте; одно поле — входящее", () => {
    const base = shop([hero("hero-x")]);
    const current = shop([
      hero("hero-x", { heading: "Чужой", text: "Чужой текст" }),
    ]);
    const incoming = shop([hero("hero-x", { heading: "Мой" })]);
    const r = merge3(base, current, incoming, "last-writer-wins");
    expect((r.merged as Doc).sections.home[0].settings).toEqual({
      heading: "Мой",
      text: "Чужой текст",
    });
    expect(r.overwritten.map((item) => item.path)).toEqual([
      "sections/home/hero-x/settings/heading",
    ]);
  });

  it("адреса — по id экземпляра; apply(a, diff(a, b)) равен b", () => {
    const a = shop([hero("hero-x")]);
    const b = shop([hero("hero-y"), hero("hero-x", { heading: "Новый" })]);
    const ops = diff(a, b);
    expect(ops).toContainEqual({
      op: "add",
      path: "sections/home/hero-y",
      value: hero("hero-y"),
      after: [],
    });
    expect(ops).toContainEqual({
      op: "set",
      path: "sections/home/hero-x/settings/heading",
      value: "Новый",
    });
    expect(apply(a, ops)).toEqual(b);
  });

  it("пять тем — без ключа sections: документ как раньше", () => {
    const base = shop();
    const r = merge3(base, base, base, "last-writer-wins");
    expect(r.merged).toEqual(base);
    expect("sections" in (r.merged as Doc)).toBe(false);
  });
});
