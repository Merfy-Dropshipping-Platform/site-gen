#!/usr/bin/env node
/**
 * Сырой puck-config темы — ровно то, что конструктор получает по
 * `GET /api/themes/:id/puck-config`.
 *
 * Зачем ещё один дампер рядом с puck-config-fields.mjs (только имена полей) и
 * puck-config-panel.mjs (поля + дефолты): обоим не видны ОПЦИИ селектов и
 * поля верхнего уровня ответа (`defaultScheme`, `colorSchemes`). Менять их
 * форму значило бы чинить два чужих теста одной правкой.
 *
 * Зачем дочерний процесс: контроллер тянет ESM-модули блоков из
 * dist/astro-blocks, а jest (CJS) на них падает — та же причина, что у
 * соседних *.mjs-хелперов.
 *
 * Использование: node puck-config-raw.mjs <тема>  → JSON на stdout.
 */
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITES_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

async function main() {
  const theme = process.argv[2];
  const require = createRequire(import.meta.url);
  const compiled = resolve(
    SITES_ROOT,
    'dist',
    'src',
    'controllers',
    'theme-puck-config.controller.js',
  );
  const mod = require(compiled);
  const controller = new mod.ThemePuckConfigController();
  const cfg = await controller.getPuckConfig(theme);
  process.stdout.write(JSON.stringify(cfg));
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err));
  process.exit(1);
});
