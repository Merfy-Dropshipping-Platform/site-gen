/**
 * Доприменение миграций, пропущенных из-за порядка.
 *
 * drizzle `migrate` применяет только миграции новее последней записанной
 * (`created_at < when` у последней строки `drizzle.__drizzle_migrations`).
 * На прод миграции приходят не по порядку: своя задача уходит cherry-pick'ом,
 * а более ранние миграции чужих задач ещё лежат в dev. 20.10.2026 так на прод
 * ушла 0027_blogs раньше 0018–0026 — без этого прохода они при своей выкатке
 * молча пропустились бы.
 *
 * Доприменяем миграции новее OUT_OF_ORDER_FLOOR, чьего `when` нет в базе.
 * Граница — 0017: старше неё история неаккуратна (0009 применена до учёта,
 * ни её `when`, ни хеша в базе нет на обоих контурах), её не трогаем.
 */
import { Pool } from "pg";
import { readMigrationFiles, type MigrationMeta } from "drizzle-orm/migrator";

type PgPool = InstanceType<typeof Pool>;

/** `when` миграции 0017_site_content_model. */
export const OUT_OF_ORDER_FLOOR = 1790126759288;

export function pickSkippedMigrations(
  migrations: readonly MigrationMeta[],
  appliedWhens: ReadonlySet<number>,
  floor: number = OUT_OF_ORDER_FLOOR,
): MigrationMeta[] {
  return migrations.filter(
    (m) => m.folderMillis > floor && !appliedWhens.has(m.folderMillis),
  );
}

export async function applySkippedMigrations(
  pool: PgPool,
  migrationsFolder: string,
): Promise<number> {
  const migrations = readMigrationFiles({ migrationsFolder });
  const { rows } = await pool.query(
    `SELECT created_at FROM drizzle.__drizzle_migrations`,
  );
  const applied = new Set<number>(
    rows.map((r: { created_at: string }) => Number(r.created_at)),
  );
  const skipped = pickSkippedMigrations(migrations, applied);

  for (const m of skipped) {
    console.log(`Applying out-of-order migration (when=${m.folderMillis})`);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const stmt of m.sql) {
        if (stmt.trim()) await client.query(stmt);
      }
      await client.query(
        `INSERT INTO drizzle.__drizzle_migrations ("hash", "created_at") VALUES ($1, $2)`,
        [m.hash, m.folderMillis],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return skipped.length;
}
