#!/usr/bin/env node
/**
 * Фаза 0 — сводка по снятой базовой линии.
 * Читает flux-baseline/<label>/home.<vp>.json и печатает markdown-отчёт.
 *
 *   node flux-baseline/report.mjs reference [> flux-baseline/BASELINE.md]
 *   node flux-baseline/report.mjs reference local   # сравнение двух наборов
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VPS = ['375', '768', '1280', '1920'];

const load = (label, vp) => {
  const p = path.join(__dirname, label, `home.${vp}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
};

const labels = process.argv.slice(2);
if (!labels.length) {
  console.error('использование: report.mjs <label> [<label2>]');
  process.exit(2);
}
const [A, B] = labels;

const sets = Object.fromEntries(VPS.map((vp) => [vp, load(A, vp)]).filter(([, v]) => v));
const first = Object.values(sets)[0];
if (!first) {
  console.error(`нет данных для набора "${A}"`);
  process.exit(1);
}

const out = [];
const w = (s = '') => out.push(s);

w(`# Базовая линия Flux — набор \`${A}\``);
w('');
w(`- URL: ${first.url}`);
w(`- Условия съёмки: ${Object.entries(first.captureEnv).map(([k, v]) => `${k}=${v}`).join(', ')}`);
w('');

// ── Gate 0 ─────────────────────────────────────────────────────────
w('## Gate 0 — воспроизводимость');
w('');
w('| viewport | высота документа | sha256 скриншота | 2-й прогон совпал | h-overflow | console errors | 4xx/5xx |');
w('|---|---:|---|---|---|---:|---:|');
for (const vp of VPS) {
  const d = sets[vp];
  if (!d) continue;
  w(
    `| ${vp} | ${d.documentHeight} | \`${d.screenshotSha256.slice(0, 16)}\` | ` +
      `${d.reproducible === null ? '—' : d.reproducible ? '✓' : '✗'} | ` +
      `${d.overflow.hasHorizontalOverflow ? '⚠️ ДА' : 'нет'} | ` +
      `${d.consoleErrors.length} | ${d.failedRequests.length} |`,
  );
}
w('');

// ── Геометрия секций ───────────────────────────────────────────────
w('## Геометрия секций (y / высота, px)');
w('');
const keys = first.sections.map((s) => s.key);
w(`| # | секция | ${VPS.filter((v) => sets[v]).map((v) => `${v}: y`).join(' | ')} | ${VPS.filter((v) => sets[v]).map((v) => `${v}: h`).join(' | ')} |`);
w(`|---|---|${VPS.filter((v) => sets[v]).map(() => '---:').join('|')}|${VPS.filter((v) => sets[v]).map(() => '---:').join('|')}|`);
keys.forEach((key, i) => {
  const ys = [];
  const hs = [];
  for (const vp of VPS) {
    if (!sets[vp]) continue;
    const s = sets[vp].sections[i];
    ys.push(s ? Math.round(s.box.y) : '—');
    hs.push(s ? Math.round(s.box.h) : '—');
  }
  w(`| ${i} | ${key} | ${ys.join(' | ')} | ${hs.join(' | ')} |`);
});
w('');

// ── Ширины контента ────────────────────────────────────────────────
w('## Ширина контента секции (x .. x+w)');
w('');
w(`| секция | ${VPS.filter((v) => sets[v]).map((v) => v).join(' | ')} |`);
w(`|---|${VPS.filter((v) => sets[v]).map(() => '---').join('|')}|`);
keys.forEach((key, i) => {
  const cells = [];
  for (const vp of VPS) {
    if (!sets[vp]) continue;
    const s = sets[vp].sections[i];
    cells.push(s ? `${Math.round(s.box.x)}..${Math.round(s.box.x + s.box.w)}` : '—');
  }
  w(`| ${key} | ${cells.join(' | ')} |`);
});
w('');

// ── Типографика заголовков ─────────────────────────────────────────
w('## Типографика заголовков секций');
w('');
w('| секция | текст | 375 | 768 | 1280 | 1920 | family | weight | transform | letter-spacing |');
w('|---|---|---|---|---|---|---|---|---|---|');
keys.forEach((key, i) => {
  const ref = sets['1280']?.sections[i];
  const h = ref?.headings?.[0];
  if (!h) return;
  const sizes = VPS.map((vp) => {
    const hh = sets[vp]?.sections[i]?.headings?.[0];
    return hh ? hh.style.fontSize : '—';
  });
  w(
    `| ${key} | ${h.text.slice(0, 40)} | ${sizes.join(' | ')} | ` +
      `${h.style.fontFamily.split(',')[0].replace(/"/g, '')} | ${h.style.fontWeight} | ` +
      `${h.style.textTransform} | ${h.style.letterSpacing} |`,
  );
});
w('');

// ── Кнопки ─────────────────────────────────────────────────────────
w('## Кнопки и CTA (по 1280)');
w('');
w('| секция | текст | h | bg | color | radius | font | size | href |');
w('|---|---|---:|---|---|---|---|---|---|');
(sets['1280']?.sections || []).forEach((s) => {
  s.controls
    .filter((c) => {
      const bg = c.style.backgroundColor;
      const hasBg = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
      const hasBorder = c.style.borderWidth && parseFloat(c.style.borderWidth) > 0;
      return (hasBg || hasBorder) && c.box.h >= 24 && c.text;
    })
    .slice(0, 6)
    .forEach((c) => {
      w(
        `| ${s.key} | ${c.text.slice(0, 28)} | ${Math.round(c.box.h)} | ${c.style.backgroundColor} | ` +
          `${c.style.color} | ${c.style.borderRadius} | ${c.style.fontFamily.split(',')[0].replace(/"/g, '')} | ` +
          `${c.style.fontSize} | ${c.href || '—'} |`,
      );
    });
});
w('');

// ── Шрифты ─────────────────────────────────────────────────────────
w('## Шрифты');
w('');
w('Computed font-family на видимых текстовых узлах (1280):');
w('');
(sets['1280']?.fonts.computedFamilies || []).forEach((f) => w(`- \`${f}\``));
w('');
const faces = sets['1280']?.fonts.fontFaces || [];
if (faces.length) {
  w('Загруженные @font-face:');
  w('');
  faces.forEach((f) => w(`- ${f.family} ${f.weight} ${f.style} (${f.status})`));
  w('');
}

// ── Ассеты ─────────────────────────────────────────────────────────
w('## Ассеты (1280)');
w('');
const a = sets['1280']?.assets;
if (a) {
  w(`- Стили: ${a.stylesheets.length}`);
  a.stylesheets.forEach((s) => w(`  - ${s}`));
  w(`- Скрипты: ${a.scripts.length}`);
  a.scripts.forEach((s) => w(`  - ${s}`));
  w(`- Изображения: ${a.images.length}`);
  a.images.forEach((s) => w(`  - ${s}`));
}
w('');

// ── Тексты и ссылки ────────────────────────────────────────────────
w('## Тексты и ссылки по секциям (1280)');
w('');
(sets['1280']?.sections || []).forEach((s) => {
  w(`### ${s.index}. ${s.key} (\`<${s.tag}>\`)`);
  w('');
  w(`- bbox: x=${Math.round(s.box.x)} y=${Math.round(s.box.y)} w=${Math.round(s.box.w)} h=${Math.round(s.box.h)}`);
  w(`- bg: \`${s.style.backgroundColor}\`, padding: ${s.style.paddingTop}/${s.style.paddingRight}/${s.style.paddingBottom}/${s.style.paddingLeft}`);
  if (s.headings.length) {
    w('- Заголовки:');
    s.headings.forEach((h) => w(`  - \`<${h.tag}>\` «${h.text.slice(0, 80)}» — ${h.style.fontSize}/${h.style.lineHeight} ${h.style.fontWeight} ${h.style.textTransform}`));
  }
  if (s.paragraphs.length) {
    w('- Абзацы:');
    s.paragraphs.slice(0, 8).forEach((p) => w(`  - «${p.text.slice(0, 80)}» — ${p.style.fontSize} ${p.style.color}`));
  }
  const uniqLinks = Array.from(new Set(s.links)).slice(0, 20);
  if (uniqLinks.length) w(`- Ссылки: ${uniqLinks.map((l) => `\`${l}\``).join(', ')}`);
  if (s.images.length) {
    w('- Изображения:');
    s.images.slice(0, 10).forEach((im) =>
      w(`  - ${im.src ? im.src.split('/').pop().slice(0, 60) : '—'}${im.box ? ` @ ${Math.round(im.box.w)}×${Math.round(im.box.h)}` : ''}${im.natural ? ` (natural ${im.natural.w}×${im.natural.h})` : ''} object-fit=${im.style?.objectFit || '—'} aspect=${im.style?.aspectRatio || '—'}`),
    );
  }
  w('');
});

// ── Breakpoint-поведение ───────────────────────────────────────────
w('## Breakpoint-поведение — раскладочные сетки секций');
w('');
w('Показаны только контейнеры, у которых сетка/направление/gap МЕНЯЮТСЯ между viewport.');
w('Контейнеры сопоставляются по DOM-пути внутри секции.');
w('');
const activeVps = VPS.filter((v) => sets[v]);
keys.forEach((key, i) => {
  const byPath = new Map();
  for (const vp of activeVps) {
    for (const c of sets[vp]?.sections[i]?.layout || []) {
      if (!byPath.has(c.path)) byPath.set(c.path, {});
      byPath.get(c.path)[vp] = c;
    }
  }
  const rows = [];
  for (const [p, perVp] of byPath) {
    const sig = (c) =>
      c ? `${c.display}|${c.gridTemplateColumns}|${c.flexDirection}|${c.flexWrap}|${c.gap}` : '—';
    const sigs = activeVps.map((vp) => sig(perVp[vp]));
    if (new Set(sigs).size <= 1) continue; // адаптива нет — пропускаем
    rows.push({ path: p, perVp });
  }
  if (!rows.length) return;
  w(`### ${key}`);
  w('');
  w(`| путь в секции | ${activeVps.join(' | ')} |`);
  w(`|---|${activeVps.map(() => '---').join('|')}|`);
  rows.slice(0, 8).forEach(({ path: p, perVp }) => {
    const cells = activeVps.map((vp) => {
      const c = perVp[vp];
      if (!c) return '—';
      const geom =
        c.display.includes('grid')
          ? `cols: ${c.gridTemplateColumns}`
          : `${c.flexDirection}${c.flexWrap === 'wrap' ? ' wrap' : ''}`;
      return `${geom}<br>gap ${c.gap}<br>${Math.round(c.box.w)}×${Math.round(c.box.h)}`;
    });
    w(`| \`${p}\` | ${cells.join(' | ')} |`);
  });
  w('');
});

// ── Сравнение двух наборов ─────────────────────────────────────────
if (B) {
  w(`## Отличия набора \`${B}\` от \`${A}\``);
  w('');
  for (const vp of VPS) {
    const ra = sets[vp];
    const rb = load(B, vp);
    if (!ra || !rb) continue;
    w(`### viewport ${vp}`);
    w('');
    w(`- Высота документа: ${A}=${ra.documentHeight} → ${B}=${rb.documentHeight} (Δ ${rb.documentHeight - ra.documentHeight})`);
    w(`- Секций: ${A}=${ra.sections.length} → ${B}=${rb.sections.length}`);
    w('');
    w('| секция | y (эталон→локал) | h (эталон→локал) | Δh | вердикт |');
    w('|---|---|---|---:|---|');
    const maxLen = Math.max(ra.sections.length, rb.sections.length);
    for (let i = 0; i < maxLen; i++) {
      const sa = ra.sections[i];
      const sb = rb.sections[i];
      if (!sa) { w(`| — | — | — | — | ЛИШНЯЯ у ${B}: ${sb.key} |`); continue; }
      if (!sb) { w(`| ${sa.key} | — | — | — | ОТСУТСТВУЕТ у ${B} |`); continue; }
      const dh = Math.round(sb.box.h - sa.box.h);
      const dy = Math.round(sb.box.y - sa.box.y);
      const verdict =
        sa.key !== sb.key ? `⚠️ РАЗНЫЕ: ${sa.key} vs ${sb.key}`
        : Math.abs(dh) <= 1 && Math.abs(dy) <= 1 ? '✓ совпадает'
        : Math.abs(dh) <= 8 ? 'мелкое расхождение'
        : '✗ расходится';
      w(`| ${sa.key} | ${Math.round(sa.box.y)}→${Math.round(sb.box.y)} (Δ${dy}) | ${Math.round(sa.box.h)}→${Math.round(sb.box.h)} | ${dh} | ${verdict} |`);
    }
    w('');
  }
}

console.log(out.join('\n'));
