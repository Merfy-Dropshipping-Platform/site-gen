#!/usr/bin/env node
/**
 * Выгрузка поля «Отступы» из ТОГО ЖЕ скомпилированного контроллера, который
 * отдаёт конфиг конструктору (GET /api/themes/:id/puck-config), по всем пяти
 * темам.
 *
 * Зачем дочерний процесс — причина та же, что у panel-canon.mjs: контроллер
 * тянет ESM-модули блоков из dist/astro-blocks, а jest (CJS, без
 * --experimental-vm-modules) падает на них с «Unexpected token 'export'».
 *
 * Почему берём конфиг ТЕМЫ, а не theme-base: resolveBlocks подставляет пакет
 * темы целиком (у satin одиннадцать собственных puckConfig). Считать по
 * theme-base значило бы сторожить темы чужой панелью.
 *
 * Вывод: { "<тема>": { "<Блок>": <описание поля padding> } }. Блоки без поля
 * отступов в вывод не попадают.
 *
 * Требует собранного dist: pnpm build && pnpm build:blocks.
 */
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SITES_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"];

async function main() {
  const require = createRequire(import.meta.url);
  const mod = require(
    resolve(SITES_ROOT, "dist", "src", "controllers", "theme-puck-config.controller.js"),
  );
  const controller = new mod.ThemePuckConfigController();
  const out = {};
  for (const theme of THEMES) {
    const cfg = await controller.getPuckConfig(theme);
    const blocks = {};
    for (const [name, def] of Object.entries(cfg.components ?? {})) {
      const field = def?.fields?.padding;
      if (!field) continue;
      blocks[name] = field;
    }
    out[theme] = blocks;
  }
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err));
  process.exit(1);
});
