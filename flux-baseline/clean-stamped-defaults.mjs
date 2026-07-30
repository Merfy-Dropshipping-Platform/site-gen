#!/usr/bin/env node
/**
 * Разовая чистка ревизий, в которые конструктор наштамповал СВОИ дефолты.
 *
 * До фикса `ConstructorContext` при создании ревизии писал `themeSettings`
 * целиком — весь `defaultTheme` конструктора. Эти значения (headingFont,
 * containerMaxWidth, buttonRadius, heroHeadingSize, productCardStyle …) с
 * первой секунды жизни сайта считались «выбором мерчанта» и перебивали
 * `theme.json`. Тема переставала управлять собственным видом.
 *
 * Удаляем ТОЛЬКО ключи, значение которых буквально равно дефолту конструктора,
 * то есть заведомо не выбор мерчанта. Всё, что отличается, остаётся нетронутым.
 * `templateId` и `colorSchemes` сохраняются всегда.
 *
 *   node flux-baseline/clean-stamped-defaults.mjs            # сухой прогон
 *   node flux-baseline/clean-stamped-defaults.mjs --apply
 *
 * Цель БД — DATABASE_URL.
 */
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const DSN = process.env.DATABASE_URL;
if (!DSN) {
  console.error('нужен DATABASE_URL');
  process.exit(2);
}

const THEME_CTX =
  process.env.THEME_CONTEXT_PATH ||
  path.resolve(
    process.cwd(),
    '..', '..', 'constructor', 'src', 'contexts', 'ThemeContext.tsx',
  );

/** Достаём литерал `defaultTheme` из исходника конструктора. */
function readConstructorDefaults() {
  const src = fs.readFileSync(THEME_CTX, 'utf-8');
  const start = src.indexOf('export const defaultTheme');
  if (start < 0) throw new Error('defaultTheme не найден в ' + THEME_CTX);
  const open = src.indexOf('{', start);
  let depth = 0, end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = src.slice(open + 1, end);

  const out = {};
  // Только простые скаляры: строка / число / true|false|null.
  const re = /^\s*([A-Za-z_$][\w$]*)\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|-?\d+(?:\.\d+)?|true|false|null)\s*,/gm;
  let m;
  while ((m = re.exec(body)) !== null) {
    const [, key, raw] = m;
    let v;
    if (raw === 'true') v = true;
    else if (raw === 'false') v = false;
    else if (raw === 'null') v = null;
    else if (/^-?\d/.test(raw)) v = Number(raw);
    else v = raw.slice(1, -1);
    out[key] = v;
  }
  return out;
}

const DEFAULTS = readConstructorDefaults();
const KEEP = new Set(['templateId', 'colorSchemes']);
const strippable = Object.keys(DEFAULTS).filter((k) => !KEEP.has(k));

console.log(`дефолтов конструктора распознано: ${Object.keys(DEFAULTS).length}`);
console.log(`кандидатов на удаление: ${strippable.length}`);
console.log(`режим: ${APPLY ? 'ЗАПИСЬ' : 'сухой прогон'}\n`);

const client = new pg.Client({ connectionString: DSN });
await client.connect();

const { rows } = await client.query(`
  SELECT r.id, r.site_id, s.name AS site_name, s.theme_id,
         (s.current_revision_id = r.id) AS is_current,
         r.data::jsonb -> 'themeSettings' AS ts
  FROM site_revision r
  LEFT JOIN site s ON s.id = r.site_id
  WHERE r.data::jsonb -> 'themeSettings' IS NOT NULL
  ORDER BY r.created_at DESC
`);

const plan = [];
for (const r of rows) {
  const ts = r.ts;
  if (!ts || typeof ts !== 'object') continue;
  const drop = strippable.filter(
    (k) => k in ts && JSON.stringify(ts[k]) === JSON.stringify(DEFAULTS[k]),
  );
  const kept = strippable.filter(
    (k) => k in ts && JSON.stringify(ts[k]) !== JSON.stringify(DEFAULTS[k]),
  );
  if (drop.length) plan.push({ ...r, drop, kept });
}

console.log(`ревизий с themeSettings: ${rows.length}`);
console.log(`из них со штампом дефолтов: ${plan.length}\n`);

if (plan.length) {
  const bySite = new Map();
  for (const p of plan) {
    if (!bySite.has(p.site_id)) bySite.set(p.site_id, []);
    bySite.get(p.site_id).push(p);
  }
  for (const [siteId, revs] of bySite) {
    const cur = revs.find((r) => r.is_current);
    console.log(
      `  ${String(siteId).slice(0, 8)} «${revs[0].site_name ?? '—'}» тема=${revs[0].theme_id ?? '—'} ревизий=${revs.length}`,
    );
    if (cur) {
      console.log(`     текущая: удалим ${cur.drop.length} ключ(ей): ${cur.drop.slice(0, 10).join(', ')}${cur.drop.length > 10 ? ' …' : ''}`);
      if (cur.kept.length)
        console.log(`     оставим (мерчант менял): ${cur.kept.join(', ')}`);
    }
  }
  console.log();
}

if (!APPLY) {
  console.log('Ничего не записано. Повторить с --apply.');
  await client.end();
  process.exit(0);
}

let n = 0;
for (const p of plan) {
  await client.query(
    `UPDATE site_revision
        SET data = jsonb_set(
              data::jsonb, '{themeSettings}',
              (data::jsonb -> 'themeSettings') - $2::text[]
            )::json
      WHERE id = $1`,
    [p.id, p.drop],
  );
  n++;
}
console.log(`очищено ревизий: ${n}`);
await client.end();
