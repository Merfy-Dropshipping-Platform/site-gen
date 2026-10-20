/**
 * Секция «Публикации»: категории → id блогов на НАСТОЯЩЕМ Postgres.
 *
 * Миграция 0028 теперь пустая (перевод на старте контейнера занимал минуты и
 * валил выкатку) — проверяем, что она ревизии не трогает. Сам перевод делает
 * фоновая задача приложения (revision-blog-refs.job.ts): здесь её SQL —
 * отбор регуляркой, пачки по id, запись при неизменной data, блокировка — на
 * тех же ревизиях, что были у теста прежней 0028.
 *
 * Отдельная одноразовая база `<SITES_TEST_DATABASE_URL>_pubsec_mig`: схема
 * накатывается до 0027 включительно, в ревизии кладутся секции «Публикации»
 * со старыми значениями news/blog/articles, затем накатывается 0028. Без
 * переменной набор пропускается с предупреждением.
 */
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { disposableDatabaseName } from "../../store/__tests__/support/test-database";
import {
  PgRevisionBlogRefsStore,
  runRevisionBlogRefs,
  type SqlClient,
} from "../revision-blog-refs.job";

const url = process.env.SITES_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
if (!url) {
  console.warn(
    "publications-section-migration.pg.spec: SITES_TEST_DATABASE_URL не задан — проверка на Postgres ПРОПУЩЕНА",
  );
}

const MIGRATIONS = resolve(__dirname, "..", "..", "..", "drizzle");

/** Каталог миграций без 0028 и дальше — «до перевода секций». */
function migrationsBefore0028(): string {
  const dir = mkdtempSync(join(tmpdir(), "sites-mig-"));
  cpSync(MIGRATIONS, dir, { recursive: true });
  const journalPath = join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  // По имени, не по idx: на прод миграции приходят не по порядку (0027 и 0028
  // там стоят сразу за 0017), номер в журнале у них другой.
  journal.entries = journal.entries.filter(
    (e: { tag: string }) => e.tag < "0028_",
  );
  writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

type Block = { type: string; props: Record<string, unknown> };
const pub = (id: string, props: Record<string, unknown>): Block => ({
  type: "Publications",
  props: { id, ...props },
});

/** Ревизия «как в базе»: секции на страницах, в зоне и в корневом content. */
function revision(blocks: Block[]) {
  return {
    pages: [{ id: "home", slug: "/" }],
    pagesData: {
      home: {
        content: [
          { type: "Hero", props: { id: "Hero-1", heading: "news" } },
          ...blocks,
        ],
        root: { props: {} },
        zones: {
          "Columns-1:left": [pub("Pub-zone", { publicationType: "blog" })],
        },
      },
    },
    content: [
      pub("Pub-root", { categoryFilter: "Статьи", publicationType: "" }),
    ],
  };
}

const logger = { log: () => undefined, warn: () => undefined };

suite(
  "секция «Публикации» на Postgres: 0028 пустая, перевод — фоновой задачей",
  () => {
    let admin: InstanceType<typeof Pool>;
    let pool: InstanceType<typeof Pool>;
    let client: SqlClient & { release(destroy?: boolean): void };
    const ids: Record<string, string> = {};
    let before0028: Array<{ id: string; data: unknown }>;

    const dataOf = async (id: string) => {
      const { rows } = await pool.query(
        `SELECT data FROM site_revision WHERE id = $1`,
        [id],
      );
      return rows[0].data as ReturnType<typeof revision>;
    };
    const homeBlock = (data: ReturnType<typeof revision>, id: string) =>
      data.pagesData.home.content.find((b) => b.props.id === id)!;
    const allRows = async () =>
      (await pool.query(`SELECT id, data FROM site_revision ORDER BY id`))
        .rows as Array<{ id: string; data: unknown }>;
    const run = () =>
      runRevisionBlogRefs(new PgRevisionBlogRefsStore(client), {
        logger,
        batchSize: 2,
      });

    beforeAll(async () => {
      const base = new URL(url!);
      const name = `${disposableDatabaseName(url!)}_pubsec_mig`;
      const adminUrl = new URL(url!);
      adminUrl.pathname = "/postgres";
      admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.query(`CREATE DATABASE "${name}"`);
      base.pathname = `/${name}`;
      pool = new Pool({ connectionString: base.toString(), max: 4 });

      await migrate(drizzle(pool), {
        migrationsFolder: migrationsBefore0028(),
      });

      await pool.query(
        `INSERT INTO site (id, tenant_id, name, status, created_at, updated_at) VALUES
        ('s1', 't1', 'Магазин 1', 'draft', now(), now()),
        ('s2', 't2', 'Магазин 2', 'draft', now(), now())`,
      );
      // «Новости» обоим магазинам — как 0027; «Статьи» и «Блог» — только первому.
      await pool.query(
        `INSERT INTO blogs (id, site_id, organization_id, title, handle) VALUES
        ('s1-novosti', 's1', 't1', 'Новости', 'novosti'),
        ('s1-stati', 's1', 't1', 'Статьи', 'stati'),
        ('s1-blog', 's1', 't1', 'Блог', 'blog'),
        ('s2-novosti', 's2', 't2', 'Новости', 'novosti')
       ON CONFLICT (site_id, handle) DO UPDATE SET id = EXCLUDED.id`,
      );
      const { rows } = await pool.query(
        `SELECT site_id, handle, id FROM blogs`,
      );
      for (const r of rows as Array<{
        site_id: string;
        handle: string;
        id: string;
      }>) {
        ids[`${r.site_id}:${r.handle}`] = r.id;
      }

      const insert = (id: string, siteId: string, data: unknown) =>
        pool.query(
          `INSERT INTO site_revision (id, site_id, data, created_at) VALUES ($1, $2, $3, now())`,
          [id, siteId, JSON.stringify(data)],
        );
      await insert(
        "r1",
        "s1",
        revision([
          pub("Pub-news", { publicationType: "news", categoryFilter: "all" }),
          pub("Pub-articles", { publicationType: "articles" }),
          pub("Pub-all", { publicationType: "all" }),
          pub("Pub-one", { publicationType: "pub-123" }),
          pub("Pub-new", {
            publicationSource: "publication",
            publicationId: "pub-9",
            publicationType: "news",
          }),
        ]),
      );
      // У второго магазина нет «Статей» — секция получает блог по умолчанию.
      await insert(
        "r2",
        "s2",
        revision([pub("Pub-articles", { publicationType: "articles" })]),
      );
      await insert("r3", "s1", { pages: [], pagesData: {} });
      // Ещё строки с прежними категориями — чтобы пачек по 2 было несколько.
      await insert("r4", "s1", revision([]));
      await insert("r5", "s2", revision([]));

      before0028 = await allRows();
      await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS });
      client = await pool.connect();
    });

    afterAll(async () => {
      client?.release(true);
      await pool?.end();
      await admin?.end();
    });

    it("0028 применена и ревизий не трогает", async () => {
      const journal = JSON.parse(
        readFileSync(join(MIGRATIONS, "meta", "_journal.json"), "utf8"),
      );
      const when0028 = journal.entries.find((e: { tag: string }) =>
        e.tag.startsWith("0028_"),
      ).when;
      const { rows } = await pool.query(
        `SELECT 1 FROM drizzle.__drizzle_migrations WHERE created_at = $1`,
        [when0028],
      );
      expect(rows).toHaveLength(1);
      expect(await allRows()).toEqual(before0028);
    });

    it("блокировку держит другое соединение — задача ничего не делает", async () => {
      const other = await pool.connect();
      try {
        expect(await new PgRevisionBlogRefsStore(other).tryLock()).toBe(true);
        const summary = await run();
        expect(summary.locked).toBe(false);
        expect(await allRows()).toEqual(before0028);
        await new PgRevisionBlogRefsStore(other).unlock();
      } finally {
        other.release(true);
      }
    });

    it("гонка: data изменилась после чтения — запись не проходит", async () => {
      const store = new PgRevisionBlogRefsStore(client);
      expect(await store.legacyIds()).toEqual(["r1", "r2", "r4", "r5"]);
      const [row] = await store.loadBatch(["r4"]);
      // «Конструктор» сохранил r4 после чтения — запись по старому хешу не проходит.
      const saved = revision([pub("Pub-saved", { publicationType: "news" })]);
      await pool.query(`UPDATE site_revision SET data = $2 WHERE id = $1`, [
        "r4",
        JSON.stringify(saved),
      ]);
      expect(
        await store.writeIfUnchanged(row.id, row.hash, { stale: true }),
      ).toBe(false);
      expect(await dataOf("r4")).toEqual(saved);
      // С актуальным хешем запись проходит; возвращаем строку как была.
      const [fresh] = await store.loadBatch(["r4"]);
      const original = before0028.find((r) => r.id === "r4")!.data;
      expect(await store.writeIfUnchanged("r4", fresh.hash, original)).toBe(
        true,
      );
      expect(await allRows()).toEqual(before0028);
    });

    it("перевод идёт пачками и выбирает только строки с прежними категориями", async () => {
      const summary = await run();
      // r1, r2, r4, r5 — с категориями; r3 пустая — регуляркой не выбрана.
      expect(summary).toEqual(
        expect.objectContaining({
          locked: true,
          batches: 2,
          scanned: 4,
          updated: 4,
          conflicts: 0,
          failed: 0,
        }),
      );
    });

    it("news → «Новости», articles → «Статьи» этого магазина", async () => {
      const data = await dataOf("r1");
      expect(homeBlock(data, "Pub-news").props).toEqual(
        expect.objectContaining({
          publicationSource: "blog",
          blogId: ids["s1:novosti"],
          publicationType: ids["s1:novosti"],
          categoryFilter: "all",
        }),
      );
      expect(homeBlock(data, "Pub-articles").props).toEqual(
        expect.objectContaining({
          publicationSource: "blog",
          blogId: ids["s1:stati"],
        }),
      );
    });

    it("секции в зонах и в корневом content тоже переведены (blog, «Статьи»)", async () => {
      const data = await dataOf("r1");
      const zone = data.pagesData.home.zones["Columns-1:left"][0];
      expect(zone.props).toEqual(
        expect.objectContaining({ blogId: ids["s1:blog"] }),
      );
      const root = data.content[0];
      expect(root.props).toEqual(
        expect.objectContaining({
          blogId: ids["s1:stati"],
          categoryFilter: ids["s1:stati"],
        }),
      );
    });

    it("блога нет в магазине — блог по умолчанию «Новости»", async () => {
      const data = await dataOf("r2");
      expect(homeBlock(data, "Pub-articles").props).toEqual(
        expect.objectContaining({
          publicationSource: "blog",
          blogId: ids["s2:novosti"],
        }),
      );
    });

    it("«Все публикации», выбранная запись, новый формат и чужие блоки не тронуты", async () => {
      const data = await dataOf("r1");
      expect(homeBlock(data, "Pub-all").props).toEqual({
        id: "Pub-all",
        publicationType: "all",
      });
      expect(homeBlock(data, "Pub-one").props).toEqual({
        id: "Pub-one",
        publicationType: "pub-123",
      });
      expect(homeBlock(data, "Pub-new").props).toEqual({
        id: "Pub-new",
        publicationSource: "publication",
        publicationId: "pub-9",
        publicationType: "news",
      });
      expect(homeBlock(data, "Hero-1").props).toEqual({
        id: "Hero-1",
        heading: "news",
      });
      expect(await dataOf("r3")).toEqual({ pages: [], pagesData: {} });
    });

    it("повторный запуск ничего не меняет, блокировка снята", async () => {
      const before = await allRows();
      const summary = await run();
      // r1 остаётся под регуляркой из-за Pub-new (новый формат с publicationType 'news') — выбрана, не записана.
      expect(summary).toEqual(
        expect.objectContaining({ updated: 0, unchanged: 1 }),
      );
      expect(await allRows()).toEqual(before);
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory'`,
      );
      expect(rows[0].n).toBe(0);
    });
  },
);
