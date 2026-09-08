/**
 * Миграция вариантов на единое поле формы: у секций «Товар» убираем legacy
 * `shape`, оставляем `style` (Кнопка/Круг/Квадрат/Список). Конфликт shape→форма
 * уходит, «Кнопка» = кнопки. Бьём по current_revision_id сайта.
 *   cd backend/services/sites && SITE=<id> node .tmp-migrate-variants.cjs   (DRY_RUN=1)
 */
const fs = require('fs');
const { Client } = require('pg');
const ROOT = '/Users/alexey/projects/merfy';
const conn = JSON.parse(fs.readFileSync(ROOT + '/.mcp.json', 'utf8')).mcpServers['postgres-merfy'].args.find((a) => String(a).startsWith('postgres://'));
const SITE = process.env.SITE || 'ef6e5979-c4ea-41d7-a70f-50d79af03ace';
const DRY = process.env.DRY_RUN === '1';

(async () => {
  const c = new Client({ connectionString: conn, ssl: false });
  await c.connect();
  const cur = await c.query('SELECT current_revision_id FROM site WHERE id=$1', [SITE]);
  const REV = cur.rows[0]?.current_revision_id;
  if (!REV) { console.error('no current_revision_id'); process.exit(1); }
  const row = await c.query('SELECT data FROM site_revision WHERE id=$1', [REV]);
  const data = row.rows[0].data;
  let touched = 0;
  const validStyle = new Set(['button', 'circle', 'square', 'list']);
  for (const [pageId, pdata] of Object.entries(data.pagesData || {})) {
    for (const block of pdata.content || []) {
      if (block.type !== 'Product') continue;
      const v = block.props?.variants || {};
      // single-field value: оставляем style если он валиден, иначе button. shape убираем.
      const style = validStyle.has(v.style) ? v.style : 'button';
      const before = JSON.stringify(v);
      block.props.variants = { style };
      if (JSON.stringify(block.props.variants) !== before) {
        touched++;
        console.log(`  ${pageId} Product: ${before} → {"style":"${style}"}`);
      }
    }
  }
  console.log(`REV ${REV} | Product-секций изменено: ${touched}`);
  if (DRY) { console.log('DRY_RUN — без записи'); await c.end(); return; }
  await c.query('UPDATE site_revision SET data=$1 WHERE id=$2', [data, REV]);
  console.log('UPDATED');
  await c.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
