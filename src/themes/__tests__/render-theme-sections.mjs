#!/usr/bin/env node
/**
 * Дочерний рендерер секций темы для снимков HTML.
 *
 * jest (CJS, без --experimental-vm-modules) не умеет загружать скомпилированные
 * ESM-модули секций и рантайм astro в своём процессе, поэтому spec запускает
 * этот скрипт. Рендерим РОВНО тот модуль, который тема отдаёт на витрину и в
 * превью (dist/theme-sections/<тема>/manifest.json), а не исходный текст и не
 * theme-base.
 *
 * Использование: node render-theme-sections.mjs <тема> '<[{block, props}, …]>'
 * На stdout — JSON-массив { block, html } (или { block, error }).
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITES_ROOT = resolve(__dirname, '..', '..', '..');

async function main() {
  const theme = process.argv[2];
  const jobs = JSON.parse(process.argv[3] ?? '[]');
  const dist = resolve(SITES_ROOT, 'dist', 'theme-sections', theme);
  const manifest = JSON.parse(readFileSync(resolve(dist, 'manifest.json'), 'utf-8'));
  const { experimental_AstroContainer } = await import('astro/container');
  const container = await experimental_AstroContainer.create();
  const out = [];
  for (const { block, props } of jobs) {
    const flat = manifest[block];
    if (!flat) {
      out.push({ block, missing: true });
      continue;
    }
    try {
      const mod = await import(resolve(dist, flat));
      out.push({ block, html: await container.renderToString(mod.default, { props }) });
    } catch (err) {
      out.push({ block, error: String(err?.message ?? err).slice(0, 300) });
    }
  }
  process.stdout.write(JSON.stringify(out));
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err));
  process.exit(1);
});
