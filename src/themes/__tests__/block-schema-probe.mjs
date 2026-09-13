#!/usr/bin/env node
/**
 * Разбор пропсов секции её СОБСТВЕННОЙ zod-схемой — тем самым скомпилированным
 * модулем, который уходит в рантайм (dist/astro-blocks/…puckConfig.mjs).
 *
 * Зачем. Ограничение в схеме — это не «настройка», а приговор: `safeParse`
 * либо принимает ревизию мерчанта, либо отбраковывает её целиком. Разница
 * между «лишние плитки не рисуются» и «секция умерла» видна только замером,
 * поэтому проверяем разбор напрямую, а не по исходнику.
 *
 * Зачем дочерний процесс. Скомпилированные блоки — ESM, jest (CJS, без
 * --experimental-vm-modules) падает на них с «Unexpected token 'export'»;
 * та же причина, что у соседних puck-config-*.mjs.
 *
 * Использование:
 *   node block-schema-probe.mjs <Блок> '<json-пропсов>'
 * На stdout — JSON { success, issues, items } (items = длина items[] после
 * разбора, если поле есть).
 *
 * Требует `pnpm build:blocks`.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SITES_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

async function main() {
  const block = process.argv[2];
  const props = JSON.parse(process.argv[3] ?? "{}");
  const modPath = resolve(
    SITES_ROOT,
    "dist",
    "astro-blocks",
    `theme-base__${block}__${block}.puckConfig.mjs`,
  );
  const mod = await import(pathToFileURL(modPath).href);
  const schema = mod[`${block}Schema`];
  if (!schema) throw new Error(`нет экспорта ${block}Schema в ${modPath}`);
  const res = schema.safeParse(props);
  process.stdout.write(
    JSON.stringify({
      success: res.success,
      issues: res.success ? [] : res.error.issues.map((i) => i.message),
      items:
        res.success && Array.isArray(res.data?.items)
          ? res.data.items.length
          : null,
    }),
  );
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err));
  process.exit(1);
});
