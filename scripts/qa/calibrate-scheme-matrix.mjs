#!/usr/bin/env node
/**
 * КАЛИБРОВКА МАТРИЦЫ: сверка статического приговора с настоящим браузером.
 *
 * Матрица (`src/themes/__tests__/scheme-matrix.mjs`) считает цвет по CSS темы
 * и токенам схемы, без браузера — иначе её нельзя поставить в CI. Значит она
 * обязана уметь врать, и это нужно проверять. Здесь тот же рендер секций
 * складывается в страницу и открывается в chromium ДВАЖДЫ — со схемой A и со
 * схемой B, — после чего `getComputedStyle` каждого узла сравнивается с тем,
 * что матрица про этот узел сказала:
 *
 *   матрица «зелёная» (краска едет за схемой) → числа ОБЯЗАНЫ отличаться;
 *   матрица «красная» (мимо схемы)            → числа ОБЯЗАНЫ совпасть.
 *
 * Любое расхождение печатается строкой: это либо ошибка каскада в матрице,
 * либо непонятый механизм краски. «0 расхождений» — единственное основание
 * верить числам матрицы.
 *
 * Использование: node scripts/qa/calibrate-scheme-matrix.mjs [--theme rose]
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  SITES_ROOT, THEMES, PROBE_A, PROBE_B, SCHEME_A, SCHEME_B,
  discoverBlocks, renderTheme, walk, buildMatrix, cellKey,
} from '../../src/themes/__tests__/scheme-matrix.mjs';

const require_ = createRequire(import.meta.url);
const { buildTokensCss } = require_(resolve(SITES_ROOT, 'dist/src/themes/tokens-css.js'));
const pw = require_(resolve(SITES_ROOT, 'node_modules/playwright/index.js'));

/**
 * Проставить каждому тегу `data-mx="i"` в том же порядке, в каком его видит
 * `walk`. Без общей нумерации узел браузера не сопоставить с клеткой матрицы.
 */
function tagNodes(html) {
  const VOID_OR_RAW = /^(script|style|template|noscript|svg)$/i;
  let i = 0;
  let out = '';
  let pos = 0;
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) continue;
    const tag = m[2].toLowerCase();
    if (VOID_OR_RAW.test(tag)) {
      const end = html.toLowerCase().indexOf(`</${tag}`, re.lastIndex);
      if (end >= 0) re.lastIndex = end;
      continue;
    }
    const insertAt = m.index + 1 + m[2].length;
    out += html.slice(pos, insertAt) + ` data-mx="${i}"`;
    pos = insertAt;
    i += 1;
  }
  return out + html.slice(pos);
}

const MEASURE = `(() => {
  const out = {};
  for (const el of document.querySelectorAll('[data-mx]')) {
    const s = getComputedStyle(el);
    out[el.closest('[data-mx-block]').getAttribute('data-mx-block') + '#' + el.getAttribute('data-mx')] =
      [s.backgroundColor, s.color];
  }
  return out;
})()`;

async function main() {
  const argv = process.argv.slice(2);
  const ti = argv.indexOf('--theme');
  const themes = ti >= 0 ? [argv[ti + 1]] : THEMES;
  const blocks = discoverBlocks();
  const matrix = buildMatrix({ themes, blocks });

  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 2000 } });
  await page.route('**/*', (r) => {
    const u = r.request().url();
    return u.startsWith('data:') || u.startsWith('about:') ? r.continue() : r.abort();
  });

  let checked = 0;
  let mismatched = 0;
  const problems = [];

  for (const theme of themes) {
    const themeCss = readFileSync(resolve(SITES_ROOT, 'dist/theme-css', `${theme}.css`), 'utf8');
    const tokens = buildTokensCss({ colorSchemes: [PROBE_A, PROBE_B] }, theme);
    const seen = {};
    // Рендерим ДВАЖДЫ, с разным colorScheme: часть портов печатает класс
    // `color-scheme-N` на СВОЁМ корне (vanilla CartBody, rose AccountSection),
    // и он бьёт обёртку. Подменять класс снаружи — значит мерить не то, что
    // отдаёт витрина.
    const rendered = renderTheme(theme, blocks);
    for (const [name, id] of [['A', SCHEME_A], ['B', SCHEME_B]]) {
      const pass = renderTheme(theme, blocks, `scheme-${id}`);
      const tagged = {};
      for (const b of blocks) if (pass[b]?.html) tagged[b] = tagNodes(pass[b].html);
      const body = Object.entries(tagged)
        .map(([b, html]) => `<div data-mx-block="${b}" class="color-scheme-${id}" data-block-scheme="${id}">${html}</div>`)
        .join('\n');
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><style>${themeCss}</style><style>${tokens}</style>` +
        `<style>html,body{margin:0;padding:0;background:rgb(1,2,3)}</style></head><body>${body}</body></html>`,
        { waitUntil: 'domcontentloaded' },
      );
      seen[name] = await page.evaluate(MEASURE);
    }

    // Индекс узлов: та же нумерация, что у walk.
    const indexOf = {};
    for (const b of blocks) {
      if (!rendered[b]?.html) continue;
      indexOf[b] = walk(rendered[b].html).nodes;
    }

    for (const cell of matrix.cells.filter((c) => c.theme === theme)) {
      const nodes = indexOf[cell.block];
      if (!nodes) continue;
      const idx = nodes.indexOf(nodes.find((n) => n.offset === cell.node.offset));
      if (idx < 0) continue;
      const key = `${cell.block}#${idx}`;
      const a = seen.A[key];
      const b = seen.B[key];
      if (!a || !b) continue;
      const pi = cell.prop === 'background-color' ? 0 : 1;
      const moved = a[pi] !== b[pi];
      const expectMoved = cell.verdict === 'ok';
      checked += 1;
      if (moved !== expectMoved) {
        mismatched += 1;
        problems.push(`${theme} · ${cell.block} · ${cell.target} · матрица: ${cell.verdict} · браузер: ${a[pi]} → ${b[pi]} · класс ${cell.cls}`);
      }
    }
  }
  await browser.close();

  console.log(`сверено клеток: ${checked}`);
  console.log(`расхождений:    ${mismatched}`);
  for (const p of problems.slice(0, 80)) console.log(`  ${p}`);
  if (problems.length > 80) console.log(`  … ещё ${problems.length - 80}`);
  process.exit(mismatched ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
