#!/usr/bin/env node
// scripts/catalog-block-aspects.mjs
//
// v2 каталог аспектов блока: сравнение «текущая база» vs «github источник темы».
//
// Использование:
//   node scripts/catalog-block-aspects.mjs --block=Header --theme=rose
//   node scripts/catalog-block-aspects.mjs --block=Header --theme=rose --refresh-source
//
// Что делает:
//   1) Получает источник стилей через `gh api` (кэшируется в sources/)
//   2) Парсит current base (theme-base/blocks/<Блок>/) и github источник
//   3) Раскладывает классы по элементам через семантические маркеры
//   4) Классифицирует утилиты в (свойство, состояние, брейкпоинт, значение)
//   5) Сравнивает значения base vs source
//   6) Фильтрует структурные и глобальные значения
//   7) Предлагает токены для расхождений
//   8) Сохраняет каталог в packages/theme-contract/tokens/catalog/<Блок>.json

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getThemeSource } from './lib/github-source.mjs';
import {
  parseAstroFile,
  BLOCK_ELEMENT_SELECTORS,
  flattenClasses as flattenAstroClasses,
} from './lib/astro-parse.mjs';
import { extractClassesObject, flattenClasses as flattenCT } from './lib/classes-ts.mjs';
import {
  classifyUtility,
  isStructural,
  isGlobalToken,
  shouldFilterAsSchemeColor,
  isStructuralDimension,
} from './lib/utility-classify.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITES_ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const out = { block: null, theme: null, refresh: false };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--block=')) out.block = a.slice('--block='.length);
    else if (a.startsWith('--theme=')) out.theme = a.slice('--theme='.length);
    else if (a === '--refresh-source') out.refresh = true;
    else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
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
Каталог аспектов блока v2

  --block=<Имя>        Имя блока (Header, Footer, ...)
  --theme=<имя>        Имя темы (rose, satin, ...)
  --refresh-source     Перекачать источник из github игнорируя кэш
  -h, --help           Помощь
`);
}

async function main() {
  const { block, theme, refresh } = parseArgs(process.argv);
  console.log(`# Каталог блока ${block} (тема ${theme})\n`);

  const baseAstroPath = path.join(SITES_ROOT, 'packages/theme-base/blocks', block, `${block}.astro`);
  const baseClassesPath = path.join(SITES_ROOT, 'packages/theme-base/blocks', block, `${block}.classes.ts`);
  const sourcesDir = path.join(SITES_ROOT, 'packages/theme-contract/tokens/sources');
  const catalogDir = path.join(SITES_ROOT, 'packages/theme-contract/tokens/catalog');

  const [baseAstro, baseClasses] = await Promise.all([
    fs.readFile(baseAstroPath, 'utf-8'),
    fs.readFile(baseClassesPath, 'utf-8'),
  ]);

  console.log(`→ Получение источника ${theme}-theme:src/components/${block}.astro...`);
  const { source, fetchedAt, cached, sourceUrl } = await getThemeSource({
    theme,
    block,
    sourcesDir,
    refresh,
  });
  console.log(`  ${cached ? '(кэш)' : '(скачано)'} ${fetchedAt}`);

  const selectors = BLOCK_ELEMENT_SELECTORS[block];

  console.log(`→ Парсинг базы и источника...`);
  const baseParsed = await parseAstroFile(baseAstro, { selectors, blockName: block });
  const sourceParsed = await parseAstroFile(source, { selectors, blockName: block });

  // Также берём значения из base classes (там захардкожены значения через var(...))
  const baseClassesObj = extractClassesObject(baseClasses, `${block}Classes`);
  const baseFlat = flattenCT(baseClassesObj);

  // Получаем все «обнаруженные» классы по элементам в источнике (источник
  // содержит сырые Tailwind утилиты — оттуда и берём «правду» темы)
  const sourceClassesByElement = {};
  for (const sel of selectors) {
    const node = sourceParsed.classMap[sel.key];
    const allTokens = node && node.found ? flattenAstroClasses(node) : [];
    sourceClassesByElement[sel.key] = allTokens;
  }

  // Берём классы базы из base classes.ts (там var(...))
  const baseClassesByElement = {};
  for (const sel of selectors) {
    const cls = baseFlat[sel.key];
    if (cls) {
      baseClassesByElement[sel.key] = cls.split(/\s+/).filter(Boolean);
    } else {
      // fallback: из AST (.astro)
      const node = baseParsed.classMap[sel.key];
      baseClassesByElement[sel.key] = node && node.found ? flattenAstroClasses(node) : [];
    }
  }

  console.log(`→ Анализ аспектов по элементам...`);
  const elementsAnalysis = {};
  const tokensSuggested = [];
  const tokensFilteredList = [];
  let elementsFound = 0;

  for (const sel of selectors) {
    const baseTokens = baseClassesByElement[sel.key] || [];
    const sourceTokens = sourceClassesByElement[sel.key] || [];
    if (sourceTokens.length === 0 && baseTokens.length === 0) continue;
    elementsFound++;

    const baseMap = classifyTokens(baseTokens);
    const sourceMap = classifyTokens(sourceTokens);

    const allKeys = new Set([...Object.keys(baseMap), ...Object.keys(sourceMap)]);
    const aspects = {};

    for (const key of allKeys) {
      const baseVal = baseMap[key];
      const sourceVal = sourceMap[key];

      // Не отличаются — пропустить
      if (baseVal === sourceVal) continue;

      // Если значение source структурное — пропустить (нечего токенизировать)
      if (sourceVal && isStructural(sourceVal)) continue;

      // Если значение source уже глобальная переменная — пропустить
      if (sourceVal && isGlobalToken(sourceVal)) continue;

      // Если только base есть (а в source нет) — пропустить
      if (!sourceVal) continue;

      // Имя токена + property/state/breakpoint
      const [property, state, breakpoint] = key.split('|');
      const tokenName = buildTokenName(block, sel.key, property, state, breakpoint);

      // ── Доработка D: scheme-driven цвет в базе vs литерал в источнике ──
      // Если база использует rgb(var(--color-*)) и источник — литерал (#000,
      // rgb(...), white) — НЕ создаём токен. Это архитектурно правильно
      // решается через colorSchemes темы, не через захардкоженный токен.
      if (shouldFilterAsSchemeColor(property, baseVal, sourceVal)) {
        tokensFilteredList.push({
          name: tokenName,
          reason: `local color in source overrides scheme-driven base — kept base scheme`,
          base: baseVal,
          source: sourceVal,
        });
        continue;
      }

      // ── Доработка E (правило 1+2): структурный dimension или text-align ──
      // Если значение source — структурное ключевое слово для dimension
      // (width:full, height:auto, max-w:100%) или любое значение text-align —
      // НЕ создаём токен. Это структура лейаута, не визуал.
      if (isStructuralDimension(property, sourceVal)) {
        tokensFilteredList.push({
          name: tokenName,
          reason: `structural dimension or text-align (${property}: ${sourceVal})`,
          base: baseVal || '(нет)',
          source: sourceVal,
        });
        continue;
      }

      aspects[key] = { base: baseVal || '(нет)', source: sourceVal };

      const fallback = baseVal && !isGlobalToken(baseVal) ? sanitizeValue(baseVal) : sanitizeValue(sourceVal);
      const themeValue = sanitizeValue(sourceVal);

      if (isStructural(themeValue) || isGlobalToken(themeValue)) {
        tokensFilteredList.push({ name: tokenName, reason: `structural or global (${themeValue})` });
        continue;
      }

      const existing = tokensSuggested.find((t) => t.name === tokenName);
      if (!existing) {
        tokensSuggested.push({
          name: tokenName,
          fallback,
          themeValue,
          element: sel.key,
          property,
          state: state || null,
          breakpoint: breakpoint || null,
        });
      }
    }

    if (Object.keys(aspects).length > 0) {
      elementsAnalysis[sel.key] = formatAspectsForCatalog(aspects);
    }
  }

  // ── Доработка E (правило 3): collapse дубликатов по брейкпоинтам ──
  // Если для одного (element, property, state) все brakpoint'ы имеют
  // идентичный themeValue — оставляем только базовый (без breakpoint),
  // остальные перемещаем в filtered. Если хоть один различается — оставляем
  // все как есть.
  const { kept: tokensSuggestedCollapsed, filtered: tokensCollapsedFiltered } =
    collapseDuplicateBreakpoints(tokensSuggested);
  for (const f of tokensCollapsedFiltered) {
    tokensFilteredList.push(f);
  }

  const catalog = {
    block,
    theme,
    source: sourceUrl,
    fetchedAt,
    elementsFound,
    tokensProposed: tokensSuggestedCollapsed.length,
    tokensFiltered: tokensFilteredList.length,
    elements: elementsAnalysis,
    tokensSuggested: tokensSuggestedCollapsed,
    tokensFilteredList,
  };

  await fs.mkdir(catalogDir, { recursive: true });
  const outFile = path.join(catalogDir, `${block}.json`);
  await fs.writeFile(outFile, JSON.stringify(catalog, null, 2) + '\n', 'utf-8');

  console.log(`✓ Каталог сохранён: ${path.relative(SITES_ROOT, outFile)}`);
  console.log(`\nСводка:`);
  console.log(`  Элементов найдено:       ${elementsFound}`);
  console.log(`  Токенов предложено:      ${tokensSuggestedCollapsed.length}`);
  console.log(`  Отфильтровано:           ${tokensFilteredList.length}`);

  if (tokensSuggestedCollapsed.length > 0) {
    console.log(`\nТоп-5 расхождений:`);
    const top = tokensSuggestedCollapsed.slice(0, 5);
    for (const t of top) {
      console.log(`  ${t.name}`);
      const baseShown = t.fallback === t.themeValue ? '(нет)' : t.fallback;
      console.log(`      база → ${baseShown}    источник → ${t.themeValue}`);
    }
  }
}

/**
 * Правило 3: схлопывание дубликатов по брейкпоинтам.
 *
 * Если для одной группы (element + property + state) все варианты
 * `breakpoint` (включая null = base) имеют ИДЕНТИЧНЫЙ `themeValue` —
 * оставляем только базовый (breakpoint = null), остальные перемещаем в
 * filtered. Если хоть один различается — оставляем все варианты.
 *
 * @param {Array<Object>} tokens — массив токенов из tokensSuggested
 * @returns {{ kept: Array<Object>, filtered: Array<Object> }}
 */
export function collapseDuplicateBreakpoints(tokens) {
  // Группируем по (element, property, state)
  const groups = new Map();
  for (const t of tokens) {
    const groupKey = `${t.element}|${t.property}|${t.state || ''}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(t);
  }

  const kept = [];
  const filtered = [];

  for (const [, group] of groups) {
    if (group.length === 1) {
      kept.push(group[0]);
      continue;
    }

    // Все ли themeValue идентичны в группе?
    const values = new Set(group.map((t) => t.themeValue));
    if (values.size > 1) {
      // Разные значения — оставляем все
      for (const t of group) kept.push(t);
      continue;
    }

    // Все одинаковые — оставляем токен без breakpoint, остальные в filtered.
    // Если базового (breakpoint === null) нет — берём первый по порядку и
    // делаем из него базовый (убираем breakpoint и пересчитываем имя).
    const baseToken = group.find((t) => !t.breakpoint);
    if (baseToken) {
      kept.push(baseToken);
      for (const t of group) {
        if (t === baseToken) continue;
        filtered.push({
          name: t.name,
          reason: `duplicate of ${baseToken.name} across breakpoints (all = ${t.themeValue})`,
          base: t.fallback,
          source: t.themeValue,
        });
      }
    } else {
      // Базового нет — оставляем все как есть (не схлопываем без базы:
      // там могут быть осмысленные breakpoint'ы например только md/lg).
      // Конкретно — если все sm/md/lg/xl одинаковые, всё равно нужно
      // оставить хотя бы один. Но без базового мы НЕ знаем какой шире
      // покрывает диапазон, поэтому оставляем все.
      for (const t of group) kept.push(t);
    }
  }

  return { kept, filtered };
}

function classifyTokens(tokens) {
  const map = {};
  for (const tok of tokens) {
    if (!tok) continue;
    const c = classifyUtility(tok);
    if (!c) continue;
    const key = `${c.property}|${c.state || ''}|${c.breakpoint || ''}`;
    // Последнее значение выигрывает (упрощённо: должно быть одно)
    map[key] = c.value;
  }
  return map;
}

function buildTokenName(block, element, property, state, breakpoint) {
  const blockK = kebab(block);
  const elementK = kebab(element).replace(/\./g, '-');
  const propK = property;
  const stateK = state ? `-${state}` : '';
  const bpK = breakpoint ? `-${breakpoint}` : '';
  return `--${blockK}-${elementK}-${propK}${stateK}${bpK}`;
}

function kebab(s) {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

function sanitizeValue(v) {
  if (!v) return v;
  // Tailwind именованные → попытка свести к числу (для документа каталога это
  // не критично, но полезно для базовых дефолтов).
  return v;
}

function formatAspectsForCatalog(aspects) {
  const out = {};
  for (const [key, { base, source }] of Object.entries(aspects)) {
    const [property, state, breakpoint] = key.split('|');
    if (!out[property]) out[property] = {};
    const sub = bracketize(state, breakpoint);
    out[property][sub] = { base, source };
  }
  return out;
}

function bracketize(state, breakpoint) {
  const parts = [];
  if (breakpoint) parts.push(breakpoint);
  if (state) parts.push(state);
  return parts.length ? parts.join('.') : 'default';
}

// Гард: запускать main() только когда файл вызван напрямую, а не импортирован
// (например, из тестов). Иначе при `import { collapseDuplicateBreakpoints }`
// main() выполнится с непереданными --block/--theme и упадёт.
const __filename = fileURLToPath(import.meta.url);
const __invoked = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (__invoked) {
  main().catch((err) => {
    console.error('\n✗ Ошибка:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  });
}
