// Reseed home-страницы flux-сайта в канон packages/theme-flux/pages/home.json.
// Только pagesData.home (content+root+zones). Остальные страницы не трогаются.
// DRY по умолчанию; --apply для записи.
const { Client } = require('pg');
const fs = require('fs');

const mcp = JSON.parse(fs.readFileSync('/Users/alexey/projects/merfy/.mcp.json', 'utf8'));
let conn;
for (const v of Object.values(mcp.mcpServers || {})) {
  const all = [...(v.args || []), ...Object.values(v.env || {})];
  for (const a of all) if (typeof a === 'string' && a.includes('sites_service') && a.startsWith('postgres://')) conn = a;
}
const canon = JSON.parse(fs.readFileSync(__dirname + '/packages/theme-flux/pages/home.json', 'utf8'));
const SID = process.argv[3] || '10caf133-cb75-4bb9-875e-a429b201b8a7';
const APPLY = process.argv[2] === '--apply';

(async () => {
  const c = new Client({ connectionString: conn });
  await c.connect();
  const { rows } = await c.query('SELECT current_revision_id FROM site WHERE id=$1', [SID]);
  const rid = rows[0].current_revision_id;
  const { rows: rr } = await c.query('SELECT data FROM site_revision WHERE id=$1', [rid]);
  const data = rr[0].data;
  const before = (data.pagesData.home.content || []).map((b) => `${b.type}(${b.props?.id || '?'})`);
  const canonBlocks = (canon.content || []).map((b) => `${b.type}(${b.props?.id || b.props?.id === undefined ? 'NO-ID' : b.props.id})`);
  console.log('site:', SID, '| rev:', rid);
  console.log('home ДО :', before);
  console.log('канон   :', canonBlocks);
  // sanity: у блоков канона должен быть props.id (Puck требует)
  const missingId = (canon.content || []).filter((b) => !b.props || !b.props.id);
  if (missingId.length) { console.log('⚠️ В каноне блоки без props.id:', missingId.map((b) => b.type), '— Puck может сломаться'); }
  if (!APPLY) { console.log('\nDRY — не записано. Применить: node .tmp-reseed-flux-home.cjs --apply'); await c.end(); return; }
  // канон-блоки без props.id — генерируем стабильные id (Type-1), как ожидает Puck/рендер
  const counts = {};
  const withIds = (canon.content || []).map((b) => {
    const t = b.type; counts[t] = (counts[t] || 0) + 1;
    return { ...b, props: { ...(b.props || {}), id: `${t}-${counts[t]}` } };
  });
  data.pagesData.home = { content: withIds, root: canon.root || { props: {} }, zones: canon.zones || {} };
  await c.query('UPDATE site_revision SET data=$1 WHERE id=$2', [JSON.stringify(data), rid]);
  console.log('\n✅ home пересеян в канон');
  await c.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
