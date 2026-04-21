#!/usr/bin/env node
/**
 * Runtime verification: Astro Container can actually render a precompiled block.
 *
 * This is a permanent check (run via `pnpm verify:astro`) — if ever the
 * @astrojs/compiler output drifts from @astrojs/runtime expectations
 * (see patchCreateAstroCall in scripts/compile-astro-blocks.mjs), this fails.
 *
 * Usage:
 *   pnpm build:blocks    # ensure dist/astro-blocks/ is fresh
 *   pnpm verify:astro    # run this
 */

import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITES_ROOT = path.resolve(__dirname, '..');
const HERO_MODULE = path.join(SITES_ROOT, 'dist', 'astro-blocks', 'theme-base__Hero__Hero.mjs');

async function main() {
  const container = await AstroContainer.create();

  let Hero;
  try {
    const mod = await import(HERO_MODULE);
    Hero = mod.default;
    if (!Hero) throw new Error('no default export');
  } catch (err) {
    console.error(`FAIL: cannot import ${HERO_MODULE}:`, err.message);
    console.error('Did you run "pnpm build:blocks" first?');
    process.exit(1);
  }

  const props = {
    id: 'verify-hero',
    title: 'Astro Runtime OK',
    subtitle: 'via compiled .mjs + Container API',
    image: { url: '', alt: '' },
    cta: { text: 'Continue', href: '/' },
    variant: 'centered',
    colorScheme: 1,
    padding: { top: 80, bottom: 80 },
  };

  let html;
  try {
    html = await container.renderToString(Hero, { props });
  } catch (err) {
    console.error('FAIL: renderToString threw:', err);
    process.exit(1);
  }

  const checks = [
    { name: 'title present', pass: html.includes('Astro Runtime OK') },
    { name: 'subtitle present', pass: html.includes('via compiled .mjs') },
    { name: 'data-variant present', pass: html.includes('data-variant="centered"') },
    { name: 'color-scheme class', pass: html.includes('color-scheme-1') },
    { name: 'HTML non-empty', pass: html.length > 100 },
  ];

  console.log('=== Astro Runtime Verification ===');
  let allPass = true;
  for (const c of checks) {
    console.log(`${c.pass ? '✓' : '✗'} ${c.name}`);
    if (!c.pass) allPass = false;
  }
  console.log(`HTML length: ${html.length} bytes`);

  if (!allPass) {
    console.error('\n=== FAIL ===');
    console.error('First 500 chars of HTML:');
    console.error(html.slice(0, 500));
    process.exit(1);
  }

  console.log('\n=== PASS ===');
}

main().catch(err => {
  console.error('UNEXPECTED ERROR:', err);
  process.exit(1);
});
