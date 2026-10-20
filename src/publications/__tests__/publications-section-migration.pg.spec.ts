/**
 * Миграция 0028 (секция «Публикации»: категории → id блогов) на НАСТОЯЩЕМ Postgres.
 *
 * Отдельная одноразовая база `<SITES_TEST_DATABASE_URL>_pubsec_mig`: схема
 * накатывается до 0027 включительно, в ревизии кладутся секции «Публикации»
 * со старыми значениями news/blog/articles, затем накатывается 0028.
 * Проверяем таблицу контракта (news → novosti, blog → blog, articles → stati;
 * блога нет — блог по умолчанию), глубину обхода, нетронутость остального и
 * идемпотентность. Без переменной набор пропускается с предупреждением.
 */
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { disposableDatabaseName } from "../../store/__tests__/support/test-database";

const url = process.env.SITES_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
if (!url) {
  console.warn(
    "publications-section-migration.pg.spec: SITES_TEST_DATABASE_URL не задан — проверка миграции на Postgres ПРОПУЩЕНА",
  );
}

const MIGRATIONS = resolve(__dirname, "..", "..", "..", "drizzle");
const MIGRATION_0028 = join(MIGRATIONS, "0028_publications_section_blogs.sql");

/** Каталог миграций без 0028 и дальше — «до перевода секций». */
function migrationsBefore0028(): string {
  const dir = mkdtempSync(join(tmpdir(), "sites-mig-"));
  cpSync(MIGRATIONS, dir, { recursive: true });
  const journalPath = join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  journal.entries = journal.entries.filter((e: { idx: number }) => e.idx < 28);
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
        content: [{ type: "Hero", props: { id: "Hero-1", heading: "news" } }, ...blocks],
        root: { props: {} },
        zones: { "Columns-1:left": [pub("Pub-zone", { publicationType: "blog" })] },
      },
    },
    content: [pub("Pub-root", { categoryFilter: "Статьи", publicationType: "" })],
  };
}

suite("миграция 0028: секция «Публикации» — категории → id блогов", () => {
  let admin: InstanceType<typeof Pool>;
  let pool: InstanceType<typeof Pool>;
  const ids: Record<string, string> = {};

  const dataOf = async (id: string) => {
    const { rows } = await pool.query(`SELECT data FROM site_revision WHERE id = $1`, [id]);
    return rows[0].data as ReturnType<typeof revision>;
  };
  const homeBlock = (data: ReturnType<typeof revision>, id: string) =>
    (data.pagesData.home.content as Block[]).find((b) => b.props.id === id)!;

  beforeAll(async () => {
    const base = new URL(url!);
    const name = `${disposableDatabaseName(url!)}_pubsec_mig`;
    const adminUrl = new URL(url!);
    adminUrl.pathname = "/postgres";
    admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${name}"`);
    base.pathname = `/${name}`;
    pool = new Pool({ connectionString: base.toString(), max: 2 });

    await migrate(drizzle(pool), { migrationsFolder: migrationsBefore0028() });

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
    const { rows } = await pool.query(`SELECT site_id, handle, id FROM blogs`);
    for (const r of rows as Array<{ site_id: string; handle: string; id: string }>) {
      ids[`${r.site_id}:${r.handle}`] = r.id;
    }

    const insert = (id: string, siteId: string, data: unknown) =>
      pool.query(`INSERT INTO site_revision (id, site_id, data, created_at) VALUES ($1, $2, $3, now())`, [
        id,
        siteId,
        JSON.stringify(data),
      ]);
    await insert(
      "r1",
      "s1",
      revision([
        pub("Pub-news", { publicationType: "news", categoryFilter: "all" }),
        pub("Pub-articles", { publicationType: "articles" }),
        pub("Pub-all", { publicationType: "all" }),
        pub("Pub-one", { publicationType: "pub-123" }),
        pub("Pub-new", { publicationSource: "publication", publicationId: "pub-9", publicationType: "news" }),
      ]),
    );
    // У второго магазина нет «Статей» — секция получает блог по умолчанию.
    await insert("r2", "s2", revision([pub("Pub-articles", { publicationType: "articles" })]));
    await insert("r3", "s1", { pages: [], pagesData: {} });

    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS });
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.end();
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
      expect.objectContaining({ publicationSource: "blog", blogId: ids["s1:stati"] }),
    );
  });

  it("секции в зонах и в корневом content тоже переведены (blog, «Статьи»)", async () => {
    const data = await dataOf("r1");
    const zone = (data.pagesData.home.zones["Columns-1:left"] as Block[])[0];
    expect(zone.props).toEqual(expect.objectContaining({ blogId: ids["s1:blog"] }));
    const root = (data.content as Block[])[0];
    expect(root.props).toEqual(
      expect.objectContaining({ blogId: ids["s1:stati"], categoryFilter: ids["s1:stati"] }),
    );
  });

  it("блога нет в магазине — блог по умолчанию «Новости»", async () => {
    const data = await dataOf("r2");
    expect(homeBlock(data, "Pub-articles").props).toEqual(
      expect.objectContaining({ publicationSource: "blog", blogId: ids["s2:novosti"] }),
    );
  });

  it("«Все публикации», выбранная запись, новый формат и чужие блоки не тронуты", async () => {
    const data = await dataOf("r1");
    expect(homeBlock(data, "Pub-all").props).toEqual({ id: "Pub-all", publicationType: "all" });
    expect(homeBlock(data, "Pub-one").props).toEqual({ id: "Pub-one", publicationType: "pub-123" });
    expect(homeBlock(data, "Pub-new").props).toEqual({
      id: "Pub-new",
      publicationSource: "publication",
      publicationId: "pub-9",
      publicationType: "news",
    });
    expect(homeBlock(data, "Hero-1").props).toEqual({ id: "Hero-1", heading: "news" });
    expect(await dataOf("r3")).toEqual({ pages: [], pagesData: {} });
  });

  it("повторный прогон 0028 ничего не меняет, временная функция удалена", async () => {
    const before = await pool.query(`SELECT id, data FROM site_revision ORDER BY id`);
    for (const statement of readFileSync(MIGRATION_0028, "utf8").split("--> statement-breakpoint")) {
      await pool.query(statement);
    }
    const after = await pool.query(`SELECT id, data FROM site_revision ORDER BY id`);
    expect(after.rows).toEqual(before.rows);
    const fn = await pool.query(`SELECT 1 FROM pg_proc WHERE proname = 'merfy_tmp_publications_blog_refs'`);
    expect(fn.rowCount).toBe(0);
  });
});
