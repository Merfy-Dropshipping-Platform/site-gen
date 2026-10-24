import { readFileSync } from "fs";
import * as path from "path";
import { hasStorefrontPackage } from "../../store/theme-catalog";
import { buildThemeCanon } from "../canon";
import { DocumentAdapter } from "../document.adapter";
import {
  SPECIAL_PAGES,
  SPECIAL_PAGE_IDS,
  SPECIAL_PAGE_SLUGS,
  isNewThemeId,
  newThemeStarterRevision,
  withSpecialPages,
} from "../new-theme-pages";

// Особые страницы магазина новой темы (блок 7 «Секций и SDK», часть 7а): список — тот же файл, что читает сборка
// витрин; стартовая ревизия — особые страницы без секций; чтение ревизии добавляет недостающие и не применяет шаги
// пяти тем.
const LIST = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "packages/storefront-build/special-pages.json"),
    "utf8",
  ),
);
const tree = (title: string) => ({
  content: [],
  root: { props: { title } },
  zones: {},
});
const HOME = {
  id: "home",
  name: "Главная",
  slug: "/",
  role: "system",
  isCustom: false,
  seo: null,
};
const NOT_FOUND = {
  id: "not-found",
  name: "Страница 404",
  slug: "/404",
  role: "system",
  isCustom: false,
  seo: null,
};

function adapterWith(data: unknown) {
  const db: any = {
    select: () => ({
      from: () => ({ where: () => Promise.resolve([{ data }]) }),
    }),
  };
  return new DocumentAdapter(db);
}

describe("особые страницы новой темы", () => {
  it("список — из special-pages.json сборки витрин; новая тема — по theme-versions.json", () => {
    expect(SPECIAL_PAGES).toEqual(LIST);
    expect([...SPECIAL_PAGE_IDS]).toEqual(["home", "not-found"]);
    expect([...SPECIAL_PAGE_SLUGS]).toEqual(["/", "/404"]);
    expect([
      isNewThemeId("nova"),
      isNewThemeId("rose"),
      isNewThemeId(null),
    ]).toEqual([true, false, false]);
  });

  it("стартовая ревизия: особые страницы, пустые деревья, секций нет", () => {
    expect(newThemeStarterRevision()).toEqual({
      pages: [HOME, NOT_FOUND],
      pagesData: { home: tree("Главная"), "not-found": tree("Страница 404") },
      currentPageId: "home",
      sections: {},
    });
  });

  it("недостающая особая страница добавляется; свои страницы, секции и меню не меняются; второй раз — то же", () => {
    const custom = {
      id: "page-custom-1",
      name: "О нас",
      slug: "/o-nas",
      role: "custom",
      isCustom: true,
      seo: null,
    };
    const doc = {
      pages: [{ ...HOME, name: "Моя главная" }, custom],
      pagesData: {
        home: { content: [{ type: "X" }], root: { props: {} }, zones: {} },
      },
      currentPageId: "page-custom-1",
      sections: {
        home: [{ id: "hero-1", section: "shop:hero", settings: {} }],
      },
      menus: [{ id: "main", title: "Главное меню", items: [] }],
    };
    const once = withSpecialPages(doc);
    expect(once.pages).toEqual([
      { ...HOME, name: "Моя главная" },
      custom,
      NOT_FOUND,
    ]);
    expect(once.pagesData).toEqual({
      ...doc.pagesData,
      "not-found": tree("Страница 404"),
    });
    expect(once.currentPageId).toBe("page-custom-1");
    expect(once.sections).toBe(doc.sections);
    expect(once.menus).toBe(doc.menus);
    expect(withSpecialPages(once)).toEqual(once);
    expect(doc.pages).toHaveLength(2);
  });

  it("канон и каталог: у новой темы — стартовая ревизия и пакет витрины", async () => {
    expect(await buildThemeCanon("nova")).toEqual(newThemeStarterRevision());
    expect(hasStorefrontPackage("nova")).toBe(true);
    expect(hasStorefrontPackage("ghost-theme")).toBe(false);
  });

  it("чтение ревизии новой темы: особые страницы добавлены, страниц пяти тем нет; как записано — без шагов", async () => {
    const stored = { pages: [HOME], sections: { home: [] } };
    const site = { themeId: "nova", publicUrl: null, currentRevisionId: "r1" };
    const { document } = await adapterWith(stored).load("s1", { site });
    expect((document.pages as { id: string }[]).map((page) => page.id)).toEqual(
      ["home", "not-found"],
    );
    expect(document.sections).toEqual({ home: [] });
    const raw = await adapterWith(stored).load("s1", { site, asStored: true });
    expect(raw.document).toEqual(stored);
  });
});
