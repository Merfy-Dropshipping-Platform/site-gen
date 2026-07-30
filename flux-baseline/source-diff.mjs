#!/usr/bin/env node
/**
 * Фаза 0 — сверка исходников порта против эталона верстальщиков.
 *
 * Эталон (репо flux-theme @ pinned SHA) и живой flux.merfy.ru совпадают,
 * поэтому сверка на уровне исходника точнее пиксельной: она показывает
 * КОНКРЕТНОЕ разошедшееся значение, а не «здесь другой цвет».
 *
 * Извлекает из .astro литеральные дизайн-значения (шрифты, размеры, высоты,
 * цвета, радиусы, gap, сетки, aspect) и сравнивает наборы.
 *
 *   REF_ROOT=/path/to/flux-theme node flux-baseline/source-diff.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT_ROOT = path.resolve(__dirname, '..');
const REF_ROOT = process.env.REF_ROOT;

if (!REF_ROOT || !fs.existsSync(REF_ROOT)) {
  console.error('нужен REF_ROOT=<путь к клону flux-theme>');
  process.exit(2);
}

/** Соответствие блок → (файл эталона, файл порта). */
const MAP = [
  ['Header+PromoBanner', 'src/components/Header.astro', 'themes/flux/src/components/Header.astro'],
  ['Hero', 'src/components/sections/Hero.astro', 'themes/flux/src/components/sections/Hero.astro'],
  ['Collections', 'src/components/sections/Collections.astro', 'themes/flux/src/components/sections/Collections.astro'],
  ['Product (FeaturedProduct)', 'src/components/sections/FeaturedProduct.astro', 'themes/flux/src/components/sections/FeaturedProduct.astro'],
  ['PopularProducts', 'src/components/sections/Popular.astro', 'themes/flux/src/components/sections/Popular.astro'],
  ['ImageWithText (Puk)', 'src/components/sections/Puk.astro', 'themes/flux/src/components/sections/Puk.astro'],
  ['Gallery', 'src/components/sections/Gallery.astro', 'themes/flux/src/components/sections/Gallery.astro'],
  ['Footer', 'src/components/Footer.astro', 'themes/flux/src/components/Footer.astro'],
  ['ProductCard', 'src/components/ProductCard.astro', 'themes/flux/src/components/products/FluxProductCard.astro'],
  ['CollectionCard', 'src/components/CollectionCard.astro', 'themes/flux/src/components/CollectionCard.astro'],
  ['SectionHeader', 'src/components/SectionHeader.astro', 'themes/flux/src/components/SectionHeader.astro'],
];

/** Категории дизайн-значений, которые сравниваем. */
const PATTERNS = {
  'шрифт': /\bfont-(roboto-flex|manrope|comfortaa|inter|sans|serif)\b/g,
  'начертание': /\bfont-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/g,
  'размер текста': /\btext-\[(\d+(?:\.\d+)?px)\]/g,
  'высота': /\bh-\[(\d+(?:\.\d+)?px)\]|\bh-(\d{1,2})\b/g,
  'мин-высота': /\bmin-h-\[([^\]]+)\]/g,
  'цвет литеральный': /\b(?:bg|text|border|from|to|via)-\[(#[0-9a-fA-F]{3,8}|rgb\([^\]]+\))\]/g,
  'радиус': /\brounded-\[([^\]]+)\]|\brounded-(none|sm|md|lg|xl|2xl|3xl|full)\b/g,
  'gap': /\bgap-\[([^\]]+)\]|\bgap-(\d{1,2})\b/g,
  'сетка': /\bgrid-cols-\[([^\]]+)\]|\bgrid-cols-(\d{1,2})\b/g,
  'пропорция': /\baspect-\[([^\]]+)\]|\baspect-(square|video|auto)\b/g,
  'отступ x': /\bpx-\[([^\]]+)\]|\bpx-(\d{1,2})\b/g,
  'отступ y': /\bpy-\[([^\]]+)\]|\bpy-(\d{1,2})\b/g,
  'непрозрачность фона': /\bbg-(?:black|white)\/(\d{1,3})\b/g,
  'uppercase': /\b(uppercase|lowercase|capitalize|normal-case)\b/g,
};

/** Убирает комментарии — иначе процитированные в комментах классы засчитываются. */
function stripComments(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
}

function extract(src) {
  const clean = stripComments(src);
  const out = {};
  for (const [cat, re] of Object.entries(PATTERNS)) {
    const set = new Map();
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(clean)) !== null) {
      const v = m[1] ?? m[2] ?? m[0];
      set.set(v, (set.get(v) || 0) + 1);
    }
    out[cat] = set;
  }
  return out;
}

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);

const lines = [];
const w = (s = '') => lines.push(s);

w('# Фаза 0 — сверка исходников: порт против эталона верстальщиков');
w('');
w(`- Эталон: \`${REF_ROOT}\` (flux-theme @ e29b7092 = HEAD репо = то, что раздаёт flux.merfy.ru)`);
w(`- Порт: \`${PORT_ROOT}\``);
w('- Комментарии из обоих исходников вырезаны — цитаты в комментах не засчитываются.');
w('');

const summary = [];

for (const [block, refRel, portRel] of MAP) {
  const refSrc = read(path.join(REF_ROOT, refRel));
  const portSrc = read(path.join(PORT_ROOT, portRel));

  if (!refSrc) {
    summary.push({ block, status: 'нет эталона', diffs: 0 });
    w(`## ${block}`);
    w('');
    w(`⚠️ Файл эталона отсутствует: \`${refRel}\` — блок является Merfy-добавлением, сверять не с чем.`);
    w('');
    continue;
  }
  if (!portSrc) {
    summary.push({ block, status: 'НЕТ ПОРТА', diffs: 0 });
    w(`## ${block}`);
    w('');
    w(`❌ Файл порта отсутствует: \`${portRel}\``);
    w('');
    continue;
  }

  const r = extract(refSrc);
  const p = extract(portSrc);

  const rows = [];
  for (const cat of Object.keys(PATTERNS)) {
    const rv = r[cat];
    const pv = p[cat];
    const missing = [...rv.keys()].filter((k) => !pv.has(k));
    const extra = [...pv.keys()].filter((k) => !rv.has(k));
    if (!missing.length && !extra.length) continue;
    rows.push({ cat, missing, extra });
  }

  summary.push({ block, status: rows.length ? 'расходится' : 'совпадает', diffs: rows.length });

  w(`## ${block}`);
  w('');
  w(`- эталон: \`${refRel}\` (${refSrc.split('\n').length} строк)`);
  w(`- порт: \`${portRel}\` (${portSrc.split('\n').length} строк)`);
  w('');
  if (!rows.length) {
    w('✅ Литеральные дизайн-значения совпадают.');
    w('');
    continue;
  }
  w('| категория | есть в эталоне, НЕТ в порте | есть в порте, НЕТ в эталоне |');
  w('|---|---|---|');
  for (const { cat, missing, extra } of rows) {
    w(
      `| ${cat} | ${missing.length ? missing.map((v) => `\`${v}\``).join(', ') : '—'} | ` +
        `${extra.length ? extra.map((v) => `\`${v}\``).join(', ') : '—'} |`,
    );
  }
  w('');
}

w('## Сводка');
w('');
w('| блок | статус | категорий с расхождением |');
w('|---|---|---:|');
summary.forEach((s) => w(`| ${s.block} | ${s.status} | ${s.diffs || '—'} |`));
w('');

console.log(lines.join('\n'));
