#!/usr/bin/env tsx
/**
 * Phase 0b rollback.
 *
 * Restores site_revision.data for every row whose revision_id lives in
 * site_revision_prebackfill. Safe to re-run — UPDATE is idempotent.
 *
 * Targeted rollback (single revision):
 *   DATABASE_URL=… REVISION_ID=<id> pnpm rollback:theme-schemes
 *
 * Full rollback (every row in the backup table):
 *   DATABASE_URL=… DRY_RUN=false pnpm rollback:theme-schemes
 *
 * Defaults to DRY_RUN so running without flags just reports what would
 * happen.
 */

import 'dotenv/config';
import { Pool } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL required'); process.exit(1); }
  const dryRun = process.env.DRY_RUN !== 'false';
  const onlyRev = process.env.REVISION_ID ?? null;

  const pool = new Pool({ connectionString: url });

  const where = onlyRev ? 'WHERE revision_id = $1' : '';
  const args = onlyRev ? [onlyRev] : [];
  const q = await pool.query<{ revision_id: string }>(
    `SELECT revision_id FROM site_revision_prebackfill ${where} ORDER BY backed_up_at DESC`,
    args,
  );

  console.log(`[rollback] found ${q.rowCount} backed-up revisions${onlyRev ? ` (filter: ${onlyRev})` : ''}`);
  if (dryRun) {
    for (const r of q.rows.slice(0, 10)) console.log(`  would restore ${r.revision_id}`);
    if (q.rowCount > 10) console.log(`  … and ${q.rowCount - 10} more`);
    console.log('[rollback] DRY_RUN=true — no writes. Set DRY_RUN=false to execute.');
    await pool.end();
    return;
  }

  let restored = 0;
  for (const r of q.rows) {
    await pool.query(
      `UPDATE site_revision
          SET data = bp.data
         FROM site_revision_prebackfill bp
        WHERE site_revision.id = $1 AND bp.revision_id = $1`,
      [r.revision_id],
    );
    restored++;
    if (restored % 10 === 0) console.log(`[rollback] restored ${restored}/${q.rowCount}`);
  }
  console.log(`[rollback] done — ${restored} revisions restored`);
  await pool.end();
}

main().catch((e) => { console.error('[rollback] failed:', e); process.exit(1); });
