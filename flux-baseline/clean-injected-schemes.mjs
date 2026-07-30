#!/usr/bin/env node
/**
 * Разовая чистка ревизий, в которые конструктор записал СВОИ hardcode-схемы.
 *
 * До фикса `ThemeContext.tsx` конструктор при открытии сайта подставлял 5
 * зашитых схем и автосейвом закреплял их в ревизии как «мерчантские».
 * С этого момента они побеждали палитру `theme.json`, и тема переставала
 * управлять цветами сайта.
 *
 * Чистим ТОЛЬКО точное совпадение всех пяти схем (id + background + heading +
 * text) с hardcode-набором. Любая правка мерчанта хотя бы в одном цвете —
 * ревизию не трогаем.
 *
 *   node flux-baseline/clean-injected-schemes.mjs            # сухой прогон
 *   node flux-baseline/clean-injected-schemes.mjs --apply    # записать
 *
 * Цель БД — переменная DATABASE_URL (по умолчанию локальная).
 */
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const DSN =
  process.env.DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/sites_service';

/** Отпечаток hardcode-набора конструктора (ThemeContext.tsx defaultColorSchemes). */
const FINGERPRINT = [
  ['scheme-1', '#000000', '#FFFFFF', '#FFFFFF'],
  ['scheme-2', '#FFFFFF', '#000000', '#000000'],
  ['scheme-3', '#71C0FF', '#FFFFFF', '#FFFFFF'],
  ['scheme-4', '#F5F0EB', '#1A1A1A', '#1A1A1A'],
  ['scheme-5', '#1A1A1A', '#FFFFFF', '#F5F0EB'],
];

const norm = (v) => String(v ?? '').trim().toUpperCase();

function isInjectedSet(schemes) {
  if (!Array.isArray(schemes) || schemes.length !== FINGERPRINT.length) return false;
  return FINGERPRINT.every(([id, bg, heading, text], i) => {
    const s = schemes[i];
    if (!s || typeof s !== 'object') return false;
    return (
      norm(s.id) === norm(id) &&
      norm(s.background) === norm(bg) &&
      norm(s.heading) === norm(heading) &&
      norm(s.text) === norm(text)
    );
  });
}

const client = new pg.Client({ connectionString: DSN });
await client.connect();

const host = new URL(DSN.replace(/^postgres(ql)?:/, 'http:')).host;
console.log(`БД: ${host}   режим: ${APPLY ? 'ЗАПИСЬ' : 'сухой прогон'}\n`);

const { rows } = await client.query(`
  SELECT r.id,
         r.site_id,
         s.name  AS site_name,
         s.theme_id,
         (s.current_revision_id = r.id) AS is_current,
         r.created_at,
         r.data::jsonb -> 'themeSettings' -> 'colorSchemes' AS schemes
  FROM site_revision r
  LEFT JOIN site s ON s.id = r.site_id
  WHERE jsonb_array_length(
          COALESCE(r.data::jsonb -> 'themeSettings' -> 'colorSchemes', '[]'::jsonb)
        ) = $1
  ORDER BY r.created_at DESC
`, [FINGERPRINT.length]);

const injected = rows.filter((r) => isInjectedSet(r.schemes));
const foreign = rows.filter((r) => !isInjectedSet(r.schemes));

console.log(`ревизий с ${FINGERPRINT.length} схемами: ${rows.length}`);
console.log(`  из них hardcode-набор конструктора: ${injected.length}`);
console.log(`  правленные мерчантом (НЕ трогаем):  ${foreign.length}\n`);

if (injected.length) {
  const bySite = new Map();
  for (const r of injected) {
    if (!bySite.has(r.site_id)) bySite.set(r.site_id, []);
    bySite.get(r.site_id).push(r);
  }
  console.log('затронутые сайты:');
  for (const [siteId, revs] of bySite) {
    const cur = revs.filter((r) => r.is_current).length;
    console.log(
      `  ${String(siteId).slice(0, 8)}  «${revs[0].site_name ?? '—'}»  тема=${revs[0].theme_id ?? '—'}  ` +
        `ревизий=${revs.length}${cur ? '  ← среди них ТЕКУЩАЯ' : ''}`,
    );
  }
  console.log();
}

if (!APPLY) {
  console.log('Ничего не записано. Для применения — повторить с --apply.');
  await client.end();
  process.exit(0);
}

let done = 0;
for (const r of injected) {
  await client.query(
    `UPDATE site_revision
        SET data = jsonb_set(data::jsonb, '{themeSettings,colorSchemes}', '[]'::jsonb)::json
      WHERE id = $1`,
    [r.id],
  );
  done++;
}
console.log(`очищено ревизий: ${done}`);

// Контроль: пересчитать
const { rows: after } = await client.query(`
  SELECT COUNT(*)::int AS n FROM site_revision
   WHERE jsonb_array_length(
           COALESCE(data::jsonb -> 'themeSettings' -> 'colorSchemes', '[]'::jsonb)
         ) = $1
`, [FINGERPRINT.length]);
console.log(`осталось ревизий с ${FINGERPRINT.length} схемами: ${after[0].n} (должны быть только мерчантские: ${foreign.length})`);

await client.end();
