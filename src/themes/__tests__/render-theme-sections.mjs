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
 *
 * job.pkg === 'theme-base' — рендерить ОБЩИЙ блок из dist/astro-blocks вместо
 * порта темы. Нужен блокам, которых нет в sections.map.json, но которые
 * конструктор адресует на странице (CartSummary стоит в pages/cart.json всех
 * пяти тем с собственным puck-id). Без этой ветки такие блоки выпадали из
 * любой проверки: в манифесте темы их нет, значит «missing», значит тест молчал.
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
  const blocksDir = resolve(SITES_ROOT, 'dist', 'astro-blocks');
  let baseBlocks = null;
  const themeBaseEntry = (block) => {
    if (!baseBlocks) {
      try {
        baseBlocks = JSON.parse(readFileSync(resolve(blocksDir, 'manifest.json'), 'utf-8')).blocks ?? [];
      } catch {
        baseBlocks = [];
      }
    }
    return baseBlocks.find((b) => b.pkg === 'theme-base' && b.blockName === block);
  };

  const out = [];
  for (const { block, props, pkg } of jobs) {
    let modPath = null;
    if (pkg === 'theme-base') {
      const entry = themeBaseEntry(block);
      if (entry) modPath = resolve(blocksDir, entry.outputName);
    } else {
      const flat = manifest[block];
      if (flat) modPath = resolve(dist, flat);
    }
    if (!modPath) {
      out.push({ block, missing: true });
      continue;
    }
    try {
      const mod = await import(modPath);
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
