#!/usr/bin/env node
/**
 * Capture live-site screenshots as Figma-reference surrogates.
 *
 * The real Figma captures require manual export — MCP renders inline in
 * chat and doesn't return file bytes. As an interim, we screenshot the
 * live storefront (which has been through spec 072 pixel-perfect design
 * parity) and commit those as references.
 *
 * That gives visual-diff CI a concrete regression gate while we plan a
 * proper Figma-token export pipeline. Switch to real Figma PNGs by
 * replacing files under specs/079-themes-figma-parity/figma-references/
 * one-by-one.
 *
 * Usage:
 *   node scripts/capture-live-references.mjs rose https://ab3d74c84ba1.merfy.ru
 *
 * Writes 10 pages × 2 viewports = 20 PNGs.
 */

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REFS_ROOT = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'specs',
  '079-themes-figma-parity',
  'figma-references',
);

const [, , theme, baseUrl] = process.argv;
if (!theme || !baseUrl) {
  console.error('Usage: node capture-live-references.mjs <theme> <base-url>');
  process.exit(1);
}

const PAGES = {
  home: '/',
  catalog: '/catalog',
  product: '/product/demo',
  cart: '/cart',
  checkout: '/checkout',
  contacts: '/contacts',
  about: '/about',
  auth: '/login',
  'account-dashboard': '/account',
  'order-tracking': '/orders',
};

const VIEWPORTS = [
  { w: 1920, h: 1080 },
  { w: 375, h: 812 },
];

const outDir = path.join(REFS_ROOT, theme);
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
let ok = 0;
let skipped = 0;

for (const [pageName, pagePath] of Object.entries(PAGES)) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h }, ignoreHTTPSErrors: true,
    });
    const tab = await ctx.newPage();
    const url = `${baseUrl}${pagePath}`;
    try {
      const resp = await tab.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 20_000,
      });
      if (!resp || resp.status() >= 400) {
        console.log(`  SKIP ${pageName}/${vp.w} — HTTP ${resp?.status()}`);
        skipped++;
        await ctx.close();
        continue;
      }
      // Some pages have analytics / chat widgets that never hit networkidle.
      // DOMContentLoaded + a fixed pause for above-the-fold content is
      // enough for pixel-diff baselines.
      await tab.waitForTimeout(1500);
      const buf = await tab.screenshot({ fullPage: true, timeout: 15_000 });
      const file = path.join(outDir, `${pageName}.${vp.w}.png`);
      await fs.writeFile(file, buf);
      console.log(`  OK   ${pageName}/${vp.w} → ${file} (${buf.length}B)`);
      ok++;
    } catch (e) {
      console.log(`  FAIL ${pageName}/${vp.w} — ${e instanceof Error ? e.message : e}`);
      skipped++;
    }
    await ctx.close();
  }
}

await browser.close();
console.log(`\nDone — ok=${ok} skipped=${skipped} total=${ok + skipped}`);
