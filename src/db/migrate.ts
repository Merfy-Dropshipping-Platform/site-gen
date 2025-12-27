import { drizzle } from 'drizzle-orm/node-postgres';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - migration CLI не требует строгой типизации pg
import { Pool } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as path from 'path';
import { existsSync } from 'fs';

// Загружаем .env.local в разработке, если доступен dotenv
if (process.env.NODE_ENV !== 'production') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('dotenv').config({ path: '.env.local' });
  } catch {
    // dotenv не является обязательным — переменные могут быть заданы снаружи
  }
}

// Функция для создания базы данных, если её нет
async function ensureDatabaseExists() {
  if (!process.env.DATABASE_URL) {
    console.log('DATABASE_URL not set, skipping database creation check');
    return;
  }

  const url = new URL(process.env.DATABASE_URL);
  const dbName = url.pathname.slice(1); // Remove leading slash

  const connectionConfig = {
    host: url.hostname,
    port: parseInt(url.port || '5432', 10),
    user: url.username,
    password: url.password,
    database: 'postgres', // Подключаемся к postgres для создания новой БД
  };

  const pool = new Pool(connectionConfig);

  try {
    const result = await pool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName],
    );

    if (result.rows.length === 0) {
      console.log(`Creating database '${dbName}'...`);
      await pool.query(`CREATE DATABASE "${dbName}"`);
      console.log(`✅ Database '${dbName}' created successfully`);
    } else {
      console.log(`✅ Database '${dbName}' already exists`);
    }
  } catch (error: any) {
    if (error.code !== '42P04') {
      console.error('Failed to ensure database exists:', error.message);
      throw error;
    }
  } finally {
    await pool.end();
  }
}

/**
 * CLI‑раннер миграций Drizzle. Ищет каталог `drizzle/` в текущей рабочей директории
 * (локальный запуск/контейнер), и откатывается на `sites/drizzle` при работе из собранного dist.
 */
async function runMigrations() {
  // Сначала убеждаемся, что база данных существует
  await ensureDatabaseExists();

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
