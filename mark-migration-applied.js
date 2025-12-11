const { Pool } = require('pg');

async function markMigrationAsApplied() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres123@localhost:5543/sites_service'
  });

  try {
    // Создаем таблицу миграций если её нет
    await pool.query(`
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);

    // Получаем hash текущей миграции
    const fs = require('fs');
    const migrationFile = fs.readFileSync('./drizzle/0000_groovy_rick_jones.sql', 'utf8');
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(migrationFile).digest('hex');

    // Добавляем запись о выполненной миграции
    const result = await pool.query(
      `INSERT INTO __drizzle_migrations (hash, created_at)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [hash, Date.now()]
    );

    if (result.rows.length > 0) {
      console.log('Migration marked as applied successfully');
    } else {
      console.log('Migration was already marked as applied');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

markMigrationAsApplied();