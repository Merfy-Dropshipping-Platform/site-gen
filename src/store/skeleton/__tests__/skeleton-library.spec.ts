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
// Особые страницы ролей — как ROLE_PLACES (packages/storefront-sections/src/roles.ts); остальные роли — «Поверх страниц».
const ROLE_PAGES: Record<string, string> = {
  cart: "page-cart",
  login: "page-login",
};
// Список общих настроек секции: нет ключа wrapper — «Цветовая схема» и «Отступы» (DEFAULT_WRAPPER_IDS).
const wrapperIdsOf = (name: string): string[] =>
  manifestOf(name).wrapper ?? ["scheme", "padding"];

describe("библиотека заготовки", () => {
  it("27 секций из fixtures/shop и storefront-shell/sections (с 29.10 — «Коллекция товаров», «Подписка на рассылку», «Контактная форма»; «Вопросы с плавным раскрытием» склеены с «Сворачиваемым разделом»); в раскладке 22 — без «Значка корзины», «Слайд-шоу», «Подписки на рассылку» и «Контактной формы», все есть в библиотеке", () => {
    expect(library.size).toBe(27);
    expect(skeletonSectionNames()).toHaveLength(22);
    for (const name of ["cart-badge", "slideshow", "newsletter", "contact-form"]) {
      expect(skeletonSectionNames()).not.toContain(name);
      expect(library.has(name)).toBe(true);
    }
    // Две секции вопросов — «Сворачиваемый раздел» (faq) и «Вопросы с плавным раскрытием» — стали одной.
    expect(library.has("faq")).toBe(true);
    expect(library.has("questions")).toBe(false);
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
    expect(twice.size).toBe(17);
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
        // Секция с ролью вне «Поверх страниц» — только на своей особой странице, иначе сборка её отбрасывает.
        if (manifest.role !== undefined && key !== "overlay")
          expect(ROLE_PAGES[manifest.role]).toBe(key);
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

  it("«Отступы» заготовки — у секций своего списка, где эта общая настройка есть (иначе сборка отбросит правку)", () => {
    for (const [key, wrappers] of Object.entries(
      SKELETON_LAYOUT.wrappers ?? {},
    ))
      for (const name of Object.keys(wrappers)) {
        expect(SKELETON_LAYOUT.lists[key]).toContain(name);
        expect(wrapperIdsOf(name)).toContain("padding");
      }
    expect(wrapperIdsOf(SKELETON_LAYOUT.about.section)).toContain("padding");
  });

  it("правки настроек и блоков заготовки — у секций своего списка и только объявленные в section.json", () => {
    for (const [key, sections] of Object.entries(
      SKELETON_LAYOUT.settings ?? {},
    ))
      for (const [name, settings] of Object.entries(sections)) {
        expect(SKELETON_LAYOUT.lists[key]).toContain(name);
        const declared = manifestOf(name).settings.map(
          (field: Record<string, unknown>) => field.id,
        );
        for (const id of Object.keys(settings)) expect(declared).toContain(id);
      }
    for (const [key, sections] of Object.entries(SKELETON_LAYOUT.blocks ?? {}))
      for (const [name, blocks] of Object.entries(sections)) {
        expect(SKELETON_LAYOUT.lists[key]).toContain(name);
        for (const block of blocks)
          expect(manifestOf(name).blocks).toHaveProperty(block.type);
      }
  });

  // Шапка с «Отступами», как на проде (базовые секции, 28.10): значение по умолчанию ставит заготовка (wrappers.header).
  it("шапка — «Цветовая схема», «Отступы», «Статичность»; служебные секции «Поверх страниц» — без «Отступов»", () => {
    expect(wrapperIdsOf("header")).toEqual(["scheme", "padding", "sticky"]);
    expect(SKELETON_LAYOUT.wrappers?.header?.header).toEqual({ padding: { top: 8, bottom: 8 } });
    for (const name of SKELETON_LAYOUT.lists.overlay)
      expect(wrapperIdsOf(name)).toEqual([]);
  });

  it("«О нас»: секция с полем новой страницы, заголовок — в нём", () => {
    const manifest = manifestOf(SKELETON_LAYOUT.about.section);
    expect(manifest.newPage).toBe("heading");
    expect(SKELETON_LAYOUT.about.settings).toEqual({
      heading: SKELETON_LAYOUT.about.name,
    });
  });
});
