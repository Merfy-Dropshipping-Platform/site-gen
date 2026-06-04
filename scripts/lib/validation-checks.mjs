// Реализация 5 проверок приёмки.
//
// 1) Сравнение классов     — before.html vs after.html, потерянных нет
// 2) Токены применены      — каждый var(--токен) имеет значение
// 3) Псевдо-состояния      — все hover/focus из github источника покрыты
// 4) Структура HTML        — before vs after по тегам/id/data-/aria-
// 5) Визуальное сравнение  — before.png vs after.png через pixelmatch

import { promises as fs } from 'node:fs';
import { parse as parseHtml } from 'node-html-parser';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

import { extractClassesObject, flattenClasses as flattenCT } from './classes-ts.mjs';
import { extractStringLiterals } from './astro-parse.mjs';
import { classifyUtility } from './utility-classify.mjs';

/** Проверка 1: сравнение классов */
export function checkClassesPreserved(beforeHtml, afterHtml) {
  const beforeClasses = extractAllClasses(beforeHtml);
  const afterClasses = extractAllClasses(afterHtml);
  const lost = [];
  for (const cls of beforeClasses) {
    if (!afterClasses.has(cls)) lost.push(cls);
  }
  return {
    ok: lost.length === 0,
    beforeCount: beforeClasses.size,
    afterCount: afterClasses.size,
    lost,
  };
}

export function extractAllClasses(html) {
  const root = parseHtml(html, { lowerCaseTagName: true });
  const out = new Set();
  function walk(node) {
    if (node && node.attributes && node.attributes.class) {
      const cls = node.attributes.class.split(/\s+/).filter(Boolean);
      for (const c of cls) out.add(c);
    }
    if (node && node.childNodes) for (const c of node.childNodes) walk(c);
  }
  walk(root);
  return out;
}

/** Проверка 2: токены применены */
export function checkTokensApplied(baseClassesText, exportName, themeJsonText, baseDefaultsText) {
  const obj = extractClassesObject(baseClassesText, exportName);
  const flat = flattenCT(obj);

  const usedTokens = new Set();
  const re = /var\((--[a-z0-9-]+)(?:\s*,\s*[^)]+)?\)/g;
  for (const v of Object.values(flat)) {
    if (typeof v !== 'string') continue;
    let m;
    while ((m = re.exec(v)) !== null) {
      usedTokens.add(m[1]);
    }
  }

  const themeJson = JSON.parse(themeJsonText);
  const themeDefaults = themeJson.defaults || {};
  const baseDefaults = extractBaseDefaultsRecord(baseDefaultsText);

  const undefined_ = [];
  for (const t of usedTokens) {
    if (!(t in themeDefaults) && !(t in baseDefaults)) {
      undefined_.push(t);
    }
  }
  return {
    ok: undefined_.length === 0,
    totalTokens: usedTokens.size,
    undefined: undefined_,
  };
}

function extractBaseDefaultsRecord(src) {
  const out = {};
  const re = /'(-{2}[a-z0-9-]+)'\s*:\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    out[m[1]] = m[2];
  }
  return out;
}

/** Проверка 3: псевдо-состояния */
export function checkPseudoStates(sourceAstroText, baseClassesText, exportName) {
  // Извлечь все hover:/focus:/active: из источника
  const sourceLiterals = collectAllClassLiterals(sourceAstroText);
  const sourceStates = new Set();
  for (const lit of sourceLiterals) {
    const tokens = lit.split(/\s+/).filter(Boolean);
    for (const tok of tokens) {
      if (tok.startsWith('hover:') || tok.startsWith('focus:') || tok.startsWith('active:')) {
        sourceStates.add(tok);
      }
    }
  }

  // Извлечь утилиты из base classes
  const obj = extractClassesObject(baseClassesText, exportName);
  const flat = flattenCT(obj);
  const baseTokens = new Set();
  for (const v of Object.values(flat)) {
    if (typeof v !== 'string') continue;
    for (const t of v.split(/\s+/).filter(Boolean)) baseTokens.add(t);
  }

  const missing = [];
  // Кэш классификации base-утилит (по property+state+breakpoint)
  const baseByKey = new Map();
  for (const t of baseTokens) {
    const c = classifyUtility(t);
    if (!c) continue;
    const key = `${c.property}|${c.state || ''}|${c.breakpoint || ''}`;
    if (!baseByKey.has(key)) baseByKey.set(key, []);
    baseByKey.get(key).push(t);
  }

  for (const state of sourceStates) {
    // 1) Точное совпадение токена в base
    if (baseTokens.has(state)) continue;
    // 2) Семантическое совпадение: в base есть утилита с тем же property+state+
    //    breakpoint (например `active:scale-95` покрыт `active:[transform:var(...)]`)
    const c = classifyUtility(state);
    if (c) {
      const key = `${c.property}|${c.state || ''}|${c.breakpoint || ''}`;
      if (baseByKey.has(key)) continue;
    }
    // 3) Старая текстовая эвристика как запасной вариант для несклассифи-
    //    цированных утилит (`hover:transition-colors` и т.п.)
    const prefix = state.split('[')[0].replace(/-[^-:]*$/, '');
    const hasMatching = Array.from(baseTokens).some((t) => t.startsWith(prefix));
    if (!hasMatching) missing.push(state);
  }
  return {
    ok: missing.length === 0,
    totalStates: sourceStates.size,
    missing,
  };
}

export function collectAllClassLiterals(astroSrc) {
  const literals = [];
  // class="..." — статичные
  const re1 = /class\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re1.exec(astroSrc)) !== null) literals.push(m[1]);
  // class:list={[...]} — литералы внутри
  const re2 = /class:list\s*=\s*\{\[([\s\S]*?)\]\}/g;
  while ((m = re2.exec(astroSrc)) !== null) {
    const lits = extractStringLiterals(m[1]);
    literals.push(...lits);
  }
  return literals;
}

/** Проверка 4: структура HTML */
export function checkHtmlStructure(beforeHtml, afterHtml) {
  const before = collectStructure(beforeHtml);
  const after = collectStructure(afterHtml);

  const diffs = [];
  if (before.elementCount !== after.elementCount) {
    diffs.push(`Элементов: было ${before.elementCount}, стало ${after.elementCount}`);
  }
  // Сравнение тегов
  const tagDiff = setDiff(before.tagCounts, after.tagCounts);
  if (tagDiff.length > 0) {
    diffs.push(...tagDiff.map((d) => `Тег <${d.tag}>: было ${d.before}, стало ${d.after}`));
  }
  // Сравнение id/data-/aria-
  const idDiff = arrayDiff(before.ids, after.ids);
  if (idDiff.length > 0) diffs.push(`id различий: ${idDiff.join(', ')}`);
  const dataDiff = arrayDiff(before.dataAttrs, after.dataAttrs);
  if (dataDiff.length > 0) diffs.push(`data-* различий: ${dataDiff.join(', ')}`);
  const ariaDiff = arrayDiff(before.ariaAttrs, after.ariaAttrs);
  if (ariaDiff.length > 0) diffs.push(`aria-* различий: ${ariaDiff.join(', ')}`);

  return {
    ok: diffs.length === 0,
    differences: diffs,
    beforeStats: before,
    afterStats: after,
  };
}

function collectStructure(html) {
  const root = parseHtml(html, { lowerCaseTagName: true });
  const tagCounts = new Map();
  const ids = [];
  const dataAttrs = [];
  const ariaAttrs = [];
  let elementCount = 0;

  function walk(node) {
    if (!node) return;
    if (node.tagName) {
      elementCount++;
      const tag = String(node.tagName).toLowerCase();
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      const attrs = node.attributes || {};
      if (attrs.id) ids.push(attrs.id);
      for (const k of Object.keys(attrs)) {
        if (k.startsWith('data-')) dataAttrs.push(k);
        if (k.startsWith('aria-')) ariaAttrs.push(`${k}:${attrs[k]}`);
      }
    }
    if (node.childNodes) for (const c of node.childNodes) walk(c);
  }
  walk(root);
  return { elementCount, tagCounts, ids, dataAttrs, ariaAttrs };
}

function setDiff(beforeMap, afterMap) {
  const out = [];
  const allKeys = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  for (const k of allKeys) {
    const b = beforeMap.get(k) || 0;
    const a = afterMap.get(k) || 0;
    if (b !== a) out.push({ tag: k, before: b, after: a });
  }
  return out;
}

function arrayDiff(a, b) {
  const aSet = new Set(a);
  const bSet = new Set(b);
  const onlyA = [...aSet].filter((x) => !bSet.has(x));
  const onlyB = [...bSet].filter((x) => !aSet.has(x));
  return [...onlyA.map((x) => `-${x}`), ...onlyB.map((x) => `+${x}`)];
}

/** Проверка 5: визуальное сравнение */
export async function checkVisualMatch(beforePng, afterPng, { threshold = 0.01 } = {}) {
  let pixelmatch;
  let PNG;
  try {
    const pmModule = await import('pixelmatch');
    pixelmatch = pmModule.default || pmModule;
    const pngModule = await import('pngjs');
    PNG = pngModule.PNG;
  } catch (err) {
    return { ok: false, error: `pixelmatch/pngjs не установлены: ${err.message}` };
  }

  try {
    const [beforeBuf, afterBuf] = await Promise.all([
      fs.readFile(beforePng),
      fs.readFile(afterPng),
    ]);
    const beforeImg = PNG.sync.read(beforeBuf);
    const afterImg = PNG.sync.read(afterBuf);

    if (beforeImg.width !== afterImg.width || beforeImg.height !== afterImg.height) {
      return {
        ok: false,
        diffPct: 100,
        error: `Размеры не совпадают: ${beforeImg.width}×${beforeImg.height} vs ${afterImg.width}×${afterImg.height}`,
      };
    }

    const diffCount = pixelmatch(
      beforeImg.data,
      afterImg.data,
      null,
      beforeImg.width,
      beforeImg.height,
      { threshold: 0.1 },
    );
    const total = beforeImg.width * beforeImg.height;
    const diffPct = (diffCount / total) * 100;

    return {
      ok: diffPct <= threshold * 100,
      diffPct,
      diffPixels: diffCount,
      totalPixels: total,
      threshold: threshold * 100,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
