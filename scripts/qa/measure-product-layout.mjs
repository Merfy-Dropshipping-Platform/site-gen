#!/usr/bin/env node
/**
 * Геометрия секции «Товар» по вариантам «Макета» и по окнам.
 *
 * Меряем числами, а не на глаз: ширина/высота галереи и колонки текста,
 * выход узлов за правый край окна, наложения между главным фото и лентой
 * миниатюр, размер самих миниатюр и то, сколько их помещается в ряд.
 *
 * Использование: node scripts/qa/measure-product-layout.mjs <out.json>
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
const LAYOUTS = ['stacked', 'two-columns', 'carousel', 'split'];
const WIDTHS = [1440, 1024, 375];

/**
 * Товар с ШЕСТЬЮ фото — иначе «сетка миниатюр» не отличима от «ряда».
 * rose/satin читают его из `__merfy.resolved` (поле `catalog` задания),
 * vanilla/flux/bloom — HTTP-запросом во фронтматтере, поэтому нужен ещё и стаб.
 */
const IMAGES = [1, 2, 3, 4, 5, 6].map((i) => `/p1-${i}.png`);
const STUB = resolve(__dirname, 'product-six-images-stub.mjs');
const CATALOG = {
  products: [{
    id: 'p1', name: 'Товар 1', slug: 'tovar-1', handle: 'tovar-1',
    image: IMAGES[0], images: IMAGES,
    price: 2500, basePrice: 2500, compareAtPrice: 3500,
    description: 'Описание товара для замера макетов галереи.',
    collectionIds: ['col-1'],
  }],
  collections: [{ id: 'col-1', name: 'Хиты', slug: 'hity', image: IMAGES[0], images: [], productIds: ['p1'] }],
  publications: [],
};

function render(theme, layout) {
  const jobs = [{
    block: 'Product', cascade: true, live: true, catalog: CATALOG,
    props: { id: 'Product-1', productId: 'p1', layout, colorScheme: 'scheme-2', padding: { top: 40, bottom: 40 } },
  }];
  const out = execFileSync('node', ['--import', STUB, resolve(ROOT, 'src/themes/__tests__/render-theme-sections.mjs'), theme, JSON.stringify(jobs)], {
    cwd: ROOT, encoding: 'utf-8', maxBuffer: 128 * 1024 * 1024,
  });
  return JSON.parse(out)[0];
}

function MEASURE(w) {
  const root = document.querySelector('[data-measure] > div > *');
  if (!root) return { missing: true };
  const R = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  // Маркеры у двух портов разные: flux — data-cfg-*, theme-base — data-product-*.
  const hero = [...root.querySelectorAll('[data-cfg-hero],[data-product-hero]')].filter(vis).map(R);
  const thumbs = [...root.querySelectorAll('[data-cfg-thumb],[data-product-thumb]')].filter(vis).map(R);
  const track = [...root.querySelectorAll('[data-cfg-thumbs-track],[data-product-thumbs],[data-product-thumbs-track]')].filter(vis).map((el) => {
    const g = R(el); const cs = getComputedStyle(el);
    return { ...g, display: cs.display, cols: cs.gridTemplateColumns, scrollW: Math.round(el.scrollWidth), clientW: Math.round(el.clientWidth) };
  });
  // Все видимые узлы, вылезшие за правый край окна (опора — КОНСТАНТА w).
  const overflow = [];
  for (const el of root.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.right > w + 1) overflow.push({ right: Math.round(r.right), tag: el.tagName.toLowerCase(), cls: (el.getAttribute('class') || '').slice(0, 80) });
  }
  // Наложение главного фото и ленты миниатюр (два бокса пересеклись площадью).
  let overlapArea = 0;
  if (hero[0] && track[0]) {
    const a = hero[0], b = track[0];
    const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    overlapArea = ox * oy;
  }
  // Наложения миниатюр друг с другом.
  let thumbOverlaps = 0;
  for (let i = 0; i < thumbs.length; i++) for (let j = i + 1; j < thumbs.length; j++) {
    const a = thumbs[i], b = thumbs[j];
    const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    if (ox * oy > 4) thumbOverlaps += 1;
  }
  return {
    section: R(root),
    hero: hero[0] || null, heroCount: hero.length,
    thumbCount: thumbs.length,
    thumb0: thumbs[0] || null,
    thumbs,
    track: track[0] || null,
    overflowCount: overflow.length, overflowMax: overflow.reduce((m, o) => Math.max(m, o.right), 0), overflowSample: overflow.slice(0, 4),
    overlapArea, thumbOverlaps,
  };
}

async function main() {
  const outFile = process.argv[2] || '/tmp/b13/product-layout.json';
  const browser = await pw.chromium.launch();
  const result = {};
  for (const theme of THEMES) {
    const themeCss = readFileSync(resolve(ROOT, 'dist/theme-css', `${theme}.css`), 'utf8');
    const tokens = buildTokensCss({}, theme);
    result[theme] = {};
    for (const layout of LAYOUTS) {
      const row = render(theme, layout);
      if (!row.html) { result[theme][layout] = { error: row.error ?? 'нет html' }; continue; }
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>${themeCss}</style><style>${tokens}</style><style>html,body{margin:0;padding:0}</style></head><body><div data-measure><div class="color-scheme-2">${row.html}</div></div></body></html>`;
      result[theme][layout] = {};
      for (const w of WIDTHS) {
        const page = await browser.newPage({ viewport: { width: w, height: 1400 } });
        await page.route('**/*', (r) => {
          const u = r.request().url();
          return (u.startsWith('data:') || u.startsWith('about:')) ? r.continue() : r.abort();
        });
        await page.setContent(html, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(120);
        result[theme][layout][w] = await page.evaluate(MEASURE, w);
        await page.close();
      }
    }
    console.log(`измерено: ${theme}`);
  }
  await browser.close();
  writeFileSync(outFile, JSON.stringify(result, null, 2));
  console.log(`→ ${outFile}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
