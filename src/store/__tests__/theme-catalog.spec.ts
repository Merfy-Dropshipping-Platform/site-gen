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
    templateId: `${id}-1.0`,
    viewCount: 0,
    createdAt: null,
    updatedAt: null,
    fitsFor: [`для ${id}`],
    ownerTenantId: null,
    baseThemeId: null,
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

describe("DbThemeCatalog: этап 3.4 — «подходит для», владелец и основа", () => {
  it("элемент каталога несёт «подходит для» и превью", async () => {
    const { db } = dbWith([
      themeRow("rose", {
        fitsFor: ["Одежда", "Аксессуары"],
        previewDesktop: "/img/online_shop_page/Rose_shop_page.png",
        previewMobile: "/img/online_shop_page/Rose_shop_page_mobile.png",
      }),
    ]);
    const [rose] = await new DbThemeCatalog(db as any).list();
    expect(rose).toMatchObject({
      id: "rose",
      fitsFor: ["Одежда", "Аксессуары"],
      previewDesktop: "/img/online_shop_page/Rose_shop_page.png",
      previewMobile: "/img/online_shop_page/Rose_shop_page_mobile.png",
      ownerTenantId: null,
      baseThemeId: null,
      templateId: "rose-1.0",
    });
  });

  it("«подходит для» не задано — пустой список, а не null", async () => {
    const { db } = dbWith([themeRow("rose", { fitsFor: null })]);
    const [rose] = await new DbThemeCatalog(db as any).list();
    expect(rose.fitsFor).toEqual([]);
  });

  it("тема другого тенанта не видна; своя и платформенные — видны", async () => {
    const rows = [
      themeRow("rose"),
      themeRow("flux", { ownerTenantId: "t-other" }),
      themeRow("satin", { ownerTenantId: "t1" }),
    ];
    const catalog = new DbThemeCatalog(dbWith(rows).db as any);
    expect((await catalog.list("t1")).map((t) => t.id)).toEqual([
      "rose",
      "satin",
    ]);
    expect((await catalog.list()).map((t) => t.id)).toEqual(["rose"]);
    expect(await catalog.find("flux", "t1")).toBeNull();
  });

  it("своя тема на основе (base_theme_id) пока не пригодна: витрина рендерит только темы с собственным пакетом", async () => {
    const rows = [
      themeRow("rose"),
      themeRow("my-rose", { ownerTenantId: "t1", baseThemeId: "rose" }),
    ];
    const catalog = new DbThemeCatalog(dbWith(rows).db as any);
    expect((await catalog.list("t1")).map((t) => t.id)).toEqual(["rose"]);
    expect(await catalog.find("my-rose", "t1")).toBeNull();
  });
});
