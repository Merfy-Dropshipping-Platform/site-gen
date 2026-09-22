/**
 * Золотые документы (волна 0, кусок 0.3): «что видит конструктор сегодня»
 * для свежего магазина каждой из пяти тем + для магазина после смены темы.
 *
 * Снимок — РОВНО путь `SitesService.getRevision()` (sites.service.ts:~1642):
 *   migrateRevisionData → PageResolver.normalizeRevision (USE_PAGE_RESOLVER) →
 *   seedContentPagesFromTheme → resolveAssetUrls.
 * Это эталон, с которым в волне 1 обязан побайтно совпасть `DocumentAdapter.load()`.
 * Поведение продового кода этот файл НЕ проверяет по кускам и НЕ меняет —
 * он фиксирует итоговую форму ответа как один документ на тему.
 *
 * Обновление снимков — ТОЛЬКО через `UPDATE_GOLDEN=1 pnpm exec jest src/__tests__/golden`.
 * Обычный прогон только читает файлы и сравнивает, никогда не пишет.
 *
 * Бриф: merfy-mcp/docs/plans/2026-09-22-wave0-golden-and-constructor.md §0.3
 * Образец моков БД (buildInitialRevision/update со сменой темы):
 *   site-create-theme.characterization.spec.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { SitesDomainService } from "../../sites.service";
import * as schema from "../../db/schema";
import { normalizeGoldenSnapshot, toGoldenJson } from "./normalize";

// ---------------------------------------------------------------------------
// Общие помощники (тот же паттерн, что в site-create-theme.characterization.spec.ts)
// ---------------------------------------------------------------------------

class MockEvents {
  public events: Array<{ pattern: string; payload: any }> = [];
  emit(pattern: string, payload: any) {
    this.events.push({ pattern, payload });
  }
}

function withLimit(rows: any[]) {
  const p: any = Promise.resolve(rows);
  p.limit = (n: number) => Promise.resolve(rows.slice(0, n));
  return p;
}

function withReturning(rows: any[]) {
  const p: any = Promise.resolve(rows);
  p.returning = (_proj: any) => Promise.resolve(rows);
  return p;
}

function makeBareService(): any {
  const dep = {} as any;
  return new SitesDomainService(dep, dep, dep, dep, dep, dep, dep, dep, dep);
}

/** Магазин, которым мы прогоняем все снимки — одно и то же имя для всех тем,
 * чтобы «Витрина» в подвале была сравнимым, а не случайным различием. */
const SITE_NAME = "Витрина";

/**
 * НАХОДКА: `migrateVanillaHomePage` (utils/revision-migrations.ts:~1017)
 * печёт `Date.now()` прямо в id девяти блоков главной vanilla (PromoBanner,
 * Header, Collections, MainText, Video, ImageWithText, PopularProducts,
 * Newsletter, Footer) КАЖДЫЙ раз, когда `_vanillaHomeMigrationVersion` в
 * ревизии ниже текущей версии миграции — то есть на КАЖДОМ `getRevision()`
 * непересохранённого vanilla-магазина id меняются. Продовое поведение не
 * трогаем (задача прямо это запрещает), но снимок обязан быть
 * детерминированным — поэтому фиксируем `Date.now()` на время захвата.
 */
const FIXED_NOW = 0;

async function withFixedNow<T>(fn: () => Promise<T>): Promise<T> {
  const nowSpy = jest.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
  try {
    return await fn();
  } finally {
    nowSpy.mockRestore();
  }
}

/**
 * Строит мок-сервис и мок-БД так, чтобы `getRevision()` вернул ровно
 * `revisionData`, пройдя реальный путь migrateRevisionData →
 * normalizeRevision → seedContentPagesFromTheme → resolveAssetUrls.
 * `service.get()` — замокан напрямую (как в разделе 6 характеризации),
 * реальный SELECT с JOIN на тему в этом файле не нужен.
 */
function makeGetRevisionService(
  themeId: string,
  revisionData: unknown,
  opts: { siteName?: string; publicUrl?: string | null } = {},
) {
  const db: any = {
    select: (_proj?: any) => ({
      from: (_tbl: any) => ({
        where: (_cond: any) =>
          withLimit([
            {
              id: "rev-1",
              siteId: "site-1",
              data: revisionData,
              createdAt: new Date(0),
            },
          ]),
      }),
    }),
  };
  const dep = {} as any;
  const service = new SitesDomainService(
    db,
    dep,
    dep,
    dep,
    dep,
    dep,
    dep,
    dep,
    dep,
  );
  jest.spyOn(service, "get").mockResolvedValue({
    id: "site-1",
    tenantId: "t1",
    name: opts.siteName ?? SITE_NAME,
    themeId,
    publicUrl: opts.publicUrl ?? null,
  } as any);
  return service;
}

/** Строит стартовую ревизию темы (как её создаёт `reserve()` при создании
 * магазина — см. buildInitialRevision() в 0.2) и прогоняет её через
 * `getRevision()`. Результат — «что видит конструктор» для свежего магазина. */
async function captureFreshStore(themeId: string) {
  return withFixedNow(async () => {
    const builder = makeBareService();
    const initialRevisionData = await builder.buildInitialRevision(themeId);
    const service = makeGetRevisionService(themeId, initialRevisionData);
    return service.getRevision("t1", "site-1", "rev-1");
  });
}

// ---------------------------------------------------------------------------
// Снимки на диске
// ---------------------------------------------------------------------------

const GOLDEN_DIR = __dirname;

function goldenFile(...parts: string[]): string {
  return resolve(GOLDEN_DIR, ...parts);
}

/**
 * Сравнивает нормализованный снимок с файлом на диске. При
 * `UPDATE_GOLDEN=1` сначала перезаписывает файл — обычный прогон файлы
 * никогда не трогает, только читает.
 */
function expectMatchesGolden(
  filePath: string,
  rawResult: { item: Record<string, unknown> },
) {
  if (process.env.UPDATE_GOLDEN === "1") {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, toGoldenJson(rawResult));
  }
  const expected = JSON.parse(readFileSync(filePath, "utf-8"));
  expect(normalizeGoldenSnapshot(rawResult)).toEqual(expected);
}

// ---------------------------------------------------------------------------
// 1. Снимок свежего магазина — один тест на тему
// ---------------------------------------------------------------------------

const THEMES = ["rose", "flux", "bloom", "satin", "vanilla"] as const;

describe.each(THEMES)("золотой документ: свежий магазин темы %s", (theme) => {
  it(`снимок совпадает с golden/${theme}/fresh-store.json`, async () => {
    const result = await captureFreshStore(theme);
    expectMatchesGolden(goldenFile(theme, "fresh-store.json"), result);
  });
});

// ---------------------------------------------------------------------------
// 2. Защита от «одного и того же rose пять раз» — снимки должны различаться
// ---------------------------------------------------------------------------

it("золотой документ: снимки пяти тем различаются между собой", async () => {
  const serialized = await Promise.all(
    THEMES.map(async (theme) => {
      const result = await captureFreshStore(theme);
      return JSON.stringify(normalizeGoldenSnapshot(result));
    }),
  );
  expect(new Set(serialized).size).toBe(THEMES.length);
});

// ---------------------------------------------------------------------------
// 3. Смена темы rose → satin с одной пользовательской страницей
//    (то же самое реальное переключение, что в 0.2 «реальный свитч
//    пересеивает ревизию каноном новой темы и переносит страницу мерчанта»,
//    но здесь результат прогоняется дальше через getRevision()).
// ---------------------------------------------------------------------------

describe("золотой документ: смена темы rose → satin переносит страницу мерчанта", () => {
  function makeSwitchDb(currentRevisionData: unknown) {
    const inserted: Array<{ table: unknown; value: any }> = [];
    let siteSelectCalls = 0;
    const db: any = {
      select: (_proj: any) => ({
        from: (tbl: any) => ({
          where: (_cond: any) => {
            if (tbl === schema.site) {
              siteSelectCalls += 1;
              if (siteSelectCalls === 1)
                return withLimit([{ themeId: "rose", status: "draft" }]);
              return withLimit([{ id: "site-1", currentRevisionId: "rev-1" }]);
            }
            if (tbl === schema.siteRevision) {
              return withLimit([{ data: currentRevisionData }]);
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
        set: (setValues: any) => ({
          where: (_c: any) => withReturning([{ id: "site-1" }]),
        }),
      }),
    };
    return { db, inserted };
  }

  it("снимок совпадает с golden/switch-rose-to-satin.json", async () => {
    const currentRevisionData = {
      pages: [
        { id: "home", source: "theme" },
        // slug не пересекается ни с одной системной страницей канона — иначе
        // carryOverUserPages сочтёт её дублем и отфильтрует (см. находку в
        // 0.2 про /about).
        {
          id: "p-1",
          slug: "/moya-stranica-merchanta",
          source: "user",
          isCustom: true,
        },
      ],
      pagesData: { home: { old: true }, "p-1": { text: "О нас мерчанта" } },
      themeSettings: { colorSchemes: [{ id: "x" }] },
    };
    const { db, inserted } = makeSwitchDb(currentRevisionData);
    const events = new MockEvents();
    const dep = {} as any;
    const updateService = new SitesDomainService(
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
    jest.spyOn(updateService, "get").mockResolvedValue({
      id: "site-1",
      tenantId: "t1",
      currentRevisionId: "rev-1",
    } as any);

    // withFixedNow: rose→satin сам по себе не трогает vanilla, но switch
    // всегда прогоняет buildInitialRevision() для ДВУХ тем (следующей и
    // предыдущей — см. prevSeed в update()), поэтому фиксируем время на
    // случай, если один из участников свитча — vanilla (см. НАХОДКУ выше).
    const result = await withFixedNow(async () => {
      const updateResult = await updateService.update({
        tenantId: "t1",
        siteId: "site-1",
        patch: { themeId: "satin" },
        actorUserId: "u1",
      });
      expect(updateResult).toBe(true);

      const revisionInsert = inserted.find(
        (i) => i.table === schema.siteRevision,
      );
      expect(revisionInsert).toBeDefined();

      // Пересеянная ревизия теперь лежит «в БД» — прогоняем её через
      // getRevision() так же, как для свежего магазина.
      const readService = makeGetRevisionService(
        "satin",
        revisionInsert!.value.data,
      );
      return readService.getRevision("t1", "site-1", "rev-1");
    });

    expectMatchesGolden(goldenFile("switch-rose-to-satin.json"), result);
  });
});
