/**
 * Библиотека и раскладка заготовки (решение 7 спеки MCP «Секции и SDK»): исходники секций — из пакетов sites, раскладка
 * согласуется с их описаниями и с особыми страницами новой темы.
 */
import { SPECIAL_PAGES } from "../../../content/new-theme-pages";
import { loadLibrary } from "../skeleton-library";
import {
  SHARED_LISTS,
  SKELETON_LAYOUT,
  skeletonSectionNames,
} from "../skeleton-layout";

const library = loadLibrary(process.cwd());
const manifestOf = (name: string): Record<string, any> =>
  JSON.parse(library.get(name)!.files["section.json"]);

describe("библиотека заготовки", () => {
  it("25 секций из fixtures/shop и storefront-shell/sections; все секции раскладки в ней есть", () => {
    expect(library.size).toBe(25);
    expect(skeletonSectionNames()).toHaveLength(25);
    for (const name of skeletonSectionNames())
      expect(library.has(name)).toBe(true);
  });

  it("секция — файлы папки как есть: section.json, template.astro, скрипт; без файлов для ИИ", () => {
    const header = library.get("header")!;
    expect(Object.keys(header.files).sort()).toEqual([
      "script.ts",
      "section.json",
      "template.astro",
    ]);
    expect(header.hasBlocks).toBe(true);
    expect(library.get("cart")!.role).toBe("cart");
    expect(library.get("footer")!.role).toBeNull();
    for (const section of library.values()) {
      expect(section.files).not.toHaveProperty("AGENTS.md");
      expect(section.files).not.toHaveProperty("CLAUDE.md");
    }
  });

  it("папки нет — секций нет; повтор имени — берётся первая", () => {
    expect(loadLibrary("/nonexistent").size).toBe(0);
    const twice = loadLibrary(process.cwd(), [
      "packages/storefront-sections/fixtures/shop",
      "packages/storefront-sections/fixtures/shop",
    ]);
    expect(twice.size).toBe(15);
  });
});

describe("раскладка заготовки", () => {
  it("ключи — общие списки и особые страницы из секций (оформление заказа — не из секций)", () => {
    const pages = new Set(
      SPECIAL_PAGES.filter((page) => page.sections !== false).map((p) => p.id),
    );
    for (const key of Object.keys(SKELETON_LAYOUT.lists))
      expect(key in SHARED_LISTS || pages.has(key)).toBe(true);
    // Все особые страницы из секций получают секции.
    for (const id of pages) expect(SKELETON_LAYOUT.lists).toHaveProperty(id);
  });

  it("согласуется с описаниями секций: группы, роли, пределы", () => {
    for (const [key, names] of Object.entries(SKELETON_LAYOUT.lists)) {
      const group = key in SHARED_LISTS ? key : "page";
      for (const name of names) {
        const manifest = manifestOf(name);
        // «Поверх страниц» — для секций с ролью; конструктор их туда сам не ставит, заготовка ставит.
        if (key === "overlay") expect(manifest.role).toBeDefined();
        else expect(manifest.groups ?? ["page"]).toContain(group);
        if (manifest.limit !== undefined)
          expect(
            names.filter((other) => other === name).length,
          ).toBeLessThanOrEqual(manifest.limit);
      }
    }
    // Роль — на весь магазин не больше одной секции.
    const roles = Object.values(SKELETON_LAYOUT.lists)
      .flat()
      .map((name) => library.get(name)!.role)
      .filter(Boolean);
    expect(new Set(roles).size).toBe(roles.length);
  });

  it("«О нас»: секция с полем новой страницы, заголовок — в нём", () => {
    const manifest = manifestOf(SKELETON_LAYOUT.about.section);
    expect(manifest.newPage).toBe("heading");
    expect(SKELETON_LAYOUT.about.settings).toEqual({
      heading: SKELETON_LAYOUT.about.name,
    });
  });
});
