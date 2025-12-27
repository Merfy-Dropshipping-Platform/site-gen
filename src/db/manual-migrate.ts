/**
 * Ручное выполнение миграций для отладки или восстановления схемы
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from './schema';
import * as path from 'path';
import { existsSync } from 'fs';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

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

async function manualMigrate() {
  console.log('Starting manual migration for sites service...');

  // Сначала убеждаемся, что база данных существует
  await ensureDatabaseExists();

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const db = drizzle(pool, { schema });

  try {
    // Проверяем наличие таблицы миграций
    const migrationTableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = '__drizzle_migrations'
      );
    `);

    if (!migrationTableExists.rows[0].exists) {
      console.log('Creating drizzle migrations table...');
    }

    // Выполняем миграции
    console.log('Running migrations...');
    const migrationsFromCwd = path.join(process.cwd(), 'drizzle');
    const migrationsFolder = existsSync(migrationsFromCwd)
      ? migrationsFromCwd
      : path.join(__dirname, '../../drizzle');

    console.log(`Using migrations folder: ${migrationsFolder}`);

    await migrate(db, { migrationsFolder });

    console.log('Manual migration completed successfully');

    // Показать информацию о выполненных миграциях (после создания таблицы)
    try {
      const appliedMigrations = await pool.query(`
        SELECT id, hash, created_at
        FROM __drizzle_migrations
        ORDER BY created_at
      `);

      console.log('\nApplied migrations:');
      appliedMigrations.rows.forEach((row: any, index: number) => {
        console.log(`${index + 1}. ${row.id} (${row.created_at})`);
      });
    } catch (error) {
      console.log('Could not fetch migration history (table may not exist yet)');
    }

  } catch (error) {
    console.error('Manual migration failed:', error);

    // Попытаемся показать больше информации об ошибке
    if (error instanceof Error && error.message.includes('relation') && error.message.includes('does not exist')) {
      console.log('\nIt seems like some tables are missing. You may need to:');
      console.log('1. Check if the database exists');
      console.log('2. Verify the connection string');
      console.log('3. Run migrations from the beginning');
    }

    throw error;
  } finally {
    await pool.end();
  }
}

manualMigrate().catch(() => process.exit(1));