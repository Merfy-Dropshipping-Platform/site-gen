#!/usr/bin/env node
/**
 * Проверка гипотезы «поверхность схемы привязана к КОНТЕЙНЕРУ».
 *
 * Жалоба владельца 15.09: «секция „Изображение“ в теме bloom — не применяется
 * цветовая схема БЕЗ КОНТЕЙНЕРА». Поле «Контейнер» есть ровно у трёх блоков
 * (панель-канон): Hero (тоггл, дефолт `false`), Slideshow (дефолт `true`),
 * CollapsibleSection (скрытое). Меряем ту же секцию дважды — контейнер ВКЛ и
 * ВЫКЛ — под двумя разными схемами магазина тестировщика и смотрим, меняется
 * ли вердикт «схема доезжает» для каждой из мишеней.
 *
 * Использование: node scripts/qa/measure-container-scheme.mjs <out.json>
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const require_ = createRequire(import.meta.url);
const { buildTokensCss } = require_(resolve(ROOT, 'dist/src/themes/tokens-css.js'));
const pw = require_(resolve(ROOT, 'node_modules/playwright/index.js'));

const THEMES = ['rose', 'vanilla', 'bloom', 'satin', 'flux'];
const BLOCKS = ['Hero', 'Slideshow', 'CollapsibleSection'];
const SCHEMES = JSON.parse(readFileSync(resolve(__dirname, 'tester-schemes.json'), 'utf8'));
const A = 'scheme-1', B = 'scheme-4';

function render(theme, block, schemeId, container) {
  const jobs = [{ block, cascade: true, live: true, props: { id: `${block}-1`, colorScheme: schemeId, container } }];
  const out = execFileSync('node', [resolve(ROOT, 'src/themes/__tests__/render-theme-sections.mjs'), theme, JSON.stringify(jobs)], {
    cwd: ROOT, encoding: 'utf-8', maxBuffer: 1 << 28,
  });
  return JSON.parse(out)[0];
}

const MEASURE = `(() => {
  const T = 'rgba(0, 0, 0, 0)';
  const SKIP = { STYLE: 1, SCRIPT: 1, LINK: 1, TEMPLATE: 1 };
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const out = {};
  for (const wrap of document.querySelectorAll('[data-measure]')) {
    const key = wrap.getAttribute('data-measure');
    let root = wrap.firstElementChild ? wrap.firstElementChild.firstElementChild : null;
    while (root && SKIP[root.tagName]) root = root.nextElementSibling;
    if (!root) { out[key] = { missing: true }; continue; }
    const rb = root.getBoundingClientRect();
    let surface = T, best = -1;
    for (const el of [root, ...root.querySelectorAll('*')]) {
      const c = getComputedStyle(el).backgroundColor;
      if (!c || c === T) continue;
      const b = el.getBoundingClientRect();
      if (b.width < rb.width - 1) continue;
      const a = b.width * b.height;
      if (a > best) { best = a; surface = c; }
    }
    // Плашка контейнера: самый большой закрашенный узел УЖЕ окна секции.
    let plate = null, pbest = -1;
    for (const el of root.querySelectorAll('*')) {
      const c = getComputedStyle(el).backgroundColor;
      if (!c || c === T) continue;
      const b = el.getBoundingClientRect();
      if (b.width >= rb.width - 1) continue;
      const a = b.width * b.height;
      if (a > pbest) { pbest = a; plate = c; }
    }
    const h = [...root.querySelectorAll('h1,h2,h3')].find(vis) || null;
    const p = [...root.querySelectorAll('p')].find((el) => vis(el) && (el.textContent || '').trim()) || null;
    out[key] = { surface, plate, headingColor: h ? getComputedStyle(h).color : null, textColor: p ? getComputedStyle(p).color : null };
  }
  return out;
})()`;

async function main() {
  const outFile = process.argv[2] || '/tmp/b13/container.json';
  const browser = await pw.chromium.launch();
  const res = {};
  for (const theme of THEMES) {
    const themeCss = readFileSync(resolve(ROOT, 'dist/theme-css', `${theme}.css`), 'utf8');
    const tokens = buildTokensCss({ colorSchemes: SCHEMES }, theme);
    res[theme] = {};
    for (const scheme of [A, B]) {
      for (const container of ['true', 'false']) {
        const rows = BLOCKS.map((b) => ({ block: b, html: render(theme, b, scheme, container).html }));
        const body = rows.map((r) => `<div data-measure="${r.block}"><div class="color-scheme-${scheme.replace('scheme-', '')}">${r.html || ''}</div></div>`).join('');
        const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
        await page.route('**/*', (r) => {
          const u = r.request().url();
          return (u.startsWith('data:') || u.startsWith('about:')) ? r.continue() : r.abort();
        });
        await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${themeCss}</style><style>${tokens}</style><style>html,body{margin:0;background:rgb(1,2,3)}</style></head><body>${body}</body></html>`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(120);
        const m = await page.evaluate(MEASURE);
        for (const b of BLOCKS) {
          res[theme][b] = res[theme][b] || {};
          res[theme][b][`${scheme}/контейнер=${container}`] = m[b];
        }
        await page.close();
      }
    }
    console.log('измерено:', theme);
  }
  await browser.close();
  writeFileSync(outFile, JSON.stringify(res, null, 2));
  console.log('→', outFile);
}
main().catch((e) => { console.error(e); process.exit(1); });
