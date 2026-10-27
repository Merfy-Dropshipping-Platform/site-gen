/**
 * Заготовка в ревизии — чистая функция `planSkeleton` (решение 7 спеки MCP «Секции и SDK»).
 *
 *   - стартовая ревизия nova (все списки пустые) → секции встают во все списки раскладки, «О нас» — своя страница
 *     с пунктом в главном меню;
 *   - повтор на результате ничего не меняет;
 *   - непустой список не трогается; список без нужных секций ждёт; страницы нет — она «absent».
 */
import { newThemeStarterRevision } from "../../../content/new-theme-pages";
import { loadLibrary } from "../skeleton-library";
import { SKELETON_LAYOUT, skeletonSectionNames } from "../skeleton-layout";
import { planSkeleton } from "../skeleton.plan";

const library = loadLibrary(process.cwd());
const everything = new Set(skeletonSectionNames());

function counter() {
  let n = 0;
  return () => {
    n += 1;
    return String(n).padStart(8, "0");
  };
}

type Doc = Record<string, any>;

describe("planSkeleton: новый магазин nova", () => {
  const plan = planSkeleton({
    document: newThemeStarterRevision(),
    layout: SKELETON_LAYOUT,
    library,
    present: everything,
    random: counter(),
  });
  const doc = plan.document as Doc;

  it("все списки раскладки заполнены секциями в её порядке, с префиксом shop:", () => {
    expect(plan.changed).toBe(true);
    for (const [key, names] of Object.entries(SKELETON_LAYOUT.lists)) {
      expect(doc.sections[key].map((i: Doc) => i.section)).toEqual(
        names.map((name) => `shop:${name}`),
      );
    }
    expect(plan.placement.waiting).toEqual([]);
    expect(plan.placement.absent).toEqual([]);
    expect(plan.placement.kept).toEqual([]);
  });

  it("шапка — только «Шапка»; первая секция страницы — 32 px под шапкой; корзина: итог в 24 px под строками", () => {
    expect(doc.sections.header.map((i: Doc) => i.section)).toEqual([
      "shop:header",
    ]);
    const pageStart = { padding: { top: 32, bottom: 64 } };
    for (const key of ["home", "catalog", "collection", "product", "not-found"])
      expect(doc.sections[key][0].wrapper).toEqual(pageStart);
    const [cart, summary] = doc.sections["page-cart"];
    expect(cart.wrapper).toEqual({ padding: { top: 32, bottom: 0 } });
    expect(summary.wrapper).toEqual({ padding: { top: 24, bottom: 64 } });
    // Шапка, подвал, «Поверх страниц» и секции главной после первой — с отступом темы: ключа wrapper нет.
    const themed = [
      ...doc.sections.header,
      ...doc.sections.footer,
      ...doc.sections.overlay,
      ...doc.sections.home.slice(1),
    ];
    expect(themed.some((instance: Doc) => "wrapper" in instance)).toBe(false);
  });

  it("главная — первый экран, товары магазина («Коллекция» без выбранной коллекции), один блок вопросов; «Поиск» — поверх страниц", () => {
    expect(doc.sections.home.map((i: Doc) => i.section)).toEqual([
      "shop:hero",
      "shop:collection",
      "shop:faq",
    ]);
    expect(doc.sections.home[1].settings).toEqual({});
    expect(doc.sections.overlay.map((i: Doc) => i.section)).toContain(
      "shop:search",
    );
  });

  it("экземпляр — как «Добавить секцию»: пустые настройки, блоки по умолчанию <тип>-<n>, id без повторов", () => {
    const [hero] = doc.sections.home;
    expect(hero.id).toMatch(/^hero-[a-z0-9]{8}$/);
    expect(hero.settings).toEqual({});
    const faq = doc.sections.home[2];
    expect(faq.blocks.map((b: Doc) => b.id)).toEqual([
      "question-1",
      "question-2",
      "question-3",
    ]);
    expect(doc.sections.footer[0]).not.toHaveProperty("blocks");
    const ids = Object.values(doc.sections as Record<string, Doc[]>)
      .flat()
      .map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("«О нас» — своя страница /o-nas с секцией «Страница», пустым деревом; в главном меню «Каталог» и «О нас»", () => {
    expect(plan.placement.about).toBe("created");
    const about = doc.pages.find((p: Doc) => p.slug === "/o-nas");
    expect(about).toMatchObject({
      name: "О нас",
      role: "custom",
      isCustom: true,
    });
    expect(doc.sections[about.id]).toEqual([
      expect.objectContaining({
        section: "shop:page",
        settings: { heading: "О нас" },
        wrapper: { padding: { top: 32, bottom: 64 } },
      }),
    ]);
    expect(doc.pagesData[about.id]).toEqual({
      content: [],
      root: { props: { title: "О нас" } },
      zones: {},
    });
    expect(doc.menus).toEqual([
      {
        id: "main",
        title: "Главное меню",
        items: [
          { label: "Каталог", url: "/catalog" },
          { label: "О нас", url: "/o-nas" },
        ],
      },
    ]);
    expect(plan.placement.filled.map((l) => l.label)).toContain("О нас");
  });

  it("особые страницы и прочие ключи ревизии — как были; lockVersion на один больше", () => {
    const starter = newThemeStarterRevision() as Doc;
    expect(doc.pages.slice(0, starter.pages.length)).toEqual(starter.pages);
    expect(doc.currentPageId).toBe("home");
    expect(doc.lockVersion).toBe(2);
  });

  it("повтор на результате ничего не меняет: всё «не тронуто»", () => {
    const again = planSkeleton({
      document: plan.document,
      layout: SKELETON_LAYOUT,
      library,
      present: everything,
    });
    expect(again.changed).toBe(false);
    expect(again.document).toBe(plan.document);
    expect(again.placement.filled).toEqual([]);
    expect(again.placement.about).toBe("kept");
    expect(again.placement.kept).toHaveLength(
      Object.keys(SKELETON_LAYOUT.lists).length + 1,
    );
  });
});

describe("planSkeleton: магазин, где уже что-то есть", () => {
  it("непустой список не трогается, пустые заполняются", () => {
    const starter = newThemeStarterRevision() as Doc;
    starter.sections = {
      home: [{ id: "mine-1", section: "shop:my-hero", settings: {} }],
    };
    const plan = planSkeleton({
      document: starter,
      layout: SKELETON_LAYOUT,
      library,
      present: everything,
    });
    const doc = plan.document as Doc;
    expect(doc.sections.home).toEqual([
      { id: "mine-1", section: "shop:my-hero", settings: {} },
    ]);
    expect(plan.placement.kept).toEqual([{ key: "home", label: "Главная" }]);
    expect(doc.sections.catalog.map((i: Doc) => i.section)).toEqual([
      "shop:catalog",
    ]);
  });

  it("секции нет в магазине — её список ждёт, остальные заполняются; «О нас» без «Страницы» ждёт", () => {
    const present = new Set(
      [...everything].filter((n) => n !== "cart" && n !== "page"),
    );
    const plan = planSkeleton({
      document: newThemeStarterRevision(),
      layout: SKELETON_LAYOUT,
      library,
      present,
    });
    const doc = plan.document as Doc;
    expect(plan.placement.waiting).toEqual([
      { key: "policy", label: "Политика", missing: ["page"] },
      { key: "page-cart", label: "Корзина", missing: ["cart"] },
    ]);
    expect(doc.sections["page-cart"]).toBeUndefined();
    expect(plan.placement.about).toBe("waiting");
    expect(doc.pages.some((p: Doc) => p.slug === "/o-nas")).toBe(false);
    expect(doc.sections.home).toHaveLength(3);
  });

  it("«О нас» уже есть (по адресу) с пустым списком — секция встаёт на неё, вторая страница не создаётся", () => {
    const starter = newThemeStarterRevision() as Doc;
    starter.pages.push({
      id: "page-custom-1",
      name: "Про нас",
      slug: "/o-nas",
    });
    const plan = planSkeleton({
      document: starter,
      layout: SKELETON_LAYOUT,
      library,
      present: everything,
    });
    const doc = plan.document as Doc;
    expect(plan.placement.about).toBe("kept");
    expect(doc.pages.filter((p: Doc) => p.slug === "/o-nas")).toHaveLength(1);
    expect(doc.sections["page-custom-1"].map((i: Doc) => i.section)).toEqual([
      "shop:page",
    ]);
    expect(doc.menus).toBeUndefined();
  });

  it("страницы из раскладки нет в ревизии — ключ в absent, список не создаётся", () => {
    const starter = newThemeStarterRevision() as Doc;
    starter.pages = starter.pages.filter((p: Doc) => p.id !== "page-wishlist");
    const plan = planSkeleton({
      document: starter,
      layout: SKELETON_LAYOUT,
      library,
      present: everything,
    });
    expect(plan.placement.absent).toEqual(["page-wishlist"]);
    expect((plan.document as Doc).sections["page-wishlist"]).toBeUndefined();
  });
});
