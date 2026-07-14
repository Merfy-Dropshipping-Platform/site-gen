#!/usr/bin/env node
/**
 * Child-process renderer for the mapped Satin MultiColumns SECTION module.
 *
 * The sibling `render-satin-multicolumns.mjs` probe inspects the compiled block
 * puckConfig SCHEMA (safeParse); THIS probe renders the ACTUAL compiled section
 * component Satin's section map selects (dist/theme-sections/satin/manifest.json
 * → MultiColumns) through the real Astro Container. It reports which value the
 * renderer emits when a column carries BOTH a canonical leaf (`title`,
 * `description`, `image`) and its legacy alias (`heading`, `text`, `imageUrl`),
 * proving the renderer reads canonical-first (the stored-shape remediation).
 *
 * jest (CJS, no --experimental-vm-modules) cannot load the compiled ESM `.mjs`
 * or the astro runtime in-process, so the fact loader spawns THIS script.
 *
 * Usage: node render-satin-multicolumns-section.mjs '<propsJson>'
 * Prints one JSON object of observed facts to stdout.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITES_ROOT = resolve(__dirname, '..', '..', '..');
const SATIN_SECTIONS_DIST = resolve(SITES_ROOT, 'dist', 'theme-sections', 'satin');

function resolveMappedMultiColumnsModulePath() {
  const manifest = JSON.parse(
    readFileSync(resolve(SATIN_SECTIONS_DIST, 'manifest.json'), 'utf-8'),
  );
  const flat = manifest.MultiColumns;
  if (!flat) throw new Error('Satin section manifest has no MultiColumns entry');
  return resolve(SATIN_SECTIONS_DIST, flat);
}

async function main() {
  const props = JSON.parse(process.argv[2] ?? '{}');
  const modPath = resolveMappedMultiColumnsModulePath();
  const mod = await import(modPath);
  const Component = mod.default;
  const { experimental_AstroContainer } = await import('astro/container');
  const container = await experimental_AstroContainer.create();
  const html = await container.renderToString(Component, { props });

  const out = {
    hasCanonTitle: html.includes('CANON_TITLE'),
    hasLegacyHeading: html.includes('LEGACY_HEADING'),
    hasCanonDesc: html.includes('CANON_DESC'),
    hasLegacyText: html.includes('LEGACY_TEXT'),
    hasCanonImage: html.includes('/canonical.png'),
    hasLegacyImage: html.includes('/legacy.png'),
  };
  process.stdout.write(JSON.stringify(out));
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err));
  process.exit(1);
});
