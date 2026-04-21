#!/usr/bin/env tsx
/**
 * Phase 0b back-fill runner.
 *
 * For every active site where `site_revision.data.themeSettings.colorSchemes`
 * deep-equals the legacy Rose-like seed, replace it with the merchant-shape
 * schemes derived from the site's theme manifest. Backs up the original
 * row to `site_revision_prebackfill` first so rollback is a single SQL.
 *
 * Usage:
 *
 *   DATABASE_URL=postgres://… pnpm backfill:theme-schemes      # dry-run
 *   DATABASE_URL=postgres://… DRY_RUN=false pnpm backfill:theme-schemes
 *
 * Always run dry-run once, review the plan counts, then run with
 * DRY_RUN=false. DRY_RUN defaults to 'true' for safety.
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema';
import { planRewrites, type Plan } from '../src/themes/backfill-planner';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }
  const dryRun = process.env.DRY_RUN !== 'false';
  console.log(`[backfill] DATABASE_URL set, DRY_RUN=${dryRun}`);

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });

  // 1. Fetch all active revisions joined with their site.theme_id.
  const rows = await pool.query<{
    id: string;
    data: unknown;
    site_theme_id: string | null;
  }>(
    `SELECT sr.id, sr.data, s.theme_id AS site_theme_id
       FROM site_revision sr
       JOIN site s ON s.current_revision_id = sr.id
      WHERE s.deleted_at IS NULL`,
  );
  console.log(`[backfill] fetched ${rows.rowCount} active revisions`);

  const plans = planRewrites(
    rows.rows.map((r) => ({
      id: r.id,
      siteThemeId: r.site_theme_id,
      data: (r.data ?? {}) as Record<string, unknown>,
    })),
  );

  const summary: Record<Plan['action'], number> = {
    'rewrite': 0,
    'skip-customised': 0,
    'skip-no-theme': 0,
    'skip-no-schemes': 0,
    'skip-no-theme-schemes': 0,
  };
  const perTheme: Record<string, number> = {};
  for (const p of plans) {
    summary[p.action]++;
    if (p.action === 'rewrite' && p.themeId) {
      perTheme[p.themeId] = (perTheme[p.themeId] ?? 0) + 1;
    }
  }
  console.log(`[backfill] plan summary:`, summary);
  console.log(`[backfill] rewrites per theme:`, perTheme);

  if (dryRun) {
    console.log('[backfill] DRY_RUN=true — no writes. Set DRY_RUN=false to execute.');
    await pool.end();
    return;
  }

  // 2. Ensure backup table exists.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_revision_prebackfill (
      revision_id text PRIMARY KEY,
      data jsonb NOT NULL,
      backed_up_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  // 3. Apply rewrites.
  let applied = 0;
  for (const plan of plans) {
    if (plan.action !== 'rewrite' || !plan.newSchemes) continue;
    const row = rows.rows.find((r) => r.id === plan.rowId);
    if (!row) continue;

    // Backup first — ON CONFLICT DO NOTHING so re-runs are idempotent.
    await pool.query(
      `INSERT INTO site_revision_prebackfill (revision_id, data)
         VALUES ($1, $2)
         ON CONFLICT (revision_id) DO NOTHING`,
      [plan.rowId, row.data],
    );

    const next = JSON.parse(JSON.stringify(row.data)) as Record<string, unknown>;
    const ts = (next.themeSettings ?? {}) as Record<string, unknown>;
    ts.colorSchemes = plan.newSchemes;
    next.themeSettings = ts;

    await db
      .update(schema.siteRevision)
      .set({ data: next })
      .where(eq(schema.siteRevision.id, plan.rowId));
    applied++;
    if (applied % 10 === 0) console.log(`[backfill] applied ${applied}/${summary.rewrite}`);
  }
  console.log(`[backfill] done — ${applied} revisions rewritten`);
  await pool.end();
}

main().catch((err) => {
  console.error('[backfill] failed:', err);
  process.exit(1);
});
