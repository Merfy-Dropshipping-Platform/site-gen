#!/usr/bin/env node
/**
 * Панель секции глазами конструктора: поля + значения, которые он подставит,
 * когда мерчант ничего не выбирал.
 *
 * Зачем отдельный файл, а не расширение puck-config-fields.mjs: тот отдаёт
 * ТОЛЬКО имена полей и его читает проверка «глаза» (hidden-named-fields).
 * Менять его форму значило бы чинить два теста одной правкой.
 *
 * Зачем дочерний процесс. `getPuckConfig` дёргает СКОМПИЛИРОВАННЫЙ контроллер,
 * а тот подтягивает ESM-модули блоков из dist/astro-blocks. jest (CJS, без
 * --experimental-vm-modules) на них падает с «Unexpected token 'export'» — та же
 * причина, по которой секции рендерятся через render-theme-sections.mjs.
 *
 * Зачем брать конфиг ТЕМЫ, а не theme-base: у тем бывают СОБСТВЕННЫЕ
 * puckConfig (у satin их одиннадцать), и resolveBlocks подставляет пакет темы
 * ЦЕЛИКОМ. Считать по theme-base значило бы проверять satin чужой панелью.
 *
 * Использование: node puck-config-panel.mjs <тема>
 * На stdout — JSON { "<Блок>": { "<поле>": { type, hasDefault, value } } }.
 * hasDefault=false означает «контрол в панели не стоит ни на чём»: пустая
 * строка считается отсутствием значения (OrderConfirmation.colorScheme: '').
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
    const defaults = (def?.defaultProps ?? {});
    const fields = {};
    for (const [name, field] of Object.entries(def?.fields ?? {})) {
      const value = defaults[name];
      fields[name] = {
        type: field?.type ?? null,
        label: field?.label ?? '',
        hasDefault: value !== undefined && value !== null && value !== '',
        value: value === undefined ? null : value,
      };
    }
    out[block] = fields;
  }
  process.stdout.write(JSON.stringify(out));
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err));
  process.exit(1);
});
