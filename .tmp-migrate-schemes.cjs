/**
 * Миграция цветовых схем → pupa-палитры для одного сайта (ef6e5979).
 * Бэкап старого значения в файл → overwrite revision.data.themeSettings.colorSchemes.
 *   cd backend/services/sites && node .tmp-migrate-schemes.cjs
 * DRY_RUN=1 — только показать, без записи.
 */
const fs = require('fs');
const { Client } = require('pg');

const ROOT = '/Users/alexey/projects/merfy';
const mcp = JSON.parse(fs.readFileSync(ROOT + '/.mcp.json', 'utf8'));
const conn = mcp.mcpServers['postgres-merfy'].args.find((a) => String(a).startsWith('postgres://'));
if (!conn) { console.error('no postgres-merfy conn in .mcp.json'); process.exit(1); }

const REV = '73705d77-78ea-4491-997d-1eff4b19b122';
const DRY = process.env.DRY_RUN === '1';

// pupa defaultColorSchemes (из ThemeContext, ветка pupa == main, значения идентичны)
const PUPA = [
  { id: 'scheme-1', name: 'Схема 1', background: '#000000', surfaceBg: '#1A1A1A', heading: '#FFFFFF', text: '#FFFFFF',
    primaryButton:  { background: '#FFFFFF', backgroundHover: '#F5F5F5', text: '#000000', textHover: '#000000', border: '#FFFFFF' },
    secondaryButton:{ background: '#000000', backgroundHover: '#1A1A1A', text: '#FFFFFF', textHover: '#FFFFFF', border: '#FFFFFF' } },
  { id: 'scheme-2', name: 'Схема 2', background: '#FFFFFF', surfaceBg: '#FBFBFB', heading: '#000000', text: '#000000',
    primaryButton:  { background: '#000000', backgroundHover: '#1A1A1A', text: '#FFFFFF', textHover: '#FFFFFF', border: '#000000' },
    secondaryButton:{ background: '#FFFFFF', backgroundHover: '#F5F5F5', text: '#000000', textHover: '#000000', border: '#000000' } },
  { id: 'scheme-3', name: 'Схема 3', background: '#71C0FF', surfaceBg: '#5AAFFF', heading: '#FFFFFF', text: '#FFFFFF',
    primaryButton:  { background: '#FFFFFF', backgroundHover: '#F5F5F5', text: '#71C0FF', textHover: '#5AAFFF', border: '#FFFFFF' },
    secondaryButton:{ background: '#E8F5FF', backgroundHover: '#D6ECFF', text: '#71C0FF', textHover: '#5AAFFF', border: '#E8F5FF' } },
  { id: 'scheme-4', name: 'Схема 4', background: '#F5F0EB', surfaceBg: '#EBE5DE', heading: '#1A1A1A', text: '#1A1A1A',
    primaryButton:  { background: '#000000', backgroundHover: '#1A1A1A', text: '#FFFFFF', textHover: '#FFFFFF', border: '#000000' },
    secondaryButton:{ background: '#F5F0EB', backgroundHover: '#EBE5DE', text: '#1A1A1A', textHover: '#1A1A1A', border: '#1A1A1A' } },
  { id: 'scheme-5', name: 'Схема 5', background: '#1A1A1A', surfaceBg: '#2A2A2A', heading: '#FFFFFF', text: '#F5F0EB',
    primaryButton:  { background: '#F5F0EB', backgroundHover: '#EBE5DE', text: '#1A1A1A', textHover: '#1A1A1A', border: '#F5F0EB' },
    secondaryButton:{ background: '#1A1A1A', backgroundHover: '#2A2A2A', text: '#F5F0EB', textHover: '#F5F0EB', border: '#F5F0EB' } },
];

(async () => {
  const c = new Client({ connectionString: conn, ssl: false });
  await c.connect();

  const before = await c.query(
    "SELECT data->'themeSettings'->'colorSchemes' AS cs FROM site_revision WHERE id=$1", [REV]);
  if (!before.rows.length) { console.error('revision not found:', REV); process.exit(1); }
  const oldCs = before.rows[0].cs;
  const backupPath = ROOT + '/backend/services/sites/.tmp-scheme-backup-' + REV + '.json';
  fs.writeFileSync(backupPath, JSON.stringify(oldCs, null, 2));
  console.log('BACKUP →', backupPath);
  console.log('СТАРЫЕ фоны:', (oldCs || []).map((s) => s.background).join(', '));
  console.log('НОВЫЕ фоны:', PUPA.map((s) => s.background).join(', '));

  if (DRY) { console.log('DRY_RUN — записи нет'); await c.end(); return; }

  const res = await c.query(
    "UPDATE site_revision SET data = jsonb_set(data, '{themeSettings,colorSchemes}', $1::jsonb, true) WHERE id=$2",
    [JSON.stringify(PUPA), REV]);
  console.log('UPDATED rows:', res.rowCount);

  const after = await c.query(
    "SELECT s->>'id' AS id, s->>'name' AS name, s->>'background' AS bg FROM site_revision sr, jsonb_array_elements(sr.data->'themeSettings'->'colorSchemes') s WHERE sr.id=$1", [REV]);
  console.log('ПРОВЕРКА (новые схемы в БД):');
  after.rows.forEach((r) => console.log('  ', r.id, '|', r.name, '|', r.bg));

  await c.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
