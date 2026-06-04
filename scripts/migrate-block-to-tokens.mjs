#!/usr/bin/env node
// scripts/migrate-block-to-tokens.mjs
//
// v2 миграция блока на CSS-токены.
//
// Использование:
//   node scripts/migrate-block-to-tokens.mjs --block=Header --theme=rose --dry-run
//   node scripts/migrate-block-to-tokens.mjs --block=Header --theme=rose --apply
//
// При --apply:
//   0) Снимок «до» (HTML + PNG в snapshots/)
//   1) Бэкапы всех изменяемых файлов (.bak.<метка>)
//   2) Добавить токены в registry.ts
//   3) Добавить запасные значения в base-defaults.ts
//   4) Переписать base/<Блок>.classes.ts (литералы → var(--токен))
//   5) Добавить значения в theme-<тема>/theme.json defaults
//   6) Удалить theme-<тема>/blocks/<Блок>/Header.classes.ts и Header.tokens.ts
//   7) При сбое — откатить из бэкапов

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  addTokensToRegistry,
  addDefaultsToBaseDefaults,
  addTokensToThemeJson,
} from './lib/registry-edit.mjs';
import { computeReplacements } from './lib/rewrite-base-classes.mjs';
import { rewriteClassesFile } from './lib/classes-ts.mjs';
import { captureBlockSnapshot } from './lib/snapshot-container.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITES_ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const out = { block: null, theme: null, dryRun: false, apply: false };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--block=')) out.block = a.slice('--block='.length);
    else if (a.startsWith('--theme=')) out.theme = a.slice('--theme='.length);
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--apply') out.apply = true;
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
  }
  if (!out.block || !out.theme) {
    console.error('Использование: --block=<Имя> --theme=<имя> [--dry-run | --apply]');
    printHelp();
    process.exit(2);
  }
  if (!out.dryRun && !out.apply) {
    console.error('Нужен флаг --dry-run или --apply');
    process.exit(2);
  }
  return out;
}

function printHelp() {
  console.log(`
Миграция блока на CSS-токены v2

  --block=<Имя>   Имя блока
  --theme=<имя>   Имя темы
  --dry-run       Показать что бы сделалось без записи
  --apply         Применить миграцию (со снимком «до»)
  -h, --help      Помощь
`);
}

async function main() {
  const { block, theme, dryRun, apply } = parseArgs(process.argv);

  console.log(`# Миграция блока ${block} → тема ${theme}\n`);
  console.log(`Режим: ${apply ? 'APPLY (запись + снимок до)' : 'DRY-RUN (только показать)'}\n`);

  const paths = computePaths(block, theme);

  // Прочитать каталог
  let catalog;
  try {
    catalog = JSON.parse(await fs.readFile(paths.catalogFile, 'utf-8'));
  } catch (err) {
    console.error(`✗ Не найден каталог ${path.relative(SITES_ROOT, paths.catalogFile)}. Запусти сначала catalog-block-aspects.mjs.`);
    process.exit(1);
  }

  if (!catalog.tokensSuggested || catalog.tokensSuggested.length === 0) {
    console.log('✓ Нет токенов для миграции (каталог пуст). Ничего не делаю.');
    return;
  }

  console.log(`Каталог: ${catalog.tokensSuggested.length} токенов, ${catalog.elementsFound} элементов`);
  console.log(`Источник: ${catalog.source}\n`);

  // Прочитать все изменяемые файлы
  const [registrySrc, baseDefaultsSrc, baseClassesSrc, themeJsonSrc] = await Promise.all([
    fs.readFile(paths.registry, 'utf-8'),
    fs.readFile(paths.baseDefaults, 'utf-8'),
    fs.readFile(paths.baseClasses, 'utf-8'),
    fs.readFile(paths.themeJson, 'utf-8'),
  ]);

  // ─ Шаг 2: registry.ts — добавить токены
  const tokensForRegistry = catalog.tokensSuggested.map((t) => ({
    name: t.name,
    category: inferCategory(t.property),
    unit: inferUnit(t.themeValue),
    scope: 'theme',
  }));
  const reg = addTokensToRegistry(registrySrc, tokensForRegistry);

  // ─ Шаг 3: base-defaults.ts — добавить запасные значения
  const tokensForDefaults = catalog.tokensSuggested.map((t) => ({
    name: t.name,
    value: t.fallback,
  }));
  const def = addDefaultsToBaseDefaults(baseDefaultsSrc, tokensForDefaults);

  // ─ Шаг 4: base/<Блок>.classes.ts — переписать литералы
  const { replacements, summary: replSummary } = computeReplacements(
    baseClassesSrc,
    `${block}Classes`,
    catalog.tokensSuggested,
  );
  const baseClassRewrite = rewriteClassesFile(baseClassesSrc, `${block}Classes`, replacements);

  // ─ Шаг 5: theme-<тема>/theme.json — добавить значения отличающиеся от fallback
  const tokensForTheme = catalog.tokensSuggested
    .filter((t) => t.themeValue && t.themeValue !== t.fallback)
    .map((t) => ({ name: t.name, value: t.themeValue }));
  const themeJsonUpdate = addTokensToThemeJson(themeJsonSrc, tokensForTheme);

  // ─ Шаг 6: что удалить
  const filesToDelete = [];
  for (const filename of [`${block}.classes.ts`, `${block}.tokens.ts`]) {
    const p = path.join(paths.themeBlockDir, filename);
    try {
      await fs.access(p);
      filesToDelete.push(p);
    } catch { /* not exists */ }
  }

  // ─── Сводка ───
  console.log('Сводка изменений:');
  console.log(`  registry.ts        → +${reg.addedCount} токенов`);
  console.log(`  base-defaults.ts   → +${def.addedCount} значений`);
  console.log(`  base/${block}.classes.ts → ${replSummary.elementsTouched} элементов, ` +
    `${replSummary.utilitiesReplaced} замен, ${replSummary.utilitiesAdded} добавлений`);
  console.log(`  theme.json defaults → +${themeJsonUpdate.addedCount} значений`);
  console.log(`  Файлов к удалению  → ${filesToDelete.length}`);
  for (const f of filesToDelete) {
    console.log(`     - ${path.relative(SITES_ROOT, f)}`);
  }

  if (dryRun) {
    console.log('\n--dry-run: записи не выполнены.');
    return;
  }

  // ── APPLY ──
  // Шаг 0: снимок «до» через настоящий Astro Container API
  console.log('\n→ Снимок «до миграции» (Astro Container + Playwright)...');
  await ensureSnapshotsDir(paths.snapshotsDir);
  try {
    const snap = await captureBlockSnapshot({
      blockName: block,
      themeId: theme,
      themeJsonPath: paths.themeJson,
      baseDefaultsPath: paths.baseDefaults,
      puckConfigPath: paths.puckConfig,
      htmlPath: paths.beforeHtml,
      pngPath: paths.beforePng,
      selector: '[data-header-wrapper]',
      viewport: { width: 1440, height: 200 },
    });
    console.log(`  HTML → ${path.relative(SITES_ROOT, paths.beforeHtml)} (${snap.htmlBytes} байт)`);
    console.log(`  PNG  → ${path.relative(SITES_ROOT, paths.beforePng)} (${snap.pngBytes} байт)`);
  } catch (err) {
    console.error(`✗ Не удалось сделать снимок «до»: ${err.message}`);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }

  // Шаг 1: бэкапы
  const stamp = Date.now();
  const backupSuffix = `.bak.${stamp}`;
  const backups = [];

  async function backup(filePath) {
    const bak = `${filePath}${backupSuffix}`;
    await fs.copyFile(filePath, bak);
    backups.push({ original: filePath, backup: bak });
    return bak;
  }

  async function restoreAll() {
    console.error('  → Откатываю изменения из бэкапов...');
    for (const { original, backup: bak } of backups) {
      try {
        await fs.copyFile(bak, original);
      } catch (err) {
        console.error(`    ✗ Не смог восстановить ${original}: ${err.message}`);
      }
    }
  }

  try {
    console.log('\n→ Бэкапы...');
    await backup(paths.registry);
    await backup(paths.baseDefaults);
    await backup(paths.baseClasses);
    await backup(paths.themeJson);
    console.log(`  Создано ${backups.length} бэкапов (.bak.${stamp})`);

    console.log('\n→ Запись изменений...');
    await fs.writeFile(paths.registry, reg.text, 'utf-8');
    console.log(`  ✓ ${path.relative(SITES_ROOT, paths.registry)}`);

    await fs.writeFile(paths.baseDefaults, def.text, 'utf-8');
    console.log(`  ✓ ${path.relative(SITES_ROOT, paths.baseDefaults)}`);

    await fs.writeFile(paths.baseClasses, baseClassRewrite.text, 'utf-8');
    console.log(`  ✓ ${path.relative(SITES_ROOT, paths.baseClasses)}`);

    await fs.writeFile(paths.themeJson, themeJsonUpdate.text, 'utf-8');
    console.log(`  ✓ ${path.relative(SITES_ROOT, paths.themeJson)}`);

    for (const f of filesToDelete) {
      await backup(f);
      await fs.unlink(f);
      console.log(`  ✓ удалён ${path.relative(SITES_ROOT, f)}`);
    }

    console.log('\n✓ Миграция применена. Запусти приёмку:');
    console.log(`    node scripts/validate-token-completeness.mjs --block=${block} --theme=${theme}`);
  } catch (err) {
    console.error(`\n✗ Ошибка при записи: ${err.message}`);
    await restoreAll();
    process.exit(1);
  }
}

function computePaths(block, theme) {
  return {
    blockAstro:       path.join(SITES_ROOT, 'packages/theme-base/blocks', block, `${block}.astro`),
    baseClasses:      path.join(SITES_ROOT, 'packages/theme-base/blocks', block, `${block}.classes.ts`),
    puckConfig:       path.join(SITES_ROOT, 'packages/theme-base/blocks', block, `${block}.puckConfig.ts`),
    registry:         path.join(SITES_ROOT, 'packages/theme-contract/tokens/registry.ts'),
    baseDefaults:     path.join(SITES_ROOT, 'packages/theme-contract/tokens/base-defaults.ts'),
    themeJson:        path.join(SITES_ROOT, `packages/theme-${theme}/theme.json`),
    themeBlockDir:    path.join(SITES_ROOT, `packages/theme-${theme}/blocks`, block),
    catalogFile:      path.join(SITES_ROOT, 'packages/theme-contract/tokens/catalog', `${block}.json`),
    snapshotsDir:     path.join(SITES_ROOT, 'packages/theme-contract/tokens/snapshots'),
    beforeHtml:       path.join(SITES_ROOT, 'packages/theme-contract/tokens/snapshots', `${block}-${theme}.before.html`),
    beforePng:        path.join(SITES_ROOT, 'packages/theme-contract/tokens/snapshots', `${block}-${theme}.before.png`),
  };
}

async function ensureSnapshotsDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function inferCategory(property) {
  if (property === 'color' || property.endsWith('-color')) return 'color';
  if (property === 'font-family') return 'font';
  if (property === 'font-weight') return 'weight';
  if (property === 'font-size' || property === 'letter-spacing') return 'size';
  if (property === 'border-radius') return 'radius';
  if (property.startsWith('padding') || property.startsWith('margin') || property === 'gap') return 'spacing';
  if (property.startsWith('width') || property.startsWith('height')
      || property === 'max-width' || property === 'min-width'
      || property === 'max-height' || property === 'min-height') return 'size';
  return 'size';
}

function inferUnit(value) {
  if (!value) return undefined;
  if (/^[\d.]+px$/.test(value)) return 'px';
  if (/^[\d.]+rem$/.test(value)) return 'rem';
  if (/^[\d.]+%$/.test(value)) return '%';
  return undefined;
}

main().catch((err) => {
  console.error('\n✗ Ошибка:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
