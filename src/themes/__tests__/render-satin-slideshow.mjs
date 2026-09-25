#!/usr/bin/env node
/**
 * Child-process renderer for the mapped Satin Slideshow section module.
 *
 * jest (CJS, no --experimental-vm-modules) cannot load the compiled ESM `.mjs`
 * or the astro runtime in-process, so satin-conformance-slideshow-renderer.spec.ts
 * spawns THIS script. It renders the ACTUAL compiled module Satin's section map
 * selects (dist/theme-sections/satin/manifest.json → Slideshow) through the real
 * Astro Container — never a source-string assertion against theme-base.
 *
 * Usage: node render-satin-slideshow.mjs '<propsJsonArray>'
 * Prints a JSON array of rendered HTML strings to stdout.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITES_ROOT = resolve(__dirname, '..', '..', '..');
const SATIN_SECTIONS_DIST = resolve(SITES_ROOT, 'dist', 'theme-sections', 'satin');

function resolveMappedSlideshowModulePath() {
  const manifest = JSON.parse(
    readFileSync(resolve(SATIN_SECTIONS_DIST, 'manifest.json'), 'utf-8'),
  );
  const flat = manifest.Slideshow;
  if (!flat) throw new Error('Satin section manifest has no Slideshow entry');
  return resolve(SATIN_SECTIONS_DIST, flat);
}

async function main() {
  const propsList = JSON.parse(process.argv[2] ?? '[]');
  const modPath = resolveMappedSlideshowModulePath();
  const mod = await import(modPath);
  const Component = mod.default;
  const { experimental_AstroContainer } = await import('astro/container');
  const container = await experimental_AstroContainer.create();
  const out = [];
  for (const props of propsList) {
    out.push(await container.renderToString(Component, { props }));
  }
  process.stdout.write(JSON.stringify(out));
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err));
  process.exit(1);
});
