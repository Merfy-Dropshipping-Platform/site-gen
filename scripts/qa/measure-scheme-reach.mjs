#!/usr/bin/env node
/**
 * Замер «доезжает ли цветовая схема до секции».
 *
 * Для каждой секции темы рендерим ЖИВОЙ порт (та же лестница, что у витрины:
 * dist/theme-sections/<тема>/manifest.json → пакет темы → theme-base), кладём
 * его в обёртку `.color-scheme-N` ДОСЛОВНО как v2-page-composer, подключаем
 * РЕАЛЬНЫЙ CSS темы (dist/theme-css/<тема>.css) + tokens.css из buildTokensCss
 * и читаем ВЫЧИСЛЕННЫЕ браузером цвета.
 *
 * Сценарии:
 *   A «смена схемы»   — та же секция под .color-scheme-1 и .color-scheme-4
 *                       мерчантских схем (белая против чёрной). Ровно то, что
 *                       делает тестер: один сайт, переключает схему секции.
 *   B «перекраска»    — .color-scheme-3 заводская против .color-scheme-3, где
 *                       мерчант поменял «Фон» на #71C0FF. Редактор схем правит
 *                       только Фон/Заголовок/Текст/кнопки; surfaceBg/accent/
 *                       muted уходят обратно заводскими (ThemeContext
 *                       normalizeScheme) — воспроизводим это буквально.
 *
 * Мерчантские схемы берём из ОДНОЙ темы (--schemes-from, по умолчанию rose):
 * тестер работает на одном сайте и переключает темы, поэтому схемы у него
 * общие, а тема разная.
 *
 * Фон страницы намеренно ядовитый rgb(1,2,3): прозрачный корень секции виден
 * числом, а не «на глаз».
 *
 * Использование:
 *   node scripts/qa/measure-scheme-reach.mjs <тема> <out.json> [ширина] [--schemes-from=<тема>]
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

/** Секции, которые мерчант ставит на страницу (панель-канон, поле colorScheme есть). */
export const SECTIONS = [
  'Hero', 'PromoBanner', 'PopularProducts', 'Collections', 'Gallery', 'Product',
  'MainText', 'ImageWithText', 'Slideshow', 'MultiColumns', 'MultiRows',
  'CollapsibleSection', 'Newsletter', 'ContactForm', 'Video', 'Publications',
  'CartSection', 'WishlistSection', 'AccountSection', 'OrdersSection',
  'LoginSection', 'CartBody', 'CartSummary', 'Catalog', 'Header', 'Footer',
];

const MERCHANT_BG = '#71C0FF';
const MERCHANT_BG_RGB = 'rgb(113, 192, 255)';

const hexOf = (triple) => {
  if (typeof triple !== 'string') return undefined;
  const p = triple.trim().split(/\s+/).map((n) => parseInt(n, 10));
  if (p.length !== 3 || p.some(Number.isNaN)) return undefined;
  return '#' + p.map((n) => n.toString(16).padStart(2, '0')).join('');
};

/** Схемы темы в «мерчантской» форме — ровно то, что конструктор кладёт в ревизию. */
function merchantSchemesOf(themeId) {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'packages', `theme-${themeId}`, 'theme.json'), 'utf8'));
  return (manifest.colorSchemes || []).map((s) => {
    const t = s.tokens || {};
    return {
      id: s.id,
      name: s.name ?? s.id,
      background: hexOf(t['--color-bg']) ?? '#FFFFFF',
      surfaceBg: hexOf(t['--color-surface']) ?? hexOf(t['--color-bg']) ?? '#FFFFFF',
      heading: hexOf(t['--color-heading']) ?? '#000000',
      text: hexOf(t['--color-text']) ?? '#000000',
      accent: hexOf(t['--color-accent']),
      muted: hexOf(t['--color-muted']),
      primaryButton: {
        background: hexOf(t['--color-button-bg']),
        text: hexOf(t['--color-button-text']),
        border: hexOf(t['--color-button-border']),
      },
      secondaryButton: {
        background: hexOf(t['--color-button-2-bg']),
        text: hexOf(t['--color-button-2-text']),
        border: hexOf(t['--color-button-2-border']),
      },
    };
  });
}

/** Та же схема, но мерчант перекрасил ровно редактируемые поля. */
function repaint(scheme) {
  return {
    ...scheme,
    background: MERCHANT_BG,
    heading: '#1A1A1A',
    text: '#E91E8C',
    primaryButton: { background: '#5AF810', text: '#000000', border: '#5AF810' },
    secondaryButton: { background: '#FFFFFF', text: '#1A1A1A', border: '#1A1A1A' },
    // surfaceBg / accent / muted — passthrough, полей в редакторе НЕТ.
  };
}

function renderAll(theme, sections, schemeId) {
  const jobs = sections.map((block) => ({
    block, cascade: true, live: true,
    props: { id: `${block}-1`, colorScheme: schemeId },
  }));
  const out = execFileSync('node', [resolve(ROOT, 'src/themes/__tests__/render-theme-sections.mjs'), theme, JSON.stringify(jobs)], {
    cwd: ROOT, encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024,
  });
  return JSON.parse(out);
}

function pageHtml(theme, tokensCss, rows, schemeNum) {
  const themeCss = readFileSync(resolve(ROOT, 'dist/theme-css', `${theme}.css`), 'utf8');
  const body = rows.map((r) => {
    const html = r.html ?? `<div data-render-error="1"></div>`;
    return `<div data-measure="${r.block}"><div class="color-scheme-${schemeNum}" data-block-scheme="${schemeNum}">${html}</div></div>`;
  }).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8">
<style>${themeCss}</style>
<style>${tokensCss}</style>
<style>html,body{margin:0;padding:0;background:rgb(1,2,3)}</style>
</head><body>${body}</body></html>`;
}

const MEASURE = `(() => {
  const TRANSPARENT = 'rgba(0, 0, 0, 0)';
  const out = {};
  for (const wrap of document.querySelectorAll('[data-measure]')) {
    const block = wrap.getAttribute('data-measure');
    const schemeWrap = wrap.firstElementChild;
    const root = schemeWrap && schemeWrap.firstElementChild;
    if (!root) { out[block] = { missing: true }; continue; }
    const cs = getComputedStyle(root);
    let node = root, painter = null, effective = TRANSPARENT;
    while (node) {
      const c = getComputedStyle(node).backgroundColor;
      if (c && c !== TRANSPARENT) {
        effective = c;
        painter = node === root ? 'root' : (node === document.body ? 'body' : 'wrapper');
        break;
      }
      node = node.parentElement;
    }
    const painted = [], texts = [];
    const all = [root, ...root.querySelectorAll('*')];
    for (const el of all) {
      const s = getComputedStyle(el);
      if (s.backgroundColor && s.backgroundColor !== TRANSPARENT) {
        painted.push({ bg: s.backgroundColor, cls: (el.getAttribute('class') || '').slice(0, 140), tag: el.tagName.toLowerCase() });
      }
      texts.push(s.color);
    }
    out[block] = {
      rootClass: (root.getAttribute('class') || '').slice(0, 400),
      rootBg: cs.backgroundColor, rootColor: cs.color,
      effectiveBg: effective, painter, nodes: all.length, painted, texts,
    };
  }
  return out;
})()`;

async function measure(scenarios, width) {
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width, height: 1400 } });
  await page.route('**/*', (route) => {
    const u = route.request().url();
    return (u.startsWith('data:') || u.startsWith('about:')) ? route.continue() : route.abort();
  });
  const result = {};
  for (const sc of scenarios) {
    await page.setContent(sc.html, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(150);
    result[sc.name] = await page.evaluate(MEASURE);
  }
  await browser.close();
  return result;
}

/** Сколько узлов с непрозрачным фоном НЕ изменились между двумя замерами. */
function frozen(a, b) {
  const pa = a?.painted ?? [], pb = b?.painted ?? [];
  if (pa.length !== pb.length) return { total: null, frozen: null, samples: [] };
  const seen = new Set(), samples = [];
  let n = 0;
  pa.forEach((x, i) => {
    if (x.bg !== pb[i].bg) return;
    n += 1;
    const key = x.cls + '|' + x.bg;
    if (seen.has(key)) return;
    seen.add(key);
    samples.push({ tag: x.tag, bg: x.bg, cls: x.cls });
  });
  return { total: pa.length, frozen: n, samples: samples.slice(0, 14) };
}

async function main() {
  const theme = process.argv[2];
  const outFile = process.argv[3];
  const width = Number(process.argv[4] || 1440);
  const from = (process.argv.find((a) => a.startsWith('--schemes-from=')) || '--schemes-from=rose').split('=')[1];
  if (!theme || !outFile) {
    console.error('usage: measure-scheme-reach.mjs <тема> <out.json> [ширина] [--schemes-from=<тема>]');
    process.exit(2);
  }
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'dist/theme-sections', theme, 'manifest.json'), 'utf8'));
  const schemes = merchantSchemesOf(from);
  const byId = (id) => schemes.find((s) => s.id === id);
  const light = byId('scheme-1') ?? schemes[0];
  const dark = byId('scheme-4') ?? schemes[schemes.length - 1];
  const base3 = byId('scheme-3') ?? schemes[2] ?? schemes[0];

  const cssAll = buildTokensCss({ colorSchemes: schemes }, theme);
  const cssRepainted = buildTokensCss(
    { colorSchemes: schemes.map((s) => (s.id === base3.id ? repaint(s) : s)) },
    theme,
  );

  const rLight = renderAll(theme, SECTIONS, light.id);
  const rDark = renderAll(theme, SECTIONS, dark.id);
  const r3 = renderAll(theme, SECTIONS, base3.id);

  const n = (id) => id.replace(/^scheme-/, '');
  const measured = await measure([
    { name: 'light', html: pageHtml(theme, cssAll, rLight, n(light.id)) },
    { name: 'dark', html: pageHtml(theme, cssAll, rDark, n(dark.id)) },
    { name: 'base3', html: pageHtml(theme, cssAll, r3, n(base3.id)) },
    { name: 'repaint3', html: pageHtml(theme, cssRepainted, r3, n(base3.id)) },
  ], width);

  const table = {};
  for (const block of SECTIONS) {
    const L = measured.light[block], D = measured.dark[block];
    const B = measured.base3[block], R = measured.repaint3[block];
    const fSwitch = frozen(L, D);
    const fRepaint = frozen(B, R);
    table[block] = {
      port: manifest[block] ? `тема:${manifest[block]}` : 'theme-base',
      rootClass: B?.rootClass ?? null,
      lightBg: L?.effectiveBg ?? null,
      darkBg: D?.effectiveBg ?? null,
      painter: B?.painter ?? null,
      repaintBg: R?.effectiveBg ?? null,
      // A: площадь секции меняется при СМЕНЕ схемы?
      areaFollowsSwitch: !!L && !!D && L.effectiveBg !== D.effectiveBg,
      // B: площадь секции стала «Фоном», который выбрал мерчант?
      areaFollowsRepaint: !!R && R.effectiveBg === MERCHANT_BG_RGB,
      switchFrozen: fSwitch.frozen, switchTotal: fSwitch.total, switchSamples: fSwitch.samples,
      repaintFrozen: fRepaint.frozen, repaintTotal: fRepaint.total, repaintSamples: fRepaint.samples,
    };
  }
  writeFileSync(outFile, JSON.stringify({
    theme, width, schemesFrom: from,
    schemeA: light.id, schemeB: dark.id, repainted: base3.id,
    table,
  }, null, 2));
  console.log(`${theme} (схемы от ${from}) → ${outFile}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
