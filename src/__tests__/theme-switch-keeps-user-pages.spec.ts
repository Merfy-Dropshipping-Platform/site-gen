/**
 * Смена темы не удаляет страницы, созданные мерчантом.
 *
 * Владелец, 18.09, дословно: «При создании страницы в подпункте Страницы во
 * вкладке Онлайн-магазин, при смене темы магазина удаляются все созданные до
 * этого страницы».
 *
 * ЗАМЕР ДО (чтением кода, `sites.service.ts`): все пять тем платформы лежат в
 * `THEMES_RESEED_ON_SWITCH`, поэтому любой реальный свитч темы даёт
 * `shouldReseedOnThemeSwitch === true`. Дальше `buildInitialRevision(next)`
 * отдаёт канон верстальщиков, и он становится ТЕКУЩЕЙ ревизией целиком. Канон
 * не знает о страницах мерчанта — «О нас», «Доставка» и любые созданные им
 * страницы исчезали вместе с содержимым, без ошибки и предупреждения.
 *
 * Пересев обязан менять ДИЗАЙН (раскладку, палитру, секции темы), а не удалять
 * КОНТЕНТ. Это и сторожит тест: страницы темы берутся из канона новой темы,
 * страницы пользователя переезжают вместе со своим `pagesData`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { carryOverUserPages, shouldReseedOnThemeSwitch } from "../sites.service";

const userPage = (id: string, slug: string, name = id) => ({
  id,
  name,
  slug,
  role: "custom",
  isCustom: true,
  source: "user",
  createdAt: 1,
});

const themePage = (id: string, slug: string) => ({
  id,
  name: id,
  slug,
  role: "system",
  isCustom: false,
  source: "theme",
  createdAt: 0,
});

describe("смена темы сохраняет страницы мерчанта", () => {
  it("САБОТАЖ-ОПОРА: свитч на любую из пяти тем действительно пересеивает ревизию", () => {
    // Если бы пересева не было, тест ниже сторожил бы пустоту.
    for (const theme of ["rose", "vanilla", "bloom", "satin", "flux"]) {
      expect(
        shouldReseedOnThemeSwitch({
          hasCurrentRevision: true,
          hasThemeSettings: true,
          resetContent: false,
          prevThemeId: "rose",
          nextThemeId: theme === "rose" ? "flux" : theme,
        }),
      ).toBe(true);
    }
  });

  it("страницы пользователя переезжают в пересеянную ревизию вместе с содержимым", () => {
    const prev = {
      pages: [themePage("home", "/"), userPage("p-1", "/about", "О нас"), userPage("p-2", "/delivery", "Доставка")],
      pagesData: {
        home: { content: [{ type: "Hero", props: { id: "Hero-1" } }] },
        "p-1": { content: [{ type: "Page", props: { id: "Page-p-1", heading: "О нас" } }] },
        "p-2": { content: [{ type: "Page", props: { id: "Page-p-2", heading: "Доставка" } }] },
      },
    };
    const next = {
      pages: [themePage("home", "/"), themePage("page-catalog", "/catalog")],
      pagesData: { home: { content: [{ type: "Hero", props: { id: "Hero-new" } }] } },
      themeSettings: { colorSchemes: [{ id: 1 }] },
    };

    const out = carryOverUserPages(prev, next) as typeof next & {
      pages: Array<{ id: string }>;
      pagesData: Record<string, unknown>;
    };

    const ids = out.pages.map((p) => p.id);
    expect(ids).toContain("p-1");
    expect(ids).toContain("p-2");
    // Страницы темы — из канона НОВОЙ темы, ради этого пересев и делается.
    expect(ids).toContain("home");
    expect(ids).toContain("page-catalog");
    expect(out.pagesData.home).toEqual(next.pagesData.home);
    // Содержимое страниц мерчанта не потеряно.
    expect(out.pagesData["p-1"]).toEqual(prev.pagesData["p-1"]);
    expect(out.pagesData["p-2"]).toEqual(prev.pagesData["p-2"]);
    // Настройки новой темы не тронуты.
    expect(out.themeSettings).toEqual(next.themeSettings);
  });

  it("страницы темы не дублируются, если канон новой темы уже несёт такой id или slug", () => {
    const prev = {
      pages: [
        { ...themePage("page-about", "/about"), isCustom: true, source: "user" },
        userPage("p-9", "/blog", "Блог"),
      ],
      pagesData: { "page-about": { content: [] }, "p-9": { content: [{ type: "Page" }] } },
    };
    const next = {
      pages: [themePage("home", "/"), themePage("page-about", "/about")],
      pagesData: { home: { content: [] }, "page-about": { content: [{ type: "Page", props: { id: "canon" } }] } },
    };

    const out = carryOverUserPages(prev, next) as { pages: Array<{ id: string }>; pagesData: Record<string, unknown> };

    expect(out.pages.filter((p) => p.id === "page-about")).toHaveLength(1);
    // Победил канон новой темы — иначе в списке был бы дубль страницы.
    expect(out.pagesData["page-about"]).toEqual(next.pagesData["page-about"]);
    // А вот собственная страница мерчанта переехала.
    expect(out.pages.map((p) => p.id)).toContain("p-9");
  });

  it("страницы темы из старой ревизии НЕ тащим — иначе новая тема получит чужие секции", () => {
    const prev = {
      pages: [themePage("home", "/"), themePage("page-cart", "/cart")],
      pagesData: { home: { content: [] }, "page-cart": { content: [{ type: "CartSection" }] } },
    };
    const next = { pages: [themePage("home", "/")], pagesData: { home: { content: [] } } };

    const out = carryOverUserPages(prev, next) as { pages: Array<{ id: string }> };
    expect(out.pages.map((p) => p.id)).toEqual(["home"]);
  });

  it("нечего переносить — данные новой темы возвращаются как есть", () => {
    const next = { pages: [themePage("home", "/")], pagesData: { home: { content: [] } } };
    expect(carryOverUserPages({ pages: [] }, next)).toBe(next);
    expect(carryOverUserPages(null, next)).toBe(next);
    expect(carryOverUserPages(undefined, next)).toBe(next);
  });
});

/**
 * Проверка ПРОВОДКИ, а не самой функции.
 *
 * Без неё сторож выше зелёный даже тогда, когда `carryOverUserPages` никто не
 * вызывает: саботаж (заменить `carryOverUserPages(prev, next)` на голый
 * `defaultContent` в месте пересева) проходил мимо всех пяти проверок —
 * функция-то работает, просто её выкинули из цепочки. Ровно тот случай, про
 * который в проекте записано «зелёный гард ≠ пруф».
 *
 * Полноценный поведенческий тест здесь потребовал бы поднять
 * `SitesDomainService` со всеми зависимостями (Drizzle, RMQ-клиент Coolify,
 * генератор) — дорого для одной строки проводки. Поэтому читаем исходник: в
 * блоке пересева данные ОБЯЗАНЫ пройти через `carryOverUserPages`, и именно
 * результат уходит в `createRevision`.
 */
describe("проводка: пересев темы идёт через carryOverUserPages", () => {
  const src = readFileSync(resolve(__dirname, "..", "sites.service.ts"), "utf-8");

  it("блок пересева вызывает carryOverUserPages с данными прошлой ревизии", () => {
    const start = src.indexOf("if (shouldReseed) {");
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, start + 1400);
    expect(block).toMatch(/carryOverUserPages\(\s*prevRevisionData\s*,\s*defaultContent\s*\)/);
  });

  it("в createRevision уходит результат переноса, а не сырой канон темы", () => {
    const start = src.indexOf("if (shouldReseed) {");
    const block = src.slice(start, start + 1400);
    const dataArg = block.match(/data:\s*(\w+)/)?.[1];
    expect(dataArg).toBeDefined();
    expect(dataArg).not.toBe("defaultContent");
  });
});
