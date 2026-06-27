import { resolveCollectionContext } from "../themes/collection-context";

/**
 * Spec 109-flux-parity / collection-page heading parity (превью ↔ live).
 *
 * Страница коллекции в превью конструктора показывала хардкод «Каталог» /
 * «Здесь начинается персональный стиль» вместо имени/описания коллекции, т.к.
 * ревизия НЕ содержит storefrontData.collections (наполняется только на live
 * из product-сервиса). Фикс: превью резолвит коллекцию из того же источника,
 * что live (fetchCollections), а `resolveCollectionContext` — чистый матчер,
 * работающий И на revision-, И на fetched-коллекциях.
 */
describe("resolveCollectionContext (109)", () => {
  const cols = [
    { id: "c1", name: "Новинки", description: "Самые последние новинки", slug: "novinki" },
    { id: "c2", name: "Хиты", description: "Лучшее", handle: "hits" },
  ];

  it("матчит по slug → имя + описание", () => {
    expect(resolveCollectionContext(cols, "novinki")).toEqual({
      name: "Новинки",
      description: "Самые последние новинки",
      slug: "novinki",
    });
  });

  it("матчит по handle", () => {
    const r = resolveCollectionContext(cols, "hits");
    expect(r.name).toBe("Хиты");
    expect(r.slug).toBe("hits");
  });

  it("матчит по id", () => {
    expect(resolveCollectionContext(cols, "c1").name).toBe("Новинки");
  });

  it("пресет 'preview' (нет конкретной коллекции) → первая коллекция как реалистичный образец", () => {
    expect(resolveCollectionContext(cols, "preview").name).toBe("Новинки");
  });

  it("конкретный slug без совпадения → пусто (НЕ показываем чужую коллекцию)", () => {
    expect(resolveCollectionContext(cols, "no-such-slug")).toEqual({});
  });

  it("пустой список → пусто", () => {
    expect(resolveCollectionContext([], "novinki")).toEqual({});
    expect(resolveCollectionContext([], "preview")).toEqual({});
  });

  it("title имеет приоритет над name (revision-коллекции используют title)", () => {
    const rev = [{ id: "x", title: "Из ревизии", name: "Из апи", slug: "x" }];
    expect(resolveCollectionContext(rev, "x").name).toBe("Из ревизии");
  });

  it("не падает на мусоре (null/не-объекты в массиве)", () => {
    const dirty = [null, 42, { id: "ok", name: "ОК", slug: "ok" }] as unknown[];
    expect(resolveCollectionContext(dirty as Array<Record<string, unknown>>, "ok").name).toBe("ОК");
  });
});
