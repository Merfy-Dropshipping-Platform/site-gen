import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { existsSync } from 'fs';

dotenv.config({ path: '.env.local' });

/**
 * CLI‑раннер миграций Drizzle. Ищет каталог `drizzle/` в текущей рабочей директории
 * (локальный запуск/контейнер), и откатывается на `sites/drizzle` при работе из собранного dist.
 */
async function runMigrations() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const db = drizzle(pool);

  try {
    console.log('Running sites migrations...');
    const migrationsFromCwd = path.join(process.cwd(), 'drizzle');
    const migrationsFolder = existsSync(migrationsFromCwd)
      ? migrationsFromCwd
      : path.join(__dirname, '../../drizzle');
    await migrate(db, { migrationsFolder });
    console.log('Sites migrations completed');
  } catch (error) {
    console.error('Sites migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

runMigrations().catch(() => process.exit(1));
