// Точечная очистка битого /main-image.png из ревизии flux-сайта → порт покажет плейсхолдер.
// DRY по умолчанию; --apply для записи. Чистит ТОЛЬКО строки с /main-image.png → "".
const { Client } = require('pg');
const fs = require('fs');

const mcp = JSON.parse(fs.readFileSync('/Users/alexey/projects/merfy/.mcp.json', 'utf8'));
let conn;
for (const v of Object.values(mcp.mcpServers || {})) {
  const all = [...(v.args || []), ...Object.values(v.env || {})];
  for (const a of all) if (typeof a === 'string' && a.includes('sites_service') && a.startsWith('postgres://')) conn = a;
}
if (!conn) { console.error('нет sites_service connection'); process.exit(1); }

const SID = process.argv[3] || '10caf133-cb75-4bb9-875e-a429b201b8a7';
const APPLY = process.argv[2] === '--apply';

function clean(obj, stats) {
  if (Array.isArray(obj)) return obj.map((x) => clean(x, stats));
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(obj)) {
      if (typeof val === 'string' && val.includes('/main-image.png')) {
        stats.count++; stats.fields.push(k + '=' + val.slice(-30));
        out[k] = '';
      } else out[k] = clean(val, stats);
    }
    return out;
  }
  return obj;
}

(async () => {
  const c = new Client({ connectionString: conn });
  await c.connect();
  const { rows } = await c.query('SELECT current_revision_id FROM site WHERE id=$1', [SID]);
  if (!rows[0]) { console.error('сайт не найден'); process.exit(1); }
  const rid = rows[0].current_revision_id;
  const { rows: rr } = await c.query('SELECT data FROM site_revision WHERE id=$1', [rid]);
  const data = rr[0].data;
  const stats = { count: 0, fields: [] };
  const cleaned = clean(data, stats);
  console.log('site:', SID, '| current_revision:', rid);
  console.log('/main-image.png найдено:', stats.count);
  stats.fields.forEach((f) => console.log('   ', f));
  if (!APPLY) { console.log('\nDRY — ничего не записано. Для применения: node .tmp-fix-flux-hero.cjs --apply'); await c.end(); return; }
  await c.query('UPDATE site_revision SET data=$1 WHERE id=$2', [JSON.stringify(cleaned), rid]);
  console.log('\n✅ UPDATE применён к ревизии', rid, '(очищено', stats.count, 'ссылок)');
  await c.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
