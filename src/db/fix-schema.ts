import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { sql } from 'drizzle-orm';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function fixSchema() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const db = drizzle(pool);

  try {
    console.log('Fixing sites database schema...');

    // Check if the site table has the prev_status column (added in migration 0002)
    const siteColumns = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'site' AND column_name = 'prev_status'
    `);

    if (siteColumns.rows.length === 0) {
      console.log('Adding prev_status column to site table...');
      await db.execute(
        sql`ALTER TABLE "site" ADD COLUMN "prev_status" "site_status";`,
      );
    }

    // Check for any missing indexes that might be needed
    const indexes = await db.execute(sql`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename IN ('site', 'site_domain', 'site_revision', 'site_build', 'site_deployment')
    `);

    console.log('Existing indexes:');
    indexes.rows.forEach((row: any) => {
      console.log(`  ${row.indexname}`);
    });

    // You can add more schema fixes here as needed
    // For example, adding missing constraints, indexes, etc.

    console.log('Schema fixed successfully');
  } catch (error) {
    console.error('Failed to fix schema:', error);
  } finally {
    await pool.end();
  }
}

fixSchema().catch(console.error);