/**
 * v2: светлый сайт + pupa-палитры. Слоты по ролям rose (scheme-1 светлая, scheme-4 тёмная):
 *   1=белая 2=бежевая 3=голубая 4=чёрная 5=тёмная. id/name остаются scheme-1..5 (блоки ссылаются на id).
 *   cd backend/services/sites && node .tmp-migrate-schemes-v2.cjs   (DRY_RUN=1 — без записи)
 */
const fs = require('fs');
const { Client } = require('pg');

const ROOT = '/Users/alexey/projects/merfy';
const conn = JSON.parse(fs.readFileSync(ROOT + '/.mcp.json', 'utf8')).mcpServers['postgres-merfy'].args.find((a) => String(a).startsWith('postgres://'));
const REV = '73705d77-78ea-4491-997d-1eff4b19b122';
const DRY = process.env.DRY_RUN === '1';

const WHITE = { background: '#FFFFFF', surfaceBg: '#FBFBFB', heading: '#000000', text: '#000000',
  primaryButton:  { background: '#000000', backgroundHover: '#1A1A1A', text: '#FFFFFF', textHover: '#FFFFFF', border: '#000000' },
  secondaryButton:{ background: '#FFFFFF', backgroundHover: '#F5F5F5', text: '#000000', textHover: '#000000', border: '#000000' } };
const BEIGE = { background: '#F5F0EB', surfaceBg: '#EBE5DE', heading: '#1A1A1A', text: '#1A1A1A',
  primaryButton:  { background: '#000000', backgroundHover: '#1A1A1A', text: '#FFFFFF', textHover: '#FFFFFF', border: '#000000' },
  secondaryButton:{ background: '#F5F0EB', backgroundHover: '#EBE5DE', text: '#1A1A1A', textHover: '#1A1A1A', border: '#1A1A1A' } };
const BLUE = { background: '#71C0FF', surfaceBg: '#5AAFFF', heading: '#FFFFFF', text: '#FFFFFF',
  primaryButton:  { background: '#FFFFFF', backgroundHover: '#F5F5F5', text: '#71C0FF', textHover: '#5AAFFF', border: '#FFFFFF' },
  secondaryButton:{ background: '#E8F5FF', backgroundHover: '#D6ECFF', text: '#71C0FF', textHover: '#5AAFFF', border: '#E8F5FF' } };
const BLACK = { background: '#000000', surfaceBg: '#1A1A1A', heading: '#FFFFFF', text: '#FFFFFF',
  primaryButton:  { background: '#FFFFFF', backgroundHover: '#F5F5F5', text: '#000000', textHover: '#000000', border: '#FFFFFF' },
  secondaryButton:{ background: '#000000', backgroundHover: '#1A1A1A', text: '#FFFFFF', textHover: '#FFFFFF', border: '#FFFFFF' } };
const DARK = { background: '#1A1A1A', surfaceBg: '#2A2A2A', heading: '#FFFFFF', text: '#F5F0EB',
  primaryButton:  { background: '#F5F0EB', backgroundHover: '#EBE5DE', text: '#1A1A1A', textHover: '#1A1A1A', border: '#F5F0EB' },
  secondaryButton:{ background: '#1A1A1A', backgroundHover: '#2A2A2A', text: '#F5F0EB', textHover: '#F5F0EB', border: '#F5F0EB' } };

const SCHEMES = [
  { id: 'scheme-1', name: 'Схема 1', ...WHITE },
  { id: 'scheme-2', name: 'Схема 2', ...BEIGE },
  { id: 'scheme-3', name: 'Схема 3', ...BLUE },
  { id: 'scheme-4', name: 'Схема 4', ...BLACK },
  { id: 'scheme-5', name: 'Схема 5', ...DARK },
];

(async () => {
  const c = new Client({ connectionString: conn, ssl: false });
  await c.connect();
  const before = await c.query("SELECT data->'themeSettings'->'colorSchemes' AS cs FROM site_revision WHERE id=$1", [REV]);
  fs.writeFileSync(ROOT + '/backend/services/sites/.tmp-scheme-backup-v2-' + REV + '.json', JSON.stringify(before.rows[0]?.cs, null, 2));
  console.log('BACKUP v2 (текущее pupa-dark) сохранён');
  console.log('НОВЫЙ порядок фонов:', SCHEMES.map((s) => s.background).join(', '));
  if (DRY) { console.log('DRY_RUN — без записи'); await c.end(); return; }
  const res = await c.query("UPDATE site_revision SET data = jsonb_set(data, '{themeSettings,colorSchemes}', $1::jsonb, true) WHERE id=$2", [JSON.stringify(SCHEMES), REV]);
  console.log('UPDATED rows:', res.rowCount);
  const after = await c.query("SELECT s->>'id' AS id, s->>'background' AS bg FROM site_revision sr, jsonb_array_elements(sr.data->'themeSettings'->'colorSchemes') s WHERE sr.id=$1", [REV]);
  console.log('ПРОВЕРКА:'); after.rows.forEach((r) => console.log('  ', r.id, '|', r.bg));
  await c.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
