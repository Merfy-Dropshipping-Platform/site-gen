// 10caf133: очистить Header padding (→ дефолт py-6 эталона) + добавить PromoBanner-секцию сверху.
// DRY по умолчанию; --apply для записи.
const { Client } = require('pg');
const fs = require('fs');
const mcp = JSON.parse(fs.readFileSync('/Users/alexey/projects/merfy/.mcp.json', 'utf8'));
let conn;
for (const v of Object.values(mcp.mcpServers || {})) {
  const all = [...(v.args || []), ...Object.values(v.env || {})];
  for (const a of all) if (typeof a === 'string' && a.includes('sites_service') && a.startsWith('postgres://')) conn = a;
}
const SID = '10caf133-cb75-4bb9-875e-a429b201b8a7';
const APPLY = process.argv[2] === '--apply';

(async () => {
  const c = new Client({ connectionString: conn });
  await c.connect();
  const { rows } = await c.query('SELECT current_revision_id FROM site WHERE id=$1', [SID]);
  const rid = rows[0].current_revision_id;
  const { rows: rr } = await c.query('SELECT data FROM site_revision WHERE id=$1', [rid]);
  const data = rr[0].data;
  const home = data.pagesData.home;
  const before = home.content.map((b) => b.type);
  // 1) очистить Header padding (→ py-6 дефолт)
  let padCleared = false;
  for (const b of home.content) {
    if (b.type === 'Header' && b.props && b.props.padding) { delete b.props.padding; padCleared = true; }
  }
  // 2) добавить PromoBanner сверху, если нет
  let promoAdded = false;
  if (!home.content.some((b) => b.type === 'PromoBanner')) {
    home.content.unshift({ type: 'PromoBanner', props: { id: 'PromoBanner-1' } });
    promoAdded = true;
  }
  console.log('rev:', rid);
  console.log('ДО :', before);
  console.log('padding очищен у Header:', padCleared, '| PromoBanner добавлен:', promoAdded);
  console.log('ПОСЛЕ:', home.content.map((b) => b.type));
  if (!APPLY) { console.log('\nDRY — не записано. Применить: node .tmp-fix-header-data.cjs --apply'); await c.end(); return; }
  await c.query('UPDATE site_revision SET data=$1 WHERE id=$2', [JSON.stringify(data), rid]);
  console.log('\n✅ применено');
  await c.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
