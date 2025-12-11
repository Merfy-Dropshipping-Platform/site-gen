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

async function manualMigrate() {
  console.log('Starting manual migration for sites service...');

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

    // Показать информацию о выполненных миграциях
    const appliedMigrations = await pool.query(`
      SELECT id, hash, created_at
      FROM __drizzle_migrations
      ORDER BY created_at
    `);

    console.log('\nApplied migrations:');
    appliedMigrations.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.id} (${row.created_at})`);
    });

  } catch (error) {
    console.error('Manual migration failed:', error);

    // Попытаемся показать больше информации об ошибке
    if (error.message.includes('relation') && error.message.includes('does not exist')) {
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