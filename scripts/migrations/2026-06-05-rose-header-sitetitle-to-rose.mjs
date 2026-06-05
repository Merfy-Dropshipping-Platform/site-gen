#!/usr/bin/env node
/**
 * Миграция: Header.siteTitle "Мой магазин" → "Rose" для rose-сайтов,
 * у которых logo === "/logo.svg" (то есть мерчант не загружал свой).
 *
 * Почему: до коммита fa93343 (constructor bug #15 fix) при создании
 * сайтов жёстко подставлялся siteTitle="ROSE" / "Мой магазин",
 * не из theme.json blockDefaults. Existing revisions zafrozen на
 * "Мой магазин", даже когда theme.json уже даёт "Rose Theme" / "Rose".
 *
 * Скоупа: только current_revision_id rose-сайтов. Мерчанты с кастомным
 * siteTitle (например "Pretty Roses Shop") не затронуты — фильтр
 * требует точное совпадение "Мой магазин".
 *
 * После моего fix LogoMark.astro этот siteTitle используется как
 * alt/aria-label рядом с CSS-mask иконкой → лучше "Rose" чем "Мой магазин".
 *
 * Запуск: --dry-run / --apply
 */
import pg from 'pg';

const CONN =
  'postgres://postgres:cVA8ECEkmfrJmgTagElGLVxoE5em8CRN7mGisQkAQpotHcurNwdhRyFlu5Ck7l9O@176.57.218.121:54321/sites_service?sslmode=disable';

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

const sites = await client.query(`
  SELECT s.id AS site_id, s.public_url, s.current_revision_id
  FROM site s
  WHERE s.theme_id = 'rose'
    AND s.deleted_at IS NULL
    AND s.current_revision_id IS NOT NULL
`);

console.log(`Rose sites: ${sites.rows.length}`);

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
      content[0]?.props?.siteTitle === 'Мой магазин' &&
      content[0]?.props?.logo === '/logo.svg'
    ) {
      const newContent = [...content];
      newContent[0] = {
        ...newContent[0],
        props: { ...newContent[0].props, siteTitle: 'Rose' },
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
    examples.push({ site: site.public_url, rev: revId });
  }

  if (isApply) {
    await client.query(
      `UPDATE site_revision SET data = jsonb_set(data, '{pagesData}', $1::jsonb, false) WHERE id = $2`,
      [JSON.stringify(newPagesData), revId],
    );
  }
}

console.log(`Revisions touched: ${touchedRevisions}`);
console.log(`Pages touched: ${touchedPages}`);
console.log('Examples:', JSON.stringify(examples, null, 2));

if (isApply) console.log('✅ APPLIED');
else console.log('💡 Dry-run only. Re-run with --apply.');

await client.end();
