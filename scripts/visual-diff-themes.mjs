#!/usr/bin/env node
/**
 * Phase 0c visual-diff runner.
 *
 * For every (theme, page, viewport) tuple, navigates the preview iframe
 * URL, captures a full-page PNG, and pixelmatch-compares against the
 * Figma reference committed under
 * `specs/079-themes-figma-parity/figma-references/<theme>/<page>.<viewport>.png`.
 *
 * Exit code 0 iff every tuple either passes its threshold or is missing
 * its reference PNG. Missing references print `no-reference` but don't
 * fail — this lets per-theme phases ship incrementally.
 *
 * Usage:
 *   PREVIEW_BASE=https://gateway.merfy.ru pnpm visual-diff:themes
 *
 * Filter knobs:
 *   THEME=rose           — restrict to one theme
 *   PAGE=home            — restrict to one page
 *   VIEWPORT=1920        — restrict to one viewport
 *   REPORT_DIR=…         — where to drop failed-diff PNGs (default: visual-diff-report/)
 *
 * Seed sites (override via env if different per env):
 *   SEED_ROSE, SEED_VANILLA, SEED_BLOOM, SEED_SATIN, SEED_FLUX
 */

import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MONOREPO = path.resolve(ROOT, '..', '..', '..');
const REFS = path.resolve(
  MONOREPO,
  'specs',
  '079-themes-figma-parity',
  'figma-references',
);
const REPORT = path.resolve(
  ROOT,
  process.env.REPORT_DIR ?? 'visual-diff-report',
);
const THRESHOLDS = JSON.parse(
  await fs.readFile(path.join(ROOT, 'visual-diff-thresholds.json'), 'utf8'),
);

const THEMES_ALL = ['rose', 'vanilla', 'bloom', 'satin', 'flux'];
const PAGES_ALL = [
  'home', 'catalog', 'product', 'cart', 'checkout',
  'contacts', 'about', 'auth', 'account-dashboard', 'order-tracking',
];
const VIEWPORTS_ALL = [
  { w: 1920, h: 1080 },
  { w: 375, h: 812 },
];

const SEED_SITES = {
  rose: process.env.SEED_ROSE ?? '214dd73c-0f5d-4913-b72f-a25ed5bcd976',
  vanilla: process.env.SEED_VANILLA ?? '63ccb1eb-079e-433a-9ddb-f22c9af3f265',
  bloom: process.env.SEED_BLOOM ?? '203bf7c0-a92e-4a55-982e-0a8d2b162ebf',
  satin: process.env.SEED_SATIN ?? 'ccb2f528-10ff-4a26-bd25-e06a65ac09f0',
  flux: process.env.SEED_FLUX ?? '6c4b7a56-a46b-4960-befb-fa2505a9da71',
};

const PREVIEW_BASE = process.env.PREVIEW_BASE ?? 'https://gateway.merfy.ru';

const filterTheme = process.env.THEME;
const filterPage = process.env.PAGE;
const filterViewport = process.env.VIEWPORT ? Number(process.env.VIEWPORT) : null;

const THEMES = filterTheme ? [filterTheme] : THEMES_ALL;
const PAGES = filterPage ? [filterPage] : PAGES_ALL;
const VIEWPORTS = filterViewport
  ? VIEWPORTS_ALL.filter((v) => v.w === filterViewport)
  : VIEWPORTS_ALL;

await fs.mkdir(REPORT, { recursive: true });

const browser = await chromium.launch();
const results = [];

for (const theme of THEMES) {
  const siteId = SEED_SITES[theme];
  if (!siteId) {
    console.warn(`[visual-diff] no seed site id for theme=${theme}, skipping`);
    continue;
  }

  for (const page of PAGES) {
    for (const vp of VIEWPORTS) {
      const key = `${theme}/${page}/${vp.w}`;
      if (THRESHOLDS.skip?.includes(key)) {
        results.push({ key, status: 'skip-config' });
        continue;
      }
      const threshold = THRESHOLDS.per_key?.[key] ?? THRESHOLDS.default;

      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      const tab = await ctx.newPage();
      const pageParam = page === 'home' ? 'home' : `page-${page}`;
      const url = `${PREVIEW_BASE}/api/sites/${siteId}/preview?page=${encodeURIComponent(pageParam)}`;
      let loadStatus = 'ok';
      try {
        // First run on a cold Astro container regularly takes 20-30s to
        // render a preview HTML; subsequent hits are <2s. Use a generous
        // timeout and domcontentloaded (networkidle can hang on trackers).
        const resp = await tab.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 45_000,
        });
        if (!resp || !resp.ok()) loadStatus = `http-${resp?.status() ?? '???'}`;
        // Wait for fonts + images to settle so pixel-diff has stable content
        // (domcontentloaded fires before hero background-image loads). Use a
        // short budget so 3rd-party trackers don't hang the run.
        await tab.waitForLoadState('load', { timeout: 10_000 }).catch(() => {});
        await tab.waitForTimeout(1500);
      } catch (e) {
        loadStatus = `load-error: ${e instanceof Error ? e.message : String(e)}`;
      }

      if (loadStatus !== 'ok') {
        // Preview 404 + missing reference = this page isn't expected yet for
        // the seed site. Informational, not a fail.
        const refPath = path.join(REFS, theme, `${page}.${vp.w}.png`);
        let refExists = true;
        try { await fs.access(refPath); } catch { refExists = false; }
        const status = refExists ? 'load-failed' : 'no-reference-no-page';
        results.push({ key, status, detail: loadStatus, threshold });
        await ctx.close();
        continue;
      }

      let actualBuf;
      try {
        actualBuf = await tab.screenshot({ fullPage: true, timeout: 15_000 });
      } catch (e) {
        results.push({ key, status: 'shot-failed', detail: String(e), threshold });
        await ctx.close();
        continue;
      }
      const actual = PNG.sync.read(actualBuf);

      const refPath = path.join(REFS, theme, `${page}.${vp.w}.png`);
      let ref;
      try {
        const buf = await fs.readFile(refPath);
        ref = PNG.sync.read(buf);
      } catch {
        results.push({ key, status: 'no-reference', threshold });
        await ctx.close();
        continue;
      }

      // Compare the overlap region so differing crop sizes don't artifically
      // inflate the diff count.
      const width = Math.min(actual.width, ref.width);
      const height = Math.min(actual.height, ref.height);
      const diff = new PNG({ width, height });
      const actualSubset = cropTopLeft(actual, width, height);
      const refSubset = cropTopLeft(ref, width, height);
      // pixelmatch per-pixel threshold. 0.1 is strict (anti-alias shimmer counts
      // as diff); 0.3 tolerates font-hinting / sub-pixel differences while still
      // flagging real layout breakage. Combined with the tuple-level threshold
      // in visual-diff-thresholds.json we get a two-level gate.
      const numDiff = pixelmatch(
        actualSubset, refSubset, diff.data, width, height,
        { threshold: 0.3, includeAA: false },
      );
      const ratio = numDiff / (width * height);
      const status = ratio > threshold ? 'fail' : 'pass';

      if (status === 'fail') {
        const base = path.join(REPORT, `${theme}-${page}-${vp.w}`);
        await fs.writeFile(`${base}-actual.png`, PNG.sync.write(actual));
        await fs.writeFile(`${base}-diff.png`, PNG.sync.write(diff));
      }

      results.push({ key, status, threshold, diff: ratio });
      await ctx.close();
    }
  }
}

await browser.close();

const fails = results.filter((r) => r.status === 'fail');
const missing = results.filter(
  (r) => r.status === 'no-reference' || r.status === 'no-reference-no-page',
);
const loadFails = results.filter(
  (r) => r.status === 'load-failed' || r.status === 'shot-failed',
);
const passes = results.filter((r) => r.status === 'pass');
const skipped = results.filter((r) => r.status === 'skip-config');

await fs.writeFile(path.join(REPORT, 'results.json'), JSON.stringify(results, null, 2));

console.log(
  `Total: ${results.length} — pass ${passes.length}, fail ${fails.length}, no-reference ${missing.length}, load-failed ${loadFails.length}, skipped ${skipped.length}`,
);
for (const f of fails) {
  console.log(` FAIL ${f.key} — diff ${(f.diff * 100).toFixed(2)}% > threshold ${(f.threshold * 100).toFixed(2)}%`);
}
for (const f of loadFails) {
  console.log(` LOAD ${f.key} — ${f.detail}`);
}

// Exit non-zero on fail OR load-failure (and there IS a reference); missing
// references and load-failed-without-reference are informational.
process.exit(fails.length > 0 || loadFails.length > 0 ? 1 : 0);

function cropTopLeft(png, width, height) {
  if (png.width === width && png.height === height) return png.data;
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    png.data.copy(
      out,
      y * width * 4,
      y * png.width * 4,
      y * png.width * 4 + width * 4,
    );
  }
  return out;
}
