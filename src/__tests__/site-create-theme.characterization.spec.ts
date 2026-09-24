/**
 * Характеризационные тесты: создание магазина и смена темы (волна 0).
 *
 * Цель — зафиксировать ТЕКУЩЕЕ поведение `reserve()`, `buildInitialRevision`,
 * `shouldReseedOnThemeSwitch`, `carryOverUserPages`, `update()` (смена темы),
 * `user.listener` (`user.registered`) и `finishProvisioning()` так, чтобы
 * любое изменение поведения роняло тест. Поведение НЕ меняем, продовый код
 * НЕ трогаем.
 *
 * Бриф: merfy-mcp/docs/plans/2026-09-21-wave0-characterization.md §0.2
 * Факты (устарели местами — см. пометки РАСХОЖДЕНИЕ ниже):
 *   merfy-mcp/docs/plans/2026-09-20-step1-site-and-theme.md §1
 *
 * Образцы моков БД/событий: theme-switch-keeps-user-pages.spec.ts,
 * revision-create-cas.spec.ts, sites.service.spec.ts, freeze-unfreeze.spec.ts.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  SitesDomainService,
  shouldReseedOnThemeSwitch,
  carryOverUserPages,
  THEMES_RESEED_ON_SWITCH,
} from "../sites.service";
import * as schema from "../db/schema";
import { UserListenerController } from "../user/user.listener";
import { makeCreateStoreHarness } from "../store/__tests__/support/create-store-harness";
import { makeSiteRow } from "../store/__tests__/support/in-memory-lifecycle";

// ---------------------------------------------------------------------------
// Общие помощники
// ---------------------------------------------------------------------------

class MockEvents {
  public events: Array<{ pattern: string; payload: any }> = [];
  emit(pattern: string, payload: any) {
    this.events.push({ pattern, payload });
  }
}

/** `.where(cond)` в реальном коде часто дальше вызывает `.limit(n)`; отдаём
 * промис с прицепленным `.limit`, чтобы обе формы вызова работали. */
function withLimit(rows: any[]) {
  const p: any = Promise.resolve(rows);
  p.limit = (n: number) => Promise.resolve(rows.slice(0, n));
  return p;
}

/** То же самое для `.update(...).set(...).where(cond)`, которое иногда
 * дочитывается через `.returning(...)`, а иногда просто await'ится напрямую. */
function withReturning(rows: any[]) {
  const p: any = Promise.resolve(rows);
  p.returning = (_proj: any) => Promise.resolve(rows);
  return p;
}

function makeBareService(): any {
  const dep = {} as any;
  return new SitesDomainService(dep, dep, dep, dep, dep, dep, dep, dep, dep);
}

// ---------------------------------------------------------------------------
// 1. reserve() — создание магазина
// ---------------------------------------------------------------------------

describe("reserve(): создание магазина (sites.service.ts:~463-577)", () => {
  function makeReserveDb(opts: {
    siteCount?: number;
    slugResponses?: any[][];
  }) {
    const inserted: Array<{ table: unknown; value: any }> = [];
    const siteUpdates: any[] = [];
    const slugResponses = opts.slugResponses ? [...opts.slugResponses] : [[]];

    const db: any = {
      select: (proj: any) => ({
        from: (tbl: any) => ({
          where: (_cond: any) => {
            if (tbl !== schema.site) return withLimit([]);
            const isCountQuery =
              proj && Object.prototype.hasOwnProperty.call(proj, "count");
            if (isCountQuery)
              return withLimit([{ count: opts.siteCount ?? 0 }]);
            const next =
              slugResponses.length > 1
                ? slugResponses.shift()!
                : slugResponses[0];
            return withLimit(next);
          },
        }),
      }),
      insert: (tbl: any) => ({
        values: async (value: any) => {
          inserted.push({ table: tbl, value });
          return value;
        },
      }),
      update: (_tbl: any) => ({
        set: (setValues: any) => {
          siteUpdates.push(setValues);
          return { where: async (_c: any) => [] };
        },
      }),
    };
    return { db, inserted, siteUpdates };
  }

  function makeReserveService(
    db: any,
    opts: {
      billingAllowed?: boolean;
      billingReason?: string;
      billingLimit?: number;
    } = {},
  ) {
    const events = new MockEvents();
    const billingClient = {
      canCreateSite: async (_t: string, _c: number) => ({
        allowed: opts.billingAllowed ?? true,
        reason: opts.billingReason,
        limit: opts.billingLimit ?? 5,
      }),
    };
    const dep = {} as any;
    const service = new SitesDomainService(
      db,
      dep,
      dep,
      events as any,
      dep,
      dep,
      dep,
      billingClient as any,
      dep,
    );
    return { service, events };
  }

  it("текущее поведение: без themeId используется тема по умолчанию rose, статус — draft", async () => {
    const { db, inserted } = makeReserveDb({ siteCount: 0 });
    const { service } = makeReserveService(db);
    jest.spyOn(service as any, "buildInitialRevision").mockResolvedValue(null);

    const result = await service.reserve({
      tenantId: "t1",
      actorUserId: "u1",
      name: "My Shop",
    });

    expect(result.publicUrl).toBeNull();
    const siteInsert = inserted.find((i) => i.table === schema.site);
    expect(siteInsert?.value.themeId).toBe("rose");
    expect(siteInsert?.value.status).toBe("draft");
  });

  it("текущее поведение: переданный themeId сохраняется как есть", async () => {
    const { db, inserted } = makeReserveDb({ siteCount: 0 });
    const { service } = makeReserveService(db);
    jest.spyOn(service as any, "buildInitialRevision").mockResolvedValue(null);

    await service.reserve({
      tenantId: "t1",
      actorUserId: "u1",
      name: "My Shop",
      themeId: "satin",
    });

    const siteInsert = inserted.find((i) => i.table === schema.site);
    expect(siteInsert?.value.themeId).toBe("satin");
  });

  it("НАХОДКА: slugify не транслитерирует — кириллическое имя даёт слаг «-», а не осмысленную строку", async () => {
    const { db, inserted } = makeReserveDb({ siteCount: 0 });
    const { service } = makeReserveService(db);
    jest.spyOn(service as any, "buildInitialRevision").mockResolvedValue(null);

    await service.reserve({
      tenantId: "t1",
      actorUserId: "u1",
      name: "Мой Магазин",
    });

    const siteInsert = inserted.find((i) => i.table === schema.site);
    // slugify() вырезает всё вне [a-z0-9\s-]; кириллица целиком выпадает,
    // остаётся только пробел между словами → он схлопывается в один дефис.
    expect(siteInsert?.value.slug).toBe("-");
  });

  it("текущее поведение: slug получает читаемый суффикс -1, -2 при коллизии имени в рамках tenant", async () => {
    const { db, inserted } = makeReserveDb({
      siteCount: 0,
      slugResponses: [[{ id: "existing-0" }], [{ id: "existing-1" }], []],
    });
    const { service } = makeReserveService(db);
    jest.spyOn(service as any, "buildInitialRevision").mockResolvedValue(null);

    await service.reserve({
      tenantId: "t1",
      actorUserId: "u1",
      name: "My Shop",
    });

    const siteInsert = inserted.find((i) => i.table === schema.site);
    expect(siteInsert?.value.slug).toBe("my-shop-2");
  });

  it("текущее поведение: стартовая ревизия создаётся с setCurrent=true и meta.title = имя магазина", async () => {
    const { db, inserted, siteUpdates } = makeReserveDb({ siteCount: 0 });
    const { service } = makeReserveService(db);
    jest.spyOn(service, "get").mockResolvedValue({
      id: "s1",
      tenantId: "t1",
      currentRevisionId: null,
    } as any);
    const fakeContent = { pages: [{ id: "home" }], pagesData: { home: {} } };
    jest
      .spyOn(service as any, "buildInitialRevision")
      .mockResolvedValue(fakeContent);

    await service.reserve({
      tenantId: "t1",
      actorUserId: "u1",
      name: "My Shop",
    });

    const revisionInsert = inserted.find(
      (i) => i.table === schema.siteRevision,
    );
    expect(revisionInsert).toBeDefined();
    expect(revisionInsert!.value.data).toEqual(fakeContent);
    expect(revisionInsert!.value.meta).toEqual({ title: "My Shop" });
    // setCurrent: true → отдельный db.update(site).set({currentRevisionId,...})
    expect(siteUpdates.some((u) => u.currentRevisionId)).toBe(true);
  });

  it("текущее поведение: ошибка построения стартовой ревизии глотается — магазин всё равно создан, ревизии нет", async () => {
    const { db, inserted } = makeReserveDb({ siteCount: 0 });
    const { service, events } = makeReserveService(db);
    jest
      .spyOn(service as any, "buildInitialRevision")
      .mockRejectedValue(new Error("seed exploded"));

    const result = await service.reserve({
      tenantId: "t1",
      actorUserId: "u1",
      name: "My Shop",
    });

    expect(result.id).toEqual(expect.any(String));
    expect(inserted.some((i) => i.table === schema.site)).toBe(true);
    expect(inserted.some((i) => i.table === schema.siteRevision)).toBe(false);
    expect(events.events.some((e) => e.pattern === "sites.site.created")).toBe(
      true,
    );
  });

  it("текущее поведение: событие sites.site.created несёт ровно {tenantId, siteId, name, slug, publicUrl:null}", async () => {
    const { db } = makeReserveDb({ siteCount: 0 });
    const { service, events } = makeReserveService(db);
    jest.spyOn(service as any, "buildInitialRevision").mockResolvedValue(null);

    const result = await service.reserve({
      tenantId: "tenant-9",
      actorUserId: "u1",
      name: "My Shop",
    });

    const created = events.events.find(
      (e) => e.pattern === "sites.site.created",
    );
    expect(created?.payload).toEqual({
      tenantId: "tenant-9",
      siteId: result.id,
      name: "My Shop",
      slug: "my-shop",
      publicUrl: null,
    });
  });

  it("текущее поведение: биллинг отклоняет лимитом магазинов — Error('shops_limit_reached')", async () => {
    const { db } = makeReserveDb({ siteCount: 3 });
    const { service } = makeReserveService(db, {
      billingAllowed: false,
      billingReason: "shops_limit_reached",
      billingLimit: 3,
    });

    await expect(
      service.reserve({ tenantId: "t1", actorUserId: "u1", name: "My Shop" }),
    ).rejects.toThrow("shops_limit_reached");
  });

  it("текущее поведение: биллинг отклоняет заморозкой аккаунта — Error('account_frozen')", async () => {
    const { db } = makeReserveDb({ siteCount: 0 });
    const { service } = makeReserveService(db, {
      billingAllowed: false,
      billingReason: "account_frozen",
    });

    await expect(
      service.reserve({ tenantId: "t1", actorUserId: "u1", name: "My Shop" }),
    ).rejects.toThrow("account_frozen");
  });
});

// ---------------------------------------------------------------------------
// 2. buildInitialRevision() — источник стартового контента по теме
// ---------------------------------------------------------------------------

describe("buildInitialRevision(): источник стартового контента (sites.service.ts:~1616)", () => {
  it.each(["rose", "flux", "bloom", "satin"])(
    "РАСХОЖДЕНИЕ С БРИФОМ: тема %s строит ревизию через PageResolver (14 страниц манифеста, не legacy defaults/<t>.json)",
    async (theme) => {
      const service = makeBareService();
      const revision = await service.buildInitialRevision(theme);

      expect(revision.themeId).toBe(theme);
      expect(revision.manifestVersion).toBe("2.0");
      expect(revision.pages).toHaveLength(14);
      expect(revision.pages.map((p: any) => p.id)).toContain("home");
      expect(revision.currentPageId).toBe("home");
      expect(Object.keys(revision.pagesData)).toHaveLength(14);
    },
  );

  it("текущее поведение: vanilla тоже строит ревизию через PageResolver, но с 13 страницами (нет page-checkout-result)", async () => {
    const service = makeBareService();
    const revision = await service.buildInitialRevision("vanilla");

    expect(revision.pages).toHaveLength(13);
    expect(revision.pages.map((p: any) => p.id)).not.toContain(
      "page-checkout-result",
    );
  });

  it("текущее поведение: неизвестная тема падает в легаси getDefaultContent → rose.json (одна страница home, без manifestVersion)", async () => {
    const service = makeBareService();
    const revision = await service.buildInitialRevision(
      "totally-unknown-theme-xyz",
    );

    expect(revision.manifestVersion).toBeUndefined();
    expect(revision.themeId).toBeUndefined();
    expect(revision.pages).toEqual([expect.objectContaining({ id: "home" })]);
    expect(revision.themeSettings?.colorSchemes).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 3. getDefaultContent() — легаси JSON-сид (сегодня доступен только как
//    fallback для неизвестных тем или при падении PageResolver)
// ---------------------------------------------------------------------------

describe("getDefaultContent(): легаси JSON-сид по теме (sites.service.ts:~1652)", () => {
  function loadDefaultsJson(theme: string) {
    return JSON.parse(
      readFileSync(
        resolve(
          __dirname,
          "..",
          "generator",
          "templates",
          "defaults",
          `${theme}.json`,
        ),
        "utf-8",
      ),
    );
  }

  it("текущее поведение: известная тема грузит defaults/<theme>.json", () => {
    const service = makeBareService();
    expect(service.getDefaultContent("flux")).toEqual(loadDefaultsJson("flux"));
  });

  it("текущее поведение: тема без файла defaults/<theme>.json откатывается на rose.json", () => {
    const service = makeBareService();
    expect(service.getDefaultContent("no-such-theme")).toEqual(
      loadDefaultsJson("rose"),
    );
  });

  it("текущее поведение: без аргумента тоже используется rose", () => {
    const service = makeBareService();
    expect(service.getDefaultContent()).toEqual(loadDefaultsJson("rose"));
  });
});

// ---------------------------------------------------------------------------
// 4. shouldReseedOnThemeSwitch() — таблица решений (чистая функция).
//    Сжатая копия для самодостаточности файла волны 0; подробная матрица —
//    flux-theme-switch-reseed.spec.ts (уже в репозитории, не дублируем 1:1).
// ---------------------------------------------------------------------------

describe("shouldReseedOnThemeSwitch(): таблица решений (sites.service.ts:~102-125)", () => {
  const base = {
    hasCurrentRevision: true,
    hasThemeSettings: true,
    resetContent: false,
    prevThemeId: "rose",
    nextThemeId: "rose",
  };

  it("текущее поведение: новый сайт без ревизии — true", () => {
    expect(
      shouldReseedOnThemeSwitch({
        ...base,
        hasCurrentRevision: false,
        nextThemeId: "unknown",
      }),
    ).toBe(true);
  });

  it("текущее поведение: ревизия без themeSettings — true", () => {
    expect(
      shouldReseedOnThemeSwitch({
        ...base,
        hasThemeSettings: false,
        nextThemeId: "unknown",
      }),
    ).toBe(true);
  });

  it("текущее поведение: явный resetContent — true", () => {
    expect(
      shouldReseedOnThemeSwitch({
        ...base,
        resetContent: true,
        nextThemeId: "unknown",
      }),
    ).toBe(true);
  });

  it.each([...THEMES_RESEED_ON_SWITCH])(
    "текущее поведение: реальный свитч на тему из пятёрки (%s) — true",
    (theme) => {
      const prev = theme === "rose" ? "flux" : "rose";
      expect(
        shouldReseedOnThemeSwitch({
          ...base,
          prevThemeId: prev,
          nextThemeId: theme,
        }),
      ).toBe(true);
    },
  );

  it("текущее поведение: тот же themeId — false (ре-сейв не сбрасывает правки)", () => {
    expect(
      shouldReseedOnThemeSwitch({
        ...base,
        prevThemeId: "flux",
        nextThemeId: "flux",
      }),
    ).toBe(false);
  });

  it("текущее поведение: смена на неизвестную тему — false (allowlist не пускает)", () => {
    expect(
      shouldReseedOnThemeSwitch({
        ...base,
        prevThemeId: "rose",
        nextThemeId: "my-custom-theme",
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. carryOverUserPages() — перенос страниц мерчанта при пересеве.
//    Сжатая копия; подробно — theme-switch-keeps-user-pages.spec.ts.
// ---------------------------------------------------------------------------

describe("carryOverUserPages(): перенос страниц мерчанта (sites.service.ts:~189)", () => {
  it("текущее поведение: страница мерчанта переезжает вместе с содержимым, страницы темы берутся из канона новой темы", () => {
    const prev = {
      pages: [
        { id: "home", source: "theme" },
        { id: "p-1", slug: "/about", source: "user", isCustom: true },
      ],
      pagesData: { home: { a: 1 }, "p-1": { b: 2 } },
    };
    const next = {
      pages: [
        { id: "home", source: "theme" },
        { id: "page-catalog", source: "theme" },
      ],
      pagesData: { home: { a: "NEW" } },
    };

    const out = carryOverUserPages(prev, next) as any;

    expect(out.pages.map((p: any) => p.id)).toEqual([
      "home",
      "page-catalog",
      "p-1",
    ]);
    expect(out.pagesData["p-1"]).toEqual({ b: 2 });
    expect(out.pagesData.home).toEqual({ a: "NEW" });
  });
});

// ---------------------------------------------------------------------------
// 6. update() — смена темы у существующего магазина (sites.service.ts:~786)
// ---------------------------------------------------------------------------

describe("update(): смена темы у существующего магазина", () => {
  function makeUpdateDb(opts: {
    existingSite: {
      themeId: string | null;
      status: string;
      settings?: any;
      branding?: any;
    };
    currentRevisionId?: string | null;
    currentRevisionData?: any;
  }) {
    const inserted: Array<{ table: unknown; value: any }> = [];
    const siteUpdates: any[] = [];
    let siteSelectCalls = 0;

    const db: any = {
      select: (_proj: any) => ({
        from: (tbl: any) => ({
          where: (_cond: any) => {
            if (tbl === schema.site) {
              siteSelectCalls += 1;
              if (siteSelectCalls === 1)
                return withLimit([{ ...opts.existingSite }]);
              return withLimit([
                {
                  id: "site-1",
                  currentRevisionId: opts.currentRevisionId ?? null,
                },
              ]);
            }
            if (tbl === schema.siteRevision) {
              return withLimit(
                opts.currentRevisionId
                  ? [{ data: opts.currentRevisionData ?? {} }]
                  : [],
              );
            }
            return withLimit([]);
          },
        }),
      }),
      insert: (tbl: any) => ({
        values: async (value: any) => {
          inserted.push({ table: tbl, value });
          return value;
        },
      }),
      update: (tbl: any) => ({
        set: (setValues: any) => {
          if (tbl === schema.site) siteUpdates.push(setValues);
          return { where: (_c: any) => withReturning([{ id: "site-1" }]) };
        },
      }),
    };
    return { db, inserted, siteUpdates };
  }

  function makeUpdateService(db: any) {
    const events = new MockEvents();
    const dep = {} as any;
    const service = new SitesDomainService(
      db,
      dep,
      dep,
      events as any,
      dep,
      dep,
      dep,
      dep,
      dep,
    );
    // createRevision() всегда начинается с this.get(...) — упрощаем его до
    // прямого возврата строки сайта, как в revision-create-cas.spec.ts.
    jest.spyOn(service, "get").mockResolvedValue({
      id: "site-1",
      tenantId: "t1",
      currentRevisionId: "rev-current",
    } as any);
    return { service, events };
  }

  const withThemeSettings = {
    pages: [],
    pagesData: {},
    themeSettings: { colorSchemes: [{ id: "x" }] },
  };

  it("текущее поведение: themeAppliedAt ставится только при реальной смене темы", async () => {
    const { db, siteUpdates } = makeUpdateDb({
      existingSite: { themeId: "rose", status: "draft" },
      currentRevisionId: "rev-1",
      currentRevisionData: withThemeSettings,
    });
    const { service } = makeUpdateService(db);

    await service.update({
      tenantId: "t1",
      siteId: "site-1",
      patch: { themeId: "flux" },
      actorUserId: "u1",
    });

    expect(siteUpdates[0].themeAppliedAt).toBeInstanceOf(Date);
  });

  it("текущее поведение: тот же themeId НЕ двигает themeAppliedAt (ключа нет в апдейте вовсе)", async () => {
    const { db, siteUpdates } = makeUpdateDb({
      existingSite: { themeId: "flux", status: "draft" },
      currentRevisionId: "rev-1",
      currentRevisionData: withThemeSettings,
    });
    const { service } = makeUpdateService(db);

    await service.update({
      tenantId: "t1",
      siteId: "site-1",
      patch: { themeId: "flux" },
      actorUserId: "u1",
    });

    expect("themeAppliedAt" in siteUpdates[0]).toBe(false);
  });

  it("текущее поведение: реальный свитч темы пересеивает ревизию каноном новой темы и переносит страницу мерчанта", async () => {
    const { db, inserted } = makeUpdateDb({
      existingSite: { themeId: "rose", status: "draft" },
      currentRevisionId: "rev-1",
      currentRevisionData: {
        pages: [
          { id: "home", source: "theme" },
          // slug НЕ должен совпадать ни с одной системной страницей канона
          // (иначе carryOverUserPages сочтёт её дублем канона и отфильтрует —
          // ровно так и было поймано на /about, который есть у всех тем).
          {
            id: "p-1",
            slug: "/moya-stranica-merchanta",
            source: "user",
            isCustom: true,
          },
        ],
        pagesData: { home: { old: true }, "p-1": { text: "О нас мерчанта" } },
        themeSettings: { colorSchemes: [{ id: "x" }] },
      },
    });
    const { service } = makeUpdateService(db);

    const result = await service.update({
      tenantId: "t1",
      siteId: "site-1",
      patch: { themeId: "flux" },
      actorUserId: "u1",
    });

    expect(result).toBe(true);
    const revisionInsert = inserted.find(
      (i) => i.table === schema.siteRevision,
    );
    expect(revisionInsert).toBeDefined();
    expect(revisionInsert!.value.meta).toEqual({ title: "Theme reseed" });
    const pageIds = revisionInsert!.value.data.pages.map((p: any) => p.id);
    expect(pageIds).toContain("p-1"); // страница мерчанта переехала
    expect(pageIds).toContain("home"); // канон новой темы (flux, 14 страниц)
    expect(pageIds.length).toBe(15); // 14 канона flux + 1 перенесённая
    expect(revisionInsert!.value.data.pagesData["p-1"]).toEqual({
      text: "О нас мерчанта",
    });
  });

  it("НАХОДКА: страница мерчанта с тем же slug, что и системная страница новой темы (например /about), при пересеве ТИХО теряется", async () => {
    // Поймано этим же файлом при первом прогоне: во всех пяти темах есть
    // системная страница «О нас» со slug «/about». Если мерчант создал свою
    // страницу с тем же URL, carryOverUserPages считает её дублем канона
    // (проверка идёт по id ИЛИ по slug) и отфильтровывает — контент мерчанта
    // пропадает без ошибки и без предупреждения. Реальный аналог бага
    // владельца от 18.09, просто через совпадение путей, а не полным пересевом.
    const { db, inserted } = makeUpdateDb({
      existingSite: { themeId: "rose", status: "draft" },
      currentRevisionId: "rev-1",
      currentRevisionData: {
        pages: [
          { id: "home", source: "theme" },
          {
            id: "p-custom-about",
            slug: "/about",
            source: "user",
            isCustom: true,
          },
        ],
        pagesData: {
          home: { old: true },
          "p-custom-about": { text: "Мерчант переписал О нас по-своему" },
        },
        themeSettings: { colorSchemes: [{ id: "x" }] },
      },
    });
    const { service } = makeUpdateService(db);

    await service.update({
      tenantId: "t1",
      siteId: "site-1",
      patch: { themeId: "flux" },
      actorUserId: "u1",
    });

    const revisionInsert = inserted.find(
      (i) => i.table === schema.siteRevision,
    );
    const pageIds = revisionInsert!.value.data.pages.map((p: any) => p.id);
    // Страница мерчанта НЕ попала в новую ревизию — победил канон flux.
    expect(pageIds).not.toContain("p-custom-about");
    expect(
      revisionInsert!.value.data.pagesData["p-custom-about"],
    ).toBeUndefined();
    expect(pageIds).toHaveLength(14); // ровно канон flux, без добавленной страницы
  });

  it("текущее поведение: тот же themeId — ревизия НЕ пересеивается", async () => {
    const { db, inserted } = makeUpdateDb({
      existingSite: { themeId: "flux", status: "draft" },
      currentRevisionId: "rev-1",
      currentRevisionData: withThemeSettings,
    });
    const { service } = makeUpdateService(db);

    await service.update({
      tenantId: "t1",
      siteId: "site-1",
      patch: { themeId: "flux" },
      actorUserId: "u1",
    });

    expect(inserted.some((i) => i.table === schema.siteRevision)).toBe(false);
  });

  it("текущее поведение: неизвестный слаг темы пишется в themeId без ошибки и без пересева", async () => {
    const { db, inserted, siteUpdates } = makeUpdateDb({
      existingSite: { themeId: "rose", status: "draft" },
      currentRevisionId: "rev-1",
      currentRevisionData: withThemeSettings,
    });
    const { service } = makeUpdateService(db);

    const result = await service.update({
      tenantId: "t1",
      siteId: "site-1",
      patch: { themeId: "opechatka-tema" },
      actorUserId: "u1",
    });

    expect(result).toBe(true);
    expect(siteUpdates[0].themeId).toBe("opechatka-tema");
    expect(inserted.some((i) => i.table === schema.siteRevision)).toBe(false);
  });

  it("текущее поведение: легаси patch.theme.id тоже принимается как смена темы", async () => {
    const { db, siteUpdates } = makeUpdateDb({
      existingSite: { themeId: "rose", status: "draft" },
      currentRevisionId: "rev-1",
      currentRevisionData: withThemeSettings,
    });
    const { service } = makeUpdateService(db);

    await service.update({
      tenantId: "t1",
      siteId: "site-1",
      patch: { theme: { id: "satin" } },
      actorUserId: "u1",
    });

    expect(siteUpdates[0].themeId).toBe("satin");
  });

  it("текущее поведение: у ОПУБЛИКОВАННОГО магазина реальная смена темы запускает publish() в фоне", async () => {
    const { db } = makeUpdateDb({
      existingSite: { themeId: "rose", status: "published" },
      currentRevisionId: "rev-1",
      currentRevisionData: withThemeSettings,
    });
    const { service } = makeUpdateService(db);
    const publishSpy = jest
      .spyOn(service, "publish")
      .mockResolvedValue({ url: "https://x" } as any);

    await service.update({
      tenantId: "t1",
      siteId: "site-1",
      patch: { themeId: "flux" },
      actorUserId: "u1",
    });

    expect(publishSpy).toHaveBeenCalledWith({
      tenantId: "t1",
      siteId: "site-1",
      mode: "production",
    });
  });

  it("текущее поведение: ЧЕРНОВИК при смене темы НЕ вызывает publish()", async () => {
    const { db } = makeUpdateDb({
      existingSite: { themeId: "rose", status: "draft" },
      currentRevisionId: "rev-1",
      currentRevisionData: withThemeSettings,
    });
    const { service } = makeUpdateService(db);
    const publishSpy = jest
      .spyOn(service, "publish")
      .mockResolvedValue({ url: "https://x" } as any);

    await service.update({
      tenantId: "t1",
      siteId: "site-1",
      patch: { themeId: "flux" },
      actorUserId: "u1",
    });

    expect(publishSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 7. user.listener: user.registered — дефолтный магазин при регистрации
//
// ИЗМЕНЕНО ОСОЗНАННО (этап 3, кусок 3.2, план
// merfy-mcp/docs/plans/2026-09-24-stage3-store-commands-saga.md, И1/И2):
// БЫЛО — листенер сам спрашивал биллинг (`billing.get_entitlements`) и список
//   магазинов, затем звал `reserve({name:'Мой сайт'})` +
//   `triggerAsyncProvisioning` (второй раз лимит проверял `reserve()`).
// СТАЛО — листенер зовёт команду `CreateStore` (`ifNoStores`, источник
//   `registration`, без ожидания): лимит и «у тенанта уже есть магазин» решает
//   команда один раз, под блокировкой тенанта; провижининг ведёт доводчик саги.
// Три наблюдаемых исхода волны 0 сохранены и проверяются ниже через настоящую
// команду на памяти: 0 магазинов → «Мой сайт» создан; магазин есть → нового
// нет; лимит 0 → магазина нет.
// ---------------------------------------------------------------------------

describe("UserListenerController.handleUserRegistered (src/user/user.listener.ts)", () => {
  const event = { userId: "u1", tenantId: "t1", accountId: "acc1" };

  it("стало: регистрация зовёт CreateStore('Мой сайт', ifNoStores, registration) — сама ничего не решает", async () => {
    const createStore = {
      execute: jest
        .fn()
        .mockResolvedValue({ ok: true, effect: { created: true } }),
    };
    const controller = new UserListenerController(createStore as any);

    await controller.handleUserRegistered(event, {} as any);

    expect(createStore.execute).toHaveBeenCalledTimes(1);
    expect(createStore.execute).toHaveBeenCalledWith({
      tenantId: "t1",
      actorUserId: "u1",
      name: "Мой сайт",
      ifNoStores: true,
      wait: false,
      source: "registration",
    });
  });

  it("исход волны 0 сохранён: 0 магазинов и лимит позволяет — создан «Мой сайт» на теме по умолчанию", async () => {
    const { command, repo } = makeCreateStoreHarness({
      entitlements: { shopsLimit: 5 },
    });
    const controller = new UserListenerController(command);

    await controller.handleUserRegistered(event, {} as any);
    await command.settle();

    const rows = [...repo.rows.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenantId: "t1",
      name: "Мой сайт",
      themeId: "rose",
      lifecycle: "ready",
    });
  });

  it("исход волны 0 сохранён: магазин уже есть — новый не создаётся", async () => {
    const { command, repo, registry } = makeCreateStoreHarness({
      entitlements: { shopsLimit: 5 },
    });
    repo.put(makeSiteRow({ id: "existing", tenantId: "t1", lifecycle: null }));
    const controller = new UserListenerController(command);

    await controller.handleUserRegistered(event, {} as any);

    expect(registry.inserted).toHaveLength(0);
  });

  it("исход волны 0 сохранён: лимит тарифа 0 — магазин не создаётся, листенер не падает", async () => {
    const { command, registry } = makeCreateStoreHarness({
      entitlements: { shopsLimit: 0 },
    });
    const controller = new UserListenerController(command);

    await expect(
      controller.handleUserRegistered(event, {} as any),
    ).resolves.toBeUndefined();

    expect(registry.inserted).toHaveLength(0);
  });

  it("стало: без userId/tenantId команда не вызывается; её исключение листенер глотает", async () => {
    const createStore = {
      execute: jest.fn().mockRejectedValue(new Error("db down")),
    };
    const controller = new UserListenerController(createStore as any);

    await controller.handleUserRegistered(
      { userId: "", tenantId: "t1", accountId: "" },
      {} as any,
    );
    expect(createStore.execute).not.toHaveBeenCalled();

    await expect(
      controller.handleUserRegistered(event, {} as any),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 8. finishProvisioning() — довыполнение провижининга (домен + Coolify)
// ---------------------------------------------------------------------------

describe("finishProvisioning(): довыполнение провижининга (sites.service.ts:~594)", () => {
  it("текущее поведение: оба поля уже есть — идемпотентный no-op, внешние клиенты не дёргаются", async () => {
    const db: any = {
      select: () => ({
        from: (_tbl: any) => ({
          where: (_c: any) =>
            withLimit([
              {
                domainId: "dom-1",
                publicUrl: "https://existing.merfy.ru",
                storageSlug: "existing",
                coolifyProjectUuid: "proj-1",
              },
            ]),
        }),
      }),
      update: () => {
        throw new Error("update НЕ должен вызываться на идемпотентном no-op");
      },
      insert: () => {
        throw new Error("insert НЕ должен вызываться на идемпотентном no-op");
      },
    };
    const events = new MockEvents();
    const domainClient = { generateSubdomain: jest.fn() };
    const dep = {} as any;
    const service = new SitesDomainService(
      db,
      dep,
      dep,
      events as any,
      dep,
      dep,
      domainClient as any,
      dep,
      dep,
    );
    const getProjectSpy = jest.spyOn(service, "getOrCreateTenantProject");

    const result = await service.finishProvisioning("site-1", "t1");

    expect(result.publicUrl).toBe("https://existing.merfy.ru");
    expect(domainClient.generateSubdomain).not.toHaveBeenCalled();
    expect(getProjectSpy).not.toHaveBeenCalled();
    expect(events.events).toHaveLength(0);
  });

  it("текущее поведение: провижининг заполняет домен — пишет site_domain_history и эмитит sites.site.provisioned", async () => {
    const inserted: Array<{ table: unknown; value: any }> = [];
    const siteUpdates: any[] = [];
    const db: any = {
      select: () => ({
        from: (tbl: any) => ({
          where: (_c: any) => {
            if (tbl === schema.site) {
              return withLimit([
                {
                  domainId: null,
                  publicUrl: null,
                  storageSlug: null,
                  coolifyProjectUuid: null,
                },
              ]);
            }
            if (tbl === schema.siteDomainHistory) return withLimit([]);
            return withLimit([]);
          },
        }),
      }),
      update: (tbl: any) => ({
        set: (setValues: any) => ({
          // Этап 3, М1: запись условная и читает `.returning()` — сколько
          // строк она реально обновила.
          where: (_c: any) => {
            if (tbl === schema.site) siteUpdates.push(setValues);
            return withReturning([{ id: "site-1" }]);
          },
        }),
      }),
      insert: (tbl: any) => ({
        values: async (value: any) => {
          inserted.push({ table: tbl, value });
          return value;
        },
      }),
    };
    const events = new MockEvents();
    const domainClient = {
      generateSubdomain: jest
        .fn()
        .mockResolvedValue({ id: "dom-1", name: "shop1.merfy.ru" }),
    };
    const storage = {
      getSitePublicUrlBySubdomain: (sub: string) => `https://${sub}`,
      extractSubdomainSlug: (_sub: string) => "shop1",
    };
    const dep = {} as any;
    const service = new SitesDomainService(
      db,
      dep,
      dep,
      events as any,
      dep,
      storage as any,
      domainClient as any,
      dep,
      dep,
    );
    jest
      .spyOn(service, "getOrCreateTenantProject")
      .mockResolvedValue("proj-uuid-1" as any);

    const result = await service.finishProvisioning(
      "site-1",
      "t1",
      "Моя Компания",
    );

    expect(result.publicUrl).toBe("https://shop1.merfy.ru");
    const historyInsert = inserted.find(
      (i) => i.table === schema.siteDomainHistory,
    );
    expect(historyInsert?.value).toMatchObject({
      siteId: "site-1",
      domainId: "dom-1",
      domainName: "shop1.merfy.ru",
      type: "generated",
      status: "active",
    });
    const provisioned = events.events.find(
      (e) => e.pattern === "sites.site.provisioned",
    );
    expect(provisioned?.payload).toMatchObject({
      tenantId: "t1",
      siteId: "site-1",
      publicUrl: "https://shop1.merfy.ru",
      domainId: "dom-1",
      coolifyProjectUuid: "proj-uuid-1",
    });
    // ИЗМЕНЕНО ОСОЗНАННО (этап 3, М1). БЫЛО: один безусловный UPDATE со
    // всеми полями провижининга. СТАЛО: два условных — домен пишется, только
    // если domain_id ещё пуст, проект — если пуст coolify_project_uuid; второй
    // провижинер на той же строке не перетирает первого.
    expect(siteUpdates).toHaveLength(2);
    expect(siteUpdates[0]).toMatchObject({
      domainId: "dom-1",
      publicUrl: "https://shop1.merfy.ru",
      storageSlug: "shop1",
    });
    expect(siteUpdates[1]).toMatchObject({ coolifyProjectUuid: "proj-uuid-1" });
  });
});
