#!/usr/bin/env node
/**
 * validate-page-seeds — guard for spec 099 (designer-faithful default content).
 *
 * Invariant: every theme MUST declare the full canonical storefront page set in
 * its `theme.json` manifest, each page MUST point at an existing `contentFile`,
 * and exactly one page MUST be `isHome:true`. This is what makes a freshly
 * created site start with the designer's full multi-page structure
 * (PageResolver path) instead of the home-only fallback.
 *
 * Run: `node scripts/validate-page-seeds.mjs` (CI gate). Non-zero exit on any
 * incomplete theme.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THEMES = ['rose', 'bloom', 'flux', 'satin', 'vanilla'];

// Canonical page ids every storefront ships (matches the rose reference set).
const CANONICAL = [
  'home',
  'page-catalog',
  'page-collection',
  'page-product',
  'page-about',
  'page-delivery',
  'page-contacts',
  'page-cart',
  'page-checkout',
];

let failures = 0;
const rows = [];

for (const theme of THEMES) {
  const mf = path.join(ROOT, 'packages', `theme-${theme}`, 'theme.json');
  if (!fs.existsSync(mf)) {
    rows.push({ theme, status: 'FAIL', detail: 'no theme.json' });
    failures++;
    continue;
  }
  const manifest = JSON.parse(fs.readFileSync(mf, 'utf8'));
  const pages = Array.isArray(manifest.pages) ? manifest.pages : [];
  const byId = new Map(pages.map((p) => [p.id, p]));

  const missing = CANONICAL.filter((id) => !byId.has(id));
  const noContent = CANONICAL.filter((id) => {
    const p = byId.get(id);
    if (!p) return false;
    const cf = p.contentFile;
    return !cf || !fs.existsSync(path.join(ROOT, 'packages', `theme-${theme}`, cf));
  });
  const homePages = pages.filter((p) => p.isHome);

  const problems = [];
  if (missing.length) problems.push(`missing pages: ${missing.join(', ')}`);
  if (noContent.length) problems.push(`missing contentFile: ${noContent.join(', ')}`);
  if (homePages.length !== 1) problems.push(`isHome count = ${homePages.length} (want 1)`);

  if (problems.length) {
    rows.push({ theme, status: 'FAIL', detail: problems.join('; ') });
    failures++;
  } else {
    rows.push({ theme, status: 'PASS', detail: `${pages.length} pages, home ok` });
  }
}

console.log('[validate:page-seeds] canonical set:', CANONICAL.join(', '));
for (const r of rows) {
  console.log(`  ${r.status === 'PASS' ? '✓' : '✗'} ${r.theme.padEnd(8)} ${r.status}  ${r.detail}`);
}
console.log(
  failures === 0
    ? `\n✅ all ${THEMES.length} themes have the full canonical page set`
    : `\n❌ ${failures} theme(s) incomplete — new sites will not get the full designer structure`,
);
process.exit(failures === 0 ? 0 : 1);
