/**
 * v3: пишет v2-светлый расклад в ТЕКУЩУЮ ревизию сайта (current_revision_id — находит сам).
 * Расклад: 1=белая 2=бежевая 3=голубая 4=чёрная 5=тёмная. id остаются scheme-1..5.
 *   cd backend/services/sites && SITE=<id> node .tmp-migrate-schemes-v3.cjs
 */
const fs = require('fs');
const { Client } = require('pg');
const ROOT = '/Users/alexey/projects/merfy';
const conn = JSON.parse(fs.readFileSync(ROOT + '/.mcp.json', 'utf8')).mcpServers['postgres-merfy'].args.find((a) => String(a).startsWith('postgres://'));
const SITE = process.env.SITE || 'ef6e5979-c4ea-41d7-a70f-50d79af03ace';

const mk = (o) => o;
const WHITE = mk({ background: '#FFFFFF', surfaceBg: '#FBFBFB', heading: '#000000', text: '#000000',
  primaryButton:{ background:'#000000', backgroundHover:'#1A1A1A', text:'#FFFFFF', textHover:'#FFFFFF', border:'#000000' },
  secondaryButton:{ background:'#FFFFFF', backgroundHover:'#F5F5F5', text:'#000000', textHover:'#000000', border:'#000000' } });
const BEIGE = mk({ background: '#F5F0EB', surfaceBg: '#EBE5DE', heading: '#1A1A1A', text: '#1A1A1A',
  primaryButton:{ background:'#000000', backgroundHover:'#1A1A1A', text:'#FFFFFF', textHover:'#FFFFFF', border:'#000000' },
  secondaryButton:{ background:'#F5F0EB', backgroundHover:'#EBE5DE', text:'#1A1A1A', textHover:'#1A1A1A', border:'#1A1A1A' } });
const BLUE = mk({ background: '#71C0FF', surfaceBg: '#5AAFFF', heading: '#FFFFFF', text: '#FFFFFF',
  primaryButton:{ background:'#FFFFFF', backgroundHover:'#F5F5F5', text:'#71C0FF', textHover:'#5AAFFF', border:'#FFFFFF' },
  secondaryButton:{ background:'#E8F5FF', backgroundHover:'#D6ECFF', text:'#71C0FF', textHover:'#5AAFFF', border:'#E8F5FF' } });
const BLACK = mk({ background: '#000000', surfaceBg: '#1A1A1A', heading: '#FFFFFF', text: '#FFFFFF',
  primaryButton:{ background:'#FFFFFF', backgroundHover:'#F5F5F5', text:'#000000', textHover:'#000000', border:'#FFFFFF' },
  secondaryButton:{ background:'#000000', backgroundHover:'#1A1A1A', text:'#FFFFFF', textHover:'#FFFFFF', border:'#FFFFFF' } });
const DARK = mk({ background: '#1A1A1A', surfaceBg: '#2A2A2A', heading: '#FFFFFF', text: '#F5F0EB',
  primaryButton:{ background:'#F5F0EB', backgroundHover:'#EBE5DE', text:'#1A1A1A', textHover:'#1A1A1A', border:'#F5F0EB' },
  secondaryButton:{ background:'#1A1A1A', backgroundHover:'#2A2A2A', text:'#F5F0EB', textHover:'#F5F0EB', border:'#F5F0EB' } });
const SCHEMES = [
  { id:'scheme-1', name:'Схема 1', ...WHITE },
  { id:'scheme-2', name:'Схема 2', ...BEIGE },
  { id:'scheme-3', name:'Схема 3', ...BLUE },
  { id:'scheme-4', name:'Схема 4', ...BLACK },
  { id:'scheme-5', name:'Схема 5', ...DARK },
];

(async () => {
  const c = new Client({ connectionString: conn, ssl: false });
  await c.connect();
  const cur = await c.query('SELECT current_revision_id FROM site WHERE id=$1', [SITE]);
  const REV = cur.rows[0]?.current_revision_id;
  if (!REV) { console.error('no current_revision_id for', SITE); process.exit(1); }
  console.log('current_revision_id =', REV);
  const res = await c.query("UPDATE site_revision SET data = jsonb_set(data, '{themeSettings,colorSchemes}', $1::jsonb, true) WHERE id=$2", [JSON.stringify(SCHEMES), REV]);
  console.log('UPDATED rows:', res.rowCount);
  const after = await c.query("SELECT s->>'id' AS id, s->>'background' AS bg FROM site_revision sr, jsonb_array_elements(sr.data->'themeSettings'->'colorSchemes') s WHERE sr.id=$1", [REV]);
  console.log('ПРОВЕРКА текущей ревизии:'); after.rows.forEach((r) => console.log('  ', r.id, '|', r.bg));
  await c.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
