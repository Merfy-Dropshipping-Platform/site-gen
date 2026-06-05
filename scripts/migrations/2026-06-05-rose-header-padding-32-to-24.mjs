#!/usr/bin/env node
/**
 * Миграция: Header padding 32/32 → 24/24 для rose-сайтов.
 *
 * Почему: эталон rose.merfy.ru desktop = py-5 lg:py-6 = 24px padding,
 * + контент h-10 (40px) = 88px высота Header. Наши revisions зафрозили
 * старый default 32/32 → 104px. Default в theme.json уже исправлен
 * (commit 8777b84), но existing revisions нужно мигрировать.
 *
 * Запуск: node scripts/migrations/2026-06-05-rose-header-padding-32-to-24.mjs --dry-run
 *         node scripts/migrations/2026-06-05-rose-header-padding-32-to-24.mjs --apply
 *
 * Скоупа: только current_revision_id (то что реально рендерится). Историю
 * revisions не трогаем — merchant может откатить, но это редкий кейс.
 */
import pg from 'pg';

const CONN =
  'postgres://postgres:cVA8ECEkmfrJmgTagElGLVxoE5em8CRN7mGisQkAQpotHcurNwdhRyFlu5Ck7l9O@176.57.218.121:54321/sites_service?sslmode=disable';

const OLD = JSON.stringify({ top: 32, bottom: 32 });
const NEW = JSON.stringify({ top: 24, bottom: 24 });

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isApply = args.includes('--apply');

if (!isDryRun && !isApply) {
  console.error('Usage: --dry-run | --apply');
  process.exit(1);
}

const client = new pg.Client({ connectionString: CONN });
await client.connect();

console.log(`Mode: ${isApply ? 'APPLY' : 'DRY-RUN'}`);

// 1. Find all rose sites + their current revisions
const sites = await client.query(`
  SELECT s.id AS site_id, s.public_url, s.current_revision_id
  FROM site s
  WHERE s.theme_id = 'rose'
    AND s.deleted_at IS NULL
    AND s.current_revision_id IS NOT NULL
`);

console.log(`Rose sites with current_revision: ${sites.rows.length}`);

let touchedRevisions = 0;
let touchedPages = 0;
const examples = [];

for (const site of sites.rows) {
  const revRes = await client.query(
    `SELECT id, data->'pagesData' AS pages_data FROM site_revision WHERE id = $1`,
    [site.current_revision_id],
  );
  if (revRes.rows.length === 0) continue;
  const { id: revId, pages_data: pagesData } = revRes.rows[0];
  if (!pagesData) continue;

  let needsUpdate = false;
  const newPagesData = {};
  for (const [pageId, pageContent] of Object.entries(pagesData)) {
    const content = pageContent?.content;
    if (
      Array.isArray(content) &&
      content[0]?.type === 'Header' &&
      JSON.stringify(content[0]?.props?.padding) === OLD
    ) {
      const newContent = [...content];
      newContent[0] = {
        ...newContent[0],
        props: { ...newContent[0].props, padding: { top: 24, bottom: 24 } },
      };
      newPagesData[pageId] = { ...pageContent, content: newContent };
      needsUpdate = true;
      touchedPages += 1;
    } else {
      newPagesData[pageId] = pageContent;
    }
  }

  if (!needsUpdate) continue;
  touchedRevisions += 1;
  if (examples.length < 3) {
    examples.push({
      site: site.public_url,
      rev: revId,
      pages_touched: Object.keys(newPagesData).filter(
        (pid) =>
          JSON.stringify(pagesData[pid]?.content?.[0]?.props?.padding) === OLD,
      ),
    });
  }

  if (isApply) {
    await client.query(
      `UPDATE site_revision SET data = jsonb_set(data, '{pagesData}', $1::jsonb, false) WHERE id = $2`,
      [JSON.stringify(newPagesData), revId],
    );
  }
}

console.log(`Revisions to touch: ${touchedRevisions}`);
console.log(`Pages to touch: ${touchedPages}`);
console.log('Examples:', JSON.stringify(examples, null, 2));

if (isApply) {
  console.log('✅ APPLIED');
} else {
  console.log('💡 Dry-run only. Re-run with --apply to commit.');
}

await client.end();
