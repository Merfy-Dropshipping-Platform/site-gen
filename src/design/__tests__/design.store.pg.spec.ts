/**
 * «Дизайн по ссылке» на НАСТОЯЩЕМ Postgres: миграция 0041, RPC design.* через контроллер и хранилище, кэш за сутки,
 * «сайт мой», чистка старше 30 дней.
 *
 * База — `SITES_TEST_DATABASE_URL`, только одноразовая (`openDisposableDatabase` накатывает миграции). Магазины теста —
 * `design-…`; после набора удаляются только такие строки.
 */
import type { Pool } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, like } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as schema from "../../db/schema";
import { openDisposableDatabase } from "../../store/__tests__/support/test-database";
import { DesignController, NOT_FOUND } from "../design.controller";
import { DesignStore } from "../design.store";

const url = process.env.SITES_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
if (!url) {
  console.warn(
    "design.store.pg.spec: SITES_TEST_DATABASE_URL не задан — «Дизайн по ссылке» на Postgres ПРОПУЩЕН",
  );
}

const P = "design-";
const DAY = 24 * 60 * 60 * 1000;
let pool: InstanceType<typeof Pool>;
let db: NodePgDatabase<typeof schema>;
let store: DesignStore;
let controller: DesignController;

const look = (siteId: string, fields: Record<string, unknown> = {}) => ({
  siteId,
  url: "https://shop.example/",
  finalUrl: "https://shop.example/home",
  tool: "dembrandt",
  toolVersion: "0.41.0",
  outlineTool: "designlang",
  style: { v: 1, bands: [{ bg: "#ffffff" }] },
  outline: { v: 1, blocks: [{ role: "hero" }] },
  content: null,
  raw: { dembrandt: { colors: {} } },
  ms: 4321,
  ...fields,
});

suite("«Дизайн по ссылке» на Postgres", () => {
  beforeAll(async () => {
    const opened = await openDisposableDatabase(url!);
    pool = opened.pool;
    db = opened.db;
    store = new DesignStore(db);
    controller = new DesignController(store);
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(schema.designLooks).where(like(schema.designLooks.siteId, `${P}%`));
    await db.delete(schema.designOwnedSites).where(like(schema.designOwnedSites.siteId, `${P}%`));
    await pool.end();
  });

  it("saveLook → getLook: строка без tool, toolVersion, raw; чужой магазин — нет записи", async () => {
    const siteId = `${P}${randomUUID()}`;
    const saved = await controller.saveLook(look(siteId, { content: { v: 1, logo: null, menu: [], blocks: [] } }));
    if (!saved.success) throw new Error(saved.error);
    const got = await controller.getLook({ siteId, lookId: saved.data.id });
    expect(got).toEqual({
      success: true,
      data: {
        id: saved.data.id,
        url: "https://shop.example/",
        style: { v: 1, bands: [{ bg: "#ffffff" }] },
        outline: { v: 1, blocks: [{ role: "hero" }] },
        content: { v: 1, logo: null, menu: [], blocks: [] },
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      },
    });
    const [row] = await db.select().from(schema.designLooks).where(eq(schema.designLooks.id, saved.data.id));
    expect(row).toMatchObject({ tool: "dembrandt", toolVersion: "0.41.0", raw: { dembrandt: { colors: {} } }, ms: 4321 });
    expect(await controller.getLook({ siteId: `${P}other`, lookId: saved.data.id })).toEqual({ success: false, error: NOT_FOUND });
  });

  it("findRecent: самый свежий снимок той же ссылки за срок; старше срока или другая ссылка — null", async () => {
    const siteId = `${P}${randomUUID()}`;
    const old = randomUUID();
    await db.insert(schema.designLooks).values({ id: old, ...look(siteId), createdAt: new Date(Date.now() - 2 * DAY) });
    expect(await controller.findRecent({ siteId, url: "https://shop.example/", maxAgeMs: DAY })).toEqual({ success: true, data: null });
    const first = await store.save(look(siteId));
    const second = await store.save(look(siteId, { style: { v: 1, second: true } }));
    const recent = await controller.findRecent({ siteId, url: "https://shop.example/", maxAgeMs: DAY });
    expect(recent.success && recent.data?.id).toBe(second);
    expect(recent.success && recent.data?.style).toEqual({ v: 1, second: true });
    expect(first).not.toBe(second);
    expect(await controller.findRecent({ siteId, url: "https://other.example/", maxAgeMs: DAY })).toEqual({ success: true, data: null });
  });

  it("confirmOwned → isOwned: домен нормализован, повтор обновляет пользователя", async () => {
    const siteId = `${P}${randomUUID()}`;
    expect(await controller.isOwned({ siteId, domain: "shop.example" })).toEqual({ success: true, data: { owned: false } });
    expect(await controller.confirmOwned({ siteId, domain: "shop.example", userId: "u-1" })).toEqual({ success: true, data: { ok: true } });
    expect(await controller.confirmOwned({ siteId, domain: "WWW.shop.example.", userId: "u-2" })).toEqual({ success: true, data: { ok: true } });
    const rows = await db.select().from(schema.designOwnedSites).where(eq(schema.designOwnedSites.siteId, siteId));
    expect(rows).toEqual([expect.objectContaining({ domain: "shop.example", userId: "u-2" })]);
    expect(await controller.isOwned({ siteId, domain: "shop.example" })).toEqual({ success: true, data: { owned: true } });
    expect(await controller.isOwned({ siteId: `${P}other`, domain: "shop.example" })).toEqual({ success: true, data: { owned: false } });
  });

  it("чистка: снимки старше 30 дней удаляются, свежие остаются", async () => {
    const siteId = `${P}${randomUUID()}`;
    const stale = randomUUID();
    await db.insert(schema.designLooks).values({ id: stale, ...look(siteId), createdAt: new Date(Date.now() - 31 * DAY) });
    const fresh = await store.save(look(siteId));
    expect(await store.purge()).toBeGreaterThanOrEqual(1);
    const left = await db.select({ id: schema.designLooks.id }).from(schema.designLooks).where(eq(schema.designLooks.siteId, siteId));
    expect(left.map((row) => row.id)).toEqual([fresh]);
    await store.purgeDaily();
  });
});
