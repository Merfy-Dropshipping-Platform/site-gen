/**
 * Миграция 0027 (категории → блоги) на НАСТОЯЩЕМ Postgres.
 *
 * Отдельная одноразовая база `<SITES_TEST_DATABASE_URL>_blogs_mig`: схема
 * накатывается до 0026, в неё кладутся записи со старыми категориями, затем
 * накатывается 0027. Проверяем, что ни одна запись не потерялась, блоги
 * созданы по таблице контракта, category и enum удалены, анонсы, посчитанные
 * сервисом, стали null, а заданные продавцом — остались. База пересоздаётся
 * на каждом прогоне. Без переменной набор пропускается с предупреждением.
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
    "blogs-migration.pg.spec: SITES_TEST_DATABASE_URL не задан — проверка миграции на Postgres ПРОПУЩЕНА",
  );
}

const MIGRATIONS = resolve(__dirname, "..", "..", "..", "drizzle");
const MIGRATION_0027 = join(MIGRATIONS, "0027_blogs.sql");

/** Каталог миграций без 0027 и дальше — схема «до блогов». */
function migrationsBefore0027(): string {
  const dir = mkdtempSync(join(tmpdir(), "sites-mig-"));
  cpSync(MIGRATIONS, dir, { recursive: true });
  const journalPath = join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  // По имени, не по idx: на прод миграции приходят не по порядку (0027 там
  // стоит сразу за 0017), номер в журнале у неё другой.
  journal.entries = journal.entries.filter(
    (e: { tag: string }) => e.tag < "0027_",
  );
  writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

/** Строка ответа Postgres в проверках: колонки — текст или null. */
type Row = Record<string, string | null>;

const LONG_CONTENT = `<p>${"Слово ".repeat(60)}</p>`;
const AUTO_EXCERPT = LONG_CONTENT.replace(/<[^>]*>/g, "").substring(0, 200);

suite("миграция 0027: категории → блоги", () => {
  let admin: InstanceType<typeof Pool>;
  let pool: InstanceType<typeof Pool>;
  let dbUrl: string;

  beforeAll(async () => {
    const base = new URL(url!);
    const name = `${disposableDatabaseName(url!)}_blogs_mig`;
    const adminUrl = new URL(url!);
    adminUrl.pathname = "/postgres";
    admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${name}"`);
    base.pathname = `/${name}`;
    dbUrl = base.toString();
    pool = new Pool({ connectionString: dbUrl, max: 2 });

    await migrate(drizzle(pool), { migrationsFolder: migrationsBefore0027() });

    await pool.query(
      `INSERT INTO site (id, tenant_id, name, status, created_at, updated_at) VALUES
        ('s1', 't1', 'Магазин 1', 'draft', now(), now()),
        ('s2', 't2', 'Магазин 2', 'draft', now(), now()),
        ('s4', 't4', 'Пустой', 'draft', now(), now())`,
    );
    await pool.query(
      `INSERT INTO publications (id, organization_id, site_id, title, slug, category, content, excerpt, status) VALUES
        ('p1', 't1', 's1', 'Новость', 'novost', 'news', $1, $2, 'published'),
        ('p2', 't1', 's1', 'Пост', 'post', 'blog', '<p>Текст</p>', 'Анонс продавца', 'draft'),
        ('p3', 't1', 's1', 'Статья', 'statya', 'articles', '<p>Текст</p>', '', 'archived'),
        ('p3b', 't1', 's1', 'Статья 2', 'statya-2', 'articles', '<p>Текст</p>', NULL, 'draft'),
        ('p4', 't2', 's2', 'Новость 2', 'novost', 'news', '<p>Коротко</p>', 'Коротко', 'scheduled'),
        ('p5', 't3', 's3-orphan', 'Сирота', 'sirota', 'articles', '', '', 'draft')`,
      [LONG_CONTENT, AUTO_EXCERPT],
    );

    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS });
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.end();
  });

  it("ни одна запись не потерялась, у каждой есть блог", async () => {
    const { rows } = await pool.query(
      `SELECT p.id, b.site_id, b.handle, b.title, b.organization_id
         FROM publications p JOIN blogs b ON b.id = p.blog_id ORDER BY p.id`,
    );
    expect(rows.map((r: Row) => [r.id, r.site_id, r.handle, r.title])).toEqual([
      ["p1", "s1", "novosti", "Новости"],
      ["p2", "s1", "blog", "Блог"],
      ["p3", "s1", "stati", "Статьи"],
      ["p3b", "s1", "stati", "Статьи"],
      ["p4", "s2", "novosti", "Новости"],
      ["p5", "s3-orphan", "stati", "Статьи"],
    ]);
    expect(rows.find((r: Row) => r.id === "p5")?.organization_id).toBe("t3");
  });

  it("«Новости» есть у каждого магазина; «Блог» и «Статьи» — только где были такие записи", async () => {
    const { rows } = await pool.query(
      `SELECT site_id, organization_id, handle FROM blogs ORDER BY site_id, handle`,
    );
    expect(rows.map((r: Row) => `${r.site_id}:${r.handle}`)).toEqual([
      "s1:blog",
      "s1:novosti",
      "s1:stati",
      "s2:novosti",
      "s3-orphan:stati",
      "s4:novosti",
    ]);
    expect(rows.find((r: Row) => r.site_id === "s4")?.organization_id).toBe(
      "t4",
    );
  });

  it("category и enum publication_category удалены, blog_id NOT NULL с внешним ключом", async () => {
    const cols = await pool.query(
      `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'publications'`,
    );
    const byName = Object.fromEntries(
      cols.rows.map((r: Row) => [r.column_name, r.is_nullable]),
    );
    expect(byName.category).toBeUndefined();
    expect(byName.blog_id).toBe("NO");
    expect(byName.seo_title).toBe("YES");
    expect(byName.seo_description).toBe("YES");
    const type = await pool.query(
      `SELECT 1 FROM pg_type WHERE typname = 'publication_category'`,
    );
    expect(type.rowCount).toBe(0);
    await expect(
      pool.query(
        `INSERT INTO publications (id, organization_id, site_id, blog_id, title, slug) VALUES ('x', 't1', 's1', 'no-such-blog', 'X', 'x')`,
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("анонс: посчитанный сервисом и пустой → null, заданный продавцом — как был; значения по умолчанию нет", async () => {
    const { rows } = await pool.query(
      `SELECT id, excerpt FROM publications ORDER BY id`,
    );
    expect(Object.fromEntries(rows.map((r: Row) => [r.id, r.excerpt]))).toEqual(
      {
        p1: null,
        p2: "Анонс продавца",
        p3: null,
        p3b: null,
        p4: null,
        p5: null,
      },
    );
    const def = await pool.query(
      `SELECT column_default FROM information_schema.columns WHERE table_name = 'publications' AND column_name = 'excerpt'`,
    );
    expect(def.rows[0].column_default).toBeNull();
  });

  it("адрес блога уникален в магазине; таблица прежних адресов на месте", async () => {
    await expect(
      pool.query(
        `INSERT INTO blogs (id, site_id, organization_id, title, handle) VALUES ('dup', 's1', 't1', 'Ещё', 'novosti')`,
      ),
    ).rejects.toThrow(/idx_blogs_site_handle/);
    await pool.query(
      `INSERT INTO publication_redirects (site_id, old_path, publication_id) VALUES ('s1', '/blogs/novosti/old', 'p1')`,
    );
    await pool.query(`DELETE FROM publications WHERE id = 'p3b'`);
    const left = await pool.query(
      `SELECT count(*)::int AS n FROM publication_redirects`,
    );
    expect(left.rows[0].n).toBe(1);
  });

  it("повторный прогон 0027 ничего не ломает", async () => {
    const statements = readFileSync(MIGRATION_0027, "utf8").split(
      "--> statement-breakpoint",
    );
    for (const statement of statements) {
      await pool.query(statement);
    }
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM blogs`);
    expect(rows[0].n).toBe(6);
  });
});
