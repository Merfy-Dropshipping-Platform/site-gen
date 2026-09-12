#!/usr/bin/env node
/**
 * Поля рабочего puck-config темы — тем же путём, каким его получает конструктор.
 *
 * Зачем дочерний процесс. `loadRuntimePuckConfig` дёргает СКОМПИЛИРОВАННЫЙ
 * контроллер, а тот подтягивает ESM-модули блоков из dist/astro-blocks. jest
 * (CJS, без --experimental-vm-modules) на них падает с «Unexpected token
 * 'export'» — ровно та же причина, по которой секции рендерятся через
 * render-theme-sections.mjs, а не в процессе теста.
 *
 * Зачем вообще. У тем бывают СОБСТВЕННЫЕ puckConfig: satin переопределяет
 * десять блоков (theme.json → blocks.<X>.override), и resolveBlocks берёт его
 * пакет ЦЕЛИКОМ вместо theme-base. Считать набор полей по theme-base значило бы
 * проверять satin чужим конфигом.
 *
 * Использование: node puck-config-fields.mjs <тема>
 * На stdout — JSON { "<Блок>": ["<поле>", …] } по всем компонентам конфига.
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
  const out = {};
  for (const [block, def] of Object.entries(cfg.components ?? {})) {
    out[block] = Object.keys(def?.fields ?? {});
  }
  process.stdout.write(JSON.stringify(out));
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err));
  process.exit(1);
});
