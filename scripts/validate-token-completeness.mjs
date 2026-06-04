#!/usr/bin/env node
// scripts/validate-token-completeness.mjs
//
// v2 приёмка миграции через 5 проверок и снимки до/после.
//
// Использование:
//   node scripts/validate-token-completeness.mjs --block=Header --theme=rose

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { captureBlockSnapshot } from './lib/snapshot-container.mjs';
import {
  checkClassesPreserved,
  checkTokensApplied,
  checkPseudoStates,
  checkHtmlStructure,
  checkVisualMatch,
} from './lib/validation-checks.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITES_ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const out = { block: null, theme: null };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--block=')) out.block = a.slice('--block='.length);
    else if (a.startsWith('--theme=')) out.theme = a.slice('--theme='.length);
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
  }
  if (!out.block || !out.theme) {
    console.error('Использование: --block=<Имя> --theme=<имя>');
    printHelp();
    process.exit(2);
  }
  return out;
}

function printHelp() {
  console.log(`
Приёмка миграции на токены v2

  --block=<Имя>   Имя блока
  --theme=<имя>   Имя темы
  -h, --help      Помощь
`);
}

async function main() {
  const { block, theme } = parseArgs(process.argv);

  const paths = computePaths(block, theme);

  // Снимок «до» должен уже существовать (создан скриптом миграции)
  try {
    await fs.access(paths.beforeHtml);
    await fs.access(paths.beforePng);
  } catch {
    console.error(`✗ Снимок «до» не найден: ${path.relative(SITES_ROOT, paths.beforeHtml)}`);
    console.error('Сначала запусти миграцию: node scripts/migrate-block-to-tokens.mjs --apply');
    process.exit(1);
  }

  console.log(`# Приёмка ${block} ${theme}\n`);

  // ─ Шаг 0: снимок «после» через настоящий Astro Container API
  console.log('→ Снимок «после миграции» (Astro Container + Playwright)...');
  let afterHtml;
  try {
    const snap = await captureBlockSnapshot({
      blockName: block,
      themeId: theme,
      themeJsonPath: paths.themeJson,
      baseDefaultsPath: paths.baseDefaults,
      puckConfigPath: paths.puckConfig,
      htmlPath: paths.afterHtml,
      pngPath: paths.afterPng,
      selector: '[data-header-wrapper]',
      viewport: { width: 1440, height: 200 },
    });
    afterHtml = snap.html;
    console.log(`  HTML → ${path.relative(SITES_ROOT, paths.afterHtml)} (${snap.htmlBytes} байт)`);
    console.log(`  PNG  → ${path.relative(SITES_ROOT, paths.afterPng)} (${snap.pngBytes} байт)`);
  } catch (err) {
    console.error(`✗ Не удалось сделать снимок «после»: ${err.message}`);
    process.exit(1);
  }

  // ─ Шаг 1: сравнение классов
  const beforeHtml = await fs.readFile(paths.beforeHtml, 'utf-8');
  const c1 = checkClassesPreserved(beforeHtml, afterHtml);

  // ─ Шаг 2: токены применены
  const baseClasses = await fs.readFile(paths.baseClasses, 'utf-8');
  const themeJsonText = await fs.readFile(paths.themeJson, 'utf-8');
  const baseDefaultsText = await fs.readFile(paths.baseDefaults, 'utf-8');
  const c2 = checkTokensApplied(baseClasses, `${block}Classes`, themeJsonText, baseDefaultsText);

  // ─ Шаг 3: псевдо-состояния
  const sourceAstro = await fs.readFile(paths.sourceAstro, 'utf-8').catch(() => '');
  const c3 = sourceAstro
    ? checkPseudoStates(sourceAstro, baseClasses, `${block}Classes`)
    : { ok: true, totalStates: 0, missing: [], skipped: true };

  // ─ Шаг 4: структура HTML
  const c4 = checkHtmlStructure(beforeHtml, afterHtml);

  // ─ Шаг 5: визуально
  const c5 = await checkVisualMatch(paths.beforePng, paths.afterPng, { threshold: 0.01 });

  // ─── Отчёт ───
  console.log(`\n=== Приёмка ${block} ${theme} ===`);
  console.log(`1. Сравнение классов        ${formatStatus(c1.ok)} ${formatClassesLine(c1)}`);
  console.log(`2. Токены применены         ${formatStatus(c2.ok)} ${formatTokensLine(c2)}`);
  console.log(`3. Псевдо-состояния         ${formatStatus(c3.ok)} ${formatPseudoLine(c3)}`);
  console.log(`4. Структура HTML           ${formatStatus(c4.ok)} ${formatStructureLine(c4)}`);
  console.log(`5. Визуальное сравнение     ${formatStatus(c5.ok)} ${formatVisualLine(c5)}`);
  const allOk = c1.ok && c2.ok && c3.ok && c4.ok && c5.ok;
  console.log(`Итог: ${allOk ? '✓ ПРИНЯТО' : '✗ ОТКАТ'}`);

  if (!allOk) {
    console.log('\nДетали провалов:');
    if (!c1.ok) {
      console.log(`  Потерянные классы (${c1.lost.length}):`);
      for (const cls of c1.lost.slice(0, 20)) console.log(`    - ${cls}`);
      if (c1.lost.length > 20) console.log(`    ... и ещё ${c1.lost.length - 20}`);
    }
    if (!c2.ok) {
      console.log(`  Неопределённые токены (${c2.undefined.length}):`);
      for (const t of c2.undefined) console.log(`    - ${t}`);
    }
    if (!c3.ok) {
      console.log(`  Потерянные псевдо-состояния (${c3.missing.length}):`);
      for (const m of c3.missing) console.log(`    - ${m}`);
    }
    if (!c4.ok) {
      console.log(`  Различия структуры (${c4.differences.length}):`);
      for (const d of c4.differences) console.log(`    - ${d}`);
    }
    if (!c5.ok) {
      console.log(`  Визуально: ${c5.error || `${c5.diffPct?.toFixed(2)}% > порога ${c5.threshold}%`}`);
    }
    process.exit(1);
  }
}

function computePaths(block, theme) {
  return {
    blockAstro:       path.join(SITES_ROOT, 'packages/theme-base/blocks', block, `${block}.astro`),
    baseClasses:      path.join(SITES_ROOT, 'packages/theme-base/blocks', block, `${block}.classes.ts`),
    puckConfig:       path.join(SITES_ROOT, 'packages/theme-base/blocks', block, `${block}.puckConfig.ts`),
    baseDefaults:     path.join(SITES_ROOT, 'packages/theme-contract/tokens/base-defaults.ts'),
    themeJson:        path.join(SITES_ROOT, `packages/theme-${theme}/theme.json`),
    sourceAstro:      path.join(SITES_ROOT, `packages/theme-contract/tokens/sources/${theme}-${block}.astro`),
    beforeHtml:       path.join(SITES_ROOT, `packages/theme-contract/tokens/snapshots/${block}-${theme}.before.html`),
    beforePng:        path.join(SITES_ROOT, `packages/theme-contract/tokens/snapshots/${block}-${theme}.before.png`),
    afterHtml:        path.join(SITES_ROOT, `packages/theme-contract/tokens/snapshots/${block}-${theme}.after.html`),
    afterPng:         path.join(SITES_ROOT, `packages/theme-contract/tokens/snapshots/${block}-${theme}.after.png`),
  };
}

function formatStatus(ok) { return ok ? '✓' : '✗'; }

function formatClassesLine(c) {
  if (c.ok) return `потерянных нет (было ${c.beforeCount}, стало ${c.afterCount})`;
  return `потеряно ${c.lost.length} из ${c.beforeCount}`;
}

function formatTokensLine(c) {
  if (c.ok) return `все ${c.totalTokens}`;
  return `undefined: ${c.undefined.length} из ${c.totalTokens}`;
}

function formatPseudoLine(c) {
  if (c.skipped) return `(источник недоступен)`;
  if (c.ok) return `все ${c.totalStates}`;
  return `потеряно ${c.missing.length} из ${c.totalStates}`;
}

function formatStructureLine(c) {
  if (c.ok) return `идентична`;
  return `${c.differences.length} различий`;
}

function formatVisualLine(c) {
  if (c.error) return `error: ${c.error}`;
  return `${c.diffPct?.toFixed(2)}% (порог ${c.threshold}%)`;
}

main().catch((err) => {
  console.error('\n✗ Ошибка:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
