/**
 * Статус сборки (`sites.build_status`) знает сборки нового сборщика витрин:
 * число в buildId — строка storefront_build (кончилась) или storefront_shop
 * (в очереди / идёт); uuid — старая сборка site_build, как раньше.
 */
import { PgDialect } from "drizzle-orm/pg-core";
import { SitesDomainService } from "../../sites.service";
import * as schema from "../../db/schema";
import {
  finishedBuildStatus,
  parseStorefrontBuildNumber,
} from "../storefront-build-status";

const SITE = "site-1";
const TENANT = "tenant-1";
const BUILD = 1793576644403;
const OLD_ID = "0b0f4e3c-7d47-4c3c-9d0e-2a5f0f6a1b11";
const T0 = new Date("2026-11-01T23:44:04.402Z");
const T1 = new Date("2026-11-01T23:44:04.408Z");
const T2 = new Date("2026-11-01T23:44:13.552Z");

type Rows = Partial<Record<"site" | "build" | "shop" | "old", unknown[]>>;

/** Фейковая БД: select().from(таблица).where() отдаёт заготовленные строки таблицы. */
function makeService(rows: Rows) {
  const wheres: Array<{ sql: string; params: unknown[] }> = [];
  const byTable = new Map<unknown, unknown[]>([
    [schema.site, rows.site ?? [{ id: SITE }]],
    [schema.storefrontBuild, rows.build ?? []],
    [schema.storefrontShop, rows.shop ?? []],
    [schema.siteBuild, rows.old ?? []],
  ]);
  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: (cond: unknown) => {
          wheres.push(new PgDialect().sqlToQuery(cond as never));
          return Promise.resolve(byTable.get(table) ?? []);
        },
      }),
    }),
  };
  const dep = {} as any;
  const service = new SitesDomainService(
    db as any,
    dep,
    dep,
    dep,
    dep,
    dep,
    dep,
    dep,
    dep,
  );
  return { service, wheres };
}

const buildRow = (outcome: string, error: string | null = null) => ({
  siteId: SITE,
  build: BUILD,
  attempt: 0,
  priority: 0,
  events: 1,
  eventAt: T0,
  queuedAt: T0,
  startedAt: T1,
  finishedAt: T2,
  outcome,
  steps: {},
  error,
});

const shopRow = (patch: Record<string, unknown>) => ({
  siteId: SITE,
  state: "idle",
  build: 0,
  nextBuild: null,
  attempt: 0,
  queuedAt: null,
  startedAt: null,
  pendingEventAt: null,
  ...patch,
});

describe("getBuildStatus: сборки нового сборщика витрин", () => {
  it.each([
    ["live", "uploaded", 100, /выложена/],
    ["paused", "paused", 100, /на паузе.*пауза будет снята/],
    ["stale", "uploaded", 100, /более новая сборка/],
    ["unchanged", "uploaded", 100, /не изменился/],
    ["skipped", "uploaded", 100, /уже собран с этими правками/],
  ])("итог %s -> status %s", async (outcome, status, percent, message) => {
    const { service } = makeService({ build: [buildRow(outcome)] });

    const res = await service.getBuildStatus(TENANT, SITE, String(BUILD));

    expect(res).toEqual({
      buildId: String(BUILD),
      siteId: SITE,
      status,
      stage: null,
      percent,
      message: expect.stringMatching(message),
      error: null,
      retryCount: 0,
      startedAt: T1,
      completedAt: T2,
      createdAt: T0,
    });
  });

  it("failed: текст ошибки в error и в message", async () => {
    const { service } = makeService({
      build: [buildRow("failed", "build-blocked: нет секции")],
    });

    const res = await service.getBuildStatus(TENANT, SITE, String(BUILD));

    expect(res).toMatchObject({
      status: "failed",
      percent: 0,
      error: "build-blocked: нет секции",
      message: "Сборка не удалась: build-blocked: нет секции",
    });
  });

  it("interrupted: failed, но с пояснением, что магазин собирается заново", async () => {
    const { service } = makeService({
      build: [buildRow("interrupted", "сборщик остановлен")],
    });

    const res = await service.getBuildStatus(TENANT, SITE, String(BUILD));

    expect(res).toMatchObject({
      status: "failed",
      error: "сборщик остановлен",
      message: expect.stringMatching(/заново, под другим номером/),
    });
  });

  it("сборка в очереди: busy, не взята сборщиком", async () => {
    const { service } = makeService({
      shop: [shopRow({ state: "busy", build: BUILD, queuedAt: T0 })],
    });

    const res = await service.getBuildStatus(TENANT, SITE, String(BUILD));

    expect(res).toMatchObject({
      status: "queued",
      percent: 0,
      startedAt: null,
      completedAt: null,
      createdAt: T0,
      message: expect.stringMatching(/в очереди/),
    });
  });

  it("сборка идёт: busy, сборщик её взял", async () => {
    const { service } = makeService({
      shop: [
        shopRow({
          state: "busy",
          build: BUILD,
          queuedAt: T0,
          startedAt: T1,
          attempt: 1,
        }),
      ],
    });

    const res = await service.getBuildStatus(TENANT, SITE, String(BUILD));

    expect(res).toMatchObject({
      status: "running",
      startedAt: T1,
      completedAt: null,
      retryCount: 1,
      message: expect.stringMatching(/Сборка идёт.*повторная попытка/),
    });
  });

  it("номер в резерве (next_build): ждёт, пока кончится идущая сборка", async () => {
    const { service } = makeService({
      shop: [
        shopRow({
          state: "busy",
          build: BUILD - 5000,
          startedAt: T1,
          nextBuild: BUILD,
          pendingEventAt: T2,
        }),
      ],
    });

    const res = await service.getBuildStatus(TENANT, SITE, String(BUILD));

    expect(res).toMatchObject({
      buildId: String(BUILD),
      status: "queued",
      startedAt: null,
      createdAt: T2,
      message: expect.stringMatching(/предыдущая сборка.*войдут в следующую/),
    });
  });

  it("неизвестный номер -> null", async () => {
    const { service } = makeService({
      shop: [shopRow({ state: "busy", build: BUILD + 1, startedAt: T1 })],
    });

    expect(
      await service.getBuildStatus(TENANT, SITE, String(BUILD)),
    ).toBeNull();
  });

  it("у магазина нет строки сборщика и сборки -> null", async () => {
    const { service } = makeService({});

    expect(
      await service.getBuildStatus(TENANT, SITE, String(BUILD)),
    ).toBeNull();
  });

  it("чужой магазин (другая организация) -> null, сборки не читаются", async () => {
    const { service, wheres } = makeService({
      site: [],
      build: [buildRow("live")],
    });

    expect(
      await service.getBuildStatus(TENANT, SITE, String(BUILD)),
    ).toBeNull();
    expect(wheres).toHaveLength(1);
    expect(wheres[0].params).toEqual(expect.arrayContaining([SITE, TENANT]));
  });

  it("сборка ищется по магазину и номеру", async () => {
    const { service, wheres } = makeService({ build: [buildRow("live")] });

    await service.getBuildStatus(TENANT, SITE, String(BUILD));

    expect(wheres).toHaveLength(2);
    expect(wheres[1].params).toEqual([SITE, BUILD]);
  });

  it("uuid -> старая логика: site_build, а новые таблицы не читаются", async () => {
    const created = new Date("2026-11-01T10:00:00Z");
    const { service, wheres } = makeService({
      build: [buildRow("live")],
      old: [
        {
          id: OLD_ID,
          siteId: SITE,
          status: "running",
          stage: "astro_build",
          percent: 70,
          message: "Building",
          error: null,
          retryCount: 2,
          startedAt: created,
          completedAt: null,
          createdAt: created,
        },
      ],
    });

    const res = await service.getBuildStatus(TENANT, SITE, OLD_ID);

    expect(res).toEqual({
      buildId: OLD_ID,
      siteId: SITE,
      status: "running",
      stage: "astro_build",
      percent: 70,
      message: "Building",
      error: null,
      retryCount: 2,
      startedAt: created,
      completedAt: null,
      createdAt: created,
    });
    expect(wheres[1].params).toEqual([OLD_ID, SITE]);
  });

  it("uuid, которого нет в site_build -> null", async () => {
    const { service } = makeService({ build: [buildRow("live")] });

    expect(await service.getBuildStatus(TENANT, SITE, OLD_ID)).toBeNull();
  });
});

describe("номер новой сборки и неизвестный итог", () => {
  it.each([
    ["1793576644403", 1793576644403],
    [OLD_ID, null],
    ["queued", null],
    ["12abc", null],
    ["-5", null],
    ["99999999999999999999", null],
  ])("parseStorefrontBuildNumber(%s)", (id, expected) => {
    expect(parseStorefrontBuildNumber(id)).toBe(expected);
  });

  it("итог, которого код не знает, — null, а не выдуманный статус", () => {
    expect(finishedBuildStatus(buildRow("exploded") as never)).toBeNull();
  });
});
