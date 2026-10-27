/**
 * Порты заготовки на НАСТОЯЩЕМ Postgres: какие свои секции есть у магазина (реестр `storefront_section`) и блокировка
 * магазина (`pg_try_advisory_xact_lock`). База — `SITES_TEST_DATABASE_URL`, только одноразовая
 * (`support/test-database.ts`); без адреса набор пропускается с предупреждением, как `store.pg.spec.ts`.
 */
import type { Pool } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { like } from "drizzle-orm";
import * as schema from "../../../db/schema";
import { openDisposableDatabase } from "../../__tests__/support/test-database";
import {
  BuilderSkeletonSections,
  DrizzleSkeletonLock,
  refusalOf,
} from "../skeleton-sections";

const url = process.env.SITES_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
if (!url) {
  console.warn(
    "skeleton-sections.pg.spec: SITES_TEST_DATABASE_URL не задан — проверки на настоящем Postgres ПРОПУЩЕНЫ",
  );
}

/** Префикс всех id этого набора: удаляются только такие строки. */
const P = "skeleton-pg-";
const SHOP = `${P}shop`;

let pool: InstanceType<typeof Pool>;
let db: NodePgDatabase<typeof schema>;

async function insertSection(values: {
  id: string;
  name: string;
  owner?: string;
  draft?: boolean;
  role?: string;
}) {
  await db.insert(schema.storefrontSection).values({
    id: `${P}${values.id}`,
    name: values.name,
    kind: "section",
    author: "shop",
    owner: values.owner ?? SHOP,
    release: null,
    sourceHash: "h",
    contentHash: "h",
    manifest: {
      name: values.name.replace(/^shop:/, ""),
      ...(values.role ? { role: values.role } : {}),
    },
    source: {},
    template: "",
    style: "",
    draft: values.draft ?? true,
    published: false,
  });
}

suite("порты заготовки на Postgres", () => {
  beforeAll(async () => {
    const opened = await openDisposableDatabase(url!);
    pool = opened.pool;
    db = opened.db;
    await db
      .delete(schema.storefrontSection)
      .where(like(schema.storefrontSection.id, `${P}%`));
  });

  afterAll(async () => {
    await db
      .delete(schema.storefrontSection)
      .where(like(schema.storefrontSection.id, `${P}%`));
    await pool.end();
  });

  it("present: только текущие правки своих секций этого магазина, имя без префикса, роль из описания", async () => {
    await insertSection({ id: "1", name: "shop:header" });
    await insertSection({ id: "2", name: "shop:cart", role: "cart" });
    await insertSection({ id: "3", name: "shop:faq", draft: false });
    await insertSection({ id: "4", name: "shop:hero", owner: `${P}other` });

    const sections = new BuilderSkeletonSections(db, { call: jest.fn() });
    const present = await sections.present(SHOP);

    expect(present.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { name: "cart", role: "cart" },
      { name: "header", role: null },
    ]);
  });

  it("блокировка магазина: занята — вторая заготовка не запускается; снята — снова доступна", async () => {
    const lock = new DrizzleSkeletonLock(db);
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const first = lock.withSiteLock(SHOP, async () => {
      await held;
      return "first";
    });
    // Дать первой транзакции взять ключ.
    await new Promise((resolve) => setTimeout(resolve, 200));

    const second = jest.fn(async () => "second");
    expect(await lock.withSiteLock(SHOP, second)).toEqual({ locked: false });
    expect(second).not.toHaveBeenCalled();
    // Другой магазин — свой ключ.
    expect(await lock.withSiteLock(`${P}another`, async () => "other")).toEqual(
      {
        locked: true,
        value: "other",
      },
    );

    release();
    expect(await first).toEqual({ locked: true, value: "first" });
    expect(await lock.withSiteLock(SHOP, async () => "third")).toEqual({
      locked: true,
      value: "third",
    });
  });
});

describe("сохранение секции через сборщик", () => {
  const files = { "section.json": "{}" };

  it("200 и ok — сохранено; адрес и тело — как у «Сохранить секцию»", async () => {
    const call = jest.fn(async () => ({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        status: "accepted",
        name: "shop:hero",
        id: "x",
      }),
    }));
    const sections = new BuilderSkeletonSections({} as any, { call });
    expect(await sections.save("s1", files)).toEqual({ ok: true });
    expect(call).toHaveBeenCalledWith(
      "/sections/save",
      { shop: "s1" },
      JSON.stringify({ files }),
      30_000,
    );
  });

  it.each([
    [
      422,
      {
        ok: false,
        problems: [{ code: "x", message: "обработчик onclick не нужен" }],
      },
      "обработчик onclick не нужен",
    ],
    [
      503,
      {
        ok: false,
        error: { code: "uploads-closed", message: "загрузка секций выключена" },
      },
      "загрузка секций выключена",
    ],
    [502, "сборщик витрин не ответил", "сборщик витрин ответил 502"],
  ])("%s — не сохранено, причина словами", async (status, body, reason) => {
    const call = jest.fn(async () => ({
      status,
      contentType: "application/json",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }));
    const sections = new BuilderSkeletonSections({} as any, { call });
    expect(await sections.save("s1", files)).toEqual({ ok: false, reason });
  });

  it("refusalOf: проблем нет и ошибки нет — код ответа", () => {
    expect(refusalOf(500, "{}")).toBe("сборщик витрин ответил 500");
  });
});
