#!/usr/bin/env node
/**
 * Standalone probe: render a single compiled v2 theme section through
 * Astro's Container API and print the resulting HTML to stdout.
 *
 * Recreated per docs/superpowers/plans/2026-07-27-flux-constructor-live-markup.md
 * — the plan's tasks invoke this literal CLI as their verification step, e.g.:
 *
 *   pnpm build:theme-sections flux
 *   node render-probe.mjs flux Header '{"id":"Header-test","siteTitle":"Test Flux"}'
 *
 * This mirrors — deliberately, not a reimplementation — the same render path
 * `src/services/preview.service.ts` uses in production
 * (`resolveV2Section` + `defaultContainerFactory` + `PreviewService.renderBlock`):
 * read `dist/theme-sections/<theme>/manifest.json` (built by
 * `scripts/compile-theme-sections.mjs` via `pnpm build:theme-sections <theme>`),
 * dynamic-import the compiled section .mjs it points to, create an
 * `experimental_AstroContainer`, and `renderToString(Component, { props })`.
 * A probe that "passes" is only meaningful because it exercises the exact
 * same code path preview/live use — no shortcuts, no alternate renderer.
 *
 * This script does NOT run `pnpm build:theme-sections` itself — it only reads
 * the already-compiled output. Run the build first; this fails loudly if the
 * manifest (or the section it points to) is missing.
 *
 * No theme-defaults merging happens here (that's `PreviewService.renderBlock`'s
 * job, via `packages/theme-<id>/theme.json` blockDefaults) — props are passed
 * through exactly as given on the CLI.
 *
 * Usage:
 *   node render-probe.mjs <theme> <BlockName> '<json-props>'
 *
 * Exit code 0 + HTML on stdout on success. Exit non-zero + a clear message on
 * stderr on any failure (bad args, missing manifest/section, JSON parse error,
 * import failure, render throwing).
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function main() {
  const [, , theme, blockName, propsJson] = process.argv;

  if (!theme || !blockName || propsJson === undefined) {
    console.error(
      "Usage: node render-probe.mjs <theme> <BlockName> '<json-props>'",
    );
    console.error(
      '  e.g.: node render-probe.mjs flux Header \'{"id":"Header-test","siteTitle":"Test Flux"}\'',
    );
    process.exitCode = 1;
    return;
  }

  let props;
  try {
    props = JSON.parse(propsJson);
  } catch (err) {
    console.error(
      `✗ render-probe: <json-props> is not valid JSON: ${err.message}`,
    );
    process.exitCode = 1;
    return;
  }

  const dir = resolve(process.cwd(), 'dist', 'theme-sections', theme);
  const manifestPath = resolve(dir, 'manifest.json');

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
  } catch (err) {
    console.error(
      `✗ render-probe: could not read manifest at ${manifestPath}: ${err.message}`,
    );
    console.error(
      `  Run 'pnpm build:theme-sections ${theme}' (or 'node scripts/compile-theme-sections.mjs ${theme}') first.`,
    );
    process.exitCode = 1;
    return;
  }

  const file = manifest[blockName];
  if (!file) {
    console.error(
      `✗ render-probe: block "${blockName}" not found in manifest for theme "${theme}".`,
    );
    console.error(
      `  Available blocks: ${Object.keys(manifest).join(', ') || '(none)'}`,
    );
    process.exitCode = 1;
    return;
  }

  const modPath = resolve(dir, file);
  let Component;
  try {
    const mod = await import(modPath);
    Component = mod.default;
    if (!Component) {
      throw new Error(`compiled module ${file} has no default export`);
    }
  } catch (err) {
    console.error(
      `✗ render-probe: failed to import compiled section "${file}" for "${theme}/${blockName}": ${err.message}`,
    );
    process.exitCode = 1;
    return;
  }

  // Same dynamic-import-with-a-variable-specifier trick as
  // preview.service.ts's defaultContainerFactory: keeps ts-jest/tsc's static
  // module resolver from choking on Astro's exports map, while Node's ESM
  // resolver (which DOES read package.json `exports`) still finds it at
  // runtime. This is plain Node ESM already, so the `@vite-ignore` comment is
  // cargo-culted from that file for exact parity of the call shape, not
  // because Vite processes this script.
  let container;
  try {
    const specifier = 'astro/container';
    const { experimental_AstroContainer } = /** @type {{ experimental_AstroContainer: { create(): Promise<{ renderToString(component: unknown, opts?: { props?: Record<string, unknown> }): Promise<string> }> } }} */ (
      await import(/* @vite-ignore */ specifier)
    );
    container = await experimental_AstroContainer.create();
  } catch (err) {
    console.error(
      `✗ render-probe: failed to create Astro container: ${err.message}`,
    );
    process.exitCode = 1;
    return;
  }

  let html;
  try {
    html = await container.renderToString(Component, { props });
  } catch (err) {
    console.error(
      `✗ render-probe: render failed for "${theme}/${blockName}": ${err.stack ?? err.message}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(html);
}

main().catch((err) => {
  console.error(
    `✗ render-probe: unexpected error: ${err?.stack ?? err?.message ?? err}`,
  );
  process.exitCode = 1;
});
