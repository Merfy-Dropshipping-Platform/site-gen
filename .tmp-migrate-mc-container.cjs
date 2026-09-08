/**
 * Миграция: MultiColumns props.containerEnabled 'true' → 'false' в ТЕКУЩИХ
 * ревизиях (canon: дефолт «Фон» выкл; тоггл раньше был сломан → бокс не
 * показывался, так что 'true' = старый дефолт, не интент пользователя).
 * Бэкап полного data каждой ревизии в файл. Меняет ТОЛЬКО containerEnabled
 * у блоков type=MultiColumns со значением 'true'.
 *   cd backend/services/sites && DRY_RUN=1 node .tmp-migrate-mc-container.cjs
 *   cd backend/services/sites && node .tmp-migrate-mc-container.cjs   (запись)
 */
const fs = require('fs');
const { Client } = require('pg');
const ROOT = '/Users/alexey/projects/merfy';
const mcp = JSON.parse(fs.readFileSync(ROOT + '/.mcp.json', 'utf8'));
const conn = mcp.mcpServers['postgres-merfy'].args.find((a) => String(a).startsWith('postgres://'));
if (!conn) { console.error('no postgres-merfy conn'); process.exit(1); }
const DRY = process.env.DRY_RUN === '1';

(async () => {
  const c = new Client({ connectionString: conn, ssl: false });
  await c.connect();

  const rows = (await c.query(`
    SELECT DISTINCT s.id AS site_id, sr.id AS rev_id
    FROM site s JOIN site_revision sr ON sr.id = s.current_revision_id,
         jsonb_each(sr.data->'pagesData') pd,
         jsonb_array_elements(pd.value->'content') b
    WHERE b->>'type' = 'MultiColumns' AND b->'props'->>'containerEnabled' = 'true'
  `)).rows;
  console.log(`Текущих ревизий к миграции: ${rows.length} (DRY=${DRY})`);

  const backup = {};
  let totalBlocks = 0;
  for (const { site_id, rev_id } of rows) {
    const { rows: [r] } = await c.query('SELECT data FROM site_revision WHERE id=$1', [rev_id]);
    const data = r.data;
    backup[rev_id] = { site_id, data }; // полный снимок ДО
    let changed = 0;
    const pd = (data && data.pagesData) || {};
    for (const pageId of Object.keys(pd)) {
      const content = pd[pageId] && pd[pageId].content;
      if (!Array.isArray(content)) continue;
      for (const blk of content) {
        if (blk && blk.type === 'MultiColumns' && blk.props && blk.props.containerEnabled === 'true') {
          blk.props.containerEnabled = 'false';
          changed++;
        }
      }
    }
    totalBlocks += changed;
    console.log(`  site ${site_id} rev ${rev_id}: ${changed} блок(ов) 'true'→'false'`);
    if (!DRY && changed > 0) {
      await c.query('UPDATE site_revision SET data=$1::jsonb WHERE id=$2', [JSON.stringify(data), rev_id]);
    }
  }

  const bpath = ROOT + '/backend/services/sites/.tmp-mc-container-backup.json';
  fs.writeFileSync(bpath, JSON.stringify(backup, null, 2));
  console.log(`Бэкап (полный data ДО) → ${bpath}`);
  console.log(`ИТОГО блоков: ${totalBlocks} | запись: ${!DRY}`);
  await c.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
