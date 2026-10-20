/**
 * Подключение тестов к НАСТОЯЩЕМУ Postgres — только к одноразовой базе.
 *
 * `store.pg.spec.ts` накатывает миграции, пишет и удаляет строки. Направить его
 * по ошибке на рабочую базу (`SITES_TEST_DATABASE_URL` скопировали из
 * `DATABASE_URL`) — значит испортить чужие данные. Поэтому соединение даёт
 * только `openDisposableDatabase`, и она отказывает, если в имени базы нет
 * «test». Базы нет — создаёт её на том же сервере (так же, как
 * `src/db/migrate.ts` создаёт рабочую), затем накатывает миграции drizzle.
 * В CI это эфемерная `sites_stage3_test` на сервисном Postgres джобы.
 */
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import * as schema from "../../../db/schema";

const DISPOSABLE_NAME = /test/i;
const DUPLICATE_DATABASE = "42P04";
const MIGRATIONS = resolve(__dirname, "..", "..", "..", "..", "drizzle");

export interface DisposableDatabase {
  pool: InstanceType<typeof Pool>;
  db: NodePgDatabase<typeof schema>;
  name: string;
}

/** Имя базы из адреса; не тестовая база — отказ (до любого подключения). */
export function disposableDatabaseName(url: string): string {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  if (!DISPOSABLE_NAME.test(name)) {
    throw new Error(
      `отказ: база «${name}» не тестовая — в имени базы для тестов на Postgres должно быть «test»`,
    );
  }
  return name;
}

async function createIfMissing(url: string, name: string): Promise<void> {
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const pool = new Pool({ connectionString: admin.toString(), max: 1 });
  try {
    const found = await pool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [name],
    );
    if (found.rowCount) return;
    await pool.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
  } catch (e) {
    // Параллельный прогон успел создать ту же базу — это не ошибка.
    if ((e as { code?: string }).code !== DUPLICATE_DATABASE) throw e;
  } finally {
    await pool.end();
  }
}

export async function openDisposableDatabase(
  url: string,
): Promise<DisposableDatabase> {
  const name = disposableDatabaseName(url);
  await createIfMissing(url, name);
  const pool = new Pool({ connectionString: url, max: 6 });
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return { pool, db, name };
}

// ---------------------------------------------------------------------------
// Jest считает тестовым любой .ts в __tests__/** — см. in-memory-lifecycle.ts.
// ---------------------------------------------------------------------------
function isOwnTestFile(): boolean {
  try {
    const testPath = (
      globalThis as { expect?: { getState?: () => { testPath?: string } } }
    ).expect?.getState?.().testPath;
    return testPath === __filename;
  } catch {
    return false;
  }
}

if (isOwnTestFile())
  describe("test-database: подключение только к одноразовой базе", () => {
    it.each([
      [
        "postgresql://u:p@localhost:5432/sites_stage3_test",
        "sites_stage3_test",
      ],
      ["postgres://u:p@db:5432/Test_Sites", "Test_Sites"],
      ["postgres://u:p@db:5432/%D1%82%D0%B5%D1%81%D1%82_test", "тест_test"],
    ])("%s — тестовая база «%s»", (url, name) => {
      expect(disposableDatabaseName(url)).toBe(name);
    });

    it.each([
      "postgresql://postgres:x@localhost:5432/sites_service",
      "postgresql://postgres:x@200.169.180.243:54321/postgres",
      "postgresql://postgres:x@localhost:5432/merfy",
    ])("%s — отказ", (url) => {
      expect(() => disposableDatabaseName(url)).toThrow(/не тестовая/);
    });

    it("openDisposableDatabase отказывает ДО подключения: сервера нет, а ошибка — про имя базы", async () => {
      await expect(
        openDisposableDatabase("postgresql://u:p@127.0.0.1:1/sites_service"),
      ).rejects.toThrow(/не тестовая/);
    });
  });
