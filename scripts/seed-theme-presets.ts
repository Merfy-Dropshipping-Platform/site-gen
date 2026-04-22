#!/usr/bin/env tsx
/**
 * CLI: seed theme presets from seed/theme-presets/*.json into the DB.
 * Normally runs on service bootstrap via ThemePresetModule.onApplicationBootstrap,
 * but this script is useful for manual runs (CI, migrations, dev DB reset).
 *
 * Usage: pnpm sites:seed-presets
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

import * as schema from '../src/db/schema';
import { ThemePresetService } from '../src/modules/theme-preset/theme-preset.service';

async function main() {
  const databaseUrl =
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres123@localhost:5432/sites_service';
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  // Instantiate service manually (no Nest DI here — plain script)
  const service = new ThemePresetService(db as unknown as never);

  console.log('🌱 Seeding theme presets from seed/theme-presets/*.json');
  const result = await service.seedFromFiles();
  console.log(
    `   loaded: ${result.loaded}  skipped: ${result.skipped.length}  errors: ${result.errors.length}`,
  );
  for (const e of result.errors) console.log(`   ⚠ ${e}`);

  await pool.end();
  process.exit(result.errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
