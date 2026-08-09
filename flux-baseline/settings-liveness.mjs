#!/usr/bin/env node
/**
 * Матрица «живости» настроек секций: rose против flux.
 *
 * Наборы полей у тем ОДИНАКОВЫ (общий puckConfig из theme-base), поэтому
 * разница только в одном: читает ли порт темы это поле. Настройка, которая
 * есть в панели, но не меняет разметку, — мёртвая: мерчант её крутит, а
 * ничего не происходит.
 *
 * Для каждого поля берём два РАЗНЫХ значения, рендерим блок и сравниваем
 * разметку. Реагирует у розы, но не у flux → пробел flux.
 *
 *   node flux-baseline/settings-liveness.mjs [siteId] [Блок ...]
 */
const SITE = process.argv[2] || '132d3a3e-a28f-40b7-98fa-a0200151cfb8';
const ONLY = process.argv.slice(3);
const API = 'http://localhost:3110/api';

const BLOCKS = ONLY.length
  ? ONLY
  : ['Hero', 'Collections', 'PopularProducts', 'Gallery', 'ImageWithText', 'Product'];

const json = async (u, init) => {
  const r = await fetch(u, init);
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  return r.json();
};

const renderBlock = async (blockType, themeId, props) => {
  const r = await fetch(`${API}/sites/${SITE}/preview/block`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blockType, themeId, props: { id: `${blockType}-probe`, ...props } }),
  });
  return r.ok ? r.text() : `ОШИБКА ${r.status}`;
};

/** Два различающихся значения для поля — по его типу. */
function probeValues(field) {
  const t = field?.type;
  if (t === 'select' || t === 'radio') {
    const o = (field.options || []).map((x) => x.value);
    return o.length >= 2 ? [o[0], o[1]] : null;
  }
  if (t === 'toggle') return ['true', 'false'];
  if (t === 'slider') {
    const min = field.min ?? 0;
    const max = field.max ?? 100;
    return min !== max ? [min, max] : null;
  }
  if (t === 'alignment') return ['left', 'right'];
  if (t === 'colorScheme') return ['scheme-1', 'scheme-2'];
  return null; // текст/картинки/массивы — не механические, пропускаем
}

/** Нормализуем шум: хеши, id, случайные суффиксы. */
const norm = (h) =>
  String(h)
    .replace(/astro-[a-z0-9]+/g, 'astro-X')
    .replace(/data-astro-[^\s">]+/g, '')
    .replace(/\s+/g, ' ');

const cfgs = {};
for (const t of ['rose', 'flux']) cfgs[t] = await json(`${API}/themes/${t}/puck-config`);

const rows = [];
for (const block of BLOCKS) {
  const fields = cfgs.flux.components?.[block]?.fields ?? {};
  for (const [name, field] of Object.entries(fields)) {
    if (field?.type === 'hidden') continue;
    const vals = probeValues(field);
    if (!vals) continue;
    const res = {};
    for (const theme of ['rose', 'flux']) {
      const [a, b] = await Promise.all([
        renderBlock(block, theme, { [name]: vals[0] }),
        renderBlock(block, theme, { [name]: vals[1] }),
      ]);
      res[theme] = norm(a) !== norm(b);
    }
    rows.push({ block, name, label: field.label || name, rose: res.rose, flux: res.flux });
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('секция', 17) + pad('настройка', 26) + pad('роза', 8) + pad('flux', 8) + 'вердикт');
console.log('-'.repeat(78));
const gaps = [];
for (const r of rows) {
  let verdict = '';
  if (r.rose && !r.flux) { verdict = '← ПРОБЕЛ flux'; gaps.push(r); }
  else if (!r.rose && !r.flux) verdict = 'мертва у обеих';
  else if (!r.rose && r.flux) verdict = 'живёт только у flux';
  else verdict = 'ок';
  console.log(
    pad(r.block, 17) + pad(r.label, 26) +
    pad(r.rose ? 'живая' : '—', 8) + pad(r.flux ? 'живая' : '—', 8) + verdict,
  );
}
console.log(`\nпроверено настроек: ${rows.length}`);
console.log(`пробелов flux (роза читает, flux нет): ${gaps.length}`);
if (gaps.length) {
  console.log('\nчинить:');
  for (const g of gaps) console.log(`  ${g.block}.${g.name} — «${g.label}»`);
}
