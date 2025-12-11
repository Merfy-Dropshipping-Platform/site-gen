import { Pool } from 'pg';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function checkSchema() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Checking sites database schema...');

    // Check if the site table exists and has all required columns
    const siteColumns = await pool.query(`
      SELECT column_name, is_nullable, column_default, data_type
      FROM information_schema.columns
      WHERE table_name = 'site'
      ORDER BY ordinal_position
    `);

    console.log('Site table columns:');
    siteColumns.rows.forEach((row: any) => {
      console.log(
        `  ${row.column_name} (${row.data_type}): nullable=${row.is_nullable}, default=${row.column_default}`,
      );
    });

    // Check if the site_domain table exists
    const siteDomainTable = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'site_domain'
    `);

    console.log('Site domain table exists:', siteDomainTable.rows.length > 0);

    // Check if the site_revision table exists
    const siteRevisionTable = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'site_revision'
    `);

    console.log('Site revision table exists:', siteRevisionTable.rows.length > 0);

    // Check if the site_build table exists
    const siteBuildTable = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'site_build'
    `);

    console.log('Site build table exists:', siteBuildTable.rows.length > 0);

    // Check if the site_deployment table exists
    const siteDeploymentTable = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'site_deployment'
    `);

    console.log('Site deployment table exists:', siteDeploymentTable.rows.length > 0);

    // Check for all enum types
    const enumTypes = await pool.query(`
      SELECT typname
      FROM pg_type
      WHERE typtype = 'e' AND typname LIKE '%site%'
    `);

    console.log('Site-related enum types:');
    enumTypes.rows.forEach((row: any) => {
      console.log(`  ${row.typname}`);
    });

    // Check if drizzle migration table exists
    const migrationTable = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = '__drizzle_migrations'
    `);

    console.log('Drizzle migrations table exists:', migrationTable.rows.length > 0);

    if (migrationTable.rows.length > 0) {
      const migrations = await pool.query(`
        SELECT id, hash, created_at
        FROM __drizzle_migrations
        ORDER BY created_at
      `);

      console.log('Applied migrations:');
      migrations.rows.forEach((row: any) => {
        console.log(`  ${row.id}: ${row.hash} (${row.created_at})`);
      });
    }
  } catch (error) {
    console.error('Failed to check schema:', error);
  } finally {
    await pool.end();
  }
}

checkSchema().catch(console.error);