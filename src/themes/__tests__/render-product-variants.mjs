#!/usr/bin/env node
/**
 * Дочерний рендерер блока выбора вариантов (theme-base ProductVariants).
 *
 * jest не умеет импортировать скомпилированный ESM-артефакт в своём процессе,
 * поэтому spec запускает этот скрипт. Рендерим РОВНО тот модуль, который уходит
 * в превью и на витрину (dist/astro-blocks/theme-base__Product__ProductVariants.mjs),
 * а не исходный текст.
 *
 * Использование: node render-product-variants.mjs '<props JSON>'
 * На stdout — JSON { html } (или { error }).
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITES_ROOT = resolve(__dirname, '..', '..', '..');
const COMPILED = resolve(
  SITES_ROOT,
  'dist',
  'astro-blocks',
  'theme-base__Product__ProductVariants.mjs',
);

async function main() {
  const props = JSON.parse(process.argv[2] ?? '{}');
  try {
    const { experimental_AstroContainer } = await import('astro/container');
    const container = await experimental_AstroContainer.create();
    const mod = await import(pathToFileURL(COMPILED).href);
    const html = await container.renderToString(mod.default, { props });
    process.stdout.write(JSON.stringify({ html }));
  } catch (err) {
    process.stdout.write(JSON.stringify({ error: String(err?.message ?? err).slice(0, 300) }));
  }
}

main();
