/**
 * Каталог тем как порт (этап 3; П5 ThemeCatalog): одна правда для команд
 * `CreateStore`/`SetTheme` («слаг темы по каталогу, опечатка → ошибка») и для
 * списка тем.
 *
 * Тема пригодна для магазина, когда она АКТИВНА в таблице `theme` И у неё есть
 * пакет витрины с главной страницей (`packages/theme-<id>/theme.json`,
 * `pages[].isHome`) — то же условие, по которому `buildInitialRevision` строит
 * стартовую ревизию резолвером. Отсюда без отдельной ветки «под default»:
 * строка `default` (миграция 0002) пакета не имеет и в каталог не попадает.
 */
import { DbThemeCatalog, DEFAULT_THEME_ID } from "../theme-catalog";
import * as schema from "../../db/schema";

function themeRow(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: id.toUpperCase(),
    slug: id,
    description: `описание ${id}`,
    previewDesktop: null,
    previewMobile: null,
    tags: [],
    badge: null,
    author: "merfy",
    price: 0,
    isActive: true,
    ...extra,
  };
}

/** БД-заглушка: отдаёт строки `theme`, уже отфильтрованные по is_active (как SQL). */
function dbWith(rows: Array<ReturnType<typeof themeRow>>) {
  const calls: unknown[] = [];
  return {
    calls,
    db: {
      select: (_proj: unknown) => ({
        from: (tbl: unknown) => {
          calls.push(tbl);
          return {
            where: async (_cond: unknown) => rows.filter((r) => r.isActive),
          };
        },
      }),
    },
  };
}

describe("DbThemeCatalog", () => {
  const rows = ["rose", "default", "flux", "satin", "bloom", "vanilla"].map(
    (id) => themeRow(id),
  );

  it("пять тем витрины; default (без пакета) не попадает", async () => {
    const { db, calls } = dbWith(rows);
    const catalog = new DbThemeCatalog(db as any);

    const list = await catalog.list();

    expect(list.map((t) => t.id)).toEqual([
      "rose",
      "flux",
      "satin",
      "bloom",
      "vanilla",
    ]);
    expect(calls).toEqual([schema.theme]);
  });

  it("неактивная тема в каталог не попадает", async () => {
    const { db } = dbWith([
      themeRow("rose"),
      themeRow("flux", { isActive: false }),
    ]);
    const catalog = new DbThemeCatalog(db as any);
    expect((await catalog.list()).map((t) => t.id)).toEqual(["rose"]);
    expect(await catalog.find("flux")).toBeNull();
  });

  it("тема есть в базе, но пакета нет (опечатка, чужая строка) — не пригодна", async () => {
    const { db } = dbWith([themeRow("rose"), themeRow("ghost")]);
    const catalog = new DbThemeCatalog(db as any);
    expect(await catalog.find("ghost")).toBeNull();
  });

  it("find отдаёт тему каталога по id", async () => {
    const { db } = dbWith(rows);
    const catalog = new DbThemeCatalog(db as any);
    expect(await catalog.find("satin")).toMatchObject({
      id: "satin",
      name: "SATIN",
    });
    expect(await catalog.find("opechatka")).toBeNull();
  });

  it("тема по умолчанию объявлена в одном месте и сама есть в каталоге", async () => {
    const { db } = dbWith(rows);
    const catalog = new DbThemeCatalog(db as any);
    expect(catalog.defaultThemeId).toBe(DEFAULT_THEME_ID);
    expect(await catalog.find(catalog.defaultThemeId)).not.toBeNull();
  });
});
